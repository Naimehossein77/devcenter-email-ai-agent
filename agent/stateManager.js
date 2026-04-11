const fs = require('fs');
const path = require('path');

const STATE_FILE = path.join(__dirname, '../data/email_state.json');

let state = {};
let loaded = false;

function load() {
  try {
    if (fs.existsSync(STATE_FILE)) {
      state = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
    }
    loaded = true;
  } catch (err) {
    console.error('[State] Error loading state:', err.message);
    state = {};
  }
}

function save() {
  try {
    fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true });
    fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
  } catch (err) {
    console.error('[State] Error saving state:', err.message);
  }
}

function getContactState(email) {
  if (!loaded) load();
  return state[email.toLowerCase()] || null;
}

function initContact(email, name, company) {
  if (!loaded) load();
  const key = email.toLowerCase();
  if (!state[key]) {
    state[key] = {
      email: key,
      name: name || '',
      company: company || '',
      first_contacted: new Date().toISOString().split('T')[0],
      conversation: []
    };
    save();
  }
}

function addMessage(email, direction, subject, body) {
  if (!loaded) load();
  const key = email.toLowerCase();
  if (!state[key]) {
    state[key] = { email: key, conversation: [] };
  }
  if (!state[key].conversation) state[key].conversation = [];

  state[key].conversation.push({
    date: new Date().toISOString().split('T')[0],
    direction, // 'sent' | 'received'
    subject,
    body
  });
  save();
}

function getAllState() {
  if (!loaded) load();
  return state;
}

module.exports = { load, save, getContactState, initContact, addMessage, getAllState };
