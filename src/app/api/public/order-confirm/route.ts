import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { queueAndSend, siteOrigin } from '@/lib/email/publicMail';
import { isValidEmail } from '@/lib/email/templates';
import { orderValues, type OrderValueSource } from '@/lib/email/orderValues';

// =====================================================================
// מייל אישור להזמנה מהקישור (ציבורי – בלי התחברות).
// הדף שולח את קוד הצפייה שקיבל אחרי ההזמנה. השרת:
//   1. שולף את נתוני ההזמנה לפי הקוד (online_confirm_data – רק service_role)
//   2. רק להזמנה מהקישור, שנוצרה בשעה האחרונה, שעוד לא נשלח לה אישור (אינדקס ייחודי), ושיש ללקוח מייל
//   3. מכניס לתור ושולח מיד (אם השליחה פעילה; אחרת נשאר בתור)
// =====================================================================

type ConfirmData = OrderValueSource & {
  order_id: string;
  customer_id: string;
  email: string | null;
  created_at: string;
  source: string;
  already_sent: boolean;
};

export async function POST(request: Request) {
  let code = '';
  try {
    const body = await request.json();
    code = typeof body?.code === 'string' ? body.code.trim() : '';
  } catch {
    /* בקשה לא תקינה */
  }
  const none = NextResponse.json({ queued: false, sent: false });
  if (!/^[A-Za-z0-9]{16,40}$/.test(code)) return none;

  const { data, error } = await supabaseAdmin.rpc('online_confirm_data', { p_view_code: code });
  const o = data as unknown as ConfirmData | null;
  if (error || !o) return none;
  const ageMinutes = (Date.now() - new Date(o.created_at).getTime()) / 60_000;
  if (o.source !== 'online' || o.already_sent || ageMinutes > 60 || !isValidEmail(o.email)) return none;

  const r = await queueAndSend({
    template: 'order_confirm',
    kind: 'order_confirm',
    values: { ...orderValues(o), קישור_הזמנה: `${siteOrigin(request)}/o/${code}` },
    to: o.email!,
    toName: o.student_name,
    customerId: o.customer_id,
    orderId: o.order_id,
  });
  return NextResponse.json(r);
}
