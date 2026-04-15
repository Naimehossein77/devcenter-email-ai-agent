# DevCenter Email Agent

> **Never write another cold email. Never forget a follow-up. Never miss a reply.**
>
> Upload your leads. Walk away. The AI writes personalized outreach, sends it daily, checks your inbox hourly, replies on your behalf, follows up when prospects go quiet, and tracks every conversation — all running 24/7 on your own machine. No SaaS. No monthly fees. No credit card.

---

## The Problem

If you run an agency, freelance, or sell any service, cold outreach is the highest-leverage activity in your business — and also the most soul-crushing.

You know the drill:

- Open a spreadsheet of leads
- Research each one
- Write a personalized email
- Remember to follow up in 7 days
- Remember to follow up again
- Respond to replies before they go cold
- Track who's pending, who's been contacted, who's converted
- Repeat every single day

Most people give up after a week. Or they hire a VA. Or they pay $99/month for a bloated SaaS that still makes them do half the work.

**This agent does all of it. For free. Forever. On a machine you already own.**

---

## What It Actually Does

Every day, at the time you choose, this agent:

1. **Reads your lead list** from a local database
2. **Writes a personalized email** for each new prospect using AI that knows their company, role, and industry
3. **Sends the outreach** via Resend (industry-leading deliverability)
4. **Waits 20 minutes between sends** so you don't look like a bot
5. **Checks your inbox every hour** for replies
6. **Detects out-of-office auto-replies** and ignores them (saves your quota)
7. **Writes thoughtful responses** when real humans reply — in your voice
8. **Follows up after 7 days of silence** (up to 2 follow-ups)
9. **Marks dead leads as ghosted** after 2 ignored follow-ups
10. **Polls Resend every 30 min** to detect bounces and spam complaints, auto-cleaning your list
11. **Tracks everything** in a local SQLite database — sent, replied, converted, bounced, unsubscribed
12. **Alerts you by email** when something breaks
13. **Logs metrics** so you can see trends over 30 days

You monitor the whole thing from a clean web dashboard at `http://localhost:3000`.

---

## Why This Matters

Most cold outreach tools are either:

- **Expensive SaaS** ($49-$299/month, cap on sends, data lives on their servers)
- **Generic bulk senders** (templates, spammy, 2% open rate)
- **Manual VA work** (slow, inconsistent, expensive)

This agent gives you:

| Feature | Most SaaS Tools | This Agent |
|---|---|---|
| Personalized AI emails | Extra cost | ✅ Built-in |
| Auto-reply to prospects | ❌ Not offered | ✅ Built-in |
| Auto follow-ups | ✅ | ✅ |
| Runs 24/7 | Their servers | Your machine |
| Monthly fee | $49-$299 | $0 |
| Data ownership | Their database | Your SQLite file |
| Customizable AI prompts | ❌ Locked | ✅ Edit `aiWriter.js` |
| Unlimited leads | Capped | Unlimited |
| Bounce detection | Sometimes | ✅ Built-in |
| OOF auto-reply filtering | ❌ Rare | ✅ Built-in |
| Open source | ❌ | ✅ MIT |

**The only costs: a Resend account (free tier: 3,000 emails/month, 100/day) and an OpenRouter API key (free AI models available).**

---

## Who This Is For

- **Agency owners** doing cold outreach to close new clients
- **Freelancers** looking for consistent pipeline
- **SaaS founders** running early-stage sales
- **Consultants** nurturing a pipeline of warm leads
- **Sales developers** who hate manual follow-up
- **Anyone** tired of CRM subscriptions

If you send 3 or more cold emails a week, this pays for itself the day you install it.

---

## Key Features

### AI-Powered Personalization

The AI doesn't use templates. For each lead, it reads:

- Their **name**
- Their **company**
- Their **role**
- Their **industry**
- Any **notes** you add

And writes a 3–5 sentence email that references their specific situation, names a concrete solution you can build for them, and offers to share demos — not a generic pitch.

Example output for a hospital without a website:

> **Subject:** Your Hospital Website
>
> Hi,
>
> Saw you're running Abedin Hospital — you have the Facebook page going but no website yet.
>
> We can build you a portfolio website with doctor profiles, services and facilities so patients can see everything you offer and trust your care before visiting.
>
> Can show you demos of similar work we've done if you'd like a look.
>
> Best,
> Jubair
> CEO - DevCenter

Every email is different. Every email is relevant.

### Smart Inbox Handling

Every hour, the agent checks your inbox. When a prospect replies:

- It **reads their actual message**
- **Reviews the full conversation history**
- **Writes a thoughtful response** that directly addresses what they said
- **Sends it** spaced 5–10 minutes apart from other replies (so it looks human)
- **Updates their status to "replied"**

When someone sends an **out-of-office auto-reply**, it's detected via email headers (`Auto-Submitted`, `X-Autoreply`, `Precedence`) and subject regex, and silently ignored. No wasted AI quota. No false "replied" status.

When someone replies with **"unsubscribe"**, they're instantly marked as unsubscribed and never contacted again.

### Automatic Follow-Ups

No more "oh, I forgot to follow up with that lead from 3 weeks ago."

After 7 days of silence, the agent writes a **fresh follow-up** (not a copy-paste of the first email) and sends it. After another 7 days of silence, it sends a **second, softer** follow-up. After that, it marks the lead as ghosted and stops.

You never lose a lead to neglect, and you never become the annoying person who emails 5 times.

### Bounce & Complaint Detection

Every 30 minutes, the agent polls Resend's API to check delivery status of recent sends. If an email **bounces**, that contact is auto-moved to `do_not_contact` with outcome `Bounced`. If someone marks it as **spam**, same thing — marked `Complaint`.

Your lead list stays clean. Your sender reputation stays strong. Your future emails stay in inboxes.

### Spam-Safe by Design

Getting into inboxes is the hardest part of cold email. This agent does everything right:

- ✅ **Resend API** — industry-leading deliverability infrastructure
- ✅ **Plain text only** (HTML from unknown senders is a spam trigger)
- ✅ **20 minutes between sends** (no burst traffic)
- ✅ **Max 10 emails per day** by default (protects domain reputation)
- ✅ **List-Unsubscribe header** (CAN-SPAM compliance + Gmail one-click)
- ✅ **Human sender name** ("Jubair from DevCenter" not just "DevCenter")
- ✅ **No URLs in outreach** (links trigger Jellyfish/Bayesian filters)
- ✅ **No marketing buzzwords** (prompt forbids "game-changer", "cutting-edge", etc.)
- ✅ **Title-case subject lines**
- ✅ **SPF + DKIM + DMARC** (you set up DNS once in Resend)

### Dashboard Built for Scale

A clean, self-hosted web dashboard at `http://localhost:3000`:

- **Stats cards** — total, pending, sent, follow-ups, replied, converted, ghosted, unsubscribed (click to filter)
- **30-day metrics chart** — sent vs. replies handled over time
- **Recent runs** — success/failure of each run, with summary
- **Contact table** — searchable, sortable, paginated (handles 10,000+ leads)
- **Bulk actions** — select multiple, set status, or delete (soft delete, recoverable)
- **Add/Edit lead modal** — inline editing with all fields
- **Conversation history modal** — click "View" on any contact to see the entire thread
- **Industry filter** — auto-populated from your lead data
- **CSV upload** — bulk-import leads, automatic deduplication (case-insensitive)
- **CSV export** — download filtered results for backup or external tools
- **Manual Run Now button** — trigger the agent instantly instead of waiting for the cron

Thousands of leads? No problem. The dashboard paginates, sorts, and filters fast because SQLite is fast.

### Error Alerts

If something breaks — IMAP connection fails, Resend rate-limits you, AI model returns garbage, database write fails — the agent sends **you** an email alert. Dedupe is built in (max 1 alert per error type per 6 hours) so you don't get spammed by your own agent.

You'll know about problems within minutes, not days.

