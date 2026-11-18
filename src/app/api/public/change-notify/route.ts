import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { describeChange, queueAndSend, siteOrigin } from '@/lib/email/publicMail';
import { isValidEmail } from '@/lib/email/templates';
import { orderValues, type OrderValueSource } from '@/lib/email/orderValues';

// =====================================================================
// מיילים על בקשת שינוי מהקישור (בלי התחברות – הקורא שולח רק את מזהה הבקשה):
//   stage = 'received' – "קיבלנו את הבקשה": רק לבקשה ממתינה מ-15 הדקות האחרונות, פעם אחת
//   stage = 'decided'  – "אושרה / נדחתה": רק לבקשה שטופלה ב-15 הדקות האחרונות, פעם אחת
// הנמען תמיד המייל שבכרטיס הלקוח של ההזמנה, כך שאין כאן אפשרות לשלוח לכתובת אחרת.
// =====================================================================

type ChangeData = OrderValueSource & {
  request_id: string;
  status: string;
  created_at: string;
  decided_at: string | null;
  reason: string | null;
  note: string | null;
  cancel_order: boolean;
  delivery_method_req: string | null;
  received_emailed: boolean;
  decision_emailed: boolean;
  add: string[];
  remove: string[];
  view_code: string | null;
  order_id: string;
  customer_id: string;
  email: string | null;
};

const minutesSince = (iso: string | null) => (iso ? (Date.now() - new Date(iso).getTime()) / 60_000 : Infinity);

export async function POST(request: Request) {
  let id = '';
  let stage = '';
  try {
    const body = await request.json();
    id = typeof body?.request_id === 'string' ? body.request_id : '';
    stage = typeof body?.stage === 'string' ? body.stage : '';
  } catch {
    /* בקשה לא תקינה */
  }
  const none = NextResponse.json({ queued: false, sent: false });
  if (!/^[0-9a-f-]{36}$/.test(id) || !['received', 'decided'].includes(stage)) return none;

  const { data, error } = await supabaseAdmin.rpc('change_request_mail_data', { p_request: id });
  const r = data as unknown as ChangeData | null;
  if (error || !r || !isValidEmail(r.email)) return none;

  let template: 'change_received' | 'change_approved' | 'change_rejected';
  let flag: 'received_emailed' | 'decision_emailed';
  if (stage === 'received') {
    if (r.status !== 'pending' || r.received_emailed || minutesSince(r.created_at) > 15) return none;
    template = 'change_received';
    flag = 'received_emailed';
  } else {
    if (!['approved', 'rejected'].includes(r.status) || r.decision_emailed || minutesSince(r.decided_at) > 15) return none;
    template = r.status === 'approved' ? 'change_approved' : 'change_rejected';
    flag = 'decision_emailed';
  }

  // מסמנים לפני השליחה, ורק אם עוד לא סומן – כך שתי קריאות במקביל לא שולחות פעמיים
  const { data: marked } = await supabaseAdmin
    .from('online_change_requests')
    .update(flag === 'received_emailed' ? { received_emailed: true } : { decision_emailed: true })
    .eq('id', id)
    .eq(flag, false)
    .select('id');
  if (!marked?.length) return none;

  const res = await queueAndSend({
    template,
    kind: 'change_request',
    values: {
      ...orderValues(r),
      פירוט_בקשה: describeChange(r),
      סיבה: r.reason ?? '',
      קישור_הזמנה: r.view_code ? `${siteOrigin(request)}/o/${r.view_code}` : '',
    },
    to: r.email!,
    toName: r.student_name,
    customerId: r.customer_id,
    orderId: r.order_id,
  });
  return NextResponse.json(res);
}
