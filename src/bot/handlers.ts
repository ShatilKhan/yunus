import { InlineKeyboard } from "grammy";
import { bot } from "./bot";
import { getSession, setSession, deleteSession } from "./session";
import {
  db,
  isAdmin,
  isAllowed,
  addAllowedUser,
  removeAllowedUser,
  listAllowedUsers,
  getAdminId,
} from "../db/client";
import { generateSummary, generateDailySummaryForDate, formatSummary } from "../lib/summary";
import { parseUserDate, todayIso, daysAgoIso, formatDateLabel } from "../lib/date";
import {
  getBudgetStatus,
  setBudget,
  checkAndAlertOverBudget,
} from "../lib/budget";

// Middleware: check if user is allowed
bot.use(async (ctx, next) => {
  const userId = ctx.from?.id;
  if (!userId) return;

  // Allow admin always
  if (await isAdmin(userId)) {
    return next();
  }

  // Allow whitelisted users
  if (await isAllowed(userId)) {
    return next();
  }

  // First-time setup: if no admin exists, make this user admin
  const adminId = await getAdminId();
  if (!adminId) {
    await db.execute(
      "INSERT OR REPLACE INTO settings (key, value) VALUES ('admin_id', ?)",
      [String(userId)]
    );
    await addAllowedUser(userId, userId);
    await ctx.reply("You have been set as the admin. Welcome!");
    return next();
  }

  // Block everyone else
  if (ctx.message?.text?.startsWith("/")) {
    await ctx.reply("Access denied. This bot is private.");
  }
  // Silently ignore non-command messages from unauthorized users
});

// /start command
bot.command("start", async (ctx) => {
  const keyboard = new InlineKeyboard()
    .text("Add Entry", "wizard_start")
    .text("Add Multiple", "bulk_start")
    .row()
    .text("Edit / Backfill", "edit_start")
    .text("Budget", "budget_view")
    .row()
    .text("Open Dashboard", "open_dashboard")
    .row()
    .text("Today", "summary_daily")
    .text("Yesterday", "summary_yesterday")
    .text("Pick day", "summary_pick_day")
    .row()
    .text("This Week", "summary_weekly")
    .text("This Month", "summary_monthly");

  await ctx.reply(
    "Welcome to Yunus Finance Tracker!\n\n" +
    "Track your expenses and savings easily.",
    { reply_markup: keyboard }
  );
});

// Admin commands
bot.command("admin", async (ctx) => {
  const userId = ctx.from?.id;
  if (!userId || !(await isAdmin(userId))) {
    await ctx.reply("Admin only.");
    return;
  }

  const args = ctx.message?.text?.split(" ").slice(1) || [];
  const subcommand = args[0];

  if (subcommand === "add" && args[1]) {
    const targetId = Number(args[1]);
    if (isNaN(targetId)) {
      await ctx.reply("Invalid Telegram ID.");
      return;
    }
    await addAllowedUser(targetId, userId);
    await ctx.reply(`User ${targetId} added to whitelist.`);
  } else if (subcommand === "remove" && args[1]) {
    const targetId = Number(args[1]);
    if (isNaN(targetId)) {
      await ctx.reply("Invalid Telegram ID.");
      return;
    }
    await removeAllowedUser(targetId);
    await ctx.reply(`User ${targetId} removed from whitelist.`);
  } else if (subcommand === "list") {
    const users = await listAllowedUsers();
    if (users.length === 0) {
      await ctx.reply("No users in whitelist.");
      return;
    }
    const lines = users.map(
      (u) => `ID: ${u.telegram_id} (added by ${u.added_by})`
    );
    await ctx.reply("Allowed users:\n" + lines.join("\n"));
  } else {
    await ctx.reply(
      "Admin commands:\n" +
      "/admin add <telegram_id>\n" +
      "/admin remove <telegram_id>\n" +
      "/admin list"
    );
  }
});

