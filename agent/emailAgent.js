require('dotenv').config();

const mailer = require('./mailer');
const imapReader = require('./imapReader');
const excelManager = require('./excelManager');
const aiWriter = require('./aiWriter');
const stateManager = require('./stateManager');

const FOLLOW_UP_DAYS = 7;
const MAX_OUTREACH_PER_DAY = parseInt(process.env.MAX_OUTREACH_PER_DAY || '20');

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

function log(msg) {
  console.log(`[Agent ${new Date().toTimeString().slice(0, 8)}] ${msg}`);
}

// ─── Inbox Check (runs every hour) ───────────────────────────────

async function checkInbox() {
  const summary = {
    timestamp: new Date().toISOString(),
    repliesHandled: 0,
    errors: [],
    summary: ''
  };

  log('───── Inbox Check Started ─────');

  const contacts = excelManager.getContacts();

  const activeContacts = contacts.filter(c =>
    ['sent', 'followed_up_1', 'followed_up_2', 'replied'].includes(
      (c.Status || '').toLowerCase()
    )
  );

  if (activeContacts.length === 0) {
    log('No active contacts to check replies for');
    summary.summary = 'Replies handled: 0';
    return summary;
  }

  let replies = [];
  try {
    replies = await imapReader.checkForReplies(activeContacts);
  } catch (err) {
    log(`IMAP error: ${err.message}`);
    summary.errors.push(`IMAP: ${err.message}`);
  }

  for (const reply of replies) {
    try {
      const contact = contacts.find(
        c => c.Email.toLowerCase() === reply.from
      );
      if (!contact) continue;

      const state = stateManager.getContactState(reply.from);
      const replyBody = await aiWriter.writeReply(contact, reply.text, state);

      await mailer.sendEmail({
        to: contact.Email,
        subject: reply.subject.startsWith('Re:')
          ? reply.subject
          : `Re: ${reply.subject}`,
        body: replyBody
      });

      const snippet = reply.text.slice(0, 120).replace(/\n/g, ' ').trim();

      excelManager.updateContact(contact.Email, {
        Status: 'replied',
        'Last Action': 'Reply received — AI response sent',
        'Last Action Date': today(),
        Replied: 'YES',
        'Reply Summary': snippet,
        'Next Scheduled Action': `Follow up if silent by ${addDays(5)}`
      });

      stateManager.addMessage(reply.from, 'received', reply.subject, reply.text);
      stateManager.addMessage(reply.from, 'sent', `Re: ${reply.subject}`, replyBody);

      excelManager.appendActivityLog({
        Date: today(),
        'Contact Email': contact.Email,
        'Action Taken': 'Reply received and responded to by AI',
        'Outcome Summary': `They said: "${snippet}..."`
      });

      summary.repliesHandled++;
      log(`✓ Handled reply from ${contact.Email}`);

      // Random 5-10 min delay before sending the next reply
      const delayMin = Math.floor(Math.random() * 6) + 5;
      log(`Waiting ${delayMin} minutes before next send...`);
      await sleep(delayMin * 60 * 1000);
    } catch (err) {
      log(`✗ Reply error for ${reply.from}: ${err.message}`);
      summary.errors.push(`Reply (${reply.from}): ${err.message}`);
    }
  }

  summary.summary = `Replies handled: ${summary.repliesHandled} | Errors: ${summary.errors.length}`;
  log(`───── Inbox Check Done: ${summary.summary} ─────`);
  return summary;
}

// ─── Daily Outreach Run (runs once daily) ────────────────────────

