import type { Bot } from "grammy";
import { db } from "../db/client";

export interface ActiveBudget {
  id: number;
  amount: number;
  start_date: string;
  alert_sent: number;
}

export async function getActiveBudget(): Promise<ActiveBudget | null> {
  try {
    const result = await db.execute(
      "SELECT id, amount, start_date, alert_sent FROM budgets WHERE end_date IS NULL ORDER BY start_date DESC LIMIT 1"
    );
    if (result.rows.length === 0) return null;
    const row = result.rows[0] as any;
    return {
      id: Number(row.id),
      amount: Number(row.amount),
      start_date: String(row.start_date),
      alert_sent: Number(row.alert_sent),
    };
  } catch {
    return null;
  }
}

export async function getBudgetSpend(
  startDate: string,
  endDate?: string
): Promise<number> {
  let sql =
    `SELECT COALESCE(SUM(e.amount), 0) AS total
     FROM entries e
     JOIN categories c ON c.id = e.category_id
     WHERE c.type = 'expense'
       AND e.created_at >= datetime(?, 'start of day')`;
  const params: any[] = [startDate];
  if (endDate) {
    sql += " AND e.created_at < datetime(?, 'start of day')";
    params.push(endDate);
  }
  const result = await db.execute(sql, params);
  return Number((result.rows[0] as any).total) || 0;
}

export async function getBudgetStatus(): Promise<{
  budget: ActiveBudget;
  spent: number;
  remaining: number;
} | null> {
  const budget = await getActiveBudget();
  if (!budget) return null;
  const spent = await getBudgetSpend(budget.start_date);
  return { budget, spent, remaining: budget.amount - spent };
}

async function getSavingsCategoryId(): Promise<number> {
  const result = await db.execute(
    "SELECT id FROM categories WHERE name = 'Savings'"
  );
  if (result.rows.length === 0) {
    throw new Error("Savings category not found");
  }
  return Number((result.rows[0] as any).id);
}

export async function setBudget(
  amount: number,
  startDate: string,
  createdBy: number
): Promise<{ closedRemainder: number }> {
  const active = await getActiveBudget();
  let closedRemainder = 0;

  if (active) {
    const spent = await getBudgetSpend(active.start_date, startDate);
    const remainder = active.amount - spent;
    if (remainder > 0) {
      const savingsId = await getSavingsCategoryId();
      const dayBefore = isoDayBefore(startDate);
      const note = `Auto-savings: budget ${active.start_date} → ${dayBefore}`;
      await db.execute(
        "INSERT INTO entries (user_id, category_id, amount, note, created_at) VALUES (?, ?, ?, ?, ?)",
        [createdBy, savingsId, remainder, note, `${dayBefore} 23:59:00`]
      );
      closedRemainder = remainder;
    }
    await db.execute("UPDATE budgets SET end_date = ? WHERE id = ?", [
      startDate,
      active.id,
    ]);
  }

  await db.execute(
    "INSERT INTO budgets (amount, start_date, end_date, alert_sent, created_by) VALUES (?, ?, NULL, 0, ?)",
    [amount, startDate, createdBy]
  );

  return { closedRemainder };
}

function isoDayBefore(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(y!, (m ?? 1) - 1, d ?? 1);
  dt.setDate(dt.getDate() - 1);
  const pad = (n: number) => (n < 10 ? `0${n}` : String(n));
  return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`;
}

export async function checkAndAlertOverBudget(bot: Bot): Promise<void> {
  const active = await getActiveBudget();
  if (!active) return;
  if (active.alert_sent === 1) return;

  const spent = await getBudgetSpend(active.start_date);
  if (spent <= active.amount) return;

  // Mark alerted BEFORE sending so concurrent writes don't double-fire.
  const update = await db.execute(
    "UPDATE budgets SET alert_sent = 1 WHERE id = ? AND alert_sent = 0",
    [active.id]
  );
  // If no rows changed, another invocation already sent the alert.
  if (Number((update as any).rowsAffected ?? (update as any).changes ?? 0) === 0) {
    return;
  }

  const over = spent - active.amount;
  const message =
    `⚠️ Over budget!\n\n` +
    `Spent: ${spent.toFixed(2)} of ${active.amount.toFixed(2)}\n` +
    `Over by: ${over.toFixed(2)}\n` +
    `Since: ${active.start_date}`;

  const recipients = await db.execute(
    "SELECT telegram_id FROM allowed_users"
  );
  for (const row of recipients.rows as Array<{ telegram_id: number }>) {
    try {
      await bot.api.sendMessage(Number(row.telegram_id), message);
    } catch (err) {
      console.error("Failed to alert user", row.telegram_id, err);
    }
  }
}
