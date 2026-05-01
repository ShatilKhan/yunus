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
    const result = await db.execute(
      "SELECT id, name, type FROM categories ORDER BY id"
    );

    return res.status(200).json({ success: true, data: result.rows });
  } catch (error: any) {
    console.error("Categories API error:", error);
    return res.status(500).json({ error: error.message });
  }
}
