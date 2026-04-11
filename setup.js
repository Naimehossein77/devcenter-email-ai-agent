/**
 * Run this once before starting: node setup.js
 * Creates data/contacts.xlsx with the correct column headers + 2 sample rows
 */

require('dotenv').config();
const XLSX = require('xlsx');
const path = require('path');
const fs = require('fs');

const DATA_DIR = path.join(__dirname, 'data');
const CONTACTS_FILE = path.join(DATA_DIR, 'contacts.xlsx');

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR);

if (fs.existsSync(CONTACTS_FILE)) {
  console.log('✓ contacts.xlsx already exists — skipping creation');
  console.log('  Delete data/contacts.xlsx and re-run to reset.');
  process.exit(0);
}

const wb = XLSX.utils.book_new();

// ── Contacts sheet ──────────────────────────────────────────────
const contactRows = [
  // Sample row 1 — replace with real leads
  {
    Name: 'John Smith',
    Email: 'john@example.com',
    Company: 'TechStartup Inc',
    'Role/Title': 'CTO',
    Industry: 'SaaS',
    Notes: 'Looking to build a mobile app for their product',
    Status: 'pending',
    'Last Action': '',
    'Last Action Date': '',
    'Follow Up Count': 0,
    Replied: 'NO',
    'Reply Summary': '',
    'Next Scheduled Action': '',
    Outcome: ''
  },
  // Sample row 2
  {
    Name: 'Sarah Lee',
    Email: 'sarah@agency.io',
    Company: 'Creative Agency',
    'Role/Title': 'Founder',
    Industry: 'Marketing',
    Notes: 'Runs a digital agency, might need AI automation tools',
    Status: 'pending',
    'Last Action': '',
    'Last Action Date': '',
    'Follow Up Count': 0,
    Replied: 'NO',
    'Reply Summary': '',
    'Next Scheduled Action': '',
    Outcome: ''
  }
];

const headers = [
  'Name', 'Email', 'Company', 'Role/Title', 'Industry', 'Notes',
  'Status', 'Last Action', 'Last Action Date', 'Follow Up Count',
  'Replied', 'Reply Summary', 'Next Scheduled Action', 'Outcome'
];

const contactsWs = XLSX.utils.json_to_sheet(contactRows, { header: headers });

// Set column widths for readability
contactsWs['!cols'] = [
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

XLSX.utils.book_append_sheet(wb, contactsWs, 'Contacts');

// ── Activity Log sheet ──────────────────────────────────────────
const logHeaders = ['Date', 'Contact Email', 'Action Taken', 'Outcome Summary'];
const logWs = XLSX.utils.aoa_to_sheet([logHeaders]);
logWs['!cols'] = [{ wch: 12 }, { wch: 28 }, { wch: 35 }, { wch: 50 }];
XLSX.utils.book_append_sheet(wb, logWs, 'Activity Log');

XLSX.writeFile(wb, CONTACTS_FILE);

console.log('✓ Created data/contacts.xlsx with:');
console.log('   — "Contacts" sheet (2 sample rows, all 14 columns)');
console.log('   — "Activity Log" sheet');
console.log('\nNext steps:');
console.log('   1. Open data/contacts.xlsx and add your real leads');
console.log('   2. Set Status to "pending" for contacts you want to email');
console.log('   3. Run: npm start');
