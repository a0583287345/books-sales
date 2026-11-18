// =====================================================================
// כספים: אמצעי תשלום, סוגי רשומות, קטגוריות הוצאה
// =====================================================================

export type PayMethod = 'cash' | 'check' | 'bit' | 'transfer';
export const PAY_METHODS: PayMethod[] = ['cash', 'check', 'bit', 'transfer'];

export const METHOD_LABELS: Record<string, string> = {
  cash: 'מזומן',
  check: 'צ׳ק',
  bit: 'ביט',
  transfer: 'העברה בנקאית',
  credit: 'זיכוי',
};

export const PAYMENT_KIND_LABELS: Record<string, string> = {
  payment: 'תשלום',
  refund: 'החזר כספי',
  credit_out: 'זיכוי שהועבר',
  credit_in: 'זיכוי שהתקבל',
};

export type Payment = {
  id: string;
  order_id: string;
  kind: 'payment' | 'refund' | 'credit_out' | 'credit_in';
  amount: number;
  method: string;
  paid_at: string;
  reference: string | null;
  notes: string | null;
  voided: boolean;
  voided_at: string | null;
  voided_by_name: string | null;
  void_reason: string | null;
  created_at: string;
  created_by_name: string | null;
};

export const PAYMENT_COLUMNS =
  'id, order_id, kind, amount, method, paid_at, reference, notes, voided, voided_at, voided_by_name, void_reason, created_at, created_by_name';

/** קטגוריות הוצאה מוצעות (אפשר גם להקליד חדשה) */
export const EXPENSE_CATEGORIES = ['משלוחים והובלה', 'אריזה וציוד', 'שקיות ומדבקות', 'שכירות ומחסן', 'שכר עבודה', 'טלפון ותקשורת', 'שונות'];

export type FinanceSummary = {
  orders_count: number;
  sales_total: number;
  discounts: number;
  received: number;
  refunded: number;
  open_debt: number;
  debt_orders: number;
  open_credit: number;
  by_method: Record<string, number>;
  purchases: number;
  supplier_paid: number;
  supplier_owed: number;
  delivery_costs: number;
  expenses_total: number;
  expenses_by_category: Record<string, number>;
};
