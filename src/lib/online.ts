// =====================================================================
// הזמנה בקישור (ח4): טיפוסים של הדף הציבורי /o/<קוד>, בדיקת ת"ז, כתובות הקישורים
// הנתונים מ-rpc('public_order_form') / rpc('submit_online_order') – ראו המיגרציה 20261119010000.
// =====================================================================

export type LinkState = 'ok' | 'not_found' | 'inactive' | 'closed_year' | 'not_open' | 'locked';

export type PublicBook = { book_id: string; name: string; qty: number; price: number; required: boolean; closed: boolean };
export type PublicClass = {
  id: string;
  name: string;
  books: PublicBook[];
  payment_instructions: string | null;
  pickup_info: string | null;
};

export type PublicOrderView = {
  number: number;
  status: string;
  student_name: string;
  class_name: string;
  created_at: string;
  delivery_method: 'pickup' | 'institution_day';
  total: number;
  paid_amount: number;
  balance: number;
  books: { name: string; qty: number; price: number }[];
  sale_day_date: string | null;
  payment_instructions: string | null;
  pickup_info: string | null;
};

export type PublicForm = {
  state: LinkState;
  contact: string | null;
  kind?: 'institution' | 'class' | 'order' | 'personal';
  institution?: string;
  year?: string;
  deadline?: string | null;
  open_date?: string | null;
  sale_day_date?: string | null;
  sale_day_notes?: string | null;
  classes?: PublicClass[];
  order?: PublicOrderView;
};

/** public_order_view – צפייה בהזמנה + אפשרויות לבקשת שינוי */
export type PublicOrderFull = {
  state: LinkState;
  contact?: string | null;
  institution?: string;
  year?: string;
  deadline?: string | null;
  sale_day_date?: string | null;
  can_change?: boolean;
  order?: Omit<PublicOrderView, 'books'> & { books: { book_id: string; name: string; qty: number; price: number }[] };
  class_books?: PublicBook[];
  pending?: {
    created_at: string;
    cancel_order: boolean;
    delivery_method: 'pickup' | 'institution_day' | null;
    note: string | null;
    add: string[];
    remove: string[];
  } | null;
  last_decision?: { status: 'approved' | 'rejected'; decided_at: string; reason: string | null } | null;
};

/** public_personal_form – קישור אישי */
export type PersonalForm = Omit<PublicForm, 'state'> & {
  state: LinkState | 'ordered';
  view_code?: string;
  student?: { first_name: string; last_name: string; has_email: boolean; email_hint: string | null; has_phone: boolean };
};

export type SubmitResult =
  | {
      ok: true;
      number: number;
      total: number;
      view_code: string;
      email_ok: boolean;
      payment_instructions: string | null;
      pickup_info: string | null;
    }
  | { ok: false; error: string; message: string };

export const STATE_MESSAGES: Record<Exclude<LinkState, 'ok'>, string> = {
  not_found: 'הקישור לא נמצא. ייתכן שהוא הוחלף בקישור חדש.',
  inactive: 'ההזמנה בקישור הזה סגורה כרגע.',
  closed_year: 'ההזמנות לשנה הזו נסגרו.',
  not_open: 'ההזמנה עוד לא נפתחה.',
  locked: 'המועד האחרון להזמנה עבר, וההזמנה ננעלה.',
};

/** סטטוס הזמנה – בניסוח להורה */
export const PUBLIC_STATUS_LABELS: Record<string, string> = {
  new: 'התקבלה',
  pending: 'התקבלה',
  approved: 'התקבלה',
  processing: 'בטיפול',
  preparing: 'בהכנה',
  ready: 'מוכנה לאיסוף',
  sent: 'הועברה ליום המכירה',
  delivered: 'נמסרה',
  cancelled: 'בוטלה',
};

/** ת"ז ישראלית: 5–9 ספרות + ספרת ביקורת (כמו valid_israeli_id במסד) */
export function validIsraeliId(value: string): boolean {
  const d = value.replace(/\D/g, '');
  if (d.length < 5 || d.length > 9) return false;
  const p = d.padStart(9, '0');
  if (p === '000000000') return false;
  let sum = 0;
  for (let i = 0; i < 9; i++) {
    const v = Number(p[i]) * (i % 2 === 0 ? 1 : 2);
    sum += v > 9 ? v - 9 : v;
  }
  return sum % 10 === 0;
}

export function validIsraeliPhone(value: string): boolean {
  return /^0\d{8,9}$/.test(value.replace(/\D/g, ''));
}

/** מייל להורה על אישור/דחייה של בקשת שינוי (השרת בודק שהבקשה טופלה עכשיו ושעוד לא נשלח) */
export async function notifyChangeDecision(requestId: string): Promise<void> {
  try {
    await fetch('/api/public/change-notify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ request_id: requestId, stage: 'decided' }),
    });
  } catch {
    /* המייל לא חיוני להחלטה עצמה */
  }
}

/** הכתובת המלאה של קישור (לפי האתר הנוכחי) */
export function orderLinkUrl(code: string): string {
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  return `${origin}/o/${code}`;
}