### Runs at Startup, Survives Reboots

With **PM2**, the agent starts automatically when your Mac (or Linux box) boots. Survives crashes. Auto-restarts on code changes if you want. One command to set up, then forget it exists.

```bash
pm2 start server.js --name email-agent
pm2 save
pm2 startup  # run the sudo command it prints
```

Done. Close your terminal. Reboot your machine. The agent is still running.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    DevCenter Email Agent                     │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  ┌──────────┐    ┌──────────┐    ┌─────────────────────┐    │
│  │ Outreach │    │  Inbox   │    │   Bounce Checker    │    │
│  │ (daily)  │    │ (hourly) │    │   (every 30 min)    │    │
│  └─────┬────┘    └────┬─────┘    └──────────┬──────────┘    │
│        │              │                     │                │
│        └──────────────┼─────────────────────┘                │
│                       │                                       │
│                  ┌────▼─────┐                                 │
│                  │  Mutex   │  ← prevents race conditions    │
│                  └────┬─────┘                                 │
│                       │                                       │
│        ┌──────────────┼──────────────┐                       │
│        │              │              │                       │
│   ┌────▼────┐   ┌─────▼────┐   ┌─────▼────┐                 │
│   │ Mailer  │   │  IMAP    │   │   AI     │                 │
│   │ (Resend)│   │ Reader   │   │ (OpenR.) │                 │
│   └────┬────┘   └─────┬────┘   └─────┬────┘                 │
│        │              │              │                       │
│        └──────────────┼──────────────┘                       │
│                       │                                       │
│                  ┌────▼─────┐                                 │
│                  │  SQLite  │  ← single source of truth     │
│                  │  (WAL)   │                                 │
│                  └────┬─────┘                                 │
│                       │                                       │
│                  ┌────▼─────┐                                 │
│                  │ Express  │                                 │
│                  │ Dashboard│  ← localhost:3000              │
│                  └──────────┘                                 │
│                                                               │
└─────────────────────────────────────────────────────────────┘
```

**Stack:**

- **Node.js + Express** — lightweight server, tiny footprint
- **SQLite (better-sqlite3, WAL mode)** — ACID-compliant local DB, handles 10k+ leads easily
- **node-cron** — daily + hourly + 30-min schedulers with timezone support
- **Resend API** — outbound email (deliverability + bounce detection)
- **ImapFlow** — inbound email reading
- **mailparser** — parse incoming messages + detect auto-replies
- **OpenRouter** — unified API for any AI model (free models available)
- **Vanilla HTML/CSS/JS dashboard** — no framework bloat, loads instantly

---

## Setup (10 Minutes)

### 1. Clone and Install

```bash
git clone https://github.com/Naimehossein77/devcenter-email-ai-agent.git
cd devcenter-email-ai-agent
npm install
```

### 2. Get Your API Keys

**Resend** (email sending):

1. Sign up at [resend.com](https://resend.com) — free tier: 3,000 emails/month
2. Add and **verify your domain** — add the SPF, DKIM, DMARC DNS records they give you
3. Generate an API key

**OpenRouter** (AI):

1. Sign up at [openrouter.ai](https://openrouter.ai)
2. Generate an API key
3. (Optional) Add credit for paid models, or use a free model like `minimax/minimax-m2.5:free`

### 3. Configure Environment

```bash
cp .env.example .env
```

Open `.env` and fill in:

```env
PORT=3000

SMTP_FROM=contact@yourdomain.com
SMTP_FROM_NAME=Your Name from Company

RESEND_API_KEY=re_your_resend_key_here

IMAP_HOST=mail.privateemail.com   # or imap.gmail.com, etc.
IMAP_PORT=993
IMAP_SECURE=true
IMAP_USER=contact@yourdomain.com
IMAP_PASS="your_email_password"

OPENROUTER_API_KEY=sk-or-v1-your_key_here

