import "dotenv/config";
import { Bot, InlineKeyboard, Context } from "grammy";
import {
  type Conversation,
  type ConversationFlavor,
  conversations,
  createConversation,
} from "@grammyjs/conversations";
import {
  initActual,
  getAccountsSummary,
  getCategories,
  createTransaction,
  createTransfer,
} from "./actual.js";
import type { AccountSummary, Category } from "./types.js";
import { e, formatBalance, buildSummaryMessage } from "./utils.js";

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN!;
const _allowedRaw = process.env.ALLOWED_CHAT_IDS ?? "";
const ALLOWED_CHAT_IDS: Set<number> = _allowedRaw
  ? new Set(_allowedRaw.split(",").map((s) => parseInt(s.trim(), 10)))
  : new Set();

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
interface BotContext extends ConversationFlavor<Context> {}
type BotConversation = Conversation<BotContext, BotContext>;

// -- helpers ------------------------------------------------------------------

function isAuthorized(ctx: BotContext): boolean {
  if (ALLOWED_CHAT_IDS.size === 0) return true;
  return ALLOWED_CHAT_IDS.has(ctx.chat?.id ?? -1);
}

function buildMainKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text("💰 Account Summary", "summary")
    .row()
    .text("➕ New Transaction", "new_tx");
}

function buildAccountsKeyboard(
  accounts: AccountSummary[],
  prefix: string,
  skipLabel: string,
): InlineKeyboard {
  const kb = new InlineKeyboard();
  accounts.forEach((acc, i) => {
    kb.text(
      `${i + 1}. ${acc.name} • ${formatBalance(acc.balance)}`,
      `${prefix}:${acc.id}`,
    ).row();
  });
  kb.text(`⏭ ${skipLabel}`, `skip_${prefix}`).text("❌ Cancel", "cancel_tx");
  return kb;
}

function buildCategoriesKeyboard(categories: Category[]): InlineKeyboard {
  const kb = new InlineKeyboard();
  categories.forEach((cat) => {
    kb.text(cat.name, `cat:${cat.id}`).row();
  });
  kb.text("⏭ No category", "skip_cat").text("❌ Cancel", "cancel_tx");
  return kb;
}

// -- summary helper -----------------------------------------------------------

async function doSummary(
  editFn: (
    text: string,
    opts: { parse_mode: "HTML"; reply_markup: InlineKeyboard },
  ) => Promise<unknown>,
): Promise<void> {
  try {
    const accounts = await getAccountsSummary();
    await editFn(buildSummaryMessage(accounts), {
      parse_mode: "HTML",
      reply_markup: buildMainKeyboard(),
    });
  } catch (err) {
    await editFn(
      `❌ Error fetching data:\n<code>${e(String(err))}</code>`,
      { parse_mode: "HTML", reply_markup: buildMainKeyboard() },
    );
  }
}

// -- new transaction conversation ---------------------------------------------

