const db = require('./db');

// ─── Contact column mapping (Excel headers → DB columns) ──────────

const DB_TO_API = (row) => row ? ({
  Name: row.name || '',
  Email: row.email || '',
  Company: row.company || '',
  'Role/Title': row.role || '',
  Industry: row.industry || '',
  Notes: row.notes || '',
  Status: row.status || 'pending',
  'Last Action': row.last_action || '',
  'Last Action Date': row.last_action_date || '',
  'Follow Up Count': row.follow_up_count || 0,
  Replied: row.replied || 'NO',
  'Reply Summary': row.reply_summary || '',
  'Next Scheduled Action': row.next_scheduled_action || '',
  Outcome: row.outcome || '',
  'Bounce Type': row.bounce_type || '',
  'Resend Msg ID': row.resend_msg_id || '',
  'Created At': row.created_at || '',
  'Updated At': row.updated_at || ''
}) : null;

const API_TO_DB_FIELD = {
  Name: 'name',
  Email: 'email',
  Company: 'company',
  'Role/Title': 'role',
  Industry: 'industry',
  Notes: 'notes',
  Status: 'status',
  'Last Action': 'last_action',
  'Last Action Date': 'last_action_date',
  'Follow Up Count': 'follow_up_count',
  Replied: 'replied',
  'Reply Summary': 'reply_summary',
  'Next Scheduled Action': 'next_scheduled_action',
  Outcome: 'outcome',
  'Bounce Type': 'bounce_type',
  'Resend Msg ID': 'resend_msg_id'
};

// ─── Contacts ─────────────────────────────────────────────────────

function getContacts(opts = {}) {
  const includeDeleted = opts.includeDeleted || false;
  const sql = includeDeleted
    ? 'SELECT * FROM contacts ORDER BY id ASC'
    : 'SELECT * FROM contacts WHERE deleted_at IS NULL ORDER BY id ASC';
  return db.prepare(sql).all().map(DB_TO_API);
}

function getContact(email) {
  const row = db.prepare('SELECT * FROM contacts WHERE LOWER(email) = LOWER(?) AND deleted_at IS NULL').get(email);
  return DB_TO_API(row);
}

function createContact(data) {
  if (!data.Email || !data.Email.includes('@')) return false;
  const emailNorm = data.Email.toString().trim().toLowerCase();

  // Case-insensitive duplicate check
  const existing = db.prepare('SELECT id FROM contacts WHERE LOWER(email) = ? AND deleted_at IS NULL').get(emailNorm);
  if (existing) return false;

  const stmt = db.prepare(`
    INSERT INTO contacts (name, email, company, role, industry, notes, status, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
    ON CONFLICT(email) DO NOTHING
  `);
  const r = stmt.run(
    data.Name || '',
    emailNorm,
    data.Company || '',
    data['Role/Title'] || '',
    data.Industry || '',
    data.Notes || '',
    data.Status || 'pending'
  );
  return r.changes > 0;
}

function updateContact(email, updates) {
  const fields = [];
  const values = [];

  for (const [apiKey, value] of Object.entries(updates)) {
    const col = API_TO_DB_FIELD[apiKey];
    if (!col) continue;
    fields.push(`${col} = ?`);
    values.push(value);
  }

  if (fields.length === 0) return false;

  fields.push(`updated_at = datetime('now')`);
  values.push(email);

  const sql = `UPDATE contacts SET ${fields.join(', ')} WHERE LOWER(email) = LOWER(?) AND deleted_at IS NULL`;
  const r = db.prepare(sql).run(...values);
  return r.changes > 0;
}

function deleteContact(email) {
  const r = db.prepare(`UPDATE contacts SET deleted_at = datetime('now') WHERE LOWER(email) = LOWER(?) AND deleted_at IS NULL`).run(email);
  return r.changes > 0;
}

function bulkUpdateStatus(emails, status) {
  const stmt = db.prepare(`UPDATE contacts SET status = ?, updated_at = datetime('now') WHERE LOWER(email) = LOWER(?) AND deleted_at IS NULL`);
  const tx = db.transaction((list) => {
    let count = 0;
    for (const e of list) count += stmt.run(status, e).changes;
    return count;
  });
  return tx(emails);
}

function bulkDelete(emails) {
  const stmt = db.prepare(`UPDATE contacts SET deleted_at = datetime('now') WHERE LOWER(email) = LOWER(?) AND deleted_at IS NULL`);
  const tx = db.transaction((list) => {
    let count = 0;
    for (const e of list) count += stmt.run(e).changes;
    return count;
  });
  return tx(emails);
}

