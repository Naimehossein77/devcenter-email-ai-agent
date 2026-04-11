const { ImapFlow } = require('imapflow');
const { simpleParser } = require('mailparser');

async function checkForReplies(contacts) {
  if (!contacts || contacts.length === 0) return [];

  const knownEmails = contacts.map(c => c.Email.toLowerCase());
  const replies = [];

  const client = new ImapFlow({
    host: process.env.IMAP_HOST,
    port: parseInt(process.env.IMAP_PORT || '993'),
    secure: process.env.IMAP_SECURE !== 'false',
    auth: {
      user: process.env.IMAP_USER,
      pass: process.env.IMAP_PASS
    },
    logger: false // suppress verbose imap logs
  });

  try {
    await client.connect();
    await client.mailboxOpen('INBOX');

    // Look back 14 days to catch any replies we may have missed
    const since = new Date();
    since.setDate(since.getDate() - 14);

    let uids = [];
    try {
      uids = await client.search({ seen: false, since });
    } catch {
      // Some servers don't support combined search — fall back
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

          // Get clean text — prefer plain text over HTML
          let text = parsed.text || '';
          if (!text && parsed.html) {
            // Strip HTML tags as fallback
            text = parsed.html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
          }

          replies.push({
            uid: msg.uid,
            from: fromEmail,
            subject: parsed.subject || '(no subject)',
            text: text.slice(0, 2000), // cap at 2000 chars
            date: parsed.date || new Date()
          });

          // Mark as seen so we don't process it again tomorrow
          await client.messageFlagsAdd(
            { uid: msg.uid },
            ['\\Seen'],
            { uid: true }
          );

          console.log(`[IMAP] ✓ Found reply from ${fromEmail}`);
        }
      } catch (parseErr) {
        console.error('[IMAP] Error parsing message:', parseErr.message);
      }
    }

    await client.logout();
  } catch (err) {
    console.error('[IMAP] Error:', err.message);
    try { await client.logout(); } catch {}
  }

  return replies;
}

module.exports = { checkForReplies };
