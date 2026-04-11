const XLSX = require('xlsx');
const path = require('path');
const fs = require('fs');

const CONTACTS_FILE = path.join(__dirname, '../data/contacts.xlsx');
const CONTACTS_SHEET = 'Contacts';
const LOG_SHEET = 'Activity Log';

// The full ordered column list for the Contacts sheet
const CONTACT_COLUMNS = [
  'Name',
  'Email',
  'Company',
  'Role/Title',
  'Industry',
  'Notes',
  'Status',
  'Last Action',
  'Last Action Date',
  'Follow Up Count',
  'Replied',
  'Reply Summary',
  'Next Scheduled Action',
  'Outcome'
];

const LOG_COLUMNS = ['Date', 'Contact Email', 'Action Taken', 'Outcome Summary'];

// ─── Helpers ─────────────────────────────────────────────────────

function ensureDataDir() {
  const dir = path.dirname(CONTACTS_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function fileExists() {
  return fs.existsSync(CONTACTS_FILE);
}

function createEmptyWorkbook() {
  const wb = XLSX.utils.book_new();

  // Contacts sheet with headers
  const contactsWs = XLSX.utils.aoa_to_sheet([CONTACT_COLUMNS]);
  XLSX.utils.book_append_sheet(wb, contactsWs, CONTACTS_SHEET);

  // Activity Log sheet with headers
  const logWs = XLSX.utils.aoa_to_sheet([LOG_COLUMNS]);
  XLSX.utils.book_append_sheet(wb, logWs, LOG_SHEET);

  ensureDataDir();
  XLSX.writeFile(wb, CONTACTS_FILE);
  return wb;
}

function readWorkbook() {
  if (!fileExists()) return createEmptyWorkbook();
  return XLSX.readFile(CONTACTS_FILE);
}

function getContactsSheet(wb) {
  // Try named sheet first, fall back to first sheet
  return wb.Sheets[CONTACTS_SHEET] || wb.Sheets[wb.SheetNames[0]];
}

// ─── Public API ──────────────────────────────────────────────────

function getContacts() {
  const wb = readWorkbook();
  const ws = getContactsSheet(wb);
  const rows = XLSX.utils.sheet_to_json(ws, { defval: '' });
  // Normalize: ensure tracking columns exist with defaults
  return rows.map(r => ({
    Status: 'pending',
    'Follow Up Count': 0,
    Replied: 'NO',
    'Reply Summary': '',
    'Next Scheduled Action': '',
    Outcome: '',
    ...r
  }));
}

const COL_WIDTHS = [
  { wch: 20 },  // Name
  { wch: 28 },  // Email
  { wch: 22 },  // Company
  { wch: 20 },  // Role/Title
  { wch: 15 },  // Industry
  { wch: 40 },  // Notes
  { wch: 15 },  // Status
  { wch: 35 },  // Last Action
  { wch: 18 },  // Last Action Date
  { wch: 16 },  // Follow Up Count
  { wch: 10 },  // Replied
  { wch: 40 },  // Reply Summary
  { wch: 35 },  // Next Scheduled Action
  { wch: 18 }   // Outcome
];

function updateContact(email, updates) {
  const wb = readWorkbook();
  const ws = getContactsSheet(wb);
  const data = XLSX.utils.sheet_to_json(ws, { defval: '' });

  const idx = data.findIndex(
    r => r.Email && r.Email.toString().toLowerCase() === email.toLowerCase()
  );

  if (idx === -1) {
    console.warn(`[Excel] Contact not found: ${email}`);
    return false;
  }

  // Merge updates — never overwrite core identity columns
  data[idx] = { ...data[idx], ...updates };

  // Write back the contacts sheet with consistent formatting
  const sheetName = wb.Sheets[CONTACTS_SHEET] ? CONTACTS_SHEET : wb.SheetNames[0];
  const newWs = XLSX.utils.json_to_sheet(data, { header: CONTACT_COLUMNS });
  newWs['!cols'] = COL_WIDTHS;
  wb.Sheets[sheetName] = newWs;

  XLSX.writeFile(wb, CONTACTS_FILE);
  return true;
}

function appendActivityLog(entry) {
  const wb = readWorkbook();

  // Ensure log sheet exists
  if (!wb.Sheets[LOG_SHEET]) {
    const logWs = XLSX.utils.aoa_to_sheet([LOG_COLUMNS]);
    XLSX.utils.book_append_sheet(wb, logWs, LOG_SHEET);
  }

  const logData = XLSX.utils.sheet_to_json(wb.Sheets[LOG_SHEET], { defval: '' });
  logData.push({
    Date: entry.Date || new Date().toISOString().split('T')[0],
    'Contact Email': entry['Contact Email'] || '',
    'Action Taken': entry['Action Taken'] || '',
    'Outcome Summary': entry['Outcome Summary'] || ''
  });

  const logWs = XLSX.utils.json_to_sheet(logData, { header: LOG_COLUMNS });
  logWs['!cols'] = [{ wch: 12 }, { wch: 28 }, { wch: 35 }, { wch: 50 }];
  wb.Sheets[LOG_SHEET] = logWs;
  XLSX.writeFile(wb, CONTACTS_FILE);
}

function getActivityLog() {
  const wb = readWorkbook();
  if (!wb.Sheets[LOG_SHEET]) return [];
  return XLSX.utils.sheet_to_json(wb.Sheets[LOG_SHEET], { defval: '' }).reverse(); // newest first
}

function getStats() {
  const contacts = getContacts();
  const counts = {
    total: contacts.length,
    pending: 0,
    sent: 0,
    followed_up: 0,
    replied: 0,
    converted: 0,
    ghosted: 0,
    unsubscribed: 0
  };

  contacts.forEach(c => {
    const s = (c.Status || 'pending').toLowerCase();
    if (s === 'pending') counts.pending++;
    else if (s === 'sent') counts.sent++;
    else if (s === 'followed_up_1' || s === 'followed_up_2') counts.followed_up++;
    else if (s === 'replied') counts.replied++;
    else if (s === 'converted') counts.converted++;
    else if (s === 'do_not_contact') counts.ghosted++;
    else if (s === 'unsubscribed') counts.unsubscribed++;
  });

  return counts;
}

module.exports = {
  getContacts,
  updateContact,
  appendActivityLog,
  getActivityLog,
  getStats,
  fileExists,
  CONTACTS_FILE
};
