import logging
from datetime import date
from decimal import Decimal

import httpx

logger = logging.getLogger(__name__)


class ActualApiClient:
    def __init__(self, base_url: str, api_key: str, budget_id: str):
        self.base_url = base_url.rstrip("/")
        self.api_key = api_key
        self.budget_id = budget_id
        self._headers = {"x-api-key": api_key}

    def _get(self, path: str):
        url = f"{self.base_url}/v1{path}"
        response = httpx.get(url, headers=self._headers, timeout=30)
        response.raise_for_status()
        return response.json()["data"]

    def _post(self, path: str, body: dict):
        url = f"{self.base_url}/v1{path}"
        response = httpx.post(url, json=body, headers=self._headers, timeout=30)
        response.raise_for_status()
        return response.json()

    def get_accounts_summary(self) -> list[dict]:
        """Return active accounts with their current balances."""
        accounts = self._get(f"/budgets/{self.budget_id}/accounts")
        result = []

        for account in accounts:
            if account.get("closed"):
                continue

            account_id = account["id"]
            balance_cents = self._get(
                f"/budgets/{self.budget_id}/accounts/{account_id}/balance"
            )
            balance = Decimal(balance_cents) / 100

            result.append(
                {
                    "id": account_id,
                    "name": account["name"],
                    "balance": balance,
                    "offbudget": bool(account.get("offbudget", False)),
                }
            )

        result.sort(key=lambda a: (a["offbudget"], a["name"].lower()))
        return result

    def get_categories(self) -> list[dict]:
        """Return all non-hidden categories."""
        categories = self._get(f"/budgets/{self.budget_id}/categories")
        return [
            {
                "id": c["id"],
                "name": c["name"],
                "is_income": bool(c.get("is_income", False)),
            }
            for c in categories
            if not c.get("hidden") and not c.get("tombstone")
        ]

    def create_transaction(
        self,
        account_id: str,
        amount_cents: int,
        category_id: str | None = None,
        notes: str | None = None,
    ) -> None:
        body: dict = {
            "transaction": {
                "account": account_id,
                "date": date.today().isoformat(),
                "amount": amount_cents,
            }
        }
        if category_id:
            body["transaction"]["category"] = category_id
        if notes:
            body["transaction"]["notes"] = notes
        self._post(
            f"/budgets/{self.budget_id}/accounts/{account_id}/transactions", body
        )
