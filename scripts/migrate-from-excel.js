#!/usr/bin/env node
/**
 * One-time migration: data/contacts.xlsx + data/email_state.json → data/agent.db
 * Safe to re-run — uses ON CONFLICT DO NOTHING on contacts, dedupes conversations.
 */

require('dotenv').config();
const path = require('path');
const fs = require('fs');
const XLSX = require('xlsx');
const db = require('../agent/db');
const store = require('../agent/contactStore');

const XLSX_FILE = path.join(__dirname, '../data/contacts.xlsx');
const STATE_FILE = path.join(__dirname, '../data/email_state.json');

function migrateContacts() {
  if (!fs.existsSync(XLSX_FILE)) {
    console.log('No contacts.xlsx found — skipping contact migration');
    return 0;
  }

  const wb = XLSX.readFile(XLSX_FILE);
  const sheetName = wb.Sheets['Contacts'] ? 'Contacts' : wb.SheetNames[0];
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { defval: '' });

  console.log(`Found ${rows.length} contacts in Excel`);

  const insert = db.prepare(`
    INSERT INTO contacts (
      name, email, company, role, industry, notes,
      status, last_action, last_action_date, follow_up_count,
      replied, reply_summary, next_scheduled_action, outcome,
      updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    ON CONFLICT(email) DO UPDATE SET
      name = excluded.name,
      company = excluded.company,
      role = excluded.role,
      industry = excluded.industry,
      notes = excluded.notes,
      status = excluded.status,
      last_action = excluded.last_action,
      last_action_date = excluded.last_action_date,
      follow_up_count = excluded.follow_up_count,
      replied = excluded.replied,
      reply_summary = excluded.reply_summary,
      next_scheduled_action = excluded.next_scheduled_action,
      outcome = excluded.outcome,
      updated_at = datetime('now')
  `);

  const tx = db.transaction((list) => {
    let count = 0;
    for (const r of list) {
      if (!r.Email || !r.Email.toString().trim()) continue;
      insert.run(
        r.Name || '',
        r.Email.toString().trim(),
        r.Company || '',
        r['Role/Title'] || '',
        r.Industry || '',
        r.Notes || '',
        r.Status || 'pending',
        r['Last Action'] || '',
        r['Last Action Date'] || '',
        parseInt(r['Follow Up Count'] || 0) || 0,
        r.Replied || 'NO',
        r['Reply Summary'] || '',
        r['Next Scheduled Action'] || '',
        r.Outcome || ''
      );
      count++;
    }
    return count;
  });

  const migrated = tx(rows);
  console.log(`✓ Migrated ${migrated} contacts → SQLite`);

  // Migrate activity log sheet if exists
  if (wb.Sheets['Activity Log']) {
    const logs = XLSX.utils.sheet_to_json(wb.Sheets['Activity Log'], { defval: '' });
    let logCount = 0;
    for (const l of logs) {
      if (!l['Contact Email']) continue;
      store.appendActivityLog({
        Date: l.Date || '',
        'Contact Email': l['Contact Email'],
        'Action Taken': l['Action Taken'] || '',
        'Outcome Summary': l['Outcome Summary'] || ''
      });
      logCount++;
    }
    console.log(`✓ Migrated ${logCount} activity log entries`);
  }

  return migrated;
}

function migrateConversations() {
  if (!fs.existsSync(STATE_FILE)) {
    console.log('No email_state.json found — skipping conversation migration');
    return 0;
  }

  const raw = fs.readFileSync(STATE_FILE, 'utf8').trim();
  if (!raw) return 0;

  let state;
  try { state = JSON.parse(raw); }
  catch (e) { console.error('email_state.json invalid:', e.message); return 0; }

  let count = 0;
  for (const [email, data] of Object.entries(state)) {
    const conv = data.conversation || [];
    for (const msg of conv) {
      store.addConversationMessage(
        email.trim(),
        msg.direction || 'sent',
        msg.subject || '',
        msg.body || '',
        null
      );
      count++;
    }
  }
  console.log(`✓ Migrated ${count} conversation messages`);
  return count;
}

function main() {
  console.log('═══ Migration: Excel+JSON → SQLite ═══\n');
  migrateContacts();
  migrateConversations();
  console.log('\n═══ Done ═══');

  // Rename old files as backup
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  if (fs.existsSync(XLSX_FILE)) {
    const backup = XLSX_FILE.replace('.xlsx', `.backup-${ts}.xlsx`);
    fs.copyFileSync(XLSX_FILE, backup);
    console.log(`Backup: ${path.basename(backup)}`);
  }
  if (fs.existsSync(STATE_FILE)) {
    const backup = STATE_FILE.replace('.json', `.backup-${ts}.json`);
    fs.copyFileSync(STATE_FILE, backup);
    console.log(`Backup: ${path.basename(backup)}`);
  }
}

main();