// Wizard callbacks
bot.callbackQuery("wizard_start", async (ctx) => {
  const userId = ctx.from.id;
  await setSession(`wizard:${userId}`, { step: "category" });

  const categories = await db.execute("SELECT id, name FROM categories ORDER BY id");
  const keyboard = new InlineKeyboard();

  (categories.rows as Array<{ id: number; name: string }>).forEach((cat, i) => {
    if (i % 2 === 0 && i > 0) keyboard.row();
    keyboard.text(cat.name, `cat_${cat.id}`);
  });

  await ctx.editMessageText("Select a category:", { reply_markup: keyboard });
  await ctx.answerCallbackQuery();
});

bot.callbackQuery(/^cat_(\d+)$/, async (ctx) => {
  const userId = ctx.from.id;
  const categoryId = Number(ctx.match[1]);

  const prev = await getSession(`wizard:${userId}`);
  await setSession(`wizard:${userId}`, {
    step: "amount",
    categoryId,
    ...(prev?.targetDate ? { targetDate: prev.targetDate } : {}),
  });
  const dateNote = prev?.targetDate
    ? `\n\nDate: ${formatDateLabel(prev.targetDate)}`
    : "";
  await ctx.editMessageText(
    "Enter the amount in Taka:\n\n" +
    "(Just send a number, e.g. 500)" +
    dateNote
  );
  await ctx.answerCallbackQuery();
});

bot.callbackQuery("open_dashboard", async (ctx) => {
  const dashboardUrl = process.env.DASHBOARD_URL;
  if (dashboardUrl) {
    await ctx.answerCallbackQuery({ text: "Opening dashboard..." });
    await ctx.reply(
      "Tap below to open your dashboard inside Telegram:",
      {
        reply_markup: new InlineKeyboard().webApp("Open Dashboard", dashboardUrl),
      }
    );
  } else {
    await ctx.answerCallbackQuery({ text: "Dashboard URL not configured." });
  }
});

bot.callbackQuery("summary_daily", async (ctx) => {
  const summary = await generateSummary("daily", "ondemand");
  await ctx.editMessageText(await formatSummary(summary));
  await ctx.answerCallbackQuery();
});

bot.callbackQuery("summary_weekly", async (ctx) => {
  const summary = await generateSummary("weekly", "ondemand");
  await ctx.editMessageText(await formatSummary(summary));
  await ctx.answerCallbackQuery();
});

bot.callbackQuery("summary_monthly", async (ctx) => {
  const summary = await generateSummary("monthly", "ondemand");
  await ctx.editMessageText(await formatSummary(summary));
  await ctx.answerCallbackQuery();
});

bot.callbackQuery("summary_yesterday", async (ctx) => {
  const summary = await generateDailySummaryForDate(daysAgoIso(1));
  await ctx.editMessageText(await formatSummary(summary));
  await ctx.answerCallbackQuery();
});

bot.callbackQuery("summary_pick_day", async (ctx) => {
  const userId = ctx.from.id;
  await setSession(`summary:${userId}`, { step: "awaiting_date" });
  await ctx.editMessageText(
    "Send the day as YYYY-MM-DD (e.g. 2026-05-04), MM-DD (05-04 — current year), or 'today' / 'yesterday'."
  );
  await ctx.answerCallbackQuery();
});

// Budget flow
bot.callbackQuery("budget_view", async (ctx) => {
  const status = await getBudgetStatus();
  const keyboard = new InlineKeyboard().text("Set new budget", "budget_set_start");

  if (!status) {
    await ctx.editMessageText(
      "No active budget.\n\nTap below to set one — your spending will be tracked against it.",
      { reply_markup: keyboard }
    );
  } else {
    const overLine =
      status.remaining >= 0
        ? `🪙 Remaining: ${status.remaining.toFixed(2)}`
        : `⚠️ Over by: ${Math.abs(status.remaining).toFixed(2)}`;
    await ctx.editMessageText(
      `💼 Budget: ${status.budget.amount.toFixed(2)} (since ${status.budget.start_date})\n` +
      `💸 Spent: ${status.spent.toFixed(2)}\n` +
      overLine,
      { reply_markup: keyboard }
    );
  }
  await ctx.answerCallbackQuery();
});

