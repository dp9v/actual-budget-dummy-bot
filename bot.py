import logging
import os
from decimal import Decimal

from dotenv import load_dotenv
from telegram import Update, InlineKeyboardButton, InlineKeyboardMarkup
from telegram.constants import ParseMode
from telegram.ext import (
    Application,
    CallbackQueryHandler,
    CommandHandler,
    ContextTypes,
    ConversationHandler,
    MessageHandler,
    filters,
)

from actual_client import ActualApiClient

load_dotenv()

logging.basicConfig(
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
    level=logging.INFO,
)
logger = logging.getLogger(__name__)

TELEGRAM_BOT_TOKEN = os.environ["TELEGRAM_BOT_TOKEN"]
ACTUAL_API_URL = os.environ["ACTUAL_API_URL"]
ACTUAL_API_KEY = os.environ["ACTUAL_API_KEY"]
ACTUAL_BUDGET_ID = os.environ["ACTUAL_BUDGET_ID"]

_allowed_ids_raw = os.environ.get("ALLOWED_CHAT_IDS", "")
ALLOWED_CHAT_IDS: set[int] = (
    {int(i.strip()) for i in _allowed_ids_raw.split(",") if i.strip()}
    if _allowed_ids_raw
    else set()
)

actual_client = ActualApiClient(
    base_url=ACTUAL_API_URL,
    api_key=ACTUAL_API_KEY,
    budget_id=ACTUAL_BUDGET_ID,
)

FROM_ACCOUNT, TO_ACCOUNT, AMOUNT, CATEGORY = range(4)

MAIN_KEYBOARD = InlineKeyboardMarkup([
    [InlineKeyboardButton("💰 Account Summary", callback_data="summary")],
    [InlineKeyboardButton("➕ New Transaction", callback_data="new_tx")],
])

HTML = ParseMode.HTML


# -- helpers ------------------------------------------------------------------

def is_authorized(update: Update) -> bool:
    if not ALLOWED_CHAT_IDS:
        return True
    return update.effective_chat.id in ALLOWED_CHAT_IDS


def e(text: str) -> str:
    """Escape text for HTML parse mode."""
    return str(text).replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def format_balance(balance: Decimal) -> str:
    formatted = f"{abs(balance):,.2f}".replace(",", " ")
    return f"-{formatted}" if balance < 0 else formatted


def build_accounts_keyboard(
    accounts: list[dict], prefix: str, skip_label: str
) -> InlineKeyboardMarkup:
    buttons = [
        [InlineKeyboardButton(
            f"{i}. {acc['name']} • {format_balance(acc['balance'])}",
            callback_data=f"{prefix}:{acc['id']}",
        )]
        for i, acc in enumerate(accounts, 1)
    ]
    buttons.append([
        InlineKeyboardButton(f"⏭ {skip_label}", callback_data=f"skip_{prefix}"),
        InlineKeyboardButton("❌ Cancel", callback_data="cancel_tx"),
    ])
    return InlineKeyboardMarkup(buttons)


def build_categories_keyboard(categories: list[dict]) -> InlineKeyboardMarkup:
    buttons = [
        [InlineKeyboardButton(cat["name"], callback_data=f"cat:{cat['id']}")]
        for cat in categories
    ]
    buttons.append([
        InlineKeyboardButton("⏭ No category", callback_data="skip_cat"),
        InlineKeyboardButton("❌ Cancel", callback_data="cancel_tx"),
    ])
    return InlineKeyboardMarkup(buttons)


def build_summary_message(accounts: list[dict]) -> str:
    if not accounts:
        return "No accounts available."

    budget_accounts = [a for a in accounts if not a["offbudget"]]
    offbudget_accounts = [a for a in accounts if a["offbudget"]]

    lines = ["💰 <b>Budget accounts</b>"]
    budget_total = Decimal(0)
    idx = 1

    for acc in budget_accounts:
        bal = acc["balance"]
        budget_total += bal
        lines.append(f"  {idx}. {e(acc['name'])}: <code>{format_balance(bal)}</code>")
        idx += 1

    if budget_accounts:
        lines.append(f"  ➡️ <b>Total:</b> <code>{format_balance(budget_total)}</code>")

    if offbudget_accounts:
        lines.append("")
        lines.append("🏦 <b>Off-budget accounts</b>")
        for acc in offbudget_accounts:
            bal = acc["balance"]
            lines.append(f"  {idx}. {e(acc['name'])}: <code>{format_balance(bal)}</code>")
            idx += 1

    return "\n".join(lines)


