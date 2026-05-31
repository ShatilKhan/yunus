import { bot } from "../src/bot/index";
import { db } from "../src/db/client";

const webhookSecret = process.env.WEBHOOK_SECRET;
if (!webhookSecret) throw new Error("WEBHOOK_SECRET must be set");

// Run once per cold start to apply any pending schema migrations
async function runMigrations() {
  try {
    await db.execute("ALTER TABLE budgets ADD COLUMN over_budget_date DATE");
  } catch {
    // Column already exists or table doesn't exist yet
  }
}

export default async function handler(req: any, res: any): Promise<void> {
  if (req.method !== "POST") {
    return res.status(405).send("Method not allowed");
  }

  // Verify webhook secret
  const secretHeader = req.headers["x-telegram-bot-api-secret-token"];
  if (secretHeader !== webhookSecret) {
    return res.status(401).send("Unauthorized");
  }

  try {
    await runMigrations();
    const update = req.body;
    await bot.init();
    await bot.handleUpdate(update);
    return res.status(200).send("OK");
  } catch (error) {
    console.error("Webhook error:", error);
    return res.status(500).send("Internal error");
  }
}
