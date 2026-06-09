"""Tests for formatting helpers in bot.py."""
from decimal import Decimal

import pytest

from bot import e, format_balance, build_summary_message


# ---------------------------------------------------------------------------
# e() — HTML escaping
# ---------------------------------------------------------------------------

class TestEscape:
    def test_ampersand(self):
        assert e("a & b") == "a &amp; b"

    def test_less_than(self):
        assert e("a < b") == "a &lt; b"

    def test_greater_than(self):
        assert e("a > b") == "a &gt; b"

    def test_all_special_chars(self):
        assert e("<script>x&y</script>") == "&lt;script&gt;x&amp;y&lt;/script&gt;"

    def test_plain_text_unchanged(self):
        assert e("Hello World 123") == "Hello World 123"

    def test_converts_to_str(self):
        assert e(42) == "42"


# ---------------------------------------------------------------------------
# format_balance()
# ---------------------------------------------------------------------------

class TestFormatBalance:
    def test_positive_no_sign(self):
        assert format_balance(Decimal("1500.00")) == "1 500.00"

    def test_negative_has_minus(self):
        assert format_balance(Decimal("-750.50")) == "-750.50"

    def test_zero(self):
        assert format_balance(Decimal("0")) == "0.00"

    def test_large_number_thousands_separator(self):
        assert format_balance(Decimal("1234567.89")) == "1 234 567.89"

    def test_small_negative(self):
        assert format_balance(Decimal("-0.01")) == "-0.01"


# ---------------------------------------------------------------------------
# build_summary_message()
# ---------------------------------------------------------------------------

class TestBuildSummaryMessage:
    def test_empty_accounts(self):
        assert build_summary_message([]) == "No accounts available."

    def test_budget_accounts_section(self):
        accounts = [
            {"name": "Checking", "balance": Decimal("1000.00"), "offbudget": False},
            {"name": "Cash",     "balance": Decimal("200.00"),  "offbudget": False},
        ]
        msg = build_summary_message(accounts)
        assert "Budget accounts" in msg
        assert "Checking" in msg
        assert "Cash" in msg
        assert "1 000.00" in msg
        assert "Total" in msg

    def test_total_is_sum_of_budget_accounts(self):
        accounts = [
            {"name": "A", "balance": Decimal("300.00"), "offbudget": False},
            {"name": "B", "balance": Decimal("200.00"), "offbudget": False},
        ]
        msg = build_summary_message(accounts)
        assert "500.00" in msg

    def test_offbudget_section_present_when_applicable(self):
        accounts = [
            {"name": "Budget",    "balance": Decimal("100.00"), "offbudget": False},
            {"name": "Savings",   "balance": Decimal("5000.00"), "offbudget": True},
        ]
        msg = build_summary_message(accounts)
        assert "Off-budget accounts" in msg
        assert "Savings" in msg

    def test_no_offbudget_section_when_not_applicable(self):
        accounts = [
            {"name": "Checking", "balance": Decimal("100.00"), "offbudget": False},
        ]
        msg = build_summary_message(accounts)
        assert "Off-budget" not in msg

    def test_numbering_is_sequential_across_sections(self):
        accounts = [
            {"name": "Budget",   "balance": Decimal("100.00"), "offbudget": False},
            {"name": "Offbudget", "balance": Decimal("200.00"), "offbudget": True},
        ]
        msg = build_summary_message(accounts)
        assert "1." in msg
        assert "2." in msg

    def test_html_special_chars_in_name_are_escaped(self):
        accounts = [
            {"name": "Savings <test> & more", "balance": Decimal("0"), "offbudget": False},
        ]
        msg = build_summary_message(accounts)
        assert "<test>" not in msg
        assert "&lt;test&gt;" in msg
        assert "&amp;" in msg

    def test_negative_balance_shown_with_minus(self):
        accounts = [
            {"name": "Overdraft", "balance": Decimal("-500.00"), "offbudget": False},
        ]
        msg = build_summary_message(accounts)
        assert "-500.00" in msg
