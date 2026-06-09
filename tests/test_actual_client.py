"""Integration tests for ActualApiClient — HTTP layer mocked via unittest.mock."""
from decimal import Decimal
from unittest.mock import MagicMock, call, patch

import pytest

from actual_client import ActualApiClient

BUDGET_ID = "budget-123"
BASE_URL = "http://localhost:5007"
API_KEY = "test-key"


def make_client() -> ActualApiClient:
    return ActualApiClient(base_url=BASE_URL, api_key=API_KEY, budget_id=BUDGET_ID)


def mock_response(data) -> MagicMock:
    r = MagicMock()
    r.raise_for_status.return_value = None
    r.json.return_value = {"data": data}
    return r


# ---------------------------------------------------------------------------
# get_accounts_summary
# ---------------------------------------------------------------------------

class TestGetAccountsSummary:
    def test_returns_open_accounts(self):
        accounts_data = [
            {"id": "a1", "name": "Checking", "closed": False, "offbudget": False},
            {"id": "a2", "name": "Savings",  "closed": False, "offbudget": False},
        ]
        with patch("httpx.get") as mock_get:
            mock_get.side_effect = [
                mock_response(accounts_data),
                mock_response(100000),   # Checking: 1000.00
                mock_response(50000),    # Savings:   500.00
            ]
            result = make_client().get_accounts_summary()

        assert len(result) == 2
        assert result[0]["name"] == "Checking"
        assert result[0]["balance"] == Decimal("1000.00")

    def test_skips_closed_accounts(self):
        accounts_data = [
            {"id": "a1", "name": "Active", "closed": False, "offbudget": False},
            {"id": "a2", "name": "Closed", "closed": True,  "offbudget": False},
        ]
        with patch("httpx.get") as mock_get:
            mock_get.side_effect = [
                mock_response(accounts_data),
                mock_response(200000),
            ]
            result = make_client().get_accounts_summary()

        assert len(result) == 1
        assert result[0]["name"] == "Active"

    def test_sorts_offbudget_last_then_alphabetically(self):
        accounts_data = [
            {"id": "a1", "name": "Zeta",   "closed": False, "offbudget": False},
            {"id": "a2", "name": "Alpha",  "closed": False, "offbudget": True},
            {"id": "a3", "name": "Budget", "closed": False, "offbudget": False},
        ]
        with patch("httpx.get") as mock_get:
            mock_get.side_effect = [
                mock_response(accounts_data),
                mock_response(0),
                mock_response(0),
                mock_response(0),
            ]
            result = make_client().get_accounts_summary()

        assert result[0]["name"] == "Budget"
        assert result[1]["name"] == "Zeta"
        assert result[2]["name"] == "Alpha"

    def test_balance_conversion_from_cents(self):
        accounts_data = [{"id": "a1", "name": "X", "closed": False, "offbudget": False}]
        with patch("httpx.get") as mock_get:
            mock_get.side_effect = [
                mock_response(accounts_data),
                mock_response(123456),
            ]
            result = make_client().get_accounts_summary()

        assert result[0]["balance"] == Decimal("1234.56")

    def test_sends_api_key_header(self):
        accounts_data = [{"id": "a1", "name": "X", "closed": False, "offbudget": False}]
        with patch("httpx.get") as mock_get:
            mock_get.side_effect = [
                mock_response(accounts_data),
                mock_response(0),
            ]
            make_client().get_accounts_summary()

        for c in mock_get.call_args_list:
            assert c.kwargs["headers"]["x-api-key"] == API_KEY


# ---------------------------------------------------------------------------
# get_categories
# ---------------------------------------------------------------------------

class TestGetCategories:
    def test_returns_visible_categories(self):
        data = [
            {"id": "c1", "name": "Food",      "hidden": False, "tombstone": False, "is_income": False},
            {"id": "c2", "name": "Transport", "hidden": False, "tombstone": False, "is_income": False},
        ]
        with patch("httpx.get", return_value=mock_response(data)):
            result = make_client().get_categories()

        assert len(result) == 2
        assert result[0]["id"] == "c1"

    def test_filters_out_hidden_categories(self):
        data = [
            {"id": "c1", "name": "Visible", "hidden": False, "tombstone": False, "is_income": False},
            {"id": "c2", "name": "Hidden",  "hidden": True,  "tombstone": False, "is_income": False},
        ]
        with patch("httpx.get", return_value=mock_response(data)):
            result = make_client().get_categories()

        assert len(result) == 1
        assert result[0]["name"] == "Visible"

    def test_filters_out_tombstoned_categories(self):
        data = [
            {"id": "c1", "name": "Live",    "hidden": False, "tombstone": False, "is_income": False},
            {"id": "c2", "name": "Deleted", "hidden": False, "tombstone": True,  "is_income": False},
        ]
        with patch("httpx.get", return_value=mock_response(data)):
            result = make_client().get_categories()

        assert len(result) == 1
        assert result[0]["name"] == "Live"


# ---------------------------------------------------------------------------
# create_transaction
# ---------------------------------------------------------------------------

class TestCreateTransaction:
    def test_expense_posts_negative_amount(self):
        with patch("httpx.post") as mock_post:
            mock_post.return_value = mock_response({})
            make_client().create_transaction("acc-1", -150000)

        _, kwargs = mock_post.call_args
        body = kwargs["json"] if "json" in kwargs else mock_post.call_args.args[1] if len(mock_post.call_args.args) > 1 else mock_post.call_args.kwargs["json"]
        assert body["transaction"]["amount"] == -150000
        assert body["transaction"]["account"] == "acc-1"

    def test_includes_category_when_provided(self):
        with patch("httpx.post") as mock_post:
            mock_post.return_value = mock_response({})
            make_client().create_transaction("acc-1", -5000, category_id="cat-42")

        body = mock_post.call_args.kwargs.get("json") or mock_post.call_args[1]["json"]
        assert body["transaction"]["category"] == "cat-42"

    def test_omits_category_when_none(self):
        with patch("httpx.post") as mock_post:
            mock_post.return_value = mock_response({})
            make_client().create_transaction("acc-1", -5000, category_id=None)

        body = mock_post.call_args.kwargs.get("json") or mock_post.call_args[1]["json"]
        assert "category" not in body["transaction"]

    def test_posts_to_correct_url(self):
        with patch("httpx.post") as mock_post:
            mock_post.return_value = mock_response({})
            make_client().create_transaction("acc-99", -1000)

        url = mock_post.call_args.args[0] if mock_post.call_args.args else mock_post.call_args.kwargs["url"]
        assert "acc-99" in url
        assert BUDGET_ID in url