bot.callbackQuery("budget_set_start", async (ctx) => {
  const userId = ctx.from.id;
  await setSession(`budget:${userId}`, { step: "awaiting_amount" });
  await ctx.editMessageText(
    "Enter the budget amount in Taka (e.g. 50000):"
  );
  await ctx.answerCallbackQuery();
});

bot.callbackQuery("budget_date_today", async (ctx) => {
  await proposeBudgetConfirm(ctx, ctx.from.id, todayIso());
  await ctx.answerCallbackQuery();
});

bot.callbackQuery("budget_date_yesterday", async (ctx) => {
  await proposeBudgetConfirm(ctx, ctx.from.id, daysAgoIso(1));
  await ctx.answerCallbackQuery();
});

bot.callbackQuery("budget_date_pick", async (ctx) => {
  const userId = ctx.from.id;
  const session = (await getSession(`budget:${userId}`)) || {};
  await setSession(`budget:${userId}`, { ...session, step: "awaiting_date" });
  await ctx.editMessageText(
    "Send the start date as YYYY-MM-DD (e.g. 2026-05-05), MM-DD (05-05 — current year), or 'today' / 'yesterday'."
  );
  await ctx.answerCallbackQuery();
});

async function proposeBudgetConfirm(
  ctx: any,
  userId: number,
  startDate: string,
  forceNewMessage = false
) {
  const session = (await getSession(`budget:${userId}`)) || {};
  if (typeof session.amount !== "number") {
    const send = forceNewMessage ? ctx.reply.bind(ctx) : ctx.editMessageText.bind(ctx);
    await send("Budget setup expired. Tap Budget to start again.");
    await deleteSession(`budget:${userId}`);
    return;
  }
  await setSession(`budget:${userId}`, {
    step: "confirm",
    amount: session.amount,
    startDate,
  });

  const keyboard = new InlineKeyboard()
    .text("Confirm", "budget_confirm")
    .text("Cancel", "budget_cancel");

  const status = await getBudgetStatus();
  const replaceNote = status
    ? `\n\nThis will close the current budget (${status.budget.amount.toFixed(2)} since ${status.budget.start_date}). ` +
      `Any remaining balance will be saved as Savings on ${startDate}.`
    : "";

  const body =
    `Confirm new budget:\n\n` +
    `Amount: ${session.amount.toFixed(2)} Taka\n` +
    `Starting: ${formatDateLabel(startDate)}` +
    replaceNote;

  if (forceNewMessage) {
    await ctx.reply(body, { reply_markup: keyboard });
  } else {
    await ctx.editMessageText(body, { reply_markup: keyboard });
  }
}

bot.callbackQuery("budget_confirm", async (ctx) => {
  const userId = ctx.from.id;
  const session = await getSession(`budget:${userId}`);
  if (!session || session.step !== "confirm") {
    await ctx.answerCallbackQuery();
    return;
  }

  const { closedRemainder } = await setBudget(
    session.amount,
    session.startDate,
    userId
  );
  await deleteSession(`budget:${userId}`);

  let msg = `Budget set: ${session.amount.toFixed(2)} Taka starting ${formatDateLabel(session.startDate)}.`;
  if (closedRemainder > 0) {
    msg += `\n\n🪙 Auto-saved ${closedRemainder.toFixed(2)} from previous budget to Savings.`;
  }
  await ctx.editMessageText(msg);
  await ctx.answerCallbackQuery();
});

bot.callbackQuery("budget_cancel", async (ctx) => {
  const userId = ctx.from.id;
  await deleteSession(`budget:${userId}`);
  await ctx.editMessageText("Budget setup cancelled.");
  await ctx.answerCallbackQuery();
});