# -- summary ------------------------------------------------------------------

async def cmd_start(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if not is_authorized(update):
        return
    await update.message.reply_text(
        "Hello! I am your <b>Actual Budget</b> bot.\n\nChoose an action:",
        parse_mode=HTML,
        reply_markup=MAIN_KEYBOARD,
    )


async def cmd_summary(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if not is_authorized(update):
        return
    msg = await update.message.reply_text("⏳ Loading data...")
    await _do_summary(msg.edit_text)


async def on_button(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    query = update.callback_query
    await query.answer()
    if not is_authorized(update):
        return
    if query.data == "summary":
        await query.edit_message_text("⏳ Loading data...")
        await _do_summary(lambda text, **kw: query.edit_message_text(text, **kw))


async def _do_summary(edit_fn) -> None:
    try:
        accounts = actual_client.get_accounts_summary()
        text = build_summary_message(accounts)
        await edit_fn(text, parse_mode=HTML, reply_markup=MAIN_KEYBOARD)
    except Exception as ex:
        logger.exception("Failed to fetch accounts summary")
        await edit_fn(
            f"❌ Error fetching data:\n<code>{e(str(ex))}</code>",
            parse_mode=HTML,
            reply_markup=MAIN_KEYBOARD,
        )


# -- new transaction conversation ---------------------------------------------

async def start_new_transaction(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    query = update.callback_query
    await query.answer()
    if not is_authorized(update):
        return ConversationHandler.END

    accounts = actual_client.get_accounts_summary()
    context.user_data.update({
        "tx_accounts": accounts,
        "tx_from": None,
        "tx_to": None,
        "conv_chat_id": query.message.chat_id,
        "conv_msg_id": query.message.message_id,
    })

    await query.edit_message_text(
        "➕ <b>New Transaction</b>\n\n<b>Step 1 of 3</b> — Source account (from):",
        parse_mode=HTML,
        reply_markup=build_accounts_keyboard(accounts, "from", "Skip"),
    )
    return FROM_ACCOUNT


async def handle_from_account(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    query = update.callback_query
    await query.answer()

    if query.data.startswith("from:"):
        account_id = query.data[5:]
        acc = next((a for a in context.user_data["tx_accounts"] if a["id"] == account_id), None)
        context.user_data["tx_from"] = acc

    accounts = context.user_data["tx_accounts"]
    await query.edit_message_text(
        "➕ <b>New Transaction</b>\n\n<b>Step 2 of 3</b> — Destination account (to):",
        parse_mode=HTML,
        reply_markup=build_accounts_keyboard(accounts, "to", "Skip"),
    )
    return TO_ACCOUNT


async def handle_to_account(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    query = update.callback_query
    await query.answer()

    if query.data.startswith("to:"):
        account_id = query.data[3:]
        acc = next((a for a in context.user_data["tx_accounts"] if a["id"] == account_id), None)
        context.user_data["tx_to"] = acc

    if not context.user_data.get("tx_from") and not context.user_data.get("tx_to"):
        await query.edit_message_text(
            "❌ Please select at least one account.",
            parse_mode=HTML,
            reply_markup=MAIN_KEYBOARD,
        )
        return ConversationHandler.END

    await query.edit_message_text(
        "➕ <b>New Transaction</b>\n\n<b>Step 3 of 3</b> — Enter amount:",
        parse_mode=HTML,
        reply_markup=InlineKeyboardMarkup([[InlineKeyboardButton("❌ Cancel", callback_data="cancel_tx")]]),
    )
    return AMOUNT


async def handle_amount(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    raw = update.message.text.strip().replace(" ", "").replace(",", ".")
    try:
        amount = Decimal(raw)
        if amount <= 0:
            raise ValueError
    except Exception:
        await update.message.reply_text(
            "❌ Invalid format. Enter a positive number, e.g.: <code>1500</code> or <code>1500.50</code>",
            parse_mode=HTML,
        )
        return AMOUNT

    context.user_data["tx_amount"] = amount

    try:
        await update.message.delete()
    except Exception:
        pass

    categories = actual_client.get_categories()
    context.user_data["tx_categories"] = categories

    await context.bot.edit_message_text(
        "➕ <b>New Transaction</b>\n\nSelect <b>category</b>:",
        chat_id=context.user_data["conv_chat_id"],
        message_id=context.user_data["conv_msg_id"],
        parse_mode=HTML,
        reply_markup=build_categories_keyboard(categories),
    )
    return CATEGORY


async def handle_category(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    query = update.callback_query
    await query.answer()

    category_id = None
    category_name = "No category"
    if query.data.startswith("cat:"):
        category_id = query.data[4:]
        cat = next((c for c in context.user_data.get("tx_categories", []) if c["id"] == category_id), None)
        if cat:
            category_name = cat["name"]

    tx_from = context.user_data.get("tx_from")
    tx_to = context.user_data.get("tx_to")
    amount = context.user_data["tx_amount"]
    amount_cents = int(amount * 100)

    try:
        if tx_from and tx_to:
            actual_client.create_transaction(tx_from["id"], -amount_cents, category_id)
            actual_client.create_transaction(tx_to["id"], amount_cents, None)
        elif tx_from:
            actual_client.create_transaction(tx_from["id"], -amount_cents, category_id)
        else:
            actual_client.create_transaction(tx_to["id"], amount_cents, category_id)
    except Exception as ex:
        logger.exception("Failed to create transaction")
        await query.edit_message_text(
            f"❌ Error creating transaction:\n<code>{e(str(ex))}</code>",
            parse_mode=HTML,
            reply_markup=MAIN_KEYBOARD,
        )
        return ConversationHandler.END

    from_name = tx_from["name"] if tx_from else "—"
    to_name = tx_to["name"] if tx_to else "—"
    lines = [
        "✅ <b>Transaction added</b>",
        "",
        f"  📤 From: {e(from_name)}",
        f"  📥 To: {e(to_name)}",
        f"  💸 Amount: <code>{format_balance(amount)}</code>",
        f"  🏷 Category: {e(category_name)}",
    ]
    await query.edit_message_text(
        "\n".join(lines),
        parse_mode=HTML,
        reply_markup=MAIN_KEYBOARD,
    )
    return ConversationHandler.END


async def cancel_transaction(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    query = update.callback_query
    await query.answer()
    await query.edit_message_text(
        "❌ Transaction cancelled.",
        parse_mode=HTML,
        reply_markup=MAIN_KEYBOARD,
    )
    return ConversationHandler.END


# -- main ---------------------------------------------------------------------

def main() -> None:
    import asyncio
    asyncio.set_event_loop(asyncio.new_event_loop())
    app = Application.builder().token(TELEGRAM_BOT_TOKEN).build()

    conv_handler = ConversationHandler(
        entry_points=[CallbackQueryHandler(start_new_transaction, pattern="^new_tx$")],
        states={
            FROM_ACCOUNT: [
                CallbackQueryHandler(handle_from_account, pattern="^(from:|skip_from)"),
                CallbackQueryHandler(cancel_transaction, pattern="^cancel_tx$"),
            ],
            TO_ACCOUNT: [
                CallbackQueryHandler(handle_to_account, pattern="^(to:|skip_to)"),
                CallbackQueryHandler(cancel_transaction, pattern="^cancel_tx$"),
            ],
            AMOUNT: [
                MessageHandler(filters.TEXT & ~filters.COMMAND, handle_amount),
                CallbackQueryHandler(cancel_transaction, pattern="^cancel_tx$"),
            ],
            CATEGORY: [
                CallbackQueryHandler(handle_category, pattern="^(cat:|skip_cat)"),
                CallbackQueryHandler(cancel_transaction, pattern="^cancel_tx$"),
            ],
        },
        fallbacks=[CallbackQueryHandler(cancel_transaction, pattern="^cancel_tx$")],
    )

    app.add_handler(conv_handler)
    app.add_handler(CommandHandler("start", cmd_start))
    app.add_handler(CommandHandler("summary", cmd_summary))
    app.add_handler(CallbackQueryHandler(on_button))
    logger.info("Bot started")
    app.run_polling()


if __name__ == "__main__":
    main()
