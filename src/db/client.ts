import { connect } from "@tursodatabase/serverless";

const url = process.env.TURSO_DATABASE_URL;
const authToken = process.env.TURSO_AUTH_TOKEN;

if (!url || !authToken) {
  throw new Error("TURSO_DATABASE_URL and TURSO_AUTH_TOKEN must be set");
}

export const db = connect({ url, authToken });

// Helper to run schema initialization
export async function initSchema() {
  const schema = await Bun.file("src/db/schema.sql").text();
  await db.exec(schema);
}

// Helper to get admin ID from settings
export async function getAdminId(): Promise<number | null> {
  try {
    const row = await db.execute("SELECT value FROM settings WHERE key = 'admin_id'");
    if (row.rows.length > 0) {
      return Number(row.rows[0].value);
    }
  } catch {
    // Table might not exist yet
  }
  return null;
}

// Helper to check if user is admin
export async function isAdmin(userId: number): Promise<boolean> {
  const adminId = await getAdminId();
  return adminId === userId;
}

// Helper to check if user is allowed
export async function isAllowed(userId: number): Promise<boolean> {
  try {
    const row = await db.execute(
      "SELECT 1 FROM allowed_users WHERE telegram_id = ?",
      [userId]
    );
    return row.rows.length > 0;
  } catch {
    return false;
  }
}

// Helper to add allowed user (admin only)
export async function addAllowedUser(telegramId: number, addedBy: number): Promise<void> {
  await db.execute(
    "INSERT OR IGNORE INTO allowed_users (telegram_id, added_by) VALUES (?, ?)",
    [telegramId, addedBy]
  );
}

// Helper to remove allowed user (admin only)
export async function removeAllowedUser(telegramId: number): Promise<void> {
  await db.execute(
    "DELETE FROM allowed_users WHERE telegram_id = ?",
    [telegramId]
  );
}

// Helper to list allowed users
export async function listAllowedUsers(): Promise<Array<{ telegram_id: number; added_by: number; added_at: string }>> {
  const result = await db.execute(
    "SELECT telegram_id, added_by, added_at FROM allowed_users ORDER BY added_at DESC"
  );
  return result.rows as Array<{ telegram_id: number; added_by: number; added_at: string }>;
}
