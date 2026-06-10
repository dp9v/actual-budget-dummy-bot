jest.mock("@actual-app/api", () => ({
  init: jest.fn().mockResolvedValue(undefined),
  downloadBudget: jest.fn().mockResolvedValue(undefined),
  getAccounts: jest.fn(),
  getAccountBalance: jest.fn(),
  getCategories: jest.fn(),
  addTransactions: jest.fn().mockResolvedValue([]),
}));

import * as api from "@actual-app/api";
import { getAccountsSummary, getCategories, createTransaction } from "../src/actual";

const mockApi = api as jest.Mocked<typeof api>;

describe("getAccountsSummary()", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns open accounts with balance converted from cents", async () => {
    mockApi.getAccounts.mockResolvedValue([
      { id: "a1", name: "Checking", closed: false, offbudget: false },
    ] as never);
    mockApi.getAccountBalance.mockResolvedValue(150000);

    const result = await getAccountsSummary();

    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("Checking");
    expect(result[0].balance).toBe(1500);
  });

  it("skips closed accounts", async () => {
    mockApi.getAccounts.mockResolvedValue([
      { id: "a1", name: "Active", closed: false, offbudget: false },
      { id: "a2", name: "Closed", closed: true, offbudget: false },
    ] as never);
    mockApi.getAccountBalance.mockResolvedValue(0);

    const result = await getAccountsSummary();

    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("Active");
  });

  it("sorts off-budget accounts last, then alphabetically within groups", async () => {
    mockApi.getAccounts.mockResolvedValue([
      { id: "a1", name: "Zeta", closed: false, offbudget: false },
      { id: "a2", name: "Alpha", closed: false, offbudget: true },
      { id: "a3", name: "Budget", closed: false, offbudget: false },
    ] as never);
    mockApi.getAccountBalance.mockResolvedValue(0);

    const result = await getAccountsSummary();

    expect(result[0].name).toBe("Budget");
    expect(result[1].name).toBe("Zeta");
    expect(result[2].name).toBe("Alpha");
  });

  it("exposes offbudget flag correctly", async () => {
    mockApi.getAccounts.mockResolvedValue([
      { id: "a1", name: "OnBudget", closed: false, offbudget: false },
      { id: "a2", name: "OffBudget", closed: false, offbudget: true },
    ] as never);
    mockApi.getAccountBalance.mockResolvedValue(0);

    const result = await getAccountsSummary();

    expect(result.find((a) => a.name === "OnBudget")?.offbudget).toBe(false);
    expect(result.find((a) => a.name === "OffBudget")?.offbudget).toBe(true);
  });
});

describe("getCategories()", () => {
  beforeEach(() => jest.clearAllMocks());

  it("maps categories to the expected shape", async () => {
    mockApi.getCategories.mockResolvedValue([
      { id: "c1", name: "Food", is_income: false, group_id: "g1" },
    ] as never);

    const result = await getCategories();

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({ id: "c1", name: "Food", isIncome: false });
  });

  it("maps income flag correctly", async () => {
    mockApi.getCategories.mockResolvedValue([
      { id: "c1", name: "Salary", is_income: true, group_id: "g1" },
    ] as never);

    const [cat] = await getCategories();
    expect(cat.isIncome).toBe(true);
  });

  it("returns multiple categories", async () => {
    mockApi.getCategories.mockResolvedValue([
      { id: "c1", name: "Food", is_income: false, group_id: "g1" },
      { id: "c2", name: "Transport", is_income: false, group_id: "g1" },
    ] as never);

    const result = await getCategories();
    expect(result).toHaveLength(2);
  });
});

describe("createTransaction()", () => {
  beforeEach(() => jest.clearAllMocks());

  it("calls addTransactions with correct account and amount", async () => {
    await createTransaction("acc-1", -150000);

    expect(mockApi.addTransactions).toHaveBeenCalledWith("acc-1", [
      expect.objectContaining({ amount: -150000 }),
    ]);
  });

  it("includes category when provided", async () => {
    await createTransaction("acc-1", -5000, "cat-42");

    const [, transactions] = mockApi.addTransactions.mock.calls[0];
    expect((transactions as Array<{ category?: string }>)[0].category).toBe("cat-42");
  });

  it("omits category field when not provided", async () => {
    await createTransaction("acc-1", -5000);

    const [, transactions] = mockApi.addTransactions.mock.calls[0];
    expect(transactions[0]).not.toHaveProperty("category");
  });

  it("uses today's date in YYYY-MM-DD format", async () => {
    await createTransaction("acc-1", 1000);

    const [, transactions] = mockApi.addTransactions.mock.calls[0];
    expect((transactions as Array<{ date: string }>)[0].date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("passes positive amount for income", async () => {
    await createTransaction("acc-2", 50000);

    expect(mockApi.addTransactions).toHaveBeenCalledWith("acc-2", [
      expect.objectContaining({ amount: 50000 }),
    ]);
  });
});
