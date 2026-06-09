# Actual Budget Telegram Bot

A lightweight Telegram bot for interacting with your self-hosted [Actual Budget](https://actualbudget.org/) instance. Communicates with Actual via the [actual-http-api](https://github.com/jhonderson/actual-http-api) REST wrapper.

## Features

- 💰 **Account summary** — view all budget and off-budget accounts with current balances
- ➕ **New transaction** — add expenses, income, or transfers through a guided step-by-step flow
- 🏷 **Category selection** — assign categories from your budget
- 🔒 **Access control** — optionally restrict the bot to specific Telegram chat IDs

## Architecture

```
Telegram ──► Bot (Python)  ──► actual-http-api  ──► Actual Budget Server
```

The bot and the REST API wrapper run as separate Docker containers managed by Docker Compose.

## Prerequisites

- Docker and Docker Compose
- A running [Actual Budget](https://actualbudget.org/) server
- A Telegram bot token from [@BotFather](https://t.me/BotFather)

## Quick Start

### 1. Clone the repository

```bash
git clone https://github.com/dp9v/actual-budget-dummy-bot.git
cd actual-budget-dummy-bot
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
| `ACTUAL_API_KEY` | ✅ | Secret key for `actual-http-api` — generate with `python -c "import secrets; print(secrets.token_hex(32))"` |
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
python -m venv .venv
source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
```

### Run locally

Start the REST API wrapper first:

```bash
docker compose up actual-http-api -d
```

Then run the bot (PyCharm run config is included, or use the command line):

```bash
# Set env vars first, then:
python bot.py
```

### Project structure

```
.
├── bot.py              # Telegram bot — handlers, conversation flow, UI
├── actual_client.py    # REST API client for actual-http-api
├── requirements.txt
├── Dockerfile
├── docker-compose.yml
└── .env.example
```

## License

MIT — see [LICENSE](LICENSE).