async function newTransactionConversation(
  conversation: BotConversation,
  ctx: BotContext,
): Promise<void> {
  if (!isAuthorized(ctx)) return;

  const accounts = await conversation.external(() => getAccountsSummary());

  // Step 1: From account
  await ctx.editMessageText(
    "➕ <b>New Transaction</b>\n\n<b>Step 1 of 3</b> — Source account (from):",
    { parse_mode: "HTML", reply_markup: buildAccountsKeyboard(accounts, "from", "Skip") },
  );

  const fromCtx = await conversation.waitFor("callback_query:data");
  await fromCtx.answerCallbackQuery();
  const fromData = fromCtx.callbackQuery.data;

  if (fromData === "cancel_tx") {
    await fromCtx.editMessageText("❌ Transaction cancelled.", {
      parse_mode: "HTML",
      reply_markup: buildMainKeyboard(),
    });
    return;
  }

  const txFrom: AccountSummary | null = fromData.startsWith("from:")
    ? (accounts.find((a) => a.id === fromData.slice(5)) ?? null)
    : null;

  // Step 2: To account
  await fromCtx.editMessageText(
    "➕ <b>New Transaction</b>\n\n<b>Step 2 of 3</b> — Destination account (to):",
    { parse_mode: "HTML", reply_markup: buildAccountsKeyboard(accounts, "to", "Skip") },
  );

  const toCtx = await conversation.waitFor("callback_query:data");
  await toCtx.answerCallbackQuery();
  const toData = toCtx.callbackQuery.data;

  if (toData === "cancel_tx") {
    await toCtx.editMessageText("❌ Transaction cancelled.", {
      parse_mode: "HTML",
      reply_markup: buildMainKeyboard(),
    });
    return;
  }

  const txTo: AccountSummary | null = toData.startsWith("to:")
    ? (accounts.find((a) => a.id === toData.slice(3)) ?? null)
    : null;

  if (!txFrom && !txTo) {
    await toCtx.editMessageText("❌ Please select at least one account.", {
      parse_mode: "HTML",
      reply_markup: buildMainKeyboard(),
    });
    return;
  }

  // Step 3: Amount (text message)
  const convChatId = toCtx.chat?.id!;
  const convMsgId = toCtx.callbackQuery.message?.message_id!;

  await toCtx.editMessageText(
    "➕ <b>New Transaction</b>\n\n<b>Step 3</b> — Enter amount:",
    {
      parse_mode: "HTML",
      reply_markup: new InlineKeyboard().text("❌ Cancel", "cancel_tx"),
    },
  );

  let txAmount: number | null = null;
  while (txAmount === null) {
    const amountCtx = await conversation.waitFor([
      "message:text",
      "callback_query:data",
    ]);

    if ("callback_query" in amountCtx.update) {
      await amountCtx.answerCallbackQuery();
      if (amountCtx.callbackQuery?.data === "cancel_tx") {
        await amountCtx.api.editMessageText(
          convChatId,
          convMsgId,
          "❌ Transaction cancelled.",
          { parse_mode: "HTML", reply_markup: buildMainKeyboard() },
        );
        return;
      }
      continue;
    }

    const raw = amountCtx.message?.text?.trim().replace(/\s/g, "").replace(",", ".") ?? "";
    const parsed = parseFloat(raw);
    try {
      await amountCtx.api.deleteMessage(convChatId, amountCtx.message!.message_id);
    } catch {}

    if (!raw || isNaN(parsed) || parsed <= 0) {
      await amountCtx.api.editMessageText(
        convChatId,
        convMsgId,
        "➕ <b>New Transaction</b>\n\n❌ Invalid format. Enter a positive number, e.g.: <code>1500</code> or <code>1500.50</code>",
        {
          parse_mode: "HTML",
          reply_markup: new InlineKeyboard().text("❌ Cancel", "cancel_tx"),
        },
      );
      continue;
    }
    txAmount = parsed;
  }

  const amountCents = Math.round(txAmount * 100);
  const isTransfer = !!(txFrom && txTo);

  // Transfer: skip category, create linked transfer transaction
  if (isTransfer) {
    try {
      await conversation.external(() =>
        createTransfer(txFrom!.id, txTo!.id, amountCents),
      );
    } catch (err) {
      await ctx.api.editMessageText(
        convChatId,
        convMsgId,
        `❌ Error creating transfer:\n<code>${e(String(err))}</code>`,
        { parse_mode: "HTML", reply_markup: buildMainKeyboard() },
      );
      return;
    }
    await ctx.api.editMessageText(
      convChatId,
      convMsgId,
      [
        "✅ <b>Transfer added</b>",
        "",
        `  📤 From: ${e(txFrom!.name)}`,
        `  📥 To: ${e(txTo!.name)}`,
        `  💸 Amount: <code>${formatBalance(txAmount)}</code>`,
      ].join("\n"),
      { parse_mode: "HTML", reply_markup: buildMainKeyboard() },
    );
    return;
  }

  // Single account: show category step
  await ctx.api.editMessageText(
    convChatId,
    convMsgId,
    "➕ <b>New Transaction</b>\n\n<b>Step 4</b> — Select <b>category</b>:",
    {
      parse_mode: "HTML",
      reply_markup: buildCategoriesKeyboard(
        await conversation.external(() => getCategories()),
      ),
    },
  );

  const catCtx = await conversation.waitFor("callback_query:data");
  await catCtx.answerCallbackQuery();
  const catData = catCtx.callbackQuery.data;

  if (catData === "cancel_tx") {
    await catCtx.editMessageText("❌ Transaction cancelled.", {
      parse_mode: "HTML",
      reply_markup: buildMainKeyboard(),
    });
    return;
  }

  const categoryId = catData.startsWith("cat:") ? catData.slice(4) : undefined;
  const categories = await conversation.external(() => getCategories());
  const categoryName = categoryId
    ? (categories.find((c) => c.id === categoryId)?.name ?? "Unknown")
    : "No category";

  // Step 5: Note (optional)
  await catCtx.editMessageText(
    "➕ <b>New Transaction</b>\n\n<b>Step 5</b> — Enter a <b>note</b> (optional):",
    {
      parse_mode: "HTML",
      reply_markup: new InlineKeyboard()
        .text("⏭ Skip", "skip_note")
        .text("❌ Cancel", "cancel_tx"),
    },
  );

  let txNote: string | undefined;
  while (true) {
    const noteCtx = await conversation.waitFor([
      "message:text",
      "callback_query:data",
    ]);

    if ("callback_query" in noteCtx.update) {
      await noteCtx.answerCallbackQuery();
      const noteData = noteCtx.callbackQuery?.data;
      if (noteData === "cancel_tx") {
        await noteCtx.api.editMessageText(
          convChatId,
          convMsgId,
          "❌ Transaction cancelled.",
          { parse_mode: "HTML", reply_markup: buildMainKeyboard() },
        );
        return;
      }
      if (noteData === "skip_note") {
        break;
      }
      continue;
    }

    const noteText = noteCtx.message?.text?.trim();
    try {
      await noteCtx.api.deleteMessage(convChatId, noteCtx.message!.message_id);
    } catch {}
    if (noteText) {
      txNote = noteText;
    }
    break;
  }

  try {
    await conversation.external(async () => {
      if (txFrom) {
        await createTransaction(txFrom.id, -amountCents, categoryId, txNote);
      } else {
        await createTransaction(txTo!.id, amountCents, categoryId, txNote);
      }
    });
  } catch (err) {
    await ctx.api.editMessageText(
      convChatId,
      convMsgId,
      `❌ Error creating transaction:\n<code>${e(String(err))}</code>`,
      { parse_mode: "HTML", reply_markup: buildMainKeyboard() },
    );
    return;
  }

  const fromName = txFrom?.name ?? "—";
  const toName = txTo?.name ?? "—";
  const confirmLines = [
    "✅ <b>Transaction added</b>",
    "",
    `  📤 From: ${e(fromName)}`,
    `  📥 To: ${e(toName)}`,
    `  💸 Amount: <code>${formatBalance(txAmount)}</code>`,
    `  🏷 Category: ${e(categoryName)}`,
  ];
  if (txNote) {
    confirmLines.push(`  📝 Note: ${e(txNote)}`);
  }
  await ctx.api.editMessageText(
    convChatId,
    convMsgId,
    confirmLines.join("\n"),
    { parse_mode: "HTML", reply_markup: buildMainKeyboard() },
  );
}

