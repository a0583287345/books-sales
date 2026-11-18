import { formatDate, money } from '@/lib/format';

// =====================================================================
// ערכי השדות בתבניות של מיילים על הזמנה ({תלמיד}, {סכום}, {פרטי_איסוף}...).
// בלי תלות בדפדפן – משמש גם את השרת (מייל אישור להזמנה מהקישור).
// =====================================================================

export type OrderValueSource = {
  number: number;
  delivery_method: 'pickup' | 'institution_day';
  student_name: string;
  parent_name: string | null;
  inst_name: string;
  class_name: string;
  sale_day_date: string | null;
  sale_day_notes: string | null;
  total: number;
  paid_amount: number;
  balance: number;
  books: { name: string; qty: number }[];
  payment_instructions: string | null;
  pickup_info: string | null;
};

export function orderValues(o: OrderValueSource): Record<string, string> {
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