// Edit / Backfill flow
bot.callbackQuery("edit_start", async (ctx) => {
  const userId = ctx.from.id;
  await deleteSession(`wizard:${userId}`);
  await setSession(`edit:${userId}`, { step: "pick_date" });

  const keyboard = new InlineKeyboard()
    .text("Today", "edit_date_today")
    .text("Yesterday", "edit_date_yesterday")
    .row()
    .text("Pick date", "edit_date_pick");

  await ctx.editMessageText(
    "Pick a day to edit or backfill:",
    { reply_markup: keyboard }
  );
  await ctx.answerCallbackQuery();
});

bot.callbackQuery("edit_date_today", async (ctx) => {
  await showDayEntries(ctx, ctx.from.id, todayIso());
  await ctx.answerCallbackQuery();
});

bot.callbackQuery("edit_date_yesterday", async (ctx) => {
  await showDayEntries(ctx, ctx.from.id, daysAgoIso(1));
  await ctx.answerCallbackQuery();
});

bot.callbackQuery("edit_date_pick", async (ctx) => {
  const userId = ctx.from.id;
  await setSession(`edit:${userId}`, { step: "awaiting_date" });
  await ctx.editMessageText(
    "Send the date as YYYY-MM-DD (e.g. 2026-05-04) or MM-DD (e.g. 05-04 — current year is assumed)."
  );
  await ctx.answerCallbackQuery();
});

async function showDayEntries(
  ctx: any,
  userId: number,
  targetDate: string,
  forceNewMessage = false
) {
  await setSession(`edit:${userId}`, { step: "viewing_day", targetDate });

  const result = await db.execute(
    `SELECT e.id, e.amount, c.name AS category_name
     FROM entries e
     JOIN categories c ON c.id = e.category_id
     WHERE e.created_at >= datetime(?, 'start of day')
       AND e.created_at <  datetime(?, 'start of day', '+1 day')
     ORDER BY e.created_at ASC`,
    [targetDate, targetDate]
  );

  const rows = result.rows as Array<{
    id: number;
    amount: number;
    category_name: string;
  }>;

  const keyboard = new InlineKeyboard();
  for (const row of rows) {
    keyboard
      .text(
        `#${row.id}  ${row.category_name}  ৳${row.amount}`,
        `edit_entry_${row.id}`
      )
      .row();
  }
  keyboard.text("+ Add for this date", "edit_add").row();
  keyboard.text("Back", "edit_start");

  const header =
    rows.length === 0
      ? `No entries for ${formatDateLabel(targetDate)}.`
      : `Entries for ${formatDateLabel(targetDate)}:`;

  const body = `${header}\n\nTap an entry to edit its amount, or add a new one.`;
  if (forceNewMessage) {
    await ctx.reply(body, { reply_markup: keyboard });
  } else {
    await ctx.editMessageText(body, { reply_markup: keyboard });
  }
}

bot.callbackQuery(/^edit_entry_(\d+)$/, async (ctx) => {
  const userId = ctx.from.id;
  const entryId = Number(ctx.match[1]);

  const result = await db.execute(
    "SELECT id, amount FROM entries WHERE id = ?",
    [entryId]
  );
  if (result.rows.length === 0) {
    await ctx.answerCallbackQuery({ text: "Entry not found." });
    return;
  }
  const current = result.rows[0] as { id: number; amount: number };

  const session = (await getSession(`edit:${userId}`)) || {};
  await setSession(`edit:${userId}`, {
    step: "awaiting_amount",
    targetDate: session.targetDate,
    editEntryId: entryId,
  });

  await ctx.editMessageText(
    `Editing entry #${entryId} (current amount: ${current.amount} Taka).\n\n` +
    `Send the new amount as a positive number.`
  );
  await ctx.answerCallbackQuery();
});

