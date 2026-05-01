import { db } from "../db/client";

export async function getSession(key: string): Promise<any | null> {
  try {
    const result = await db.execute(
      "SELECT data FROM sessions WHERE key = ?",
      [key]
    );
    if (result.rows.length > 0) {
      return JSON.parse(result.rows[0].data as string);
    }
  } catch {
    // Table might not exist
  }
  return null;
}

export async function setSession(key: string, data: any): Promise<void> {
  await db.execute(
    "INSERT INTO sessions (key, data) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET data = excluded.data, updated_at = CURRENT_TIMESTAMP",
    [key, JSON.stringify(data)]
  );
}

export async function deleteSession(key: string): Promise<void> {
  await db.execute("DELETE FROM sessions WHERE key = ?", [key]);
}
