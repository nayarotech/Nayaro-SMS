import type { Language } from "./i18n";

export interface FeeBill {
  id: string;
  title: string;
  period: string;
  dueDate: string;
  amount: number;
  discount: number;
  fine: number;
  total: number;
  paid: number;
  balance: number;
}
export interface ChildFees {
  items: FeeBill[];
  total: number;
  page: number;
  pageSize: number;
  summary: { billed: number; paid: number; outstanding: number };
}
export interface ChildFeeDetail extends FeeBill {
  payments: { id: string; amount: number; method: string; reference: string | null; reversedAt: string | null; reversalReason: string | null; createdAt: string }[];
}

export function formatFee(paisa: number, language: Language): string {
  return new Intl.NumberFormat(language === "ne" ? "ne-NP" : "en-NP", { style: "currency", currency: "NPR" }).format(paisa / 100);
}
