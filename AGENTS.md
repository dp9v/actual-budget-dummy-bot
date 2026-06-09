# Agent Guidelines

This document describes the codebase for AI coding agents.

## Project Overview

A Telegram bot that connects to a self-hosted [Actual Budget](https://actualbudget.org/) server
via the [actual-http-api](https://github.com/jhonderson/actual-http-api) REST wrapper.

## Tech Stack

| Layer | Technology |
|---|---|
| Language | Python 3.12+ |
| Telegram framework | `python-telegram-bot` v21 |
| HTTP client | `httpx` (sync) |
| Actual REST wrapper | `jhonderson/actual-http-api` Docker image |
| Containerization | Docker + Docker Compose |

## File Map

| File | Purpose |
|---|---|
| `bot.py` | Entry point. All Telegram handlers, conversation state machine, message formatting |
| `actual_client.py` | `ActualApiClient` class — wraps all calls to `actual-http-api` REST endpoints |
| `requirements.txt` | Python dependencies |
| `Dockerfile` | Bot container image |
| `docker-compose.yml` | Orchestrates `actual-http-api` + `bot` containers |
| `.env.example` | Template for required environment variables |

## Key Design Decisions

- **HTML parse mode** — all Telegram messages use `ParseMode.HTML`. Dynamic values are escaped
  with the `e()` helper (`&` → `&amp;`, etc.). Do NOT switch to MarkdownV2.
- **Sync HTTP** — `actual_client.py` uses synchronous `httpx` calls. The bot runs them from async
  handlers; this is acceptable because calls are short-lived and infrequent.
- **Conversation state** — new-transaction flow uses `python-telegram-bot`'s `ConversationHandler`
  with states `FROM_ACCOUNT → TO_ACCOUNT → AMOUNT → CATEGORY`.
- **Single message UI** — the bot edits the same message throughout a conversation rather than
  sending new ones. `conv_chat_id` / `conv_msg_id` stored in `context.user_data` track it.
- **Access control** — `ALLOWED_CHAT_IDS` env var. Empty = allow all. Checked in `is_authorized()`.
- **Amount encoding** — Actual Budget stores amounts as integer cents. The client multiplies/divides
  by 100. Expenses are negative (`-amount_cents`), income is positive.

## actual-http-api Endpoints Used

| Method | Path | Used for |
|---|---|---|
| `GET` | `/v1/budgets/{id}/accounts` | List accounts |
| `GET` | `/v1/budgets/{id}/accounts/{accountId}/balance` | Get account balance (returns integer cents) |
| `GET` | `/v1/budgets/{id}/categories` | List categories |
| `POST` | `/v1/budgets/{id}/accounts/{accountId}/transactions` | Create transaction |

Authentication: `x-api-key` header.

## Adding New Features

### New bot command
1. Add a handler function `async def cmd_xxx(update, context)` in `bot.py`
2. Register it: `app.add_handler(CommandHandler("xxx", cmd_xxx))`

### New API call
1. Add a method to `ActualApiClient` in `actual_client.py`
2. Call it from the relevant handler in `bot.py`

### Extending the transaction flow
- Add new states to the `range(4)` declaration and the `ConversationHandler.states` dict
- Store intermediate values in `context.user_data`

## Environment Variables

See `.env.example` for all variables and their descriptions.
Required: `TELEGRAM_BOT_TOKEN`, `ACTUAL_SERVER_URL`, `ACTUAL_SERVER_PASSWORD`,
`ACTUAL_BUDGET_ID`, `ACTUAL_API_KEY`.

## Running Tests / Linting

No automated tests are currently configured. Syntax can be verified with:

```bash
python -m py_compile bot.py actual_client.py
```
