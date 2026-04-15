const { Resend } = require('resend');

const resend = new Resend(process.env.RESEND_API_KEY);

async function verifyConnection() {
  if (!process.env.RESEND_API_KEY) {
    console.error('[Mailer] RESEND_API_KEY missing');
    return false;
  }
  console.log('[Mailer] Resend configured ✓');
  return true;
}

async function sendEmail({ to, subject, body, replyTo }) {
  const fromAddress = process.env.SMTP_FROM || process.env.SMTP_USER;
  const fromName = process.env.SMTP_FROM_NAME || 'Jubair from DevCenter';
  const unsubAddr = process.env.UNSUBSCRIBE_EMAIL || fromAddress;

  const { data, error } = await resend.emails.send({
    from: `${fromName} <${fromAddress}>`,
    to: [to],
    subject,
    text: body,
    replyTo: replyTo || fromAddress,
    headers: {
      'List-Unsubscribe': `<mailto:${unsubAddr}?subject=unsubscribe>`,
      'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click'
    }
  });

  if (error) {
    throw new Error(`Resend: ${error.message || error.name}`);
  }

  console.log(`[Mailer] ✓ Sent to ${to} — ID: ${data.id}`);
  return data; // { id: '...' }
}

// Poll Resend for delivery status
async function getMessageStatus(messageId) {
  try {
    const { data, error } = await resend.emails.get(messageId);
    if (error) return null;
    return data; // { id, last_event: 'delivered'|'bounced'|'complained'|... }
  } catch (e) {
    return null;
  }
}

module.exports = { sendEmail, verifyConnection, getMessageStatus };