bot.callbackQuery("edit_add", async (ctx) => {
  const userId = ctx.from.id;
  const editSession = await getSession(`edit:${userId}`);
  if (!editSession?.targetDate) {
    await ctx.answerCallbackQuery({ text: "Pick a date first." });
    return;
  }

  await deleteSession(`edit:${userId}`);
  await setSession(`wizard:${userId}`, {
    step: "category",
    targetDate: editSession.targetDate,
  });

  const categories = await db.execute("SELECT id, name FROM categories ORDER BY id");
  const keyboard = new InlineKeyboard();
  (categories.rows as Array<{ id: number; name: string }>).forEach((cat, i) => {
    if (i % 2 === 0 && i > 0) keyboard.row();
    keyboard.text(cat.name, `cat_${cat.id}`);
  });

  await ctx.editMessageText(
    `Adding entry for ${formatDateLabel(editSession.targetDate)}.\n\nSelect a category:`,
    { reply_markup: keyboard }
  );
  await ctx.answerCallbackQuery();
});

// Bulk entry callback
bot.callbackQuery("bulk_start", async (ctx) => {
  const userId = ctx.from.id;
  await setSession(`bulk:${userId}`, { step: "awaiting_input" });

  const categories = await db.execute("SELECT name FROM categories ORDER BY id");
  const categoryList = (categories.rows as Array<{ name: string }>)
    .map((c) => c.name)
    .join(", ");

  await ctx.editMessageText(
    `Add multiple entries at once.\n\n` +
    `Send one line per entry in this format:\n` +
    `Category Amount [Note]\n\n` +
    `Examples:\n` +
    `Bazar 500 Weekly market\n` +
    `Grocery 1200\n` +
    `Savings 2000 Monthly savings\n\n` +
    `Categories: ${categoryList}\n\n` +
    `Tip: You can skip any category by leaving it out or using 0.`
  );
  await ctx.answerCallbackQuery();
});

// Handle wizard and bulk entry steps via text messages
bot.on("message:text", async (ctx) => {
  const userId = ctx.from.id;

  // Check bulk mode first
  const bulkSession = await getSession(`bulk:${userId}`);
  if (bulkSession && bulkSession.step === "awaiting_input") {
    await parseBulkEntries(ctx, userId, ctx.message.text);
    return;
  }

  // Budget setup
  const budgetSession = await getSession(`budget:${userId}`);
  if (budgetSession?.step === "awaiting_amount") {
    const amount = Number(ctx.message.text);
    if (isNaN(amount) || amount <= 0) {
      await ctx.reply("Please enter a valid positive number.");
      return;
    }
    await setSession(`budget:${userId}`, { step: "awaiting_date_choice", amount });
    const keyboard = new InlineKeyboard()
      .text("Today", "budget_date_today")
      .text("Yesterday", "budget_date_yesterday")
      .row()
      .text("Pick date", "budget_date_pick");
    await ctx.reply(
      `Amount: ${amount.toFixed(2)} Taka.\n\nWhen does this budget start?`,
      { reply_markup: keyboard }
    );
    return;
  }
  if (budgetSession?.step === "awaiting_date") {
    const iso = parseUserDate(ctx.message.text);
    if (!iso) {
      await ctx.reply(
        "Couldn't parse that date. Try YYYY-MM-DD (2026-05-04), MM-DD (05-05), or 'today' / 'yesterday'."
      );
      return;
    }
    await proposeBudgetConfirm(ctx, userId, iso, true);
    return;
  }

  // Pick-a-day summary
  const summarySession = await getSession(`summary:${userId}`);
  if (summarySession?.step === "awaiting_date") {
    const iso = parseUserDate(ctx.message.text);
    if (!iso) {
      await ctx.reply(
        "Couldn't parse that date. Try YYYY-MM-DD (2026-05-04), MM-DD (05-04), or 'today' / 'yesterday'."
      );
      return;
    }
    await deleteSession(`summary:${userId}`);
    const summary = await generateDailySummaryForDate(iso);
    await ctx.reply(await formatSummary(summary));
    return;
  }

  // Edit / backfill flows
  const editSession = await getSession(`edit:${userId}`);
  if (editSession?.step === "awaiting_date") {
    const iso = parseUserDate(ctx.message.text);
    if (!iso) {
      await ctx.reply(
        "Couldn't parse that date. Try YYYY-MM-DD (2026-05-04), MM-DD (05-04), or 'today' / 'yesterday'."
      );
      return;
    }
    await showDayEntries(ctx, userId, iso, true);
    return;
  }
  if (editSession?.step === "awaiting_amount") {
    const amount = Number(ctx.message.text);
    if (isNaN(amount) || amount <= 0) {
      await ctx.reply("Please enter a valid positive number.");
      return;
    }
    await db.execute(
      "UPDATE entries SET amount = ? WHERE id = ? AND user_id = ?",
      [amount, editSession.editEntryId, userId]
    );
    const targetDate = editSession.targetDate;
    await deleteSession(`edit:${userId}`);
    await ctx.reply(`Entry #${editSession.editEntryId} updated to ${amount} Taka.`);
    if (targetDate) {
      await showDayEntries(ctx, userId, targetDate, true);
    }
    await checkAndAlertOverBudget(bot);
    return;
  }

  const session = await getSession(`wizard:${userId}`);
  if (!session) return; // Not in wizard mode

  const text = ctx.message.text;

  if (session.step === "amount") {
    const amount = Number(text);
    if (isNaN(amount) || amount <= 0) {
      await ctx.reply("Please enter a valid positive number.");
      return;
    }
    await setSession(`wizard:${userId}`, {
      step: "note",
      categoryId: session.categoryId,
      amount,
      ...(session.targetDate ? { targetDate: session.targetDate } : {}),
    });

    const keyboard = new InlineKeyboard().text("Skip", "skip_note");
    await ctx.reply("Add a note (optional):", { reply_markup: keyboard });
  } else if (session.step === "note") {
    await setSession(`wizard:${userId}`, {
      step: "confirm",
      categoryId: session.categoryId,
      amount: session.amount,
      note: text,
      ...(session.targetDate ? { targetDate: session.targetDate } : {}),
    });
    await showConfirmation(ctx, userId);
  }
});

