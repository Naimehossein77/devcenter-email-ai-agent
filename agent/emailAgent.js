require('dotenv').config();

const mailer = require('./mailer');
const imapReader = require('./imapReader');
const store = require('./contactStore');
const aiWriter = require('./aiWriter');
const alerter = require('./alerter');

const FOLLOW_UP_DAYS = 7;
const MAX_OUTREACH_PER_DAY = parseInt(process.env.MAX_OUTREACH_PER_DAY || '10');
const SEND_DELAY_MS = parseInt(process.env.SEND_DELAY_MS || String(20 * 60 * 1000)); // 20 min
const REPLY_DELAY_MIN = 5 * 60 * 1000;   // 5 min
const REPLY_DELAY_MAX = 10 * 60 * 1000;  // 10 min

// ─── Utilities ───────────────────────────────────────────────────

function daysSince(dateStr) {
  if (!dateStr) return 999;
  const then = new Date(dateStr);
  const now = new Date();
  return Math.floor((now - then) / (1000 * 60 * 60 * 24));
}

function addDays(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0];
}

function today() {
  return new Date().toISOString().split('T')[0];
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function randomDelay(min, max) {
  return min + Math.floor(Math.random() * (max - min + 1));
}

function log(msg) {
  console.log(`[Agent ${new Date().toTimeString().slice(0, 8)}] ${msg}`);
}

function buildStateForAI(email) {
  const conversation = store.getConversation(email);
  return { conversation };
}

// ─── Inbox Check ─────────────────────────────────────────────────

async function checkInbox() {
  const summary = {
    timestamp: new Date().toISOString(),
    kind: 'inbox',
    repliesHandled: 0,
    autoRepliesSkipped: 0,
    unsubscribed: 0,
    errors: [],
    summary: '',
    success: true
  };

  log('───── Inbox Check Started ─────');

  const contacts = store.getContacts();
  const activeContacts = contacts.filter(c =>
    ['sent', 'followed_up_1', 'followed_up_2', 'replied'].includes(
      (c.Status || '').toLowerCase()
    )
  );

  if (activeContacts.length === 0) {
    log('No active contacts to check');
    summary.summary = 'No active contacts';
    return summary;
  }

  let replies = [];
  try {
    replies = await imapReader.checkForReplies(activeContacts);
  } catch (err) {
    log(`IMAP error: ${err.message}`);
    summary.errors.push(`IMAP: ${err.message}`);
    store.incrementMetric('errors');
    await alerter.sendAlert('imap_error', 'IMAP connection failed', err.message + '\n\n' + (err.stack || ''));
    summary.summary = `IMAP error: ${err.message}`;
    summary.success = false;
    return summary;
  }

  store.incrementMetric('replies_received', replies.length);

  for (let idx = 0; idx < replies.length; idx++) {
    const reply = replies[idx];
    try {
      const contact = contacts.find(c => c.Email.toLowerCase() === reply.from);
      if (!contact) continue;

      // Skip auto-replies (OOF, vacation)
      if (reply.isAutoReply) {
        store.appendActivityLog({
          Date: today(),
          'Contact Email': contact.Email,
          'Action Taken': 'Auto-reply detected — skipped',
          'Outcome Summary': `Subject: "${reply.subject}"`
        });
        summary.autoRepliesSkipped++;
        log(`↷ Auto-reply skipped from ${contact.Email}`);
        continue;
      }

      // Handle unsubscribe
      if (reply.isUnsubscribe) {
        store.updateContact(contact.Email, {
          Status: 'unsubscribed',
          'Last Action': 'Unsubscribed by recipient',
          'Last Action Date': today(),
          Replied: 'YES',
          'Reply Summary': reply.text.slice(0, 120),
          Outcome: 'Unsubscribed',
          'Next Scheduled Action': 'None'
        });
        store.appendActivityLog({
          Date: today(),
          'Contact Email': contact.Email,
          'Action Taken': 'Unsubscribed',
          'Outcome Summary': `Subject: "${reply.subject}"`
        });
        store.addConversationMessage(contact.Email, 'received', reply.subject, reply.text);
        store.incrementMetric('unsubscribes');
        summary.unsubscribed++;
        log(`✗ Unsubscribed: ${contact.Email}`);
        continue;
      }

      // Real reply — generate AI response
      const state = buildStateForAI(reply.from);
      let replyBody;
      try {
        replyBody = await aiWriter.writeReply(contact, reply.text, state);
      } catch (err) {
        summary.errors.push(`AI reply (${reply.from}): ${err.message}`);
        store.incrementMetric('errors');
        await alerter.sendAlert('ai_reply_fail', 'AI failed to write reply', `${reply.from}: ${err.message}`);
        continue;
      }

      const sendResult = await mailer.sendEmail({
        to: contact.Email,
        subject: reply.subject.startsWith('Re:') ? reply.subject : `Re: ${reply.subject}`,
        body: replyBody
      });

      const snippet = reply.text.slice(0, 120).replace(/\n/g, ' ').trim();

      store.updateContact(contact.Email, {
        Status: 'replied',
        'Last Action': 'Reply received — AI response sent',
        'Last Action Date': today(),
        Replied: 'YES',
        'Reply Summary': snippet,
        'Next Scheduled Action': `Follow up if silent by ${addDays(5)}`,
        'Resend Msg ID': sendResult.id
      });

      store.addConversationMessage(contact.Email, 'received', reply.subject, reply.text);
      store.addConversationMessage(contact.Email, 'sent', `Re: ${reply.subject}`, replyBody, sendResult.id);

      store.appendActivityLog({
        Date: today(),
        'Contact Email': contact.Email,
        'Action Taken': 'AI reply sent',
        'Outcome Summary': `They said: "${snippet}..."`
      });

      store.incrementMetric('replies_handled');
      summary.repliesHandled++;
      log(`✓ Handled reply from ${contact.Email}`);

      // Random delay before next reply (5-10 min)
      if (idx < replies.length - 1) {
        const delay = randomDelay(REPLY_DELAY_MIN, REPLY_DELAY_MAX);
        log(`Waiting ${Math.round(delay / 60000)} min before next reply send...`);
        await sleep(delay);
      }
    } catch (err) {
      log(`✗ Reply error for ${reply.from}: ${err.message}`);
      summary.errors.push(`Reply (${reply.from}): ${err.message}`);
      store.incrementMetric('errors');
    }
  }

  summary.summary = `Replies: ${summary.repliesHandled} | Auto skipped: ${summary.autoRepliesSkipped} | Unsubs: ${summary.unsubscribed} | Errors: ${summary.errors.length}`;
  log(`───── Inbox Done: ${summary.summary} ─────`);
  return summary;
}

// ─── Daily Outreach Run ──────────────────────────────────────────

async function runOutreach() {
  const summary = {
    timestamp: new Date().toISOString(),
    kind: 'outreach',
    outreachSent: 0,
    followUpsSent: 0,
    ghostsMarked: 0,
    errors: [],
    summary: '',
    success: true
  };

  log('═══════════ Daily Outreach Started ═══════════');

  const contacts = store.getContacts();
  log(`Loaded ${contacts.length} contacts`);

  // ── STEP 1: Initial outreach ─────────────────────────────────
  log('Step 1: Initial outreach...');

  const pending = contacts
    .filter(c => !c.Status || c.Status.toLowerCase() === 'pending')
    .slice(0, MAX_OUTREACH_PER_DAY);

  log(`Found ${pending.length} pending (max ${MAX_OUTREACH_PER_DAY}/day)`);

  for (let i = 0; i < pending.length; i++) {
    const contact = pending[i];
    if (!contact.Email || !contact.Email.includes('@')) {
      log(`✗ Skipping ${contact.Name} — invalid email`);
      continue;
    }

    try {
      const emailContent = await aiWriter.writeOutreachEmail(contact);

      const sendResult = await mailer.sendEmail({
        to: contact.Email,
        subject: emailContent.subject,
        body: emailContent.body
      });

      store.updateContact(contact.Email, {
        Status: 'sent',
        'Last Action': 'Initial outreach sent',
        'Last Action Date': today(),
        'Follow Up Count': 0,
        Replied: 'NO',
        'Reply Summary': '',
        'Next Scheduled Action': `Follow-up on ${addDays(FOLLOW_UP_DAYS)}`,
        Outcome: '',
        'Resend Msg ID': sendResult.id
      });

      store.addConversationMessage(contact.Email, 'sent', emailContent.subject, emailContent.body, sendResult.id);

      store.appendActivityLog({
        Date: today(),
        'Contact Email': contact.Email,
        'Action Taken': 'Initial outreach sent',
        'Outcome Summary': `Subject: "${emailContent.subject}"`
      });

      store.incrementMetric('emails_sent');
      summary.outreachSent++;
      log(`✓ Sent to ${contact.Email}`);

      if (i < pending.length - 1) {
        log(`Waiting ${Math.round(SEND_DELAY_MS / 60000)} min before next send...`);
        await sleep(SEND_DELAY_MS);
      }
    } catch (err) {
      log(`✗ Outreach error for ${contact.Email}: ${err.message}`);
      summary.errors.push(`Outreach (${contact.Email}): ${err.message}`);
      store.incrementMetric('errors');
      if (/5\d\d|rate|limit/i.test(err.message)) {
        await alerter.sendAlert('send_failure', 'Outreach send failed', `${contact.Email}: ${err.message}`);
      }
    }
  }

  // ── STEP 2: Follow-ups ────────────────────────────────────────
  log('Step 2: Follow-ups...');

  const fuCandidates = contacts.filter(c => {
    const s = (c.Status || '').toLowerCase();
    if (!['sent', 'followed_up_1'].includes(s)) return false;
    if ((c.Replied || '').toUpperCase() === 'YES') return false;
    return daysSince(c['Last Action Date']) >= FOLLOW_UP_DAYS;
  });

  log(`Found ${fuCandidates.length} due for follow-up`);

  for (let i = 0; i < fuCandidates.length; i++) {
    const contact = fuCandidates[i];
    try {
      const attempt = parseInt(contact['Follow Up Count'] || '0') + 1;
      const state = buildStateForAI(contact.Email);
      const emailContent = await aiWriter.writeFollowUpEmail(contact, attempt, state);

      const sendResult = await mailer.sendEmail({
        to: contact.Email,
        subject: emailContent.subject,
        body: emailContent.body
      });

      const newStatus = attempt === 1 ? 'followed_up_1' : 'followed_up_2';
      const nextAction = attempt === 1
        ? `Follow-up #2 on ${addDays(FOLLOW_UP_DAYS)}`
        : `Ghost if no reply by ${addDays(FOLLOW_UP_DAYS)}`;

      store.updateContact(contact.Email, {
        Status: newStatus,
        'Last Action': `Follow-up #${attempt} sent`,
        'Last Action Date': today(),
        'Follow Up Count': attempt,
        'Next Scheduled Action': nextAction,
        'Resend Msg ID': sendResult.id
      });

      store.addConversationMessage(contact.Email, 'sent', emailContent.subject, emailContent.body, sendResult.id);

      store.appendActivityLog({
        Date: today(),
        'Contact Email': contact.Email,
        'Action Taken': `Follow-up #${attempt} sent`,
        'Outcome Summary': `Subject: "${emailContent.subject}"`
      });

      store.incrementMetric('follow_ups_sent');
      summary.followUpsSent++;
      log(`✓ Follow-up #${attempt} → ${contact.Email}`);

      if (i < fuCandidates.length - 1) {
        await sleep(SEND_DELAY_MS);
      }
    } catch (err) {
      log(`✗ Follow-up error for ${contact.Email}: ${err.message}`);
      summary.errors.push(`Follow-up (${contact.Email}): ${err.message}`);
      store.incrementMetric('errors');
    }
  }

  // ── STEP 3: Mark ghosts ───────────────────────────────────────
  log('Step 3: Mark ghosts...');

  const ghostCandidates = contacts.filter(c => {
    if ((c.Status || '').toLowerCase() !== 'followed_up_2') return false;
    if ((c.Replied || '').toUpperCase() === 'YES') return false;
    return daysSince(c['Last Action Date']) >= FOLLOW_UP_DAYS;
  });

  for (const contact of ghostCandidates) {
    store.updateContact(contact.Email, {
      Status: 'do_not_contact',
      'Last Action': 'Marked ghosted',
      'Last Action Date': today(),
      Outcome: 'Ghosted',
      'Next Scheduled Action': 'None'
    });

    store.appendActivityLog({
      Date: today(),
      'Contact Email': contact.Email,
      'Action Taken': 'Marked ghosted',
      'Outcome Summary': 'No reply after initial + 2 follow-ups'
    });

    summary.ghostsMarked++;
    log(`→ Ghosted: ${contact.Email}`);
  }

  summary.summary = `Outreach: ${summary.outreachSent} | Follow-ups: ${summary.followUpsSent} | Ghosted: ${summary.ghostsMarked} | Errors: ${summary.errors.length}`;
  log(`═══════════ Outreach Done: ${summary.summary} ═══════════`);
  return summary;
}

// ─── Full run (manual trigger) ────────────────────────────────────

async function run() {
  const inbox = await checkInbox();
  const outreach = await runOutreach();

  return {
    timestamp: new Date().toISOString(),
    kind: 'full',
    outreachSent: outreach.outreachSent,
    followUpsSent: outreach.followUpsSent,
    repliesHandled: inbox.repliesHandled,
    ghostsMarked: outreach.ghostsMarked,
    errors: [...inbox.errors, ...outreach.errors],
    summary: `Outreach: ${outreach.outreachSent} | Follow-ups: ${outreach.followUpsSent} | Replies: ${inbox.repliesHandled} | Ghosted: ${outreach.ghostsMarked} | Errors: ${inbox.errors.length + outreach.errors.length}`,
    success: inbox.success && outreach.success
  };
}

module.exports = { run, checkInbox, runOutreach };
