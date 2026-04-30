# Financial Management Telegram Bot — Implementation Plan

**Platform:** Vercel (free, no credit card) + Turso (SQLite, free, no credit card) + Grammy.js + React 19 + shadcn/ui + Tailwind CSS v4 + Bun

**Date:** 2026-05-01
**Status:** Planning complete. Ready for implementation.

---

## 1. Why Vercel + Turso?

| Requirement | Solution |
|-------------|----------|
| Free hosting, no credit card | Vercel Hobby plan |
| Database persistence | Turso (libSQL/SQLite, edge-hosted) |
| Telegram bot | Grammy.js in webhook mode (no always-on server needed) |
| Dashboard UI | React 19 + shadcn/ui + Tailwind v4 |
| Encryption | AES-256-GCM for notes field |
| Auth | Telegram Web App initData verification (zero login screen) |

**Vercel uses serverless functions.** Telegram bot runs in **webhook mode** (Telegram pushes updates to `/api/webhook`), so no always-on process is required.

---

## 2. Project Structure

```
project-root/
├── api/                          # Vercel serverless functions
│   ├── webhook.ts                # Telegram webhook handler (POST)
│   ├── entries.ts                # GET list/filter, POST create entry
│   ├── categories.ts             # GET all categories
│   └── stats.ts                  # GET dashboard aggregates
├── src/
│   ├── db/
│   │   ├── client.ts             # Turso/libsql connection + helpers
│   │   └── schema.sql            # Database schema + seed data
│   ├── bot/
│   │   ├── index.ts              # Grammy bot instance setup
│   │   ├── handlers.ts           # /start, Add Entry wizard, callbacks
│   │   ├── auth.ts               # Telegram initData HMAC verification
│   │   └── session.ts            # Turso-backed session store for wizard state
│   ├── dashboard/
│   │   ├── App.tsx               # Dashboard root component
│   │   ├── components/
│   │   │   ├── DataTable.tsx     # Transaction sheet (TanStack Table)
│   │   │   ├── ChartSection.tsx  # Pie chart (Recharts)
│   │   │   ├── StatsCards.tsx    # Summary stat cards (shadcn Card)
│   │   │   ├── Filters.tsx       # Category Select + Time ToggleGroup
│   │   │   └── EntryForm.tsx     # (Optional) Direct add from dashboard
│   │   └── hooks/
│   │       └── useTelegramAuth.ts # Reads initData, calls /api/* with headers
│   ├── components/ui/            # shadcn/ui components (existing + new)
│   ├── lib/
│   │   ├── utils.ts              # cn() + crypto helpers
│   │   └── encryption.ts         # AES-256-GCM encrypt/decrypt for notes
│   ├── index.html                # HTML entry (loads Telegram Web App script)
│   ├── frontend.tsx              # React entry point
│   ├── index.css                 # Global styles
│   └── index.ts                  # Local dev server (Bun.serve + polling mode)
├── dist/                         # Build output (Vercel serves this)
├── .env                          # Environment variables (DO NOT COMMIT)
├── package.json
├── tsconfig.json
├── vercel.json                   # Vercel routing config
├── build.ts                      # Existing Bun build script
└── PLAN.md                       # This file
```

---

## 3. Database Schema (Turso / libSQL)

### `categories` — seeded once, never changes
```sql
CREATE TABLE IF NOT EXISTS categories (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  type TEXT NOT NULL CHECK(type IN ('expense', 'saving'))
);
```

**Seed (13 categories):**
| id | name | type |
|----|------|------|
| 1 | Bazar | expense |
| 2 | Grocery | expense |
| 3 | Date | expense |
| 4 | Travel | expense |
| 5 | Medicine | expense |
| 6 | Rent | expense |
| 7 | Bills | expense |
| 8 | Pocket Money | expense |
| 9 | Wife | expense |
| 10 | Donation | expense |
| 11 | Others | expense |
| 12 | Home | expense |
| 13 | Savings | saving |

### `entries` — every transaction
```sql
CREATE TABLE IF NOT EXISTS entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  category_id INTEGER NOT NULL,
  amount REAL NOT NULL,
  note TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (category_id) REFERENCES categories(id)
);
```

### `sessions` — bot conversation state (serverless-safe)
```sql
CREATE TABLE IF NOT EXISTS sessions (
  key TEXT PRIMARY KEY,
  data TEXT NOT NULL,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

### Indexes
```sql
CREATE INDEX IF NOT EXISTS idx_entries_user_id ON entries(user_id);
CREATE INDEX IF NOT EXISTS idx_entries_category_id ON entries(category_id);
CREATE INDEX IF NOT EXISTS idx_entries_created_at ON entries(created_at);
```

---

## 4. Telegram Bot Flow (Grammy.js)

### Commands
- `/start` → Welcome message + inline keyboard:
  ```
  [Add Entry]    [Open Dashboard]
  [View Summary]
  ```

### "Add Entry" Wizard (3-step, serverless-safe)
State stored in Turso `sessions` table (key = `userId:chatId`).

| Step | Bot Prompts | User Action |
|------|-------------|-------------|
| 1 | "Pick a category:" (inline keyboard, 2-column grid of 13 categories) | Taps category button |
| 2 | "Enter amount in Taka:" | Types a number. Bot validates it's numeric > 0 |
| 3 | "Add a note (optional):" | Types text OR taps `[Skip]` inline button |
| 4 | Summary card shown: "Category: X | Amount: Y | Note: Z" | `[Confirm]` `[Edit]` `[Cancel]` |
| 5 | On Confirm | Saved to `entries` table. Success message shown. Session cleared. |

### Dashboard Access
- **"Open Dashboard"** button sends Telegram Web App link (`https://your-project.vercel.app`)
- Works on **iOS, Android, Desktop, Web** Telegram clients
- No login screen — auth is automatic via Telegram `initData`

