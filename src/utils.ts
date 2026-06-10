import type { AccountSummary } from "./types.js";

export function e(text: unknown): string {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export function formatBalance(balance: number): string {
  const formatted = Math.abs(balance)
    .toFixed(2)
    .replace(/\B(?=(\d{3})+(?!\d))/g, "\u00a0");
  return balance < 0 ? `-${formatted}` : formatted;
}

export function buildSummaryMessage(accounts: AccountSummary[]): string {
  if (accounts.length === 0) return "No accounts available.";

  const budgetAccounts = accounts.filter((a) => !a.offbudget);
  const offbudgetAccounts = accounts.filter((a) => a.offbudget);

  const lines: string[] = ["💰 <b>Budget accounts</b>"];
  let budgetTotal = 0;
  let idx = 1;

  for (const acc of budgetAccounts) {
    budgetTotal += acc.balance;
    lines.push(`  ${idx++}. ${e(acc.name)}: <code>${formatBalance(acc.balance)}</code>`);
  }
  if (budgetAccounts.length > 0) {
    lines.push(`  ➡️ <b>Total:</b> <code>${formatBalance(budgetTotal)}</code>`);
  }

  if (offbudgetAccounts.length > 0) {
    lines.push("", "🏦 <b>Off-budget accounts</b>");
    for (const acc of offbudgetAccounts) {
      lines.push(`  ${idx++}. ${e(acc.name)}: <code>${formatBalance(acc.balance)}</code>`);
    }
  }

  return lines.join("\n");
}