function getStats() {
  const rows = db.prepare(`
    SELECT status, COUNT(*) as n
    FROM contacts
    WHERE deleted_at IS NULL
    GROUP BY status
  `).all();
  const counts = { total: 0, pending: 0, sent: 0, followed_up: 0, replied: 0, converted: 0, ghosted: 0, unsubscribed: 0 };
  for (const { status, n } of rows) {
    counts.total += n;
    const s = (status || 'pending').toLowerCase();
    if (s === 'pending') counts.pending += n;
    else if (s === 'sent') counts.sent += n;
    else if (s === 'followed_up_1' || s === 'followed_up_2') counts.followed_up += n;
    else if (s === 'replied') counts.replied += n;
    else if (s === 'converted') counts.converted += n;
    else if (s === 'do_not_contact') counts.ghosted += n;
    else if (s === 'unsubscribed') counts.unsubscribed += n;
  }
  return counts;
}

function getContactsWithRecentMsgId(hours = 48) {
  return db.prepare(`
    SELECT * FROM contacts
    WHERE resend_msg_id IS NOT NULL
      AND deleted_at IS NULL
      AND status IN ('sent', 'followed_up_1', 'followed_up_2')
      AND datetime(updated_at) > datetime('now', '-${parseInt(hours)} hours')
  `).all().map(DB_TO_API);
}

// ─── Activity Log ─────────────────────────────────────────────────

function appendActivityLog(entry) {
  db.prepare(`
    INSERT INTO activity_log (date, contact_email, action, outcome)
    VALUES (?, ?, ?, ?)
  `).run(
    entry.Date || new Date().toISOString().split('T')[0],
    entry['Contact Email'] || '',
    entry['Action Taken'] || '',
    entry['Outcome Summary'] || ''
  );
}

function getActivityLog(limit = 500) {
  return db.prepare(`SELECT * FROM activity_log ORDER BY id DESC LIMIT ?`).all(limit).map(r => ({
    Date: r.date,
    'Contact Email': r.contact_email,
    'Action Taken': r.action,
    'Outcome Summary': r.outcome
  }));
}

// ─── Conversations ────────────────────────────────────────────────

function addConversationMessage(email, direction, subject, body, resendMsgId = null) {
  db.prepare(`
    INSERT INTO conversations (contact_email, direction, subject, body, resend_msg_id)
    VALUES (?, ?, ?, ?, ?)
  `).run(email, direction, subject || '', body || '', resendMsgId);
}

function getConversation(email) {
  return db.prepare(`
    SELECT * FROM conversations
    WHERE LOWER(contact_email) = LOWER(?)
    ORDER BY id ASC
  `).all(email).map(r => ({
    date: r.date,
    direction: r.direction,
    subject: r.subject,
    body: r.body
  }));
}

// ─── Metrics ──────────────────────────────────────────────────────

function incrementMetric(metricName, amount = 1) {
  const date = new Date().toISOString().split('T')[0];
  const allowed = ['emails_sent', 'follow_ups_sent', 'replies_received', 'replies_handled', 'bounces', 'unsubscribes', 'errors'];
  if (!allowed.includes(metricName)) return;

  db.prepare(`INSERT INTO metrics (date) VALUES (?) ON CONFLICT(date) DO NOTHING`).run(date);
  db.prepare(`UPDATE metrics SET ${metricName} = ${metricName} + ? WHERE date = ?`).run(amount, date);
}

function getMetrics(days = 30) {
  return db.prepare(`
    SELECT * FROM metrics
    WHERE date >= date('now', '-${parseInt(days)} days')
    ORDER BY date ASC
  `).all();
}

// ─── Run History ──────────────────────────────────────────────────

function appendRunHistory(run) {
  db.prepare(`
    INSERT INTO run_history (timestamp, trigger, kind, outreach_sent, follow_ups_sent, replies_handled, ghosts_marked, errors_count, errors_json, summary, success)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    run.timestamp || new Date().toISOString(),
    run.trigger || 'manual',
    run.kind || 'full',
    run.outreachSent || 0,
    run.followUpsSent || 0,
    run.repliesHandled || 0,
    run.ghostsMarked || 0,
    (run.errors || []).length,
    JSON.stringify(run.errors || []),
    run.summary || '',
    run.success === false ? 0 : 1
  );
  // trim to last 100
  db.prepare(`DELETE FROM run_history WHERE id NOT IN (SELECT id FROM run_history ORDER BY id DESC LIMIT 100)`).run();
}

function getRunHistory(limit = 20) {
  return db.prepare(`SELECT * FROM run_history ORDER BY id DESC LIMIT ?`).all(limit).map(r => ({
    timestamp: r.timestamp,
    trigger: r.trigger,
    kind: r.kind,
    outreachSent: r.outreach_sent,
    followUpsSent: r.follow_ups_sent,
    repliesHandled: r.replies_handled,
    ghostsMarked: r.ghosts_marked,
    errors: r.errors_json ? JSON.parse(r.errors_json) : [],
    summary: r.summary,
    success: r.success === 1
  }));
}

module.exports = {
  getContacts,
  getContact,
  createContact,
  updateContact,
  deleteContact,
  bulkUpdateStatus,
  bulkDelete,
  getStats,
  getContactsWithRecentMsgId,
  appendActivityLog,
  getActivityLog,
  addConversationMessage,
  getConversation,
  incrementMetric,
  getMetrics,
  appendRunHistory,
  getRunHistory
};
