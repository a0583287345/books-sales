import 'server-only';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { processQueue } from './server';
import { mergeTemplates, renderTemplate, type TemplateKey, type EmailKind } from './templates';

// =====================================================================
// מיילים להורה שנשלחים בעקבות פעולה בקישור / במשרד (אישור הזמנה, בקשת שינוי).
// השרת מכניס לתור בעצמו (service_role) ושולח מיד – הכתובת של הלקוח לא נחשפת לדפדפן.
// הבדיקות "האם מותר לשלוח" (פעם אחת, רק לאחרונה) נעשות בכל route לפני הקריאה לכאן.
// =====================================================================

export async function queueAndSend(opts: {
  template: TemplateKey;
  kind: EmailKind;
  values: Record<string, string>;
  to: string;
  toName: string;
  customerId: string;
  orderId: string;
}): Promise<{ queued: boolean; sent: boolean }> {
  const { data: settings } = await supabaseAdmin.from('email_settings').select('templates').eq('id', 1).maybeSingle();
  const t = mergeTemplates(settings?.templates)[opts.template];
  const { data: row, error } = await supabaseAdmin
    .from('email_outbox')
    .insert({
      kind: opts.kind,
      to_email: opts.to.trim(),
      to_name: opts.toName,
      subject: renderTemplate(t.subject, opts.values),
      body: renderTemplate(t.body, opts.values),
      customer_id: opts.customerId,
      order_id: opts.orderId,
      created_by_name: 'הזמנה בקישור',
    })
    .select('id')
    .single();
  if (error || !row) return { queued: false, sent: false };
  try {
    const res = await processQueue({ ids: [row.id], max: 1 });
    return { queued: true, sent: res.sent > 0 };
  } catch {
    return { queued: true, sent: false };
  }
}

/** כתובת האתר (לקישורים במייל) */
export function siteOrigin(request: Request): string {
  return request.headers.get('origin') || new URL(request.url).origin;
}

/** תיאור בקשת שינוי במילים (למייל ולמסך) */
export function describeChange(r: {
  cancel_order: boolean;
  add: string[];
  remove: string[];
  delivery_method_req: string | null;
  note: string | null;
}): string {
  if (r.cancel_order) return `ביטול ההזמנה${r.note ? ` (${r.note})` : ''}`;
  const lines: string[] = [];
  if (r.add.length) lines.push(`להוסיף: ${r.add.join(', ')}`);
  if (r.remove.length) lines.push(`להוריד: ${r.remove.join(', ')}`);
  if (r.delivery_method_req) lines.push(`אופן מסירה: ${r.delivery_method_req === 'pickup' ? 'איסוף עצמי' : 'יום מכירה במוסד'}`);
  if (r.note) lines.push(`הערה: ${r.note}`);
  return lines.map((l) => `• ${l}`).join('\n');
}
