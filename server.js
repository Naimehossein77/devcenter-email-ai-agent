require('dotenv').config();
const express = require('express');
const cron = require('node-cron');
const path = require('path');

const emailAgent = require('./agent/emailAgent');
const store = require('./agent/contactStore');
const bounceChecker = require('./agent/bounceChecker');
const alerter = require('./agent/alerter');

const app = express();
const PORT = parseInt(process.env.PORT) || 8080;
const HOST = process.env.HOST || '0.0.0.0';

app.use(express.json({ limit: '5mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// ─── Locks ───────────────────────────────────────────────────────
// Outreach and inbox run independently — inbox is highest priority.
// Bounce check blocked only if inbox is running.
let lastRunResult = null;

async function withLock(label, lockObj, fn) {
  if (lockObj.running) {
    console.log(`[Server] ${label} blocked — already running`);
    return { success: false, blocked: true, error: `${label} already running` };
  }
  lockObj.running = true;
  console.log(`[Server] Started: ${label}`);
  try {
    const result = await fn();
    return { success: true, result };
  } catch (err) {
    console.error(`[Server] ${label} error:`, err.message);
    return { success: false, error: err.message };
  } finally {
    lockObj.running = false;
    console.log(`[Server] Done: ${label}`);
  }
}

// Expose combined running state for /api/status (lock objects defined below in triggerRun)
function isRunning() { return (outreachLock && outreachLock.running) || (inboxLock && inboxLock.running); }
function runLabel() {
  if (outreachLock && outreachLock.running) return 'outreach';
  if (inboxLock && inboxLock.running) return 'inbox';
  return null;
}

// ─── API: Read ────────────────────────────────────────────────────

app.get('/api/contacts', (req, res) => {
  try {
    res.json({ success: true, data: store.getContacts() });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

app.get('/api/contacts/:email/history', (req, res) => {
  try {
    const email = decodeURIComponent(req.params.email);
    const contact = store.getContact(email);
    if (!contact) return res.json({ success: false, error: 'Not found' });
    const conversation = store.getConversation(email);
    res.json({ success: true, data: { contact, conversation } });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

app.get('/api/logs', (req, res) => {
  try {
    res.json({ success: true, data: store.getActivityLog() });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

app.get('/api/stats', (req, res) => {
  try {
    res.json({ success: true, data: store.getStats() });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

app.get('/api/metrics', (req, res) => {
  try {
    const days = parseInt(req.query.days) || 30;
    res.json({ success: true, data: store.getMetrics(days) });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

app.get('/api/run-history', (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 20;
    res.json({ success: true, data: store.getRunHistory(limit) });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

app.get('/api/status', (req, res) => {
  res.json({
    success: true,
    isRunning: isRunning(),
    runLabel: runLabel(),
    lastRunResult,
    schedule: process.env.CRON_SCHEDULE || '0 18 * * *',
    timezone: process.env.CRON_TIMEZONE || 'Asia/Dhaka',
    maxPerDay: process.env.MAX_OUTREACH_PER_DAY || 10
  });
});

// ─── API: Write (Contacts CRUD) ──────────────────────────────────

app.post('/api/contacts', (req, res) => {
  try {
    const data = req.body;
    if (!data.Email || !data.Email.includes('@')) {
      return res.json({ success: false, error: 'Valid Email required' });
    }
    const created = store.createContact(data);
    if (!created) {
      return res.json({ success: false, error: 'Contact with this email already exists' });
    }
    res.json({ success: true });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

app.post('/api/upload-contacts', (req, res) => {
  try {
    const { contacts } = req.body;
    if (!contacts || !Array.isArray(contacts) || contacts.length === 0) {
      return res.json({ success: false, error: 'No contacts provided' });
    }

    let added = 0;
    let skipped = 0;
    for (const c of contacts) {
      if (!c.Email) { skipped++; continue; }
      const ok = store.createContact(c);
      if (ok) added++;
      else skipped++;
    }
    const total = store.getStats().total;
    res.json({ success: true, added, skipped, total });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

app.put('/api/contacts/:email', (req, res) => {
  try {
    const email = decodeURIComponent(req.params.email);
    const updates = req.body || {};
    // Never allow email change via edit (breaks conversation link)
    delete updates.Email;
    const ok = store.updateContact(email, updates);
    if (!ok) return res.json({ success: false, error: 'Not found' });
    res.json({ success: true });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

app.delete('/api/contacts/:email', (req, res) => {
  try {
    const email = decodeURIComponent(req.params.email);
    const ok = store.deleteContact(email);
    if (!ok) return res.json({ success: false, error: 'Not found' });
    res.json({ success: true });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

app.post('/api/contacts/bulk-action', (req, res) => {
  try {
    const { emails, action, status } = req.body;
    if (!Array.isArray(emails) || emails.length === 0) {
      return res.json({ success: false, error: 'No emails provided' });
    }
    let affected = 0;
    if (action === 'delete') {
      affected = store.bulkDelete(emails);
    } else if (action === 'setStatus' && status) {
      affected = store.bulkUpdateStatus(emails, status);
    } else {
      return res.json({ success: false, error: 'Unknown action' });
    }
    res.json({ success: true, affected });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

// ─── API: CSV Export ──────────────────────────────────────────────

function csvEscape(val) {
  if (val === null || val === undefined) return '';
  const str = String(val);
  if (/[",\n]/.test(str)) return '"' + str.replace(/"/g, '""') + '"';
  return str;
}

app.get('/api/export', (req, res) => {
  try {
    const { status, industry } = req.query;
    let contacts = store.getContacts();
    if (status) contacts = contacts.filter(c => (c.Status || '').toLowerCase() === status.toLowerCase());
    if (industry) contacts = contacts.filter(c => (c.Industry || '') === industry);

    const cols = ['Name', 'Email', 'Company', 'Role/Title', 'Industry', 'Notes', 'Status', 'Last Action', 'Last Action Date', 'Follow Up Count', 'Replied', 'Reply Summary', 'Next Scheduled Action', 'Outcome'];
    const lines = [cols.map(csvEscape).join(',')];
    for (const c of contacts) {
      lines.push(cols.map(k => csvEscape(c[k])).join(','));
    }

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="contacts-${new Date().toISOString().split('T')[0]}.csv"`);
    res.send(lines.join('\n'));
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── API: Run Triggers ───────────────────────────────────────────

app.post('/api/run', async (req, res) => {
  if (runLock) {
    return res.json({ success: false, error: `Agent busy: ${runLabel}` });
  }
  res.json({ success: true, message: 'Agent started' });
  triggerRun('manual', 'full');
});

app.post('/api/run-inbox', async (req, res) => {
  if (runLock) {
    return res.json({ success: false, error: `Agent busy: ${runLabel}` });
  }
  res.json({ success: true, message: 'Inbox check started' });
  triggerRun('manual', 'inbox');
});

// ─── Agent Runner ─────────────────────────────────────────────────

const outreachLock = { running: false };
const inboxLock    = { running: false };
const bounceLock   = { running: false };

async function triggerRun(trigger = 'cron', kind = 'full') {
  const label = `${kind}:${trigger}`;

  // Pick the right lock — inbox always independent from outreach
  const lock = (kind === 'inbox') ? inboxLock : outreachLock;

  const { result, error, success, blocked } = await withLock(label, lock, async () => {
    if (kind === 'inbox') return await emailAgent.checkInbox();
    if (kind === 'outreach') return await emailAgent.runOutreach();
    // full run: inbox first (priority), then outreach
    const inbox = await emailAgent.checkInbox();
    const outreach = await emailAgent.runOutreach();
    return {
      ...outreach,
      repliesHandled: inbox.repliesHandled,
      errors: [...(inbox.errors || []), ...(outreach.errors || [])],
      summary: `Outreach: ${outreach.outreachSent} | Follow-ups: ${outreach.followUpsSent} | Replies: ${inbox.repliesHandled} | Ghosted: ${outreach.ghostsMarked} | Errors: ${(inbox.errors || []).length + (outreach.errors || []).length}`
    };
  });

  if (blocked) return;

  if (success && result) {
    lastRunResult = { ...result, trigger, success: result.success !== false };
    store.appendRunHistory(lastRunResult);
  } else {
    lastRunResult = {
      timestamp: new Date().toISOString(),
      trigger,
      kind,
      success: false,
      error: error || 'Unknown error',
      summary: `Error: ${error}`
    };
    store.appendRunHistory(lastRunResult);
    await alerter.sendAlert('run_failure', `Agent run failed: ${label}`, error || 'Unknown error');
  }
}

async function triggerBounceCheck() {
  if (inboxRunning) return; // don't run bounce check while inbox is active
  await withLock('bounce-check', bounceLock, async () => {
    try {
      return await bounceChecker.checkBounces();
    } catch (err) {
      await alerter.sendAlert('bounce_check_fail', 'Bounce check failed', err.message);
      throw err;
    }
  });
}

// ─── Cron Schedules ──────────────────────────────────────────────

const cronSchedule = process.env.CRON_SCHEDULE || '0 18 * * *';
const cronTimezone = process.env.CRON_TIMEZONE || 'Asia/Dhaka';

// Daily outreach
if (cron.validate(cronSchedule)) {
  cron.schedule(cronSchedule, () => triggerRun('cron', 'outreach'), { timezone: cronTimezone });
  console.log(`[Server] Outreach cron: "${cronSchedule}" (${cronTimezone})`);
} else {
  console.warn(`[Server] Invalid CRON_SCHEDULE — using default 6pm`);
  cron.schedule('0 18 * * *', () => triggerRun('cron', 'outreach'), { timezone: cronTimezone });
}

// Hourly inbox check
cron.schedule('0 * * * *', () => triggerRun('cron', 'inbox'), { timezone: cronTimezone });
console.log(`[Server] Inbox cron: "0 * * * *" (${cronTimezone})`);

// Bounce polling every 30 min
cron.schedule('*/30 * * * *', () => triggerBounceCheck(), { timezone: cronTimezone });
console.log(`[Server] Bounce cron: "*/30 * * * *" (${cronTimezone})`);

// ─── Start ────────────────────────────────────────────────────────

app.listen(PORT, HOST, () => {
  const os = require('os');
  const nets = os.networkInterfaces();
  let lanIp = 'unknown';
  for (const iface of Object.values(nets)) {
    for (const cfg of iface) {
      if (cfg.family === 'IPv4' && !cfg.internal) { lanIp = cfg.address; break; }
    }
    if (lanIp !== 'unknown') break;
  }

  console.log(`\n╔════════════════════════════════════════════════╗`);
  console.log(`║   DevCenter Email Agent — Running              ║`);
  console.log(`║   Local:     http://localhost:${PORT}`);
  console.log(`║   LAN:       http://${lanIp}:${PORT}`);
  console.log(`║   Outreach:  ${cronSchedule} (${cronTimezone})`);
  console.log(`║   Inbox:     every hour`);
  console.log(`║   Bounces:   every 30 min`);
  console.log(`╚════════════════════════════════════════════════╝\n`);
});