bot.callbackQuery("skip_note", async (ctx) => {
  const userId = ctx.from.id;
  const session = await getSession(`wizard:${userId}`);
  if (!session || session.step !== "note") {
    await ctx.answerCallbackQuery();
    return;
  }

  await setSession(`wizard:${userId}`, {
    step: "confirm",
    categoryId: session.categoryId,
    amount: session.amount,
    note: null,
    ...(session.targetDate ? { targetDate: session.targetDate } : {}),
  });
  await showConfirmation(ctx, userId);
  await ctx.answerCallbackQuery();
});

async function showConfirmation(ctx: any, userId: number) {
  const session = await getSession(`wizard:${userId}`);
  const catResult = await db.execute(
    "SELECT name FROM categories WHERE id = ?",
    [session.categoryId]
  );
  const categoryName = (catResult.rows[0] as { name: string })?.name || "Unknown";

  const noteText = session.note ? `\nNote: ${session.note}` : "";
  const dateText = session.targetDate
    ? `\nDate: ${formatDateLabel(session.targetDate)}`
    : "";

  const keyboard = new InlineKeyboard()
    .text("Confirm", "confirm_entry")
    .text("Cancel", "cancel_entry");

  await ctx.editMessageText(
    `Please confirm:\n\n` +
    `Category: ${categoryName}\n` +
    `Amount: ${session.amount} Taka` +
    noteText +
    dateText,
    { reply_markup: keyboard }
  );
}

bot.callbackQuery("confirm_entry", async (ctx) => {
  const userId = ctx.from.id;
  const session = await getSession(`wizard:${userId}`);
  if (!session || session.step !== "confirm") {
    await ctx.answerCallbackQuery();
    return;
  }

  if (session.targetDate) {
    await db.execute(
      "INSERT INTO entries (user_id, category_id, amount, note, created_at) VALUES (?, ?, ?, ?, ?)",
      [userId, session.categoryId, session.amount, session.note, `${session.targetDate} 12:00:00`]
    );
  } else {
    await db.execute(
      "INSERT INTO entries (user_id, category_id, amount, note) VALUES (?, ?, ?, ?)",
      [userId, session.categoryId, session.amount, session.note]
    );
  }

  await deleteSession(`wizard:${userId}`);
  const savedFor = session.targetDate ? ` for ${formatDateLabel(session.targetDate)}` : "";
  await ctx.editMessageText(`Entry saved successfully${savedFor}!`);
  await ctx.answerCallbackQuery();
  await checkAndAlertOverBudget(bot);
});