async function runOutreach() {
  const summary = {
    timestamp: new Date().toISOString(),
    outreachSent: 0,
    followUpsSent: 0,
    ghostsMarked: 0,
    errors: [],
    summary: ''
  };

  log('═══════════ Daily Outreach Started ═══════════');

  const contacts = excelManager.getContacts();
  log(`Loaded ${contacts.length} contacts from Excel`);

  // ── Send initial outreach ─────────────────────────────────────
  log('Step 1: Sending initial outreach to pending contacts...');

  const pendingContacts = contacts
    .filter(c => !c.Status || c.Status.toLowerCase() === 'pending')
    .slice(0, MAX_OUTREACH_PER_DAY);

  log(`Found ${pendingContacts.length} pending contacts (max ${MAX_OUTREACH_PER_DAY}/day)`);

  for (const contact of pendingContacts) {
    if (!contact.Email || !contact.Email.includes('@')) {
      log(`✗ Skipping ${contact.Name} — invalid email`);
      continue;
    }

    try {
      const emailContent = await aiWriter.writeOutreachEmail(contact);

      await mailer.sendEmail({
        to: contact.Email,
        subject: emailContent.subject,
        body: emailContent.body
      });

      excelManager.updateContact(contact.Email, {
        Status: 'sent',
        'Last Action': 'Initial outreach sent',
        'Last Action Date': today(),
        'Follow Up Count': 0,
        Replied: 'NO',
        'Reply Summary': '',
        'Next Scheduled Action': `Follow-up on ${addDays(FOLLOW_UP_DAYS)}`,
        Outcome: ''
      });

      stateManager.initContact(contact.Email, contact.Name, contact.Company);
      stateManager.addMessage(contact.Email, 'sent', emailContent.subject, emailContent.body);

      excelManager.appendActivityLog({
        Date: today(),
        'Contact Email': contact.Email,
        'Action Taken': 'Initial outreach email sent',
        'Outcome Summary': `Subject: "${emailContent.subject}"`
      });

      summary.outreachSent++;
      log(`✓ Outreach sent to ${contact.Email}`);
      await sleep(1200000); // 20 min delay between sends
    } catch (err) {
      log(`✗ Outreach error for ${contact.Email}: ${err.message}`);
      summary.errors.push(`Outreach (${contact.Email}): ${err.message}`);
    }
  }

  // ── Send follow-ups ───────────────────────────────────────────
  log('Step 2: Sending follow-ups...');

  const followUpCandidates = contacts.filter(c => {
    const status = (c.Status || '').toLowerCase();
    if (!['sent', 'followed_up_1'].includes(status)) return false;
    if ((c.Replied || '').toUpperCase() === 'YES') return false;
    return daysSince(c['Last Action Date']) >= FOLLOW_UP_DAYS;
  });

  log(`Found ${followUpCandidates.length} contacts due for follow-up`);

  for (const contact of followUpCandidates) {
    try {
      const followUpCount = parseInt(contact['Follow Up Count'] || '0');
      const attempt = followUpCount + 1;

      const state = stateManager.getContactState(contact.Email);
      const emailContent = await aiWriter.writeFollowUpEmail(contact, attempt, state);

      await mailer.sendEmail({
        to: contact.Email,
        subject: emailContent.subject,
        body: emailContent.body
      });

      const newStatus = attempt === 1 ? 'followed_up_1' : 'followed_up_2';
      const nextAction = attempt === 1
        ? `Follow-up #2 on ${addDays(FOLLOW_UP_DAYS)}`
        : `No further action — ghost if no reply by ${addDays(FOLLOW_UP_DAYS)}`;

      excelManager.updateContact(contact.Email, {
        Status: newStatus,
        'Last Action': `Follow-up #${attempt} sent`,
        'Last Action Date': today(),
        'Follow Up Count': attempt,
        'Next Scheduled Action': nextAction
      });

      stateManager.addMessage(contact.Email, 'sent', emailContent.subject, emailContent.body);

      excelManager.appendActivityLog({
        Date: today(),
        'Contact Email': contact.Email,
        'Action Taken': `Follow-up email #${attempt} sent`,
        'Outcome Summary': `Subject: "${emailContent.subject}"`
      });

      summary.followUpsSent++;
      log(`✓ Follow-up #${attempt} sent to ${contact.Email}`);
      await sleep(1200000); // 20 min delay between sends
    } catch (err) {
      log(`✗ Follow-up error for ${contact.Email}: ${err.message}`);
      summary.errors.push(`Follow-up (${contact.Email}): ${err.message}`);
    }
  }

  // ── Mark ghosts ───────────────────────────────────────────────
  log('Step 3: Marking ghosted contacts...');

  const ghostCandidates = contacts.filter(c => {
    if ((c.Status || '').toLowerCase() !== 'followed_up_2') return false;
    if ((c.Replied || '').toUpperCase() === 'YES') return false;
    return daysSince(c['Last Action Date']) >= FOLLOW_UP_DAYS;
  });

  for (const contact of ghostCandidates) {
    excelManager.updateContact(contact.Email, {
      Status: 'do_not_contact',
      'Last Action': 'Marked as ghosted — no reply after 2 follow-ups',
      'Last Action Date': today(),
      Outcome: 'Ghosted',
      'Next Scheduled Action': 'None'
    });

    excelManager.appendActivityLog({
      Date: today(),
      'Contact Email': contact.Email,
      'Action Taken': 'Contact marked as ghosted',
      'Outcome Summary': 'No reply after initial email + 2 follow-ups'
    });

    summary.ghostsMarked++;
    log(`→ Ghosted: ${contact.Email}`);
  }

  // ── Done ──────────────────────────────────────────────────────
  summary.summary = [
    `Outreach: ${summary.outreachSent}`,
    `Follow-ups: ${summary.followUpsSent}`,
    `Ghosted: ${summary.ghostsMarked}`,
    `Errors: ${summary.errors.length}`
  ].join(' | ');

  log(`═══════════ Daily Outreach Complete ═══════════`);
  log(summary.summary);

  return summary;
}

// ─── Full Run (manual trigger from dashboard) ────────────────────

async function run() {
  const inboxResult = await checkInbox();
  const outreachResult = await runOutreach();

  return {
    timestamp: new Date().toISOString(),
    outreachSent: outreachResult.outreachSent,
    followUpsSent: outreachResult.followUpsSent,
    repliesHandled: inboxResult.repliesHandled,
    ghostsMarked: outreachResult.ghostsMarked,
    errors: [...inboxResult.errors, ...outreachResult.errors],
    summary: `Outreach: ${outreachResult.outreachSent} | Follow-ups: ${outreachResult.followUpsSent} | Replies handled: ${inboxResult.repliesHandled} | Ghosted: ${outreachResult.ghostsMarked} | Errors: ${inboxResult.errors.length + outreachResult.errors.length}`,
    trigger: 'manual',
    success: true
  };
}

module.exports = { run, checkInbox, runOutreach };
