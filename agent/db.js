const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DATA_DIR = path.join(__dirname, '../data');
const DB_FILE = path.join(DATA_DIR, 'agent.db');

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new Database(DB_FILE);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS contacts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT,
  email TEXT NOT NULL UNIQUE,
  company TEXT,
  role TEXT,
  industry TEXT,
  notes TEXT,
  status TEXT DEFAULT 'pending',
  last_action TEXT,
  last_action_date TEXT,
  follow_up_count INTEGER DEFAULT 0,
  replied TEXT DEFAULT 'NO',
  reply_summary TEXT,
  next_scheduled_action TEXT,
  outcome TEXT,
  bounce_type TEXT,
  resend_msg_id TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  deleted_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_contacts_status ON contacts(status) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_contacts_email ON contacts(email) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_contacts_resend_msg ON contacts(resend_msg_id) WHERE resend_msg_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS activity_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date TEXT NOT NULL,
  contact_email TEXT NOT NULL,
  action TEXT NOT NULL,
  outcome TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_log_date ON activity_log(date DESC);
CREATE INDEX IF NOT EXISTS idx_log_contact ON activity_log(contact_email);

CREATE TABLE IF NOT EXISTS conversations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  contact_email TEXT NOT NULL,
  direction TEXT NOT NULL,
  subject TEXT,
  body TEXT NOT NULL,
  date TEXT DEFAULT (datetime('now')),
  resend_msg_id TEXT
);

CREATE INDEX IF NOT EXISTS idx_conv_contact ON conversations(contact_email, date DESC);

CREATE TABLE IF NOT EXISTS metrics (
  date TEXT PRIMARY KEY,
  emails_sent INTEGER DEFAULT 0,
  follow_ups_sent INTEGER DEFAULT 0,
  replies_received INTEGER DEFAULT 0,
  replies_handled INTEGER DEFAULT 0,
  bounces INTEGER DEFAULT 0,
  unsubscribes INTEGER DEFAULT 0,
  errors INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS run_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  timestamp TEXT NOT NULL,
  trigger TEXT NOT NULL,
  kind TEXT NOT NULL,
  outreach_sent INTEGER DEFAULT 0,
  follow_ups_sent INTEGER DEFAULT 0,
  replies_handled INTEGER DEFAULT 0,
  ghosts_marked INTEGER DEFAULT 0,
  errors_count INTEGER DEFAULT 0,
  errors_json TEXT,
  summary TEXT,
  success INTEGER DEFAULT 1
);

CREATE INDEX IF NOT EXISTS idx_runs_ts ON run_history(timestamp DESC);
`);

module.exports = db;
