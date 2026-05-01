import { db, isAllowed } from "../src/db/client";
import { verifyInitData } from "../src/bot/auth";

// CORS headers for Mini App
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, X-Telegram-Init-Data",
};

async function getUserFromRequest(req: Request): Promise<{ id: number } | null> {
  const initData = req.headers.get("X-Telegram-Init-Data");
  if (!initData) return null;

  const user = verifyInitData(initData);
  if (!user) return null;

  // Check whitelist
  if (!(await isAllowed(user.id))) return null;

  return user;
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "GET" && req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const user = await getUserFromRequest(req);
  if (!user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    if (req.method === "GET") {
      const url = new URL(req.url);
      const category = url.searchParams.get("category");
      const days = url.searchParams.get("days");

      let query = `
        SELECT e.id, e.amount, e.note, e.created_at,
               c.id as category_id, c.name as category_name, c.type as category_type
        FROM entries e
        JOIN categories c ON e.category_id = c.id
        WHERE e.user_id = ?
      `;
      const params: any[] = [user.id];

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

      return new Response(JSON.stringify({ success: true, data: result.rows }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (req.method === "POST") {
      const body = await req.json();
      const { categoryId, amount, note } = body;

      if (!categoryId || !amount || isNaN(Number(amount)) || Number(amount) <= 0) {
        return new Response(
          JSON.stringify({ error: "Invalid category or amount" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      await db.execute(
        "INSERT INTO entries (user_id, category_id, amount, note) VALUES (?, ?, ?, ?)",
        [user.id, Number(categoryId), Number(amount), note || null]
      );

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  } catch (error: any) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  return new Response(JSON.stringify({ error: "Not found" }), {
    status: 404,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
