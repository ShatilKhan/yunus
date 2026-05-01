import { bot } from "../src/bot/index";

const webhookSecret = process.env.WEBHOOK_SECRET;
if (!webhookSecret) throw new Error("WEBHOOK_SECRET must be set");

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  // Verify webhook secret
  const secretHeader = req.headers.get("X-Telegram-Bot-Api-Secret-Token");
  if (secretHeader !== webhookSecret) {
    return new Response("Unauthorized", { status: 401 });
  }

  try {
    const update = await req.json();
    await bot.handleUpdate(update);
    return new Response("OK", { status: 200 });
  } catch (error) {
    console.error("Webhook error:", error);
    return new Response("Internal error", { status: 500 });
  }
}
