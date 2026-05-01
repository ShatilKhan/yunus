import { db } from "../src/db/client";
import { verifyInitData } from "../src/bot/auth";
import { isAllowed } from "../src/db/client";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, X-Telegram-Init-Data",
};

function setCors(res: any) {
  for (const [key, value] of Object.entries(corsHeaders)) {
    res.setHeader(key, value);
  }
}

export default async function handler(req: any, res: any): Promise<void> {
  setCors(res);

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const initData = req.headers["x-telegram-init-data"];
  if (!initData) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const user = verifyInitData(initData);
  if (!user || !(await isAllowed(user.id))) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    const days = req.query?.days || "30";

    const result = await db.execute(
      `SELECT
        c.type,
        c.name,
        SUM(e.amount) as total,
        COUNT(*) as count
      FROM entries e
      JOIN categories c ON e.category_id = c.id
      WHERE e.user_id = ?
      AND e.created_at >= datetime('now', '-' || ? || ' days')
      GROUP BY c.id
      ORDER BY total DESC`,
      [user.id, Number(days)]
    );

    const totalsResult = await db.execute(
      `SELECT
        SUM(CASE WHEN c.type = 'expense' THEN e.amount ELSE 0 END) as total_expense,
        SUM(CASE WHEN c.type = 'saving' THEN e.amount ELSE 0 END) as total_saving,
        COUNT(*) as transaction_count
      FROM entries e
      JOIN categories c ON e.category_id = c.id
      WHERE e.user_id = ?
      AND e.created_at >= datetime('now', '-' || ? || ' days')`,
      [user.id, Number(days)]
    );

    return res.status(200).json({
      success: true,
      data: {
        breakdown: result.rows,
        totals: totalsResult.rows[0],
      },
    });
  } catch (error: any) {
    console.error("Stats API error:", error);
    return res.status(500).json({ error: error.message });
  }
}
