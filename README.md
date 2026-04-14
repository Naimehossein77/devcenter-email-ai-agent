# DevCenter Email Agent

Autonomous AI email outreach system. Paste leads → AI writes personalized emails → sends daily → checks inbox hourly → replies automatically → tracks everything in Excel.

Runs 24/7 on your machine. No cloud. No subscription. Just your API keys.

---

## What It Does

- **Writes personalized cold emails** with AI based on each lead's company, role, and industry
- **Sends outreach** daily at 9 AM (configurable, max 10/day, 20 min gap between sends)
- **Checks inbox hourly** for replies — AI reads them and writes thoughtful responses automatically
- **Follows up** after 7 days of silence (up to 2 follow-ups, then marks as ghosted)
- **Tracks everything** in an Excel sheet — status, dates, reply summaries, follow-up counts
- **Dashboard** at `http://localhost:3000` — upload leads via CSV, monitor stats, trigger manual runs

---

## Architecture

- **Sending:** [Resend](https://resend.com) API (best deliverability, avoids spam filters)
- **Reading replies:** IMAP (your existing email inbox — Gmail, Namecheap, etc.)
- **AI:** [OpenRouter](https://openrouter.ai) (supports free models like `minimax/minimax-m2.5:free`)
- **Storage:** Local Excel file (`data/contacts.xlsx`) + JSON state file

---

## Setup (One Time)

### 1. Clone & Install
```bash
git clone <your-repo-url>
cd devcenter-email-agent
npm install
```

### 2. Get API Keys

- **Resend** — sign up at [resend.com](https://resend.com), verify your domain, grab an API key
- **OpenRouter** — sign up at [openrouter.ai](https://openrouter.ai), grab an API key (free models available)

### 3. Configure Environment
```bash
cp .env.example .env
```
Open `.env` and fill in:
- `RESEND_API_KEY` — from resend.com
- `OPENROUTER_API_KEY` — from openrouter.ai
- `SMTP_FROM` / `SMTP_FROM_NAME` — your verified sender identity
- `IMAP_*` — your inbox credentials (for reading replies)

### 4. Verify Your Domain in Resend

Critical for deliverability. At [resend.com/domains](https://resend.com/domains):
- Add your domain
- Copy the DNS records (SPF, DKIM, DMARC)
- Add them to your domain registrar (Namecheap, Cloudflare, etc.)
- Wait for verification (usually minutes)

### 5. Create Contacts Sheet
```bash
npm run setup
```
Creates `data/contacts.xlsx` with the right columns.

### 6. Start the Agent
```bash
npm start
```
Open [http://localhost:3000](http://localhost:3000) to see the dashboard.

---

## Adding Leads

**Option 1 — Upload CSV via dashboard:**
Click the "Upload CSV" button. CSV format:
```csv
Name,Email,Company,Role/Title,Industry,Notes
Jane Doe,jane@company.com,Acme Inc,CTO,SaaS,Looking for a booking app
```

**Option 2 — Edit Excel directly:**
Open `data/contacts.xlsx` and fill in the first 6 columns. Leave `Status` blank — the agent treats empty or `pending` as new leads.

**Only fill in these columns** — the rest are managed by the agent:

| Column | You Fill? | Description |
|--------|-----------|-------------|
| Name | Yes | Lead's full name |
| Email | Yes | Their email address |
| Company | Yes | Their company name |
| Role/Title | Yes | Their job title |
| Industry | Yes | Helps AI personalize the email |
| Notes | Yes | Extra context for the AI (e.g. "needs a mobile app") |
| Status | Auto | `pending` → `sent` → `followed_up_1` → `followed_up_2` → `replied`/`do_not_contact` |
| Last Action | Auto | What the agent did last |
| Last Action Date | Auto | When it happened |
| Follow Up Count | Auto | Number of follow-ups sent |
| Replied | Auto | YES/NO |
| Reply Summary | Auto | AI summary of their reply |
| Next Scheduled Action | Auto | What's coming next |
| Outcome | Auto | Final outcome |

---

## Status Flow

```
pending → sent → followed_up_1 → followed_up_2 → do_not_contact (ghosted)
                    ↓
                 replied → converted (you mark this)
```

---

## Schedules

| Task | Schedule | What It Does |
|------|----------|-------------|
| Outreach + Follow-ups + Ghost marking | Daily at 9 AM | Sends new emails, follow-ups, marks ghosts |
| Inbox check + AI replies | Every hour | Reads replies and responds |
| Manual run | Dashboard button | Triggers both immediately |

**Anti-spam measures built in:**
- Plain text emails only (no HTML — HTML from unknown senders triggers spam)
- 20 min gap between outreach sends
- 5-10 min random gap between reply sends
- Max 10 emails/day by default
- Title case subject lines
- Sent via Resend (high deliverability)

---

## Running 24/7 with PM2

Instead of keeping a terminal window open:

```bash
# Install PM2 (one time)
npm install -g pm2

# Start the agent
pm2 start server.js --name devcenter-email-agent

# Auto-start on device boot
pm2 startup
pm2 save
```

Now the agent runs in the background even after reboot.

- Check logs: `pm2 logs devcenter-email-agent`
- Stop: `pm2 stop devcenter-email-agent`
- Restart: `pm2 restart devcenter-email-agent`

---

## Manual Run

Click the **Run Now** button in the dashboard, or:
```bash
curl -X POST http://localhost:3000/api/run
```

---

## Customizing the AI Prompt

Edit `agent/aiWriter.js`. Look for `COMPANY_CONTEXT` — update it with your company info, services, and tone. The AI uses this context when writing every email.

For reply style, see `writeReply` function in the same file.

---

## Files

```
devcenter-email-agent/
├── server.js              Express server + cron schedulers
├── setup.js               Creates template contacts.xlsx
├── agent/
│   ├── emailAgent.js      Main orchestrator (outreach + inbox check)
│   ├── mailer.js          Resend email sender
│   ├── imapReader.js      IMAP inbox reader
│   ├── excelManager.js    Read/write contacts.xlsx
│   ├── aiWriter.js        AI email generator (OpenRouter)
│   └── stateManager.js    JSON conversation memory
├── public/
│   └── index.html         Dashboard UI
├── data/
│   ├── contacts.xlsx      Your leads (created by setup.js)
│   └── email_state.json   AI memory (auto-created)
└── .env                   Your config (never commit this)
```

---

## Troubleshooting

**Emails going to spam?**
- Verify your domain in Resend (SPF, DKIM, DMARC all pass)
- Add a DMARC record: `v=DMARC1; p=none; rua=mailto:your@email.com`
- Warm up your domain: start with 3-5 emails/day for a week, ramp up slowly
- Test deliverability at [mail-tester.com](https://www.mail-tester.com)

**AI not responding to replies?**
- Check IMAP credentials are correct
- Verify the reply is in your INBOX folder (not junk)
- Check the inbox-check logs in the terminal

**Server crashes or won't start?**
- Make sure `.env` has all required fields
- Verify your Resend domain is actually verified
- Run `node -e "require('dotenv').config(); console.log(process.env.RESEND_API_KEY ? 'OK' : 'MISSING')"` to check key

---

## License

MIT. Fork it, modify it, make it yours.
