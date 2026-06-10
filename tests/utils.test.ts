import { e, formatBalance, buildSummaryMessage } from "../src/utils";
import type { AccountSummary } from "../src/types";

describe("e() — HTML escaping", () => {
  it("escapes ampersands", () => expect(e("a & b")).toBe("a &amp; b"));
  it("escapes less-than", () => expect(e("a < b")).toBe("a &lt; b"));
  it("escapes greater-than", () => expect(e("a > b")).toBe("a &gt; b"));
  it("escapes all special chars", () =>
    expect(e("<script>x&y</script>")).toBe("&lt;script&gt;x&amp;y&lt;/script&gt;"));
  it("leaves plain text unchanged", () => expect(e("Hello World 123")).toBe("Hello World 123"));
  it("converts non-string to string", () => expect(e(42)).toBe("42"));
});

describe("formatBalance()", () => {
  it("positive number has no sign", () => expect(formatBalance(1500)).toBe("1\u00a0500.00"));
  it("negative number has minus", () => expect(formatBalance(-750.5)).toBe("-750.50"));
  it("zero", () => expect(formatBalance(0)).toBe("0.00"));
  it("large number uses thousands separator", () =>
    expect(formatBalance(1234567.89)).toBe("1\u00a0234\u00a0567.89"));
  it("small negative", () => expect(formatBalance(-0.01)).toBe("-0.01"));
});

describe("buildSummaryMessage()", () => {
  it("returns fallback for empty array", () => {
    expect(buildSummaryMessage([])).toBe("No accounts available.");
  });

  it("includes budget accounts section with names and total", () => {
    const accounts: AccountSummary[] = [
      { id: "a1", name: "Checking", balance: 1000, offbudget: false },
      { id: "a2", name: "Cash", balance: 200, offbudget: false },
    ];
    const msg = buildSummaryMessage(accounts);
    expect(msg).toContain("Budget accounts");
    expect(msg).toContain("Checking");
    expect(msg).toContain("Cash");
    expect(msg).toContain("Total");
  });

  it("total equals sum of budget account balances", () => {
    const accounts: AccountSummary[] = [
      { id: "a1", name: "A", balance: 300, offbudget: false },
      { id: "a2", name: "B", balance: 200, offbudget: false },
    ];
    const msg = buildSummaryMessage(accounts);
    expect(msg).toContain("500.00");
  });

  it("includes off-budget section when applicable", () => {
    const accounts: AccountSummary[] = [
      { id: "a1", name: "Budget", balance: 100, offbudget: false },
      { id: "a2", name: "Savings", balance: 5000, offbudget: true },
    ];
    const msg = buildSummaryMessage(accounts);
    expect(msg).toContain("Off-budget accounts");
    expect(msg).toContain("Savings");
  });

  it("omits off-budget section when not applicable", () => {
    const accounts: AccountSummary[] = [
      { id: "a1", name: "Checking", balance: 100, offbudget: false },
    ];
    expect(buildSummaryMessage(accounts)).not.toContain("Off-budget");
  });

  it("numbering is sequential across both sections", () => {
    const accounts: AccountSummary[] = [
      { id: "a1", name: "Budget", balance: 100, offbudget: false },
      { id: "a2", name: "Offbudget", balance: 200, offbudget: true },
    ];
    const msg = buildSummaryMessage(accounts);
    expect(msg).toContain("1.");
    expect(msg).toContain("2.");
  });

  it("escapes HTML special chars in account name", () => {
    const accounts: AccountSummary[] = [
      { id: "a1", name: "Savings <test> & more", balance: 0, offbudget: false },
    ];
    const msg = buildSummaryMessage(accounts);
    expect(msg).not.toContain("<test>");
    expect(msg).toContain("&lt;test&gt;");
    expect(msg).toContain("&amp;");
  });

  it("shows negative balance with minus sign", () => {
    const accounts: AccountSummary[] = [
      { id: "a1", name: "Overdraft", balance: -500, offbudget: false },
    ];
    expect(buildSummaryMessage(accounts)).toContain("-500.00");
  });
});
