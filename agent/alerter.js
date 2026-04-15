const mailer = require('./mailer');

// In-memory dedupe: errorKey → timestamp
const lastAlert = new Map();
const COOLDOWN_MS = 6 * 60 * 60 * 1000; // 6 hours

async function sendAlert(errorKey, subject, body) {
  const now = Date.now();
  const last = lastAlert.get(errorKey);
  if (last && now - last < COOLDOWN_MS) {
    console.log(`[Alerter] Skipped (cooldown): ${errorKey}`);
    return false;
  }

  const adminEmail = process.env.ALERT_EMAIL || process.env.SMTP_FROM || process.env.SMTP_USER;
  if (!adminEmail) {
    console.error('[Alerter] No admin email configured');
    return false;
  }

  try {
    await mailer.sendEmail({
      to: adminEmail,
      subject: `[Agent Alert] ${subject}`,
      body: `Error key: ${errorKey}\nTime: ${new Date().toISOString()}\n\n${body}`
    });
    lastAlert.set(errorKey, now);
    console.log(`[Alerter] Sent: ${errorKey}`);
    return true;
  } catch (err) {
    console.error(`[Alerter] Failed to send alert: ${err.message}`);
    return false;
  }
}

module.exports = { sendAlert };
