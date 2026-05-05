import { db } from "../db/client";
import { getBudgetStatus } from "./budget";

export type SummaryPeriod = "daily" | "weekly" | "monthly";
export type SummaryMode = "scheduled" | "ondemand";

interface SummaryResult {
  period: string;
  periodLabel: string;
  entries: Array<{
    category: string;
    type: string;
    amount: number;
  }>;
  totalExpense: number;
  totalSaving: number;
  net: number;
  count: number;
}

/**
 * Generate a summary for all entries (shared data across all users)
 * @param period - daily | weekly | monthly
 * @param mode - scheduled (previous period) | ondemand (current period up to now)
 */
export async function generateSummary(
  period: SummaryPeriod,
  mode: SummaryMode = "ondemand"
): Promise<SummaryResult> {
  let startDate: string;
  let endDate: string;
  let periodLabel: string;

  const now = new Date();

  if (period === "daily") {
    if (mode === "scheduled") {
      // Yesterday (previous day)
      startDate = "datetime('now', 'start of day', '-1 day')";
      endDate = "datetime('now', 'start of day')";
      const yesterday = new Date(now);
      yesterday.setDate(yesterday.getDate() - 1);
      periodLabel = yesterday.toLocaleDateString("en-US", {
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric",
      });
    } else {
      // Today so far
      startDate = "datetime('now', 'start of day')";
      endDate = "datetime('now')";
      periodLabel = now.toLocaleDateString("en-US", {
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric",
      });
    }
  } else if (period === "weekly") {
    if (mode === "scheduled") {
      // Last week (previous 7 days)
      startDate = "datetime('now', 'weekday 4', '-14 days')"; // Previous Thursday
      endDate = "datetime('now', 'weekday 4', '-7 days')"; // Last Thursday
      periodLabel = "Last Week";
    } else {
      // This week so far (from most recent Thursday)
      startDate = "datetime('now', 'weekday 4', '-7 days')";
      endDate = "datetime('now')";
      periodLabel = "This Week";
    }
  } else {
    // monthly
    if (mode === "scheduled") {
      // Last month
      startDate = "datetime('now', 'start of month', '-1 month')";
      endDate = "datetime('now', 'start of month')";
      const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      periodLabel = lastMonth.toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
      });
    } else {
      // This month so far
      startDate = "datetime('now', 'start of month')";
      endDate = "datetime('now')";
      periodLabel = now.toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
      });
    }
  }

  const query = `
    SELECT
      c.name as category,
      c.type,
      SUM(e.amount) as amount
    FROM entries e
    JOIN categories c ON e.category_id = c.id
    WHERE e.created_at >= ${startDate}
    AND e.created_at < ${endDate}
    GROUP BY c.id
    ORDER BY c.type DESC, amount DESC
  `;

  const result = await db.execute(query);
  const rows = result.rows as Array<{ category: string; type: string; amount: number }>;

  const totalExpense = rows
    .filter((r) => r.type === "expense")
    .reduce((sum, r) => sum + Number(r.amount), 0);

  const totalSaving = rows
    .filter((r) => r.type === "saving")
    .reduce((sum, r) => sum + Number(r.amount), 0);

  return {
    period,
    periodLabel,
    entries: rows,
    totalExpense,
    totalSaving,
    net: totalSaving - totalExpense,
    count: rows.length,
  };
}

export async function generateDailySummaryForDate(
  iso: string
): Promise<SummaryResult> {
  const query = `
    SELECT
      c.name as category,
      c.type,
      SUM(e.amount) as amount
    FROM entries e
    JOIN categories c ON e.category_id = c.id
    WHERE e.created_at >= datetime(?, 'start of day')
    AND e.created_at < datetime(?, 'start of day', '+1 day')
    GROUP BY c.id
    ORDER BY c.type DESC, amount DESC
  `;

  const result = await db.execute(query, [iso, iso]);
  const rows = result.rows as Array<{ category: string; type: string; amount: number }>;

  const totalExpense = rows
    .filter((r) => r.type === "expense")
    .reduce((sum, r) => sum + Number(r.amount), 0);

  const totalSaving = rows
    .filter((r) => r.type === "saving")
    .reduce((sum, r) => sum + Number(r.amount), 0);

  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(y!, (m ?? 1) - 1, d ?? 1);
  const periodLabel = dt.toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return {
    period: "daily",
    periodLabel,
    entries: rows,
    totalExpense,
    totalSaving,
    net: totalSaving - totalExpense,
    count: rows.length,
  };
}

export async function formatSummary(summary: SummaryResult): Promise<string> {
  const lines: string[] = [];
  lines.push(`📊 ${summary.periodLabel} Summary`);
  lines.push("━━━━━━━━━━━━━━");

  if (summary.entries.length === 0) {
    lines.push("No entries for this period.");
  } else {
    for (const entry of summary.entries) {
      const emoji = entry.type === "saving" ? "💰" : "💸";
      lines.push(`${emoji} ${entry.category}: ${Number(entry.amount).toFixed(2)}`);
    }
  }

  lines.push("");
  lines.push(`💸 Total Expense: ${summary.totalExpense.toFixed(2)}`);
  lines.push(`💰 Total Savings: ${summary.totalSaving.toFixed(2)}`);
  lines.push(`📈 Net: ${summary.net >= 0 ? "+" : ""}${summary.net.toFixed(2)}`);

  const status = await getBudgetStatus();
  if (status) {
    lines.push("━━━━━━━━━━━━━━");
    lines.push(
      `💼 Budget: ${status.budget.amount.toFixed(2)} (since ${status.budget.start_date})`
    );
    lines.push(`💸 Spent: ${status.spent.toFixed(2)}`);
    if (status.remaining >= 0) {
      lines.push(`🪙 Remaining: ${status.remaining.toFixed(2)}`);
    } else {
      lines.push(`⚠️ Over by: ${Math.abs(status.remaining).toFixed(2)}`);
    }
  }

  return lines.join("\n");
}
