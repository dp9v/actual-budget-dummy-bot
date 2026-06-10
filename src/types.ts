export interface AccountSummary {
  id: string;
  name: string;
  balance: number; // decimal value, e.g. 1500.50
  offbudget: boolean;
}

export interface Category {
  id: string;
  name: string;
  isIncome: boolean;
}
