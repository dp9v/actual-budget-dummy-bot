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

  const parts: string[] = [];
  let idx = 1;

  if (budgetAccounts.length > 0) {
    let budgetTotal = 0;
    const lines: string[] = [];
    for (const acc of budgetAccounts) {
      budgetTotal += acc.balance;
      lines.push(`  ${idx++}. ${e(acc.name)}: ${formatBalance(acc.balance)}`);
    }
    lines.push(`  ➡️ Total: ${formatBalance(budgetTotal)}`);
    parts.push(`💰 <b>Budget accounts</b>\n<tg-spoiler>${lines.join("\n")}</tg-spoiler>`);
  }

  if (offbudgetAccounts.length > 0) {
    const lines: string[] = [];
    for (const acc of offbudgetAccounts) {
      lines.push(`  ${idx++}. ${e(acc.name)}: ${formatBalance(acc.balance)}`);
    }
    parts.push(`🏦 <b>Off-budget accounts</b>\n<tg-spoiler>${lines.join("\n")}</tg-spoiler>`);
  }

  return parts.join("\n\n");
}
