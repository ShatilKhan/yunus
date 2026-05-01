import { db, isAllowed } from "../src/db/client";
import { verifyInitData } from "../src/bot/auth";

// CORS headers for Mini App
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, X-Telegram-Init-Data",
};

function setCors(res: any) {
  for (const [key, value] of Object.entries(corsHeaders)) {
    res.setHeader(key, value);
  }
}

async function getUserFromRequest(req: any): Promise<{ id: number } | null> {
  const initData = req.headers["x-telegram-init-data"];
  if (!initData) return null;

  const user = verifyInitData(initData);
  if (!user) return null;

  if (!(await isAllowed(user.id))) return null;

  return user;
}

export default async function handler(req: any, res: any): Promise<void> {
  setCors(res);

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "GET" && req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const user = await getUserFromRequest(req);
  if (!user) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    if (req.method === "GET") {
      const category = req.query?.category;
      const days = req.query?.days;

      let query = `
        SELECT e.id, e.amount, e.note, e.created_at,
               c.id as category_id, c.name as category_name, c.type as category_type
        FROM entries e
        JOIN categories c ON e.category_id = c.id
        WHERE 1=1
      `;
      const params: any[] = [];

      if (category) {
        query += " AND e.category_id = ?";
        params.push(Number(category));
      }

      if (days) {
        query += " AND e.created_at >= datetime('now', '-' || ? || ' days')";
        params.push(Number(days));
      }

      query += " ORDER BY e.created_at DESC";

      const result = await db.execute(query, params);
      return res.status(200).json({ success: true, data: result.rows });
    }

    if (req.method === "POST") {
      const { categoryId, amount, note } = req.body || {};

      if (!categoryId || !amount || isNaN(Number(amount)) || Number(amount) <= 0) {
        return res.status(400).json({ error: "Invalid category or amount" });
      }

      await db.execute(
        "INSERT INTO entries (user_id, category_id, amount, note) VALUES (?, ?, ?, ?)",
        [user.id, Number(categoryId), Number(amount), note || null]
      );

      return res.status(200).json({ success: true });
    }
  } catch (error: any) {
    console.error("Entries API error:", error);
    return res.status(500).json({ error: error.message });
  }

  return res.status(404).json({ error: "Not found" });
}
