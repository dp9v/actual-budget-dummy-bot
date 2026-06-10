# Actual Budget Telegram Bot

A lightweight Telegram bot for interacting with your self-hosted [Actual Budget](https://actualbudget.org/) instance. Communicates with Actual directly via the official [`@actual-app/api`](https://www.npmjs.com/package/@actual-app/api) Node.js library.

## Features

- 💰 **Account summary** — view all budget and off-budget accounts with current balances
- ➕ **New transaction** — add expenses, income, or transfers through a guided step-by-step flow
- 🏷 **Category selection** — assign categories from your budget
- 🔒 **Access control** — optionally restrict the bot to specific Telegram chat IDs

## Architecture

```
Telegram ──► Bot (TypeScript)  ──► Actual Budget Server
```

The bot connects directly to your Actual Budget server — no extra API wrapper container needed.

## Prerequisites

- Docker and Docker Compose
- A running [Actual Budget](https://actualbudget.org/) server
- A Telegram bot token from [@BotFather](https://t.me/BotFather)

## Quick Start

### 1. Clone the repository

```bash
git clone https://github.com/dp9v/actual-budget-telegram-bot.git
cd actual-budget-telegram-bot
```

### 2. Configure environment

```bash
cp .env.example .env
```

Edit `.env` and fill in all required values (see [Environment Variables](#environment-variables)).

### 3. Deploy

```bash
docker compose up -d --build
```

That's it. The bot will start polling for messages immediately.

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `TELEGRAM_BOT_TOKEN` | ✅ | Token from [@BotFather](https://t.me/BotFather) |
| `ACTUAL_SERVER_URL` | ✅ | URL of your Actual Budget server, e.g. `http://actual:5006` |
| `ACTUAL_SERVER_PASSWORD` | ✅ | Actual Budget web password |
| `ACTUAL_BUDGET_ID` | ✅ | Budget Sync ID — found in Actual → Settings → Show advanced settings → Sync ID |
| `ALLOWED_CHAT_IDS` | ❌ | Comma-separated Telegram chat IDs allowed to use the bot. Leave empty to allow everyone |

## Bot Commands

| Command | Description |
|---|---|
| `/start` | Show the main menu with action buttons |
| `/summary` | Fetch and display account balances |

## Transaction Flow

When creating a new transaction:

1. **Source account** (from) — optional, skip to record income
2. **Destination account** (to) — optional, skip to record expense
3. **Amount** — enter a positive number (e.g. `1500` or `1500.50`)
4. **Category** — select from your budget categories, or skip

| Selection | Result |
|---|---|
| From only | Expense (negative on source account) |
| To only | Income (positive on destination account) |
| From + To | Transfer (negative on source, positive on destination) |

## Development

### Local setup

```bash
npm install
```

### Run locally

```bash
# Set env vars in .env, then:
npm run dev
```

### Build

```bash
npm run build
npm start
```

### Project structure

```
.
├── src/
│   ├── bot.ts          # Telegram bot — handlers, conversation flow, UI
│   ├── actual.ts       # Actual Budget API client
│   └── types.ts        # Shared TypeScript interfaces
├── package.json
├── tsconfig.json
├── Dockerfile
├── docker-compose.yml
└── .env.example
```

## License

MIT — see [LICENSE](LICENSE).
