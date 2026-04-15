const store = require('./contactStore');
const mailer = require('./mailer');

async function checkBounces() {
  const candidates = store.getContactsWithRecentMsgId(48);
  if (candidates.length === 0) {
    console.log('[Bounce] No candidates to check');
    return { checked: 0, bounced: 0, complained: 0 };
  }

  console.log(`[Bounce] Checking ${candidates.length} recent messages...`);
  let bounced = 0;
  let complained = 0;
  let errors = 0;

  for (const c of candidates) {
    const msgId = c['Resend Msg ID'];
    if (!msgId) continue;

    try {
      const status = await mailer.getMessageStatus(msgId);
      if (!status || !status.last_event) continue;

      const event = status.last_event.toLowerCase();

      if (event === 'bounced' || event === 'bounce') {
        store.updateContact(c.Email, {
          Status: 'do_not_contact',
          Outcome: 'Bounced',
          'Bounce Type': status.bounce_type || 'hard',
          'Last Action': 'Marked bounced (Resend)',
          'Last Action Date': new Date().toISOString().split('T')[0],
          'Next Scheduled Action': 'None'
        });
        store.appendActivityLog({
          Date: new Date().toISOString().split('T')[0],
          'Contact Email': c.Email,
          'Action Taken': 'Marked bounced',
          'Outcome Summary': `Resend event: ${event}`
        });
        store.incrementMetric('bounces');
        bounced++;
      } else if (event === 'complained' || event === 'complaint') {
        store.updateContact(c.Email, {
          Status: 'do_not_contact',
          Outcome: 'Complaint',
          'Last Action': 'Spam complaint (Resend)',
          'Last Action Date': new Date().toISOString().split('T')[0],
          'Next Scheduled Action': 'None'
        });
        store.appendActivityLog({
          Date: new Date().toISOString().split('T')[0],
          'Contact Email': c.Email,
          'Action Taken': 'Marked complaint',
          'Outcome Summary': `Resend event: ${event}`
        });
        complained++;
      }

      // tiny delay — stay under Resend 5 req/s
      await new Promise(r => setTimeout(r, 250));
    } catch (err) {
      errors++;
      console.error(`[Bounce] ${c.Email}: ${err.message}`);
    }
  }

  const summary = `checked: ${candidates.length}, bounced: ${bounced}, complained: ${complained}, errors: ${errors}`;
  console.log(`[Bounce] ${summary}`);
  return { checked: candidates.length, bounced, complained, errors };
}

module.exports = { checkBounces };
