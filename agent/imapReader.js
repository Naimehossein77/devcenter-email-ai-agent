const { ImapFlow } = require('imapflow');
const { simpleParser } = require('mailparser');

const OOF_SUBJECT_RE = /^(re:\s*)?(out\s*of\s*office|auto[- ]?reply|automatic reply|vacation|away|i[' ]?m\s*(away|ooo|out))/i;
const UNSUB_SUBJECT_RE = /unsubscribe|opt[- ]?out|remove\s*me/i;

function detectAutoReply(parsed, envelope) {
  // Check headers (case-insensitive via mailparser's headers Map)
  const headers = parsed.headers || new Map();
  const get = (k) => {
    const v = headers.get(k.toLowerCase());
    return v ? String(v).toLowerCase() : '';
  };

  const autoSubmitted = get('auto-submitted');
  if (autoSubmitted && autoSubmitted !== 'no') return true;

  if (get('x-autoreply') || get('x-autorespond') || get('x-auto-response-suppress')) return true;

  const precedence = get('precedence');
  if (['auto_reply', 'bulk', 'junk', 'list'].includes(precedence)) return true;

  const subject = parsed.subject || envelope?.subject || '';
  if (OOF_SUBJECT_RE.test(subject)) return true;

  return false;
}

function detectUnsubscribe(parsed, envelope) {
  const subject = parsed.subject || envelope?.subject || '';
  if (UNSUB_SUBJECT_RE.test(subject)) return true;
  const text = (parsed.text || '').slice(0, 500).toLowerCase();
  if (/^\s*unsubscribe\s*$/m.test(text) || /please\s*(unsubscribe|remove\s*me)/i.test(text)) return true;
  return false;
}

async function checkForReplies(contacts) {
  if (!contacts || contacts.length === 0) return [];

  const knownEmails = contacts.map(c => c.Email.toLowerCase().trim());
  const replies = [];

  const client = new ImapFlow({
    host: process.env.IMAP_HOST,
    port: parseInt(process.env.IMAP_PORT || '993'),
    secure: process.env.IMAP_SECURE !== 'false',
    auth: {
      user: process.env.IMAP_USER,
      pass: process.env.IMAP_PASS
    },
    logger: false
  });

  try {
    await client.connect();
    await client.mailboxOpen('INBOX');

    const since = new Date();
    since.setDate(since.getDate() - 14);

    let uids = [];
    try {
      uids = await client.search({ seen: false, since });
    } catch {
      uids = await client.search({ seen: false });
    }

    if (!uids || uids.length === 0) {
      await client.logout();
      return replies;
    }

    console.log(`[IMAP] Found ${uids.length} unread messages to check`);

    for await (const msg of client.fetch(uids, {
      source: true,
      uid: true,
      envelope: true
    })) {
      try {
        const fromEmail = msg.envelope?.from?.[0]?.address?.toLowerCase();

        if (fromEmail && knownEmails.includes(fromEmail)) {
          const parsed = await simpleParser(msg.source);

          let text = parsed.text || '';
          if (!text && parsed.html) {
            text = parsed.html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
          }

          const isAutoReply = detectAutoReply(parsed, msg.envelope);
          const isUnsubscribe = detectUnsubscribe(parsed, msg.envelope);

          replies.push({
            uid: msg.uid,
            from: fromEmail,
            subject: parsed.subject || '(no subject)',
            text: text.slice(0, 2000),
            date: parsed.date || new Date(),
            isAutoReply,
            isUnsubscribe
          });

          // Mark as seen regardless — we've processed it
          await client.messageFlagsAdd(
            { uid: msg.uid },
            ['\\Seen'],
            { uid: true }
          );

          const tag = isAutoReply ? '[AUTO]' : isUnsubscribe ? '[UNSUB]' : '';
          console.log(`[IMAP] ✓ ${tag} Reply from ${fromEmail}`);
        }
      } catch (parseErr) {
        console.error('[IMAP] Error parsing message:', parseErr.message);
      }
    }

    await client.logout();
  } catch (err) {
    console.error('[IMAP] Error:', err.message);
    try { await client.logout(); } catch {}
    throw err; // let caller handle — alerter can notify
  }

  return replies;
}

module.exports = { checkForReplies };
