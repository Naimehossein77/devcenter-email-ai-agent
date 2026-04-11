# DevCenter Email Agent 🚀

Autonomous email marketing system that runs daily, sends personalized outreach, follows up automatically, handles replies with AI, and tracks everything in your Excel sheet.

---

## What It Does (Daily, Automatically)

1. **Sends outreach** to all `pending` contacts in your Excel sheet
2. **Checks replies** in your inbox and responds using AI (Claude)
3. **Follows up** on contacts with no reply after 7 days (max 2 follow-ups)
4. **Marks as ghosted** after 2 ignored follow-ups
5. **Updates Excel** with full status after every action
6. **Dashboard** at `http://localhost:3000` to monitor everything

---

## Setup (One Time)

### 1. Clone & Install
```bash
cd devcenter-email-agent
npm install
```

### 2. Configure Environment
```bash
cp .env.example .env
```
Open `.env` and fill in:
- Your SMTP credentials (for sending)
- Your IMAP credentials (for reading replies)
- Your Anthropic API key (get one at console.anthropic.com)

### 3. Create your contacts sheet
```bash
npm run setup
```
This creates `data/contacts.xlsx` with the right columns and 2 sample rows.
Open it and replace the samples with your real leads. Set Status to `pending`.

### 4. Start the agent
```bash
npm start
```
Open `http://localhost:3000` to see the dashboard.

---

## contacts.xlsx Columns

| Column | Description |
|--------|-------------|
| Name | Lead's full name |
| Email | Their email address |
| Company | Their company name |
| Role/Title | Their job title |
| Industry | Their industry (helps AI personalize) |
| Notes | Any context you want the AI to use |
| Status | **Auto-managed** (see below) |
| Last Action | **Auto-managed** |
| Last Action Date | **Auto-managed** |
| Follow Up Count | **Auto-managed** |
| Replied | **Auto-managed** (YES/NO) |
| Reply Summary | **Auto-managed** |
| Next Scheduled Action | **Auto-managed** |
| Outcome | **Auto-managed** |

**Only fill in the first 6 columns.** The rest are managed by the agent.

---

## Status Flow

```
pending → sent → followed_up_1 → followed_up_2 → do_not_contact (ghosted)
                    ↓
                 replied → converted
```

---

## Running 24/7 on Mac Mini (PM2)

Instead of keeping a Terminal window open, use PM2 to keep the agent alive:

```bash
# Install PM2 globally (one time)
npm install -g pm2

# Start the agent
pm2 start server.js --name devcenter-email-agent

# Auto-start on login
pm2 startup
pm2 save
```

Now the agent runs in the background even if you close your Terminal.

To check logs: `pm2 logs devcenter-email-agent`
To stop: `pm2 stop devcenter-email-agent`
To restart: `pm2 restart devcenter-email-agent`

---

## Manual Run

Hit the **▶ Run Now** button in the dashboard, or:
```bash
# via API
curl -X POST http://localhost:3000/api/run
```

---

## Common Email Provider Settings

**Google Workspace (Gmail):**
```
SMTP_HOST=smtp.gmail.com  SMTP_PORT=587  SMTP_SECURE=false
IMAP_HOST=imap.gmail.com  IMAP_PORT=993  IMAP_SECURE=true
```
⚠️ Use an App Password (not your main password): myaccount.google.com/apppasswords

**cPanel / Hostinger:**
```
SMTP_HOST=mail.yourdomain.com  SMTP_PORT=587  SMTP_SECURE=false
IMAP_HOST=mail.yourdomain.com  IMAP_PORT=993  IMAP_SECURE=true
```

**Outlook / Microsoft 365:**
```
SMTP_HOST=smtp.office365.com  SMTP_PORT=587  SMTP_SECURE=false
IMAP_HOST=outlook.office365.com  IMAP_PORT=993  IMAP_SECURE=true
```

---

## Files

```
devcenter-email-agent/
├── server.js              Express server + cron scheduler
├── setup.js               Creates template contacts.xlsx
├── agent/
│   ├── emailAgent.js      Main orchestrator (Step 1-4 daily flow)
│   ├── mailer.js          SMTP email sender
│   ├── imapReader.js      IMAP inbox reader
│   ├── excelManager.js    Read/write contacts.xlsx
│   ├── aiWriter.js        Claude AI email generator
│   └── stateManager.js    JSON conversation memory
├── public/
│   └── index.html         Dashboard UI
├── data/
│   ├── contacts.xlsx      Your leads (created by setup.js)
│   └── email_state.json   AI memory (auto-created)
└── .env                   Your config (never commit this)
```
