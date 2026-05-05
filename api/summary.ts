import { verifyInitData } from "../src/bot/auth";
import { isAllowed } from "../src/db/client";
import { generateSummary, formatSummary, type SummaryPeriod, type SummaryMode } from "../src/lib/summary";

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
  const cronSecret = req.headers["x-cron-secret"];

  let userId: number | null = null;

  if (initData) {
    const user = verifyInitData(initData);
    if (!user || !(await isAllowed(user.id))) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    userId = user.id;
  } else if (cronSecret) {
    const expectedSecret = process.env.CRON_SECRET;
    if (!expectedSecret || cronSecret !== expectedSecret) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    // For cron jobs, we need a user_id query param
    userId = req.query?.user_id ? Number(req.query.user_id) : null;
    if (!userId) {
      return res.status(400).json({ error: "user_id required for cron requests" });
    }
  } else {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const type = (req.query?.type as SummaryPeriod) || "daily";
  const mode = (req.query?.mode as SummaryMode) || "ondemand";

  if (!["daily", "weekly", "monthly"].includes(type)) {
    return res.status(400).json({ error: "Invalid type" });
  }

  try {
    const summary = await generateSummary(type, mode);
    return res.status(200).json({
      success: true,
      data: {
        text: await formatSummary(summary),
        summary,
      },
    });
  } catch (error: any) {
    console.error("Summary API error:", error);
    return res.status(500).json({ error: error.message });
  }
}