// -- main ---------------------------------------------------------------------

async function main(): Promise<void> {
  console.log("Initializing Actual Budget…");
  await initActual();
  console.log("Actual Budget ready.");

  const bot = new Bot<BotContext>(TELEGRAM_BOT_TOKEN);

  bot.use(conversations());
  bot.use(createConversation(newTransactionConversation, "new_tx"));

  bot.command("start", async (ctx) => {
    if (!isAuthorized(ctx)) return;
    await ctx.reply(
      "Hello! I am your <b>Actual Budget</b> bot.\n\nChoose an action:",
      { parse_mode: "HTML", reply_markup: buildMainKeyboard() },
    );
  });

  bot.command("summary", async (ctx) => {
    if (!isAuthorized(ctx)) return;
    const msg = await ctx.reply("⏳ Loading data…");
    await doSummary((text, opts) =>
      ctx.api.editMessageText(ctx.chat.id, msg.message_id, text, opts),
    );
  });

  bot.callbackQuery("summary", async (ctx) => {
    if (!isAuthorized(ctx)) return;
    await ctx.answerCallbackQuery();
    await ctx.editMessageText("⏳ Loading data…");
    await doSummary((text, opts) => ctx.editMessageText(text, opts));
  });

  bot.callbackQuery("new_tx", async (ctx) => {
    if (!isAuthorized(ctx)) return;
    await ctx.conversation.enter("new_tx");
  });

  bot.start();
  console.log("Bot started.");
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