bot.callbackQuery("cancel_entry", async (ctx) => {
  const userId = ctx.from.id;
  await deleteSession(`wizard:${userId}`);
  await ctx.editMessageText("Entry cancelled.");
  await ctx.answerCallbackQuery();
});

// Bulk entry parser
async function parseBulkEntries(ctx: any, userId: number, text: string) {
  const lines = text.trim().split("\n");
  const entries: Array<{ categoryId: number; amount: number; note: string | null }> = [];
  const errors: string[] = [];

  // Fetch all categories for lookup
  const catsResult = await db.execute("SELECT id, name FROM categories");
  const categories = new Map<string, number>();
  for (const row of catsResult.rows as Array<{ id: number; name: string }>) {
    categories.set(row.name.toLowerCase(), row.id);
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!.trim();
    if (!line) continue;

    // Parse: Category Amount [Note]
    const parts = line.split(/\s+/);
    if (parts.length < 2) {
      errors.push(`Line ${i + 1}: "${line}" — missing amount`);
      continue;
    }

    const categoryName = parts[0]!;
    const amountStr = parts[1];
    const note = parts.slice(2).join(" ") || null;

    const categoryId = categories.get(categoryName.toLowerCase());
    if (!categoryId) {
      errors.push(`Line ${i + 1}: "${categoryName}" — unknown category`);
      continue;
    }

    const amount = Number(amountStr);
    if (isNaN(amount) || amount <= 0) {
      // Skip entries with 0 or invalid amount (user chose to skip this category)
      continue;
    }

    entries.push({ categoryId, amount, note });
  }

  if (errors.length > 0) {
    await ctx.reply(
      `Found some errors:\n${errors.join("\n")}\n\n` +
      `Please fix and send again.`
    );
    return;
  }

  if (entries.length === 0) {
    await ctx.reply("No valid entries found. Please check your format and try again.");
    await deleteSession(`bulk:${userId}`);
    return;
  }

  // Store entries in session for confirmation
  await setSession(`bulk:${userId}`, { step: "confirm", entries });

  // Build summary
  const total = entries.reduce((sum, e) => sum + e.amount, 0);
  const summaryLines = entries.map(
    (e) => `${e.note ? "📝" : "💰"} ${e.amount} Taka${e.note ? ` — ${e.note}` : ""}`
  );

  const keyboard = new InlineKeyboard()
    .text("Confirm All", "bulk_confirm")
    .text("Cancel", "bulk_cancel");

  await ctx.reply(
    `${entries.length} entries ready to save:\n\n` +
    summaryLines.join("\n") +
    `\n\nTotal: ${total.toFixed(2)} Taka`,
    { reply_markup: keyboard }
  );
}

bot.callbackQuery("bulk_confirm", async (ctx) => {
  const userId = ctx.from.id;
  const session = await getSession(`bulk:${userId}`);
  if (!session || session.step !== "confirm") {
    await ctx.answerCallbackQuery();
    return;
  }

  for (const entry of session.entries) {
    await db.execute(
      "INSERT INTO entries (user_id, category_id, amount, note) VALUES (?, ?, ?, ?)",
      [userId, entry.categoryId, entry.amount, entry.note]
    );
  }

  await deleteSession(`bulk:${userId}`);
  await ctx.editMessageText(`${session.entries.length} entries saved successfully!`);
  await ctx.answerCallbackQuery();
  await checkAndAlertOverBudget(bot);
});

bot.callbackQuery("bulk_cancel", async (ctx) => {
  const userId = ctx.from.id;
  await deleteSession(`bulk:${userId}`);
  await ctx.editMessageText("Bulk entry cancelled.");
  await ctx.answerCallbackQuery();
});
