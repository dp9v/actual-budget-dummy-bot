// Set required env vars before any module that reads them at load time
process.env.TELEGRAM_BOT_TOKEN = "test-token";
process.env.ACTUAL_SERVER_URL = "http://localhost:5006";
process.env.ACTUAL_SERVER_PASSWORD = "test-password";
process.env.ACTUAL_BUDGET_ID = "test-budget-id";
process.env.ACTUAL_DATA_DIR = "/tmp/actual-test";
process.env.ALLOWED_CHAT_IDS = "";
