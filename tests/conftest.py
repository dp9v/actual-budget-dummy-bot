# Set required env vars before any bot.py import
import os

os.environ.setdefault("TELEGRAM_BOT_TOKEN", "test-token")
os.environ.setdefault("ACTUAL_API_URL", "http://localhost:5007")
os.environ.setdefault("ACTUAL_API_KEY", "test-api-key")
os.environ.setdefault("ACTUAL_BUDGET_ID", "test-budget-id")
