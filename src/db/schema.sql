-- Categories (13 fixed options)
CREATE TABLE IF NOT EXISTS categories (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  type TEXT NOT NULL CHECK(type IN ('expense', 'saving'))
);

-- Entries (transactions)
CREATE TABLE IF NOT EXISTS entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  category_id INTEGER NOT NULL,
  amount REAL NOT NULL,
  note TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (category_id) REFERENCES categories(id)
);

-- Sessions (bot wizard state, serverless-safe)
CREATE TABLE IF NOT EXISTS sessions (
  key TEXT PRIMARY KEY,
  data TEXT NOT NULL,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Settings (admin config, editable only via bot)
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- Allowed Users (whitelist, managed by admin via bot)
CREATE TABLE IF NOT EXISTS allowed_users (
  telegram_id INTEGER PRIMARY KEY,
  added_by INTEGER NOT NULL,
  added_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for fast filtering
CREATE INDEX IF NOT EXISTS idx_entries_user_id ON entries(user_id);
CREATE INDEX IF NOT EXISTS idx_entries_category_id ON entries(category_id);
CREATE INDEX IF NOT EXISTS idx_entries_created_at ON entries(created_at);

-- Seed categories
INSERT OR IGNORE INTO categories (id, name, type) VALUES
  (1, 'Bazar', 'expense'),
  (2, 'Grocery', 'expense'),
  (3, 'Date', 'expense'),
  (4, 'Travel', 'expense'),
  (5, 'Medicine', 'expense'),
  (6, 'Rent', 'expense'),
  (7, 'Bills', 'expense'),
  (8, 'Pocket Money', 'expense'),
  (9, 'Wife', 'expense'),
  (10, 'Donation', 'expense'),
  (11, 'Others', 'expense'),
  (12, 'Home', 'expense'),
  (13, 'Savings', 'saving');
