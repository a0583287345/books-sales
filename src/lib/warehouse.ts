import { supabase } from '@/lib/supabase';

// =====================================================================
// מחסן: שקיות, משלוחים למוסד, מסירה
// =====================================================================

export type BagStatus = 'picking' | 'picked' | 'checked' | 'ready' | 'delivered' | 'cancelled';

export const BAG_STATUS_LABELS: Record<BagStatus, string> = {
  picking: 'בליקוט',
  picked: 'לוקטה',
  checked: 'נבדקה',
  ready: 'מוכנה למסירה',
  delivered: 'נמסרה',
  cancelled: 'פורקה',
};

export const BAG_STATUS_STYLES: Record<BagStatus, string> = {
  picking: 'bg-amber-100 text-amber-800',
  picked: 'bg-blue-100 text-blue-800',
  checked: 'bg-indigo-100 text-indigo-800',
  ready: 'bg-teal-100 text-teal-800',
  delivered: 'bg-emerald-100 text-emerald-800',
  cancelled: 'bg-slate-200 text-slate-500 line-through',
};

export type DeliveryStatus = 'planned' | 'sent' | 'delivered' | 'cancelled';
export const DELIVERY_STATUS_LABELS: Record<DeliveryStatus, string> = {
  planned: 'בתכנון',
  sent: 'יצא לדרך',
  delivered: 'נמסר למוסד',
  cancelled: 'בוטל',
};

export type PackItem = {
  id: string;
  book_id: string;
  book_name: string;
  book_code: string;
  qty: number;
  packed: number;
  delivered: number;
  allocated: number;
  packed_open: number;
};

export type PackBag = {
  id: string;
  bag_no: number;
  code: string;
  status: BagStatus;
  is_partial: boolean;
  delivery_id: string | null;
  notes: string | null;
  picked_by_name: string | null;
  checked_by_name: string | null;
  delivered_at: string | null;
  received_by: string | null;
  delivered_by_name: string | null;
  label_printed_at: string | null;
  items: { order_item_id: string; qty: number }[];
};

export type PackDetails = {
  order: {
    id: string;
    number: number;
    status: string;
    delivery_method: 'pickup' | 'institution_day';
    student_name: string;
    customer_name: string;
    customer_phone: string | null;
    institution_year_id: string;
    inst_name: string;
    class_name: string;
    total: number;
    paid_amount: number;
    balance: number;
    notes: string | null;
    year_name: string;
    sale_day_date: string | null;
  };
  items: PackItem[];
  bags: PackBag[];
};

export async function fetchPackDetails(orderId: string): Promise<PackDetails | null> {
  const { data } = await supabase.rpc('order_pack_details', { p_order: orderId });
  return (data as unknown as PackDetails) ?? null;
}

/** קישור ה-QR של שקית – נפתח גם במצלמה רגילה */
export function bagUrl(code: string): string {
  const origin = typeof window !== 'undefined' ? window.location.origin : 'https://books-sales.vercel.app';
  return `${origin}/b/${encodeURIComponent(code)}`;
}

export type LabelData = {
  id: string;
  code: string;
  bag_no: number;
  bag_count: number;
  is_partial: boolean;
  order_number: number;
  student_name: string;
  customer_name: string;
  inst_name: string;
  class_name: string;
  delivery_method: 'pickup' | 'institution_day';
  balance: number;
  total: number;
  items: { name: string; code: string; qty: number }[];
};
