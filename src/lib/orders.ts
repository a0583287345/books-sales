import { supabase } from '@/lib/supabase';

// =====================================================================
// הזמנות: סטטוסים, אופני מסירה, טיפוסים ושליפות משותפות
// =====================================================================

export const ORDER_STATUSES = [
  'new',
  'pending',
  'approved',
  'processing',
  'preparing',
  'ready',
  'sent',
  'delivered',
  'cancelled',
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  new: 'חדשה',
  pending: 'ממתינה לאישור',
  approved: 'מאושרת',
  processing: 'בטיפול',
  preparing: 'בהכנה',
  ready: 'מוכנה לאיסוף',
  sent: 'הועברה ליום המכירה',
  delivered: 'נמסרה',
  cancelled: 'בוטלה',
};

export const ORDER_STATUS_STYLES: Record<OrderStatus, string> = {
  new: 'bg-blue-100 text-blue-800',
  pending: 'bg-amber-100 text-amber-800',
  approved: 'bg-indigo-100 text-indigo-800',
  processing: 'bg-violet-100 text-violet-800',
  preparing: 'bg-orange-100 text-orange-800',
  ready: 'bg-teal-100 text-teal-800',
  sent: 'bg-cyan-100 text-cyan-800',
  delivered: 'bg-emerald-100 text-emerald-800',
  cancelled: 'bg-slate-200 text-slate-600 line-through',
};

/** סטטוסים שבהם הספרים כבר בתהליך הכנה/מסירה – ביטול מציג אזהרה */
export const ADVANCED_STATUSES: OrderStatus[] = ['preparing', 'ready', 'sent', 'delivered'];

export type DeliveryMethod = 'pickup' | 'institution_day';
export const DELIVERY_LABELS: Record<DeliveryMethod, string> = {
  pickup: 'איסוף עצמי',
  institution_day: 'יום מכירה במוסד',
};

export const SOURCE_LABELS: Record<string, string> = { manual: 'ידנית', phone: 'טלפונית', copy: 'העתקה', online: 'בקישור' };

/** פרטים שההורה הקליד בקישור ושונים מהכרטיס (orders.review_details) */
export const REVIEW_FIELD_LABELS: Record<string, string> = { name: 'שם', phone: 'טלפון', email: 'מייל', parent_name: 'שם ההורה' };

export type OrderRow = {
  id: string;
  number: number;
  year_id: string;
  institution_year_id: string;
  class_id: string;
  customer_id: string;
  student_id: string | null;
  student_name: string;
  status: OrderStatus;
  delivery_method: DeliveryMethod;
  subtotal: number;
  discount: number;
  discount_reason: string | null;
  total: number;
  paid_amount: number;
  balance: number;
  source: string;
  copied_from: string | null;
  notes: string | null;
  cancelled_at: string | null;
  cancelled_by_name: string | null;
  cancel_reason: string | null;
  created_at: string;
  created_by_name: string | null;
  needs_review: boolean;
  review_details: Record<string, string> | null;
};

export const ORDER_COLUMNS =
  'id, number, year_id, institution_year_id, class_id, customer_id, student_id, student_name, status, delivery_method, subtotal, discount, discount_reason, total, paid_amount, balance, source, copied_from, notes, cancelled_at, cancelled_by_name, cancel_reason, created_at, created_by_name, needs_review, review_details';

/** עמודות + שמות לתצוגה ברשימות */
export const ORDER_LIST_SELECT = `${ORDER_COLUMNS},
  customers(number, first_name, last_name, phone, phone_digits),
  classes(name),
  institution_years(institutions(name, number))`;

export type OrderListRow = OrderRow & {
  customerName: string;
  customerNumber: number;
  customerPhone: string | null;
  customerPhoneDigits: string;
  className: string;
  instName: string;
  instNumber: number;
};

type RawListRow = OrderRow & {
  customers: { number: number; first_name: string; last_name: string; phone: string | null; phone_digits: string | null } | null;
  classes: { name: string } | null;
  institution_years: { institutions: { name: string; number: number } | null } | null;
};

export function toListRow(r: unknown): OrderListRow {
  const x = r as RawListRow;
  return {
    ...x,
    customerName: x.customers ? `${x.customers.last_name} ${x.customers.first_name}` : '',
    customerNumber: x.customers?.number ?? 0,
    customerPhone: x.customers?.phone ?? null,
    customerPhoneDigits: x.customers?.phone_digits ?? '',
    className: x.classes?.name ?? '',
    instName: x.institution_years?.institutions?.name ?? '',
    instNumber: x.institution_years?.institutions?.number ?? 0,
  };
}

export type OrderItem = {
  id: string;
  order_id: string;
  book_id: string;
  class_book_id: string | null;
  qty: number;
  unit_price: number;
  is_required: boolean;
  order_deadline: string | null;
  cancel_deadline: string | null;
  status: 'active' | 'cancelled';
  cancelled_at: string | null;
  cancelled_by_name: string | null;
  cancel_reason: string | null;
  cancelled_late: boolean;
};

export const ORDER_ITEM_COLUMNS =
  'id, order_id, book_id, class_book_id, qty, unit_price, is_required, order_deadline, cancel_deadline, status, cancelled_at, cancelled_by_name, cancel_reason, cancelled_late';

/** ספר ברשימת הכיתה, עם שם וקוד – לבחירה בהזמנה */
export type ClassBookOption = {
  id: string;
  book_id: string;
  qty_per_student: number;
  sale_price: number;
  is_required: boolean;
  order_deadline: string | null;
  cancel_deadline: string | null;
  sort_order: number;
  bookName: string;
  bookCode: string;
};

export async function fetchClassBookOptions(classId: string): Promise<ClassBookOption[]> {
  const { data } = await supabase
    .from('class_books')
    .select('id, book_id, qty_per_student, sale_price, is_required, order_deadline, cancel_deadline, sort_order, books(name, code)')
    .eq('class_id', classId)
    .order('sort_order');
  return (data ?? []).map((r) => {
    const b = r.books as unknown as { name: string; code: string } | null;
    return { ...r, bookName: b?.name ?? '', bookCode: b?.code ?? '' };
  });
}

/** תאריך היום בישראל, 'YYYY-MM-DD' (לבדיקת מועדים אחרונים) */
export function israelToday(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem' }).format(new Date());
}

export function isPast(deadline: string | null | undefined): boolean {
  return !!deadline && israelToday() > deadline;
}