CRON_SCHEDULE=0 18 * * *
CRON_TIMEZONE=Asia/Dhaka
MAX_OUTREACH_PER_DAY=10
```

### 4. (If Upgrading) Migrate from Old Excel Setup

If you were running an older version with Excel storage:

```bash
node scripts/migrate-from-excel.js
```

This imports your existing `data/contacts.xlsx` and `data/email_state.json` into the new SQLite database, backing up the old files first.

### 5. Start the Agent

```bash
npm start
```

The SQLite database auto-creates on first run. Open [http://localhost:3000](http://localhost:3000) to see the dashboard.

### 6. Add Leads

**Option A: Upload CSV from dashboard.** Click "Upload CSV" in the header. Format:

```csv
Name,Email,Company,Role/Title,Industry,Notes
Jane Doe,jane@acme.com,Acme Inc,CTO,SaaS,Looking for a booking app
```

Duplicates (by email) are automatically skipped.

**Option B: Use the "Add Lead" button** to add leads one at a time via the modal form.

**Option C: Use the API** directly:

```bash
curl -X POST http://localhost:3000/api/contacts \
  -H "Content-Type: application/json" \
  -d '{"Name":"Jane Doe","Email":"jane@acme.com","Company":"Acme Inc","Role/Title":"CTO","Industry":"SaaS","Notes":"Looking for a booking app"}'
```

### 7. Run It 24/7 with PM2

```bash
# Install PM2 once
npm install -g pm2

# Start the agent
pm2 start server.js --name email-agent
pm2 save

# Enable startup on boot (prints a sudo command — run it)
pm2 startup
```

Now the agent runs in the background, survives reboots, and auto-restarts if it crashes.

**Useful commands:**

- `pm2 logs email-agent` — tail the logs
- `pm2 restart email-agent` — restart after code changes
- `pm2 stop email-agent` — stop
- `pm2 status` — see all processes

---

## Schedules

| Task | When | What |
|---|---|---|
| Outreach + Follow-ups + Ghost marking | Daily (default 6 PM, configurable) | Sends new emails, writes follow-ups, marks ghosts |
| Inbox check + AI replies | Every hour on the hour | Reads replies, detects auto-replies, sends AI responses |
| Bounce + complaint check | Every 30 minutes | Polls Resend API, auto-moves bounced contacts to `do_not_contact` |
| Manual run | On-demand | Click "Run Now" in the dashboard |

Change the outreach time by editing `CRON_SCHEDULE` in `.env`. Format: `minute hour day month weekday`. Examples:

- `0 9 * * *` — 9 AM daily
- `0 18 * * *` — 6 PM daily (default)
- `0 9,14 * * 1-5` — 9 AM and 2 PM weekdays only

Change timezone with `CRON_TIMEZONE` (default: `Asia/Dhaka`). Supports any IANA timezone.

---

## Lead Status Flow

```
     ┌──────────────────────────────────────────┐
     │                                          │
  pending ─────────▶ sent ─────▶ followed_up_1  │
                      │              │          │
                      ▼              ▼          │
                   replied     followed_up_2    │
                      │              │          │
                      ▼              ▼          │
                  converted    do_not_contact   │
                              (ghosted/bounced) │
                                                │
                           unsubscribed ◀───────┘
