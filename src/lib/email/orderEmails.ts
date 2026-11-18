import { supabase } from '@/lib/supabase';
import { formatDate, money } from '@/lib/format';
import { isValidEmail, renderTemplate, type EmailTemplate, type OutgoingEmail } from './templates';

// =====================================================================
// מיילים על ההזמנה: "ההזמנה מוכנה" / "מוכנה חלקית" / "תזכורת תשלום".
// הנתונים מ-rpc('order_email_data') – כולל מצב האריזה, הספרים והטקסטים לפי כיתה ← מוסד ← ברירת מחדל.
// =====================================================================

export type OrderEmailData = {
  order_id: string;
  number: number;
  status: string;
  delivery_method: 'pickup' | 'institution_day';
  student_name: string;
  customer_id: string;
  parent_name: string | null;
  email: string | null;
  email_opt_out: boolean;
  phone: string | null;
  inst_name: string;
  class_name: string;
  sale_day_date: string | null;
  sale_day_notes: string | null;
  total: number;
  paid_amount: number;
  balance: number;
  qty_total: number;
  qty_ready: number;
  qty_delivered: number;
  books: { name: string; qty: number }[];
  payment_instructions: string | null;
  pickup_info: string | null;
  last_ready_email: string | null;
  last_reminder_email: string | null;
};

export async function fetchOrderEmailData(orderIds: string[]): Promise<OrderEmailData[]> {
  const out: OrderEmailData[] = [];
  for (let i = 0; i < orderIds.length; i += 300) {
    const { data, error } = await supabase.rpc('order_email_data', { p_orders: orderIds.slice(i, i + 300) });
    if (error) throw new Error(error.message);
    out.push(...((data as unknown as OrderEmailData[]) ?? []));
  }
  return out;
}

export type OrderMailMode = 'ready' | 'payment_reminder';

/** מוכנה = כל הספרים בשקיות מוכנות (או כבר נמסרו) ויש לפחות שקית מוכנה אחת */
export const isFullyReady = (o: OrderEmailData) => o.qty_total > 0 && o.qty_ready > 0 && o.qty_ready + o.qty_delivered >= o.qty_total;
export const isPartlyReady = (o: OrderEmailData) => o.qty_ready > 0 && !isFullyReady(o);

/** איזה סוג מייל מתאים להזמנה הזו (null = לא מתאים) */
export function kindFor(o: OrderEmailData, mode: OrderMailMode, includePartial: boolean): 'ready' | 'ready_partial' | 'payment_reminder' | null {
  if (o.status === 'cancelled') return null;
  if (mode === 'payment_reminder') return o.balance > 0 ? 'payment_reminder' : null;
  if (isFullyReady(o)) return 'ready';
  if (includePartial && isPartlyReady(o)) return 'ready_partial';
  return null;
}

/** כבר נשלח מייל מהסוג הזה (תזכורת: בימים האחרונים) */
export function alreadySent(o: OrderEmailData, mode: OrderMailMode, reminderDays = 7): string | null {
  if (mode === 'ready') return o.last_ready_email;
  if (!o.last_reminder_email) return null;
  const days = (Date.now() - new Date(o.last_reminder_email).getTime()) / 86_400_000;
  return days < reminderDays ? o.last_reminder_email : null;
}

/** ערכי השדות בתבנית */
export function orderValues(o: OrderEmailData): Record<string, string> {
  const pickup =
    o.delivery_method === 'institution_day'
      ? [
          `החלוקה ביום המכירה ב${o.inst_name}${o.sale_day_date ? ` – ${formatDate(o.sale_day_date)}` : ''}`,
          o.sale_day_notes,
        ]
          .filter(Boolean)
          .join('\n')
      : o.pickup_info ?? '';
  return {
    תלמיד: o.student_name,
    הורה: o.parent_name ?? '',
    מוסד: o.inst_name,
    כיתה: o.class_name,
    מספר_הזמנה: String(o.number),
    סכום: money(o.total),
    שולם: money(o.paid_amount),
    יתרה: money(Math.max(o.balance, 0)),
    מצב_תשלום: o.balance > 0 ? `יתרה לתשלום: ${money(o.balance)}` : 'ההזמנה שולמה – תודה!',
    רשימת_ספרים: o.books.map((b) => `• ${b.name}${b.qty > 1 ? ` × ${b.qty}` : ''}`).join('\n'),
    פרטי_איסוף: pickup,
    // כשהכול שולם – אין צורך בהוראות תשלום
    הוראות_תשלום: o.balance > 0 ? o.payment_instructions ?? '' : '',
  };
}

export function buildOrderEmail(o: OrderEmailData, kind: 'ready' | 'ready_partial' | 'payment_reminder', t: EmailTemplate): OutgoingEmail {
  const values = orderValues(o);
  return {
    kind,
    to: (o.email ?? '').trim(),
    to_name: o.student_name,
    subject: renderTemplate(t.subject, values),
    body: renderTemplate(t.body, values),
    customer_id: o.customer_id,
    order_id: o.order_id,
  };
}

export const hasEmail = (o: OrderEmailData) => isValidEmail(o.email);
