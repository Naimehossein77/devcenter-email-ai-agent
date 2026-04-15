require('dotenv').config();
const express = require('express');
const cron = require('node-cron');
const path = require('path');

const emailAgent = require('./agent/emailAgent');
const excelManager = require('./agent/excelManager');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ─── State ────────────────────────────────────────────────────────
let isRunning = false;
let isCheckingInbox = false;
let lastRunResult = null;
let lastInboxCheck = null;
const runHistory = []; // last 10 runs

// ─── API Routes ───────────────────────────────────────────────────

// Get all contacts
app.get('/api/contacts', (req, res) => {
  try {
    const contacts = excelManager.getContacts();
    res.json({ success: true, data: contacts });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

// Get activity log
app.get('/api/logs', (req, res) => {
  try {
    const logs = excelManager.getActivityLog();
    res.json({ success: true, data: logs });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

// Get stats
app.get('/api/stats', (req, res) => {
  try {
    const stats = excelManager.getStats();
    res.json({ success: true, data: stats });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

// Agent status
app.get('/api/status', (req, res) => {
  res.json({
    success: true,
    isRunning,
    lastRunResult,
    runHistory: runHistory.slice(-5),
    schedule: process.env.CRON_SCHEDULE || '0 9 * * *',
    maxPerDay: process.env.MAX_OUTREACH_PER_DAY || 20
  });
});

// Upload contacts (append new ones)
app.post('/api/upload-contacts', (req, res) => {
  try {
    const { contacts } = req.body;
    if (!contacts || !Array.isArray(contacts) || contacts.length === 0) {
      return res.json({ success: false, error: 'No contacts provided' });
    }

    const XLSX = require('xlsx');
    const path = require('path');
    const CONTACTS_FILE = path.join(__dirname, 'data/contacts.xlsx');

    // Read existing workbook
    let wb;
    const fs = require('fs');
    if (fs.existsSync(CONTACTS_FILE)) {
      wb = XLSX.readFile(CONTACTS_FILE);
    } else {
      wb = XLSX.utils.book_new();
    }

    const sheetName = 'Contacts';
    const existing = wb.Sheets[sheetName]
      ? XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { defval: '' })
      : [];

    const existingEmails = new Set(existing.map(c => (c.Email || '').toLowerCase()));
    let added = 0;

    for (const c of contacts) {
      if (!c.Email || existingEmails.has(c.Email.toLowerCase())) continue;
      existing.push({
        Name: c.Name || '',
        Email: c.Email,
        Company: c.Company || '',
        'Role/Title': c['Role/Title'] || '',
        Industry: c.Industry || '',
        Notes: c.Notes || '',
        Status: 'pending',
        'Last Action': '',
        'Last Action Date': '',
        'Follow Up Count': 0,
        Replied: 'NO',
        'Reply Summary': '',
        'Next Scheduled Action': '',
        Outcome: ''
      });
      existingEmails.add(c.Email.toLowerCase());
      added++;
    }

    const headers = ['Name','Email','Company','Role/Title','Industry','Notes','Status','Last Action','Last Action Date','Follow Up Count','Replied','Reply Summary','Next Scheduled Action','Outcome'];
    wb.Sheets[sheetName] = XLSX.utils.json_to_sheet(existing, { header: headers });
    if (!wb.SheetNames.includes(sheetName)) XLSX.utils.book_append_sheet(wb, wb.Sheets[sheetName], sheetName);

    XLSX.writeFile(wb, CONTACTS_FILE);
    res.json({ success: true, added, total: existing.length });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

// Manually trigger agent run
app.post('/api/run', async (req, res) => {
  if (isRunning) {
    return res.json({ success: false, error: 'Agent is already running. Please wait.' });
  }
  res.json({ success: true, message: 'Agent started — check /api/status for progress' });
  triggerRun('manual');
});

// ─── Agent Runners ────────────────────────────────────────────────

async function triggerRun(trigger = 'cron') {
  if (isRunning) return;
  isRunning = true;

  console.log(`\n[Server] Agent triggered by: ${trigger}`);

  try {
    const result = await emailAgent.run();
    lastRunResult = { ...result, trigger, success: true };
    runHistory.push(lastRunResult);
    if (runHistory.length > 10) runHistory.shift();
  } catch (err) {
    console.error('[Server] Agent run error:', err.message);
    lastRunResult = {
      timestamp: new Date().toISOString(),
      trigger,
      success: false,
      error: err.message
    };
    runHistory.push(lastRunResult);
  } finally {
    isRunning = false;
  }
}

async function triggerInboxCheck() {
  if (isCheckingInbox) return;
  isCheckingInbox = true;

  console.log('\n[Server] Hourly inbox check started');

  try {
    const result = await emailAgent.checkInbox();
    lastInboxCheck = { ...result, trigger: 'hourly', success: true };
    // Also push to run history so it shows on the dashboard
    if (result.repliesHandled > 0) {
      runHistory.push(lastInboxCheck);
      if (runHistory.length > 10) runHistory.shift();
      lastRunResult = lastInboxCheck;
    }
  } catch (err) {
    console.error('[Server] Inbox check error:', err.message);
  } finally {
    isCheckingInbox = false;
  }
}

// ─── Cron Schedules ──────────────────────────────────────────────

// Daily outreach + follow-ups + ghost marking
const cronSchedule = process.env.CRON_SCHEDULE || '0 18 * * *';
const cronTimezone = process.env.CRON_TIMEZONE || 'Asia/Dhaka';

if (cron.validate(cronSchedule)) {
  cron.schedule(cronSchedule, () => triggerRun('cron'), { timezone: cronTimezone });
  console.log(`[Server] Outreach cron: "${cronSchedule}" (${cronTimezone})`);
} else {
  console.warn(`[Server] Invalid CRON_SCHEDULE: "${cronSchedule}" — using default 6pm daily`);
  cron.schedule('0 18 * * *', () => triggerRun('cron'), { timezone: cronTimezone });
}

// Hourly inbox check for replies
cron.schedule('0 * * * *', () => triggerInboxCheck(), { timezone: cronTimezone });
console.log(`[Server] Inbox check cron: "0 * * * *" (${cronTimezone})`);

// ─── Start ────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`\n╔════════════════════════════════════════════════╗`);
  console.log(`║   DevCenter Email Agent — Running              ║`);
  console.log(`║   Dashboard:  http://localhost:${PORT}              ║`);
  console.log(`║   Outreach:   ${(cronSchedule + '                ').slice(0, 20)}(daily)    ║`);
  console.log(`║   Inbox:      every hour                       ║`);
  console.log(`╚════════════════════════════════════════════════╝\n`);
});
