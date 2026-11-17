import { supabase } from '@/lib/supabase';

// =====================================================================
// רכש ומלאי: סטטוסים, טיפוסים ושליפות משותפות
// =====================================================================

export type PoStatus = 'draft' | 'sent' | 'partial' | 'received' | 'closed' | 'cancelled';

export const PO_STATUS_LABELS: Record<PoStatus, string> = {
  draft: 'טיוטה',
  sent: 'נשלחה לספק',
  partial: 'התקבלה חלקית',
  received: 'התקבלה במלואה',
  closed: 'נסגרה',
  cancelled: 'בוטלה',
};

export const PO_STATUS_STYLES: Record<PoStatus, string> = {
  draft: 'bg-slate-100 text-slate-700',
  sent: 'bg-blue-100 text-blue-800',
  partial: 'bg-amber-100 text-amber-800',
  received: 'bg-emerald-100 text-emerald-800',
  closed: 'bg-slate-200 text-slate-600',
  cancelled: 'bg-slate-200 text-slate-500 line-through',
};

export type PurchaseOrder = {
  id: string;
  number: number;
  supplier_id: string;
  year_id: string;
  status: PoStatus;
  order_date: string | null;
  expected_date: string | null;
  notes: string | null;
  close_note: string | null;
  closed_at: string | null;
  closed_by_name: string | null;
  created_at: string;
  created_by_name: string | null;
};

export const PO_COLUMNS =
  'id, number, supplier_id, year_id, status, order_date, expected_date, notes, close_note, closed_at, closed_by_name, created_at, created_by_name';

export type PoItem = {
  id: string;
  po_id: string;
  book_id: string;
  qty_ordered: number;
  qty_received: number;
  qty_damaged: number;
  qty_wrong: number;
  qty_returned: number;
  shortage_note: string | null;
  notes: string | null;
};

export const PO_ITEM_COLUMNS =
  'id, po_id, book_id, qty_ordered, qty_received, qty_damaged, qty_wrong, qty_returned, shortage_note, notes';

export type PoAllocation = { id: string; po_item_id: string; institution_year_id: string | null; qty: number };

export type StockLevel = { book_id: string; on_hand: number; allocated: number; on_order: number; in_draft: number };
export type DemandRow = {
  institution_year_id: string;
  book_id: string;
  supplier_id: string | null;
  demand: number;
  allocated: number;
  ordered: number;
  ordered_draft: number;
};

export async function fetchStockLevels(): Promise<Map<string, StockLevel>> {
  const { data } = await supabase.rpc('stock_levels');
  return new Map((data ?? []).map((s) => [s.book_id, s]));
}

export async function fetchDemand(yearId: string): Promise<DemandRow[]> {
  const { data } = await supabase.rpc('demand_by_institution', { p_year: yearId });
  return data ?? [];
}

export type IyName = { id: string; name: string; number: number };

/** שמות המוסדות בשנה (למפתחות institution_year_id) */
export async function fetchIyNames(yearId: string): Promise<Map<string, IyName>> {
  const { data } = await supabase.from('institution_years').select('id, institutions(name, number)').eq('year_id', yearId);
  return new Map(
    (data ?? []).map((r) => {
      const i = r.institutions as unknown as { name: string; number: number } | null;
      return [r.id, { id: r.id, name: i?.name ?? '', number: i?.number ?? 0 }];
    })
  );
}

/** החוסר בקליטה: הוזמן פחות מה שהתקבל תקין (לא שלילי) */
export function outstanding(it: Pick<PoItem, 'qty_ordered' | 'qty_received'>): number {
  return Math.max(it.qty_ordered - it.qty_received, 0);
}
