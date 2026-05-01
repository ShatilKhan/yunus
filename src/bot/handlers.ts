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
    .text("Open Dashboard", "open_dashboard")
    .text("View Summary", "view_summary");

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

  await setSession(`wizard:${userId}`, { step: "amount", categoryId });
  await ctx.editMessageText(
    "Enter the amount in Taka:\n\n" +
    "(Just send a number, e.g. 500)"
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

bot.callbackQuery("view_summary", async (ctx) => {
  const userId = ctx.from.id;
  const result = await db.execute(
    `SELECT 
      c.type,
      SUM(e.amount) as total
    FROM entries e
    JOIN categories c ON e.category_id = c.id
    WHERE e.user_id = ?
    AND e.created_at >= datetime('now', '-30 days')
    GROUP BY c.type`,
    [userId]
  );

  const rows = result.rows as Array<{ type: string; total: number }>;
  const expense = rows.find((r) => r.type === "expense")?.total || 0;
  const saving = rows.find((r) => r.type === "saving")?.total || 0;

  await ctx.editMessageText(
    `Last 30 days summary:\n\n` +
    `Total Expenses: ${expense.toFixed(2)} Taka\n` +
    `Total Savings: ${saving.toFixed(2)} Taka\n` +
    `Net: ${(saving - expense).toFixed(2)} Taka`
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
    });

    const keyboard = new InlineKeyboard().text("Skip", "skip_note");
    await ctx.reply("Add a note (optional):", { reply_markup: keyboard });
  } else if (session.step === "note") {
    await setSession(`wizard:${userId}`, {
      step: "confirm",
      categoryId: session.categoryId,
      amount: session.amount,
      note: text,
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

  const keyboard = new InlineKeyboard()
    .text("Confirm", "confirm_entry")
    .text("Cancel", "cancel_entry");

  await ctx.editMessageText(
    `Please confirm:\n\n` +
    `Category: ${categoryName}\n` +
    `Amount: ${session.amount} Taka` +
    noteText,
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

  await db.execute(
    "INSERT INTO entries (user_id, category_id, amount, note) VALUES (?, ?, ?, ?)",
    [userId, session.categoryId, session.amount, session.note]
  );

  await deleteSession(`wizard:${userId}`);
  await ctx.editMessageText("Entry saved successfully!");
  await ctx.answerCallbackQuery();
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
});

bot.callbackQuery("bulk_cancel", async (ctx) => {
  const userId = ctx.from.id;
  await deleteSession(`bulk:${userId}`);
  await ctx.editMessageText("Bulk entry cancelled.");
  await ctx.answerCallbackQuery();
});
