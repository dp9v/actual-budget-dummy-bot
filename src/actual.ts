import * as api from "@actual-app/api";
import type { AccountSummary, Category } from "./types.js";

const ACTUAL_DATA_DIR = process.env.ACTUAL_DATA_DIR ?? "/data";
const ACTUAL_SERVER_URL = process.env.ACTUAL_SERVER_URL!;
const ACTUAL_SERVER_PASSWORD = process.env.ACTUAL_SERVER_PASSWORD!;
const ACTUAL_BUDGET_ID = process.env.ACTUAL_BUDGET_ID!;

export async function initActual(): Promise<void> {
  await api.init({
    dataDir: ACTUAL_DATA_DIR,
    serverURL: ACTUAL_SERVER_URL,
    password: ACTUAL_SERVER_PASSWORD,
  });
  await api.downloadBudget(ACTUAL_BUDGET_ID);
}

export async function getAccountsSummary(): Promise<AccountSummary[]> {
  const accounts = await api.getAccounts();
  const result: AccountSummary[] = [];

  for (const account of accounts) {
    if (account.closed) continue;

    const balanceCents = await api.getAccountBalance(account.id);
    result.push({
      id: account.id,
      name: account.name,
      balance: balanceCents / 100,
      offbudget: account.offbudget ?? false,
    });
  }

  result.sort((a, b) => {
    if (a.offbudget !== b.offbudget) return a.offbudget ? 1 : -1;
    return a.name.toLowerCase().localeCompare(b.name.toLowerCase());
  });

  return result;
}

export async function getCategories(): Promise<Category[]> {
  const categories = await api.getCategories();
  return categories.map((c) => ({
    id: c.id,
    name: c.name,
    isIncome: c.is_income ?? false,
  }));
}

export async function createTransfer(
  fromAccountId: string,
  toAccountId: string,
  amountCents: number,
): Promise<void> {
  const payees = await api.getPayees();
  const transferPayee = payees.find((p) => p.transfer_acct === toAccountId);
  if (!transferPayee) {
    throw new Error(`Transfer payee not found for account "${toAccountId}"`);
  }
  const today = new Date().toISOString().slice(0, 10);
  await api.addTransactions(
    fromAccountId,
    [{ date: today, amount: -amountCents, payee: transferPayee.id }],
    { runTransfers: true },
  );
}

export async function createTransaction(
  accountId: string,
  amountCents: number,
  categoryId?: string,
): Promise<void> {
  const today = new Date().toISOString().slice(0, 10);
  await api.addTransactions(accountId, [
    {
      date: today,
      amount: amountCents,
      ...(categoryId ? { category: categoryId } : {}),
    },
  ]);
}

