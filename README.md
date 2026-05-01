# Yunus Finance Tracker

A personal finance management Telegram bot with a Mini App dashboard. Track your daily expenses and savings through an intuitive bot interface, then visualize everything in a beautiful web dashboard — all inside Telegram.

## Features

- **Telegram Bot Wizard** — Add single entries via a guided 3-step flow (Category → Amount → Note)
- **Bulk Entry Mode** — Enter multiple transactions at once, one per line
- **Mini App Dashboard** — Full-screen dashboard inside Telegram with charts and data tables
- **Category Filtering** — 14 built-in categories (Bazar, Grocery, Shopping, Date, Travel, Medicine, Rent, Bills, Pocket Money, Wife, Donation, Others, Home, Savings)
- **Time Filtering** — View data by Daily, Weekly, or Monthly ranges
- **Admin Whitelist** — Only authorized users can access the bot; admin controls who gets access
- **Private by Design** — First user to message `/start` becomes admin; everyone else is blocked until whitelisted
- **Shared Data** — All whitelisted users see the same entries and summaries (perfect for managing shared household finances)
- **Daily, Weekly & Monthly Summaries** — Generate summary reports on-demand from the bot, or schedule them to run automatically

## Architecture

```
Telegram User
     │
     ├─ /start ────────► Bot (Grammy.js)
     │                      │
     │                      ├─ Polling (local dev)
     │                      └─ Webhook (production)
     │                           │
     │                           ▼
     │                      Vercel Serverless
     │                      ├─ /api/webhook ──► Bot Handlers
     │                      ├─ /api/entries ──► CRUD API
     │                      ├─ /api/categories
     │                      ├─ /api/stats
     │                      └─ / (static) ────► React Dashboard
     │                           │
     │                           ▼
     │                      Turso Cloud (SQLite)
     │
     └─ Open Dashboard ──► Mini App WebView
                              │
                              ▼
                         React 19 + shadcn/ui
                         ├─ Stats Cards
                         ├─ Pie Chart
                         ├─ Data Table
                         └─ Filters
```

### Auth Flow

1. User opens bot in Telegram and sends `/start`
2. If no admin exists, user becomes admin automatically
3. Admin can whitelist others via `/admin add <telegram_id>`
4. User taps "Open Dashboard" — Telegram opens Mini App with signed `initData`
5. Backend verifies `initData` signature using bot token
6. Backend checks if user's Telegram ID is in the `allowed_users` table
7. If authorized → dashboard loads with their data

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Runtime | Bun 1.x |
| Bot Framework | Grammy.js |
| Frontend | React 19 |
| Styling | Tailwind CSS v4 |
| UI Components | shadcn/ui |
| Charts | Recharts (via shadcn `chart`) |
| Database | Turso (libSQL / SQLite) |
| Hosting | Vercel (serverless) |
| Auth | Telegram Mini App `initData` |

## Project Structure

```
yunus/
├── api/                          # Vercel serverless functions
│   ├── webhook.ts                # Telegram webhook handler
│   ├── entries.ts                # GET/POST entries
│   ├── categories.ts             # GET categories
│   └── stats.ts                  # GET dashboard aggregates
├── src/
│   ├── db/
│   │   ├── client.ts             # Turso connection + helpers
│   │   └── schema.sql            # Database schema + seeds
│   ├── bot/
│   │   ├── bot.ts                # Grammy bot instance
│   │   ├── index.ts              # Re-exports + imports handlers
│   │   ├── handlers.ts           # Commands, wizard, bulk entry, callbacks
│   │   ├── session.ts            # Turso-backed session store
│   │   └── auth.ts               # initData HMAC verification
│   ├── dashboard/
│   │   ├── App.tsx               # Dashboard root
│   │   ├── components/
│   │   │   ├── StatsCards.tsx    # Summary cards (Expense/Saving/Count)
│   │   │   ├── ChartSection.tsx  # Pie chart breakdown
│   │   │   ├── Filters.tsx       # Category + time filters
│   │   │   └── DataTable.tsx     # Transaction sheet
│   │   └── hooks/
│   │       └── useAuth.ts        # Telegram Mini App auth hook
│   ├── components/ui/            # shadcn/ui components
│   ├── lib/
│   │   └── utils.ts              # cn() helper
│   ├── index.html                # HTML entry (loads Telegram Web App SDK)
│   ├── frontend.tsx              # React entry point
│   ├── index.css                 # Global styles
│   └── index.ts                  # Local dev server (Bun.serve + polling)
├── package.json
├── tsconfig.json
├── vercel.json                   # Vercel routing config
└── build.ts                      # Production build script
```

