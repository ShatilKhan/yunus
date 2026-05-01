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

```bash
curl -X POST "https://api.telegram.org/bot<BOT_TOKEN>/setWebhook" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://your-project.vercel.app/api/webhook",
    "secret_token": "your-webhook-secret"
  }'
```

Verify:

```bash
curl "https://api.telegram.org/bot<BOT_TOKEN>/getWebhookInfo"
```

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
| **Open Dashboard** | Send dashboard link |
| **View Summary** | Show last 30 days totals |

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

## Environment Variables Reference

| Variable | Required | Description |
|----------|----------|-------------|
| `BOT_TOKEN` | Yes | From @BotFather |
| `WEBHOOK_SECRET` | Yes | Random string for webhook verification |
| `TURSO_DATABASE_URL` | Yes | Turso database connection URL |
| `TURSO_AUTH_TOKEN` | Yes | Turso database auth token |
| `DASHBOARD_URL` | Yes | Your deployed Vercel URL |

## Security

- **Private Bot** — Only whitelisted users can access; first `/start` user becomes admin
- **initData Verification** — Telegram Mini App auth is cryptographically verified (HMAC-SHA256)
- **Webhook Secret** — Telegram webhooks include a secret token header
- **No Passwords** — Auth is handled entirely by Telegram's signed data
- **Database Encryption** — Turso encrypts data at rest and in transit (TLS)

## License

Private project — not for public distribution.
