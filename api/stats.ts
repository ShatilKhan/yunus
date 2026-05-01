import { db } from "../src/db/client";
import { verifyInitData } from "../src/bot/auth";
import { isAllowed } from "../src/db/client";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, X-Telegram-Init-Data",
};

export default async function handler(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "GET") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const initData = req.headers.get("X-Telegram-Init-Data");
  if (!initData) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const user = verifyInitData(initData);
  if (!user || !(await isAllowed(user.id))) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const url = new URL(req.url);
    const days = url.searchParams.get("days") || "30";

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

    return new Response(
      JSON.stringify({
        success: true,
        data: {
          breakdown: result.rows,
          totals: totalsResult.rows[0],
        },
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
}