## Prerequisites

Before you begin, ensure you have:

1. **[Bun](https://bun.sh)** installed (`bun --version` should work)
2. **[Vercel CLI](https://vercel.com/docs/cli)** installed (`npm i -g vercel`)
3. **[Turso CLI](https://docs.turso.tech/cli/introduction)** installed (`curl -sSfL https://get.tur.so/install.sh | bash`)
4. A **Telegram account** to create a bot via [@BotFather](https://t.me/BotFather)

## Setup

### 1. Clone and Install

```bash
git clone <your-repo-url>
cd yunus
bun install
```

### 2. Create Telegram Bot

1. Open Telegram and message [@BotFather](https://t.me/BotFather)
2. Send `/newbot` and follow the prompts
3. Save the bot token (looks like `123456:ABC-DEF...`)

### 3. Create Turso Database

```bash
# Login to Turso
turso auth login

# Create database
turso db create yunus-finance

# Get connection URL (save this)
turso db show yunus-finance --url

# Create auth token (save this)
turso db tokens create yunus-finance
```

### 4. Run Schema

```bash
turso db shell yunus-finance < src/db/schema.sql
```

### 5. Set Environment Variables

Create a `.env` file in the project root:

```env
BOT_TOKEN=your-botfather-token-here
WEBHOOK_SECRET=any-random-string-at-least-32-chars
TURSO_DATABASE_URL=libsql://your-db.turso.io
TURSO_AUTH_TOKEN=your-turso-token-here
DASHBOARD_URL=https://your-project.vercel.app
CRON_SECRET=another-random-string-for-cron-jobs
```

**Note:** `DASHBOARD_URL` is a placeholder for now. You'll update it after first deploy.

### 6. Run Locally

```bash
bun dev
```

The bot will start in **polling mode** and the dev server will run at `http://localhost:3000`.

Message your bot `/start` on Telegram to test.

### 7. Deploy to Vercel

```bash
# Build the static dashboard
bun run build

# Deploy
vercel
```

When prompted:
- **Directory:** `./` (current directory)
- **Modify settings:** `N` (no)

### 8. Set Environment Variables on Vercel

```bash
vercel env add BOT_TOKEN
vercel env add WEBHOOK_SECRET
vercel env add TURSO_DATABASE_URL
vercel env add TURSO_AUTH_TOKEN
vercel env add DASHBOARD_URL
```

For each, select `Production` (or all environments).

Then redeploy:

```bash
vercel --prod
```

### 9. Update DASHBOARD_URL

After deploy, copy your Vercel URL (e.g., `https://yunus.vercel.app`) and update the env var:

```bash
vercel env add DASHBOARD_URL
# Enter: https://your-project.vercel.app
vercel --prod
```

### 10. Set Telegram Webhook

After deploying, you must tell Telegram where to send updates:

```bash
curl -X POST "https://api.telegram.org/bot<BOT_TOKEN>/setWebhook" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://your-project.vercel.app/api/webhook",
    "secret_token": "your-webhook-secret"
  }'
```

**Response:** `{"ok":true,"result":true,"description":"Webhook was set"}`

**Verify it's working:**

```bash
curl "https://api.telegram.org/bot<BOT_TOKEN>/getWebhookInfo"
```

Expected output:
```json
{
  "ok": true,
  "result": {
    "url": "https://your-project.vercel.app/api/webhook",
    "has_custom_certificate": false,
    "pending_update_count": 0,
    "max_connections": 40
  }
}
```

#### Webhook Troubleshooting

If the bot doesn't respond on Telegram after deploying:

| Symptom | Cause | Fix |
|---------|-------|-----|
| `last_error_message: "Wrong response from the webhook: 500"` | Function crashing on Vercel | Check `vercel logs` for the actual error |
| `TypeError: req.headers.get is not a function` | Using Web Standard `Request` API on Vercel (which uses Node.js `IncomingMessage`) | Already fixed in this project — use `req.headers["name"]` instead |
| `Bot not initialized!` | Missing `bot.init()` in webhook handler | Already fixed — `api/webhook.ts` calls `await bot.init()` |
| `{"ok":false,"error_code":400,"description":"Bad Request: secret token contains unallowed characters"}` | `WEBHOOK_SECRET` has invalid chars (`=`, `/`, `+`) | Use only `a-z`, `A-Z`, `0-9`, `_`, `-` |
| `pending_update_count` keeps growing | Webhook returning errors; Telegram is retrying | Fix the error, then run `deleteWebhook` and `setWebhook` again |

**To reset the webhook (useful after URL changes or errors):**

```bash
# 1. Delete old webhook and clear queue
curl "https://api.telegram.org/bot<BOT_TOKEN>/deleteWebhook?drop_pending_updates=true"

# 2. Re-set with new URL
curl -X POST "https://api.telegram.org/bot<BOT_TOKEN>/setWebhook" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://your-project.vercel.app/api/webhook",
    "secret_token": "your-clean-secret"
  }'
```

**Important:** After every `vercel --prod` deploy that changes the API functions, the env vars are rebuilt. If you added env vars after the last deploy, **redeploy first** (`vercel --prod`), then re-set the webhook.

**Check Vercel logs for function errors:**
```bash
vercel logs https://your-project.vercel.app
```
Or visit: `https://vercel.com/shatilkhans-projects/yunus/logs`

## Database Management

### Schema

The database uses **Turso** (SQLite-compatible) with these tables:

| Table | Purpose |
|-------|---------|
| `categories` | 14 fixed expense/saving categories |
| `entries` | All user transactions |
| `sessions` | Bot wizard state (serverless-safe) |
| `settings` | Admin config (e.g., `admin_id`) |
| `allowed_users` | Whitelist of authorized Telegram IDs |

### Adding a New Category

1. Update `src/db/schema.sql` — add to the `INSERT OR IGNORE INTO categories` block
2. Run the insert manually on existing databases:

```bash
turso db shell your-db-name
```

Then:

```sql
INSERT OR IGNORE INTO categories (id, name, type) VALUES (15, 'NewCategory', 'expense');
```

### Backup

```bash
# Export to SQL
turso db shell your-db-name ".dump" > backup.sql

# Import from SQL
turso db shell your-db-name < backup.sql
```

## Bot Commands

### User Commands

| Command | Description |
|---------|-------------|
| `/start` | Show welcome menu with buttons |

### Inline Buttons

| Button | Action |
|--------|--------|
| **Add Entry** | Start single-entry wizard |
| **Add Multiple** | Start bulk entry mode |
| **Open Dashboard** | Open Mini App dashboard |
| **Today** | Show today's summary |
| **This Week** | Show this week's summary |
| **This Month** | Show this month's summary |

### Bulk Entry Format

Send multiple lines, one per entry:

```
Bazar 500 Weekly market
Grocery 1200
Savings 2000 Monthly savings
```

- Format: `Category Amount [Note]`
- Amount `0` or missing → category skipped
- Note is optional

### Admin Commands

| Command | Description |
|---------|-------------|
| `/admin add <id>` | Whitelist a Telegram user |
| `/admin remove <id>` | Remove a user from whitelist |
| `/admin list` | Show all whitelisted users |

**How to find a Telegram ID:** Message [@userinfobot](https://t.me/userinfobot)

## Admin Guide

### First-Time Setup

When you first deploy the bot, **no admin exists**. The first person to message `/start` becomes the admin automatically. You'll see:

> "You have been set as the admin. Welcome!"

### Adding a New User

To allow someone else to use the bot, you need their **Telegram user ID**.

**Step 1: Get their Telegram ID**
- Ask them to message [@userinfobot](https://t.me/userinfobot) on Telegram
- They'll receive their ID (e.g., `123456789`)

**Step 2: Add them to the whitelist**

Message your bot:
```
/admin add 123456789
```

**Response:**
> "User 123456789 added to whitelist."

**Step 3: They can now use the bot**
- They message the bot `/start`
- They get full access to all features

### Removing a User

```
/admin remove 123456789
```

**Response:**
> "User 123456789 removed from whitelist."

### Listing All Users

```
/admin list
```

**Response:**
```
Allowed users:
ID: 123456789 (added by 987654321)
ID: 987654321 (added by 987654321)
```

### Security Notes

- The admin (first user) is **automatically** whitelisted
- **Non-whitelisted users** get "Access denied. This bot is private." when messaging `/start`
- Admin commands (`/admin`) are **restricted** to the admin only
- The admin ID is stored in the `settings` table, not in env vars (so it can't be leaked)
- You can change admin by manually updating the `settings` table in Turso (advanced)

### Shared Data

**All whitelisted users share the same data.** When any user adds an entry, it appears in everyone's dashboard and summaries. This is designed for **managing shared finances** (e.g., a couple tracking household expenses together).

- **Read access:** All whitelisted users see all entries
- **Write access:** All whitelisted users can add entries (tracked by `user_id` for audit)
- **No isolation:** There is no per-user data separation

## Summaries

The bot provides **Daily, Weekly, and Monthly summaries** both on-demand and via scheduled reports.

### On-Demand Summaries

Tap these buttons from the `/start` menu for instant reports:

| Button | Period | Data Range |
|--------|--------|-----------|
| **Today** | Daily | From midnight today until now |
| **This Week** | Weekly | From the most recent Thursday until now |
| **This Month** | Monthly | From the 1st of this month until now |

**Summary format:**
```
📊 [Period] Summary
━━━━━━━━━━━━━━
💸 Bazar: 500.00
💸 Grocery: 1200.00
💰 Savings: 2000.00

💸 Total Expense: 1700.00
💰 Total Savings: 2000.00
📈 Net: +300.00
```

- **💸** = Expense categories
- **💰** = Savings categories
- Categories with no entries are hidden
- Shows "No entries for this period" if empty

### Scheduled Summaries

Scheduled summaries use **the previous period** (not current):

| Schedule | Period | Data Range |
|----------|--------|-----------|
| Daily at 12:30 AM | Yesterday | Full previous day (midnight to midnight) |
| Thursday 12:30 AM | Last Week | Previous Thursday to last Thursday |
| Last day of month | Last Month | Full previous month |

**Bangladesh Time (UTC+6) conversion:**
- 12:30 AM Bangladesh = 18:30 UTC (previous day)

### Setup Automated Summaries via Cron

Since Vercel's free plan doesn't support cron jobs, use [cron-job.org](https://cron-job.org) (free):

1. Sign up at [cron-job.org](https://cron-job.org)
2. Create 3 cron jobs:

**Daily Summary**
- URL: `https://your-project.vercel.app/api/summary?type=daily&mode=scheduled&user_id=YOUR_TELEGRAM_ID`
- Schedule: Daily at 18:30 UTC

**Weekly Summary**
- URL: `https://your-project.vercel.app/api/summary?type=weekly&mode=scheduled&user_id=YOUR_TELEGRAM_ID`
- Schedule: Weekly on Wednesday at 18:30 UTC

**Monthly Summary**
- URL: `https://your-project.vercel.app/api/summary?type=monthly&mode=scheduled&user_id=YOUR_TELEGRAM_ID`
- Schedule: Monthly on the last day at 18:30 UTC

3. Set the header `X-Cron-Secret` to match your `CRON_SECRET` env var
4. The API returns JSON with the summary text in the `data.text` field

**Note:** To receive summaries directly in Telegram, you would need a separate script that calls this API and then uses the Telegram Bot API `sendMessage` to deliver it. For now, check the cron logs or call the API manually.

## Environment Variables Reference

| Variable | Required | Description |
|----------|----------|-------------|
| `BOT_TOKEN` | Yes | From @BotFather |
| `WEBHOOK_SECRET` | Yes | Random string for webhook verification |
| `TURSO_DATABASE_URL` | Yes | Turso database connection URL |
| `TURSO_AUTH_TOKEN` | Yes | Turso database auth token |
| `DASHBOARD_URL` | Yes | Your deployed Vercel URL |
| `CRON_SECRET` | No | Secret for external cron job authentication |

## Security

- **Private Bot** — Only whitelisted users can access; first `/start` user becomes admin
- **initData Verification** — Telegram Mini App auth is cryptographically verified (HMAC-SHA256)
- **Webhook Secret** — Telegram webhooks include a secret token header
- **No Passwords** — Auth is handled entirely by Telegram's signed data
- **Database Encryption** — Turso encrypts data at rest and in transit (TLS)

## License

Private project — not for public distribution.
