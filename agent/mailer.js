const nodemailer = require('nodemailer');

let transporter = null;

function getTransporter() {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT || '587'),
      secure: process.env.SMTP_SECURE === 'true', // true for 465, false for 587/25
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
      },
      tls: {
        rejectUnauthorized: false // allows self-signed certs (cPanel, shared hosting)
      }
    });
  }
  return transporter;
}

async function verifyConnection() {
  try {
    const t = getTransporter();
    await t.verify();
    console.log('[Mailer] SMTP connection verified ✓');
    return true;
  } catch (err) {
    console.error('[Mailer] SMTP connection failed:', err.message);
    return false;
  }
}

async function sendEmail({ to, subject, body, replyTo }) {
  const t = getTransporter();
  const fromAddress = process.env.SMTP_FROM || process.env.SMTP_USER;

  // Send plain text only — HTML emails from new senders trigger spam filters
  const mailOptions = {
    from: `"Jubair from DevCenter" <${fromAddress}>`,
    to,
    subject,
    text: body,
    replyTo: replyTo || fromAddress
  };

  const result = await t.sendMail(mailOptions);
  console.log(`[Mailer] ✓ Sent to ${to} — Message ID: ${result.messageId}`);
  return result;
}

module.exports = { sendEmail, verifyConnection };