```

- **pending** — new lead, not yet contacted
- **sent** — initial outreach sent
- **followed_up_1** — first follow-up sent
- **followed_up_2** — second (last) follow-up sent
- **replied** — prospect replied, AI responded
- **converted** — you manually marked them as a won deal
- **do_not_contact** — ghosted after 2 follow-ups, OR bounced, OR spam complaint
- **unsubscribed** — they replied with "unsubscribe"

---

## Customization

### Change the AI's Voice and Context

Edit `agent/aiWriter.js`. Look for `COMPANY_CONTEXT` — update it with your company name, services, and tone preferences. Every generated email uses this context.

For **outreach emails**, see `writeOutreachEmail`. For **follow-ups**, see `writeFollowUpEmail`. For **AI replies to prospects**, see `writeReply`.

### Change the AI Model

In `agent/aiWriter.js`, line 61, change `model`:

```javascript
model: 'minimax/minimax-m2.5:free',  // free
// or
model: 'anthropic/claude-sonnet-4',  // best quality (paid)
// or
model: 'google/gemini-2.0-flash',    // cheap + fast
```

Browse models at [openrouter.ai/models](https://openrouter.ai/models).

### Change Send Limits and Delays

In `.env`:

- `MAX_OUTREACH_PER_DAY=10` — cap daily outreach (higher = risk of spam flags)
- `SEND_DELAY_MS=1200000` — gap between sends (default 20 min)

---

## Security Notes

This is a local-first tool. The dashboard runs on `localhost:3000` with **no authentication**. Don't expose it to the public internet.

**Recommended for admin access from other devices:**

- **Tailscale** (free, easiest) — install on your Mac and admins' devices; access `http://your-mac:3000` over a private mesh network
- **Cloudflare Tunnel** (free) — expose via `admin.yourdomain.com` with optional Cloudflare Access login wall

**Never do:**

- Port-forward 3000 on your router without adding authentication first
- Commit your `.env` file
- Share your Resend or OpenRouter keys

---

## Data Files

```
devcenter-email-agent/
├── server.js                    Express server + cron schedulers
├── setup.js                     Legacy setup (not needed anymore)
├── agent/
│   ├── db.js                    SQLite schema + connection
│   ├── contactStore.js          Data access layer
│   ├── emailAgent.js            Main orchestrator
│   ├── mailer.js                Resend email sender + status polling
│   ├── imapReader.js            IMAP reader + OOF/unsubscribe detection
│   ├── aiWriter.js              AI email generator (OpenRouter)
│   ├── bounceChecker.js         Polls Resend for bounce/complaint
│   └── alerter.js               Error email alerts
├── public/
│   └── index.html               Dashboard UI (vanilla JS, no framework)
├── scripts/
│   └── migrate-from-excel.js    One-time migration from Excel
└── data/
    └── agent.db                 SQLite database (auto-created, gitignored)
```

---

## Troubleshooting

**Emails going to spam?**

- Verify your domain in Resend with all three records: SPF, DKIM, DMARC
- Test your domain at [mail-tester.com](https://www.mail-tester.com) — aim for 9/10 or higher
- Warm up gradually: start with 3–5 emails/day for 2 weeks, then ramp up
- Keep emails under 60 words with no URLs

**AI returns garbage or times out?**

- Free OpenRouter models have rate limits; the agent retries up to 3 times
- Consider switching to a paid model for production (~$0.01 per email)
- Check the logs: `pm2 logs email-agent`

**Agent not starting on boot?**

- Run `pm2 startup` and execute the `sudo` command it prints
- After running it, do `pm2 save` again

**Can't find replies?**

- Check your IMAP credentials in `.env`
- Gmail users: use an [App Password](https://myaccount.google.com/apppasswords), not your regular password
- Run the inbox check manually: `curl -X POST http://localhost:3000/api/run-inbox`

**Dashboard won't load?**

- Check if the server is running: `lsof -i :3000`
- Check logs: `pm2 logs email-agent` or `tail -f /tmp/agent-test.log`

---

## Roadmap

Things that might come next (PRs welcome):

- A/B testing infrastructure (track which subject lines convert)
- Lead scoring based on reply sentiment
- Calendar integration for booking detected interest
- Slack/Discord alerts instead of email
- Multi-user auth for team access
- Built-in LinkedIn scraping helper
- Deal pipeline view

---

## License

**MIT.** Fork it, sell it, break it, make it yours.

---

## Who Built This

Built by [Jubair Hossain](https://www.devcenter.dev) — CEO of DevCenter, a Flutter and AI development agency.

If you use this and it makes you money, a star on GitHub means everything.

If you need it customized or integrated into your existing stack, [reach out](mailto:contact@devcenter.dev) — we build custom AI agents and automation for agencies and SaaS companies.

---

**Stop sending cold emails by hand. Let the agent do it.**