---

## 5. Dashboard UI (shadcn/ui)

### Components Required (shadcn add list)
- `table` — Data table with sorting/filtering (via TanStack Table)
- `chart` — Pie chart wrapper (uses Recharts)
- `toggle-group` — Time filter: Daily / Weekly / Monthly
- `select` — Category filter dropdown
- `card` — Summary stat cards
- `badge` — Category badges in table
- `sonner` — Toast notifications
- `skeleton` — Loading states
- `button` — Already installed
- `input` — Already installed
- `label` — Already installed
- `textarea` — Already installed

### Dashboard Layout
```
┌─────────────────────────────────────────────┐
│  [Total Expense] [Total Savings] [# Trans]  │  StatsCards (3 columns)
├─────────────────────────────────────────────┤
│  [Category: All ▼] [Daily] [Weekly] [Monthly]│  Filters row
├─────────────────────────────────────────────┤
│                                             │
│           [  PIE CHART  ]                   │  ChartSection
│                                             │
├─────────────────────────────────────────────┤
│  Date | Category | Amount | Note            │  DataTable
│  ...  | ...      | ...    | ...             │  (sortable, paginated)
└─────────────────────────────────────────────┘
```

### Filter Logic
- **Time filters:**
  - `daily` → `created_at >= datetime('now', '-1 day')`
  - `weekly` → `created_at >= datetime('now', '-7 day')`
  - `monthly` → `created_at >= datetime('now', '-30 day')`
- **Category filter:** `WHERE category_id = ?`
- **Combined:** `WHERE category_id = ? AND created_at >= datetime('now', '-7 day')`

---

## 6. Auth & Security

