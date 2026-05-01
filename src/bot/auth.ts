import crypto from "node:crypto";

const token = process.env.BOT_TOKEN;
if (!token) throw new Error("BOT_TOKEN must be set");
const botToken: string = token;

/**
 * Verify Telegram Mini App initData
 * Returns the parsed user object if valid, null otherwise
 */
export function verifyInitData(initData: string): { id: number; [key: string]: any } | null {
  try {
    const params = new URLSearchParams(initData);
    const hash = params.get("hash");
    if (!hash) return null;

    params.delete("hash");

    // Sort params alphabetically and join
    const entries: [string, string][] = [];
    params.forEach((value: string, key: string) => entries.push([key, value]));
    
    const dataCheckString = entries
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([key, value]) => `${key}=${value}`)
      .join("\n");

    // Generate secret key from bot token
    const secretKey = crypto
      .createHmac("sha256", "WebAppData")
      .update(botToken)
      .digest();

    // Verify hash
    const checkHash = crypto
      .createHmac("sha256", secretKey)
      .update(dataCheckString)
      .digest("hex");

    if (checkHash !== hash) return null;

    // Parse user data
    const userStr = params.get("user");
    if (!userStr) return null;

    return JSON.parse(decodeURIComponent(userStr));
  } catch {
    return null;
  }
}
