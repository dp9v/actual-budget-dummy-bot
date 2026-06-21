# Agent Guidelines

This document describes the codebase for AI coding agents.

## Agent Rules

- **Do NOT automatically commit code.** After making changes, always stop and let the user review and commit manually.

## Project Overview

A Telegram bot that connects directly to a self-hosted [Actual Budget](https://actualbudget.org/) server
via the official [`@actual-app/api`](https://www.npmjs.com/package/@actual-app/api) Node.js library.

## Tech Stack

| Layer | Technology |
|---|---|
| Language | TypeScript (strict, target ES2022, CommonJS output) |
| Telegram framework | `grammy` v1 + `@grammyjs/conversations` v2 |
| Actual Budget client | `@actual-app/api` (direct connection, no HTTP wrapper) |
| Containerization | Docker + Docker Compose |
| Test framework | Jest + ts-jest |

## File Map

| File | Purpose |
|---|---|
| `src/bot.ts` | Entry point. Grammy bot setup, all Telegram handlers, conversation flow |
| `src/actual.ts` | Wrapper around `@actual-app/api` — init, accounts, categories, transactions |
| `src/utils.ts` | Pure helper functions: `e()` (HTML escape), `formatBalance()`, `buildSummaryMessage()` |
| `src/types.ts` | Shared TypeScript interfaces: `AccountSummary`, `Category` |
| `tests/utils.test.ts` | Unit tests for formatting helpers |
| `tests/actual.test.ts` | Unit tests for Actual Budget API wrapper (mocked) |
| `tests/setup.ts` | Jest global setup — sets required env vars before module load |
| `package.json` | Dependencies + Jest config |
| `tsconfig.json` | Build tsconfig (`src/` → `dist/`) |
| `tsconfig.test.json` | Test tsconfig — extends build config, includes `tests/` |
| `Dockerfile` | Node.js 22 Alpine image; compiles TS then runs `dist/bot.js` |
| `docker-compose.yml` | Single `bot` container with volume for Actual local cache |
| `.env.example` | Template for required environment variables |

## Key Design Decisions

- **HTML parse mode** — all Telegram messages use `parse_mode: "HTML"`. Dynamic values are escaped
  with the `e()` helper (`&` → `&amp;`, etc.). Do NOT switch to MarkdownV2.
- **Grammy Conversations** — the new-transaction flow uses `@grammyjs/conversations` v2 with a
  generator-based conversation function (`newTransactionConversation`).
- **Single message UI** — the bot edits the same message throughout a conversation rather than
  sending new ones. The conversation function holds the `chatId`/`messageId` in local variables.
- **Access control** — `ALLOWED_CHAT_IDS` env var. Empty = allow all. Checked in `isAuthorized()`.
- **Amount encoding** — Actual Budget stores amounts as integer cents. The wrapper divides by 100
  for display. Expenses are negative (`-amountCents`), income is positive.
- **@actual-app/api init** — `initActual()` must be called once at startup before any other API
  calls. It calls `api.init()` then `api.downloadBudget()`.

## @actual-app/api Methods Used

| Method | Used for |
|---|---|
| `init({ dataDir, serverURL, password })` | Connect to Actual server |
| `downloadBudget(budgetId)` | Load the budget file |
| `getAccounts()` | List all accounts |
| `getAccountBalance(accountId)` | Get balance in cents |
| `getCategories()` | List all categories |
| `addTransactions(accountId, [tx])` | Create a transaction |

## Adding New Features

### New bot command
1. Add a handler `async (ctx: BotContext) => { ... }` in `src/bot.ts`
2. Register it: `bot.command("xxx", handler)` or `bot.callbackQuery("xxx", handler)`

### New API call
1. Add an exported `async function` to `src/actual.ts`
2. Import and call it from `src/bot.ts`

### Extending the transaction flow
- Add new `await conversation.waitFor(...)` steps inside `newTransactionConversation` in `src/bot.ts`
- Store intermediate values in local variables within the conversation function

## Environment Variables

See `.env.example` for all variables.
Required: `TELEGRAM_BOT_TOKEN`, `ACTUAL_SERVER_URL`, `ACTUAL_SERVER_PASSWORD`, `ACTUAL_BUDGET_ID`.

## Running Tests / Linting

```bash
npm test              # run Jest tests
npm run typecheck     # tsc --noEmit type check
npm run build         # compile to dist/
```

If Node.js is not available locally, use Docker via `docker-compose.dev.yml`:

```bash
# Run typecheck + tests (default command)
docker compose -f docker-compose.dev.yml run --rm dev

# Run a specific command
docker compose -f docker-compose.dev.yml run --rm dev sh -c "npm ci && npm run typecheck"
docker compose -f docker-compose.dev.yml run --rm dev sh -c "npm ci && npm run build"
```

`node_modules` are stored in a named Docker volume and reused across runs — no reinstall on every invocation.