### Telegram Web App Auth (Zero Login)
1. Telegram client sends `initData` (signed with bot token's HMAC-SHA256)
2. Backend (`auth.ts`) verifies signature using `BOT_TOKEN`
3. Extracts `user.id` from `initData`
4. Checks `ALLOWED_USER_IDS` whitelist
5. Only then serves data

**Why it's safe:**
- `initData` is cryptographically signed by Telegram
- Only your backend (with your bot token) can verify it
- No passwords, no JWT tokens, no session cookies
- Works perfectly on mobile

### Note Encryption (AES-256-GCM)
- `note` field encrypted before INSERT
- Decrypted after SELECT
- Uses `NOTE_ENCRYPTION_KEY` env var (32+ chars)
- Amounts stay unencrypted (needed for SQL `SUM()`)

---

## 7. API Endpoints (Vercel Serverless)

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `POST` | `/api/webhook` | `X-Telegram-Bot-Api-Secret-Token` header | Receives Telegram updates. Routes to Grammy handlers. |
| `GET` | `/api/categories` | `X-Telegram-Init-Data` header | Returns all 13 categories as JSON. |
| `GET` | `/api/entries?category=&days=` | `X-Telegram-Init-Data` header | Returns filtered entries. Supports `category` (id) and `days` (1, 7, 30). |
| `POST` | `/api/entries` | `X-Telegram-Init-Data` header | Body: `{ categoryId, amount, note? }`. Creates new entry. |
| `GET` | `/api/stats?days=` | `X-Telegram-Init-Data` header | Returns aggregates: totalExpense, totalSaving, topCategory, count. |

### Error Responses
All endpoints return `{ success: boolean, data?: any, error?: string }`.

---

## 8. Environment Variables

```env
# Bot (from @BotFather)
BOT_TOKEN=123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11

# Webhook verification (you choose this)
WEBHOOK_SECRET=any-random-string-at-least-32-chars

# Turso (from `turso db show` and `turso db tokens create`)
TURSO_DATABASE_URL=libsql://your-db.turso.io
TURSO_AUTH_TOKEN=your-turso-token

# Encryption (generate with `openssl rand -hex 32`)
NOTE_ENCRYPTION_KEY=your-64-char-hex-key

# Dashboard
DASHBOARD_URL=https://your-project.vercel.app

# Access Control (comma-separated Telegram user IDs)
# Get your ID by messaging @userinfobot on Telegram
ALLOWED_USER_IDS=123456789
```

---

## 9. Deployment Steps

### Step 1: Turso Database
```bash
# Install Turso CLI
curl -sSfL https://get.tur.so/install.sh | bash

# Login
turso auth login

# Create database
turso db create yunus-finance

# Get connection URL
turso db show yunus-finance --url

# Create auth token
turso db tokens create yunus-finance

# Run schema (locally or via Turso shell)
turso db shell yunus-finance < src/db/schema.sql
```

### Step 2: Telegram Bot
1. Open Telegram, message [@BotFather](https://t.me/BotFather)
2. Send `/newbot`, follow prompts
3. Save the bot token
4. Optional: Set bot name, description, profile picture

### Step 3: Vercel Project
1. Push code to GitHub (private repo recommended)
2. Go to [vercel.com](https://vercel.com) → "Add New Project"
3. Import your GitHub repo
4. Add all environment variables from above
5. Deploy (first deployment is automatic)

### Step 4: Set Telegram Webhook (one-time)
```bash
curl -X POST "https://api.telegram.org/bot<BOT_TOKEN>/setWebhook" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://your-project.vercel.app/api/webhook",
    "secret_token": "your-webhook-secret"
  }'
```

Verify with:
```bash
curl "https://api.telegram.org/bot<BOT_TOKEN>/getWebhookInfo"
```

### Step 5: Add Your Telegram ID
1. Message [@userinfobot](https://t.me/userinfobot) on Telegram to get your ID
2. Add it to `ALLOWED_USER_IDS` in Vercel environment variables
3. Redeploy

### Step 6: Test
1. Message your bot `/start`
2. Tap "Add Entry" and complete the wizard
3. Tap "Open Dashboard" — your data should appear

---

## 10. Local Development

Run the full stack locally with **polling mode** (simpler than webhooks for dev):

```bash
# Terminal 1: Run dev server (includes bot polling + API routes + dashboard)
bun dev

# Terminal 2: Build dashboard for production preview
bun run build
```

**Local server (`src/index.ts`) responsibilities:**
- Serves built React dashboard on `/`
- API routes on `/api/*` (mirrors Vercel functions)
- Bot runs in **polling mode** for convenience
- Uses local Turso database (or SQLite file for offline dev)

---

## 11. Implementation Order

1. **Dependencies & shadcn components**
   - `bun add @libsql/client recharts @tanstack/react-table sonner`
   - `npx shadcn@latest add table chart toggle-group select badge sonner skeleton`

2. **Database layer**
   - `src/db/client.ts` — Turso connection
   - `src/db/schema.sql` — Schema + seed
   - `src/lib/encryption.ts` — AES-256-GCM helpers

3. **Bot layer**
   - `src/bot/auth.ts` — initData HMAC verification
   - `src/bot/session.ts` — Turso-backed session store
   - `src/bot/handlers.ts` — /start, wizard, callbacks
   - `src/bot/index.ts` — Grammy bot setup

4. **API functions (Vercel)**
   - `api/webhook.ts` — Telegram webhook handler
   - `api/categories.ts` — GET categories
   - `api/entries.ts` — GET/POST entries
   - `api/stats.ts` — GET aggregates

5. **Dashboard frontend**
   - `src/dashboard/hooks/useTelegramAuth.ts`
   - `src/dashboard/components/StatsCards.tsx`
   - `src/dashboard/components/ChartSection.tsx`
   - `src/dashboard/components/Filters.tsx`
   - `src/dashboard/components/DataTable.tsx`
   - `src/dashboard/App.tsx`

6. **Local dev server**
   - Update `src/index.ts` for polling mode + API routes

7. **Config & polish**
   - `vercel.json` — routing
   - `.env` template
   - Error handling, loading states, empty states
   - Final testing

---

## 12. Notes & Decisions

| Decision | Rationale |
|----------|-----------|
| **Vercel over Fly.io** | Free, no credit card required. Fly.io requires card on file. |
| **Turso over Vercel Postgres** | SQLite is simpler, edge-hosted, generous free tier. |
| **Webhook over Polling** | Vercel is serverless; polling needs always-on process. Webhook is the right pattern. |
| **Telegram auth over Clerk** | Zero login screen, cryptographically secure, perfect for personal use. |
| **One table for expenses + savings** | Category `type` column (`expense`/`saving`) handles both. Simplest schema. |
| **AES encryption for notes only** | Amounts need SQL aggregation. Notes are the only sensitive text. |
| **13 categories (12 expense + 1 saving)** | "Savings" is both a category and represents the saving type. Cleanest UX. |

---

## 13. Quick Reference

### Useful Commands
```bash
# Local dev
bun dev

# Build for production
bun run build

# Check Turso DB
turso db shell yunus-finance

# View Vercel logs
vercel logs

# Redeploy
vercel --prod
```

### Telegram API
- `https://api.telegram.org/bot<TOKEN>/getMe` — Verify bot token
- `https://api.telegram.org/bot<TOKEN>/getWebhookInfo` — Check webhook status
- `https://api.telegram.org/bot<TOKEN>/deleteWebhook` — Remove webhook (for polling)

### Grammy Docs
- https://grammy.dev/
- https://grammy.dev/ref/

---

*Plan finalized. Ready for implementation.*
