import { NextResponse } from 'next/server';
import { supabaseAdmin, userClient } from '@/lib/supabase-admin';
import { buildAttachments } from '@/lib/email/attachments';
import { configProblem, getEmailConfig, processQueue, sentToday } from '@/lib/email/server';
import { isValidEmail, type OutgoingEmail } from '@/lib/email/templates';

// =====================================================================
// מיילים – פעולות:
//   status          – מצב: מוגדר? פעיל? כמה נשלחו היום / ממתינים       (כל מי שקשור למיילים)
//   save_password   – שמירת סיסמת אפליקציה (לא חוזרת לדפדפן לעולם)   (email_settings)
//   clear_password  – מחיקת הסיסמה                                    (email_settings)
//   test            – מייל בדיקה                                       (email_settings)
//   send            – הכנסה לתור (בשם המשתמש – RLS לפי סוג) + שליחת החלק הראשון
//   process         – שליחת החלק הבא (לפי באץ' / הכול)
//   retry / cancel  – שליחה חוזרת של מייל שנכשל / ביטול מייל שממתין
// service_role רק לסיסמה ולעדכון הסטטוס אחרי השליחה; ההוספה לתור – בשם המשתמש.
// =====================================================================

const fail = (error: string, status = 400) => NextResponse.json({ error }, { status });
const SEND_PERMS = ['emails_send', 'emails_suppliers', 'email_settings'];
const MAX_MESSAGES = 1000;

export const maxDuration = 120;

export async function POST(request: Request) {
  const token = request.headers.get('Authorization')?.replace('Bearer ', '') ?? '';
  if (!token) return fail('חסר טוקן התחברות', 401);
  const {
    data: { user },
  } = await supabaseAdmin.auth.getUser(token);
  if (!user) return fail('משתמש לא מזוהה', 401);
  const db = userClient(token);

  const can = async (perms: string[]) => {
    for (const p of perms) {
      const { data } = await db.rpc('has_permission', { p });
      if (data) return true;
    }
    return false;
  };
  const audit = (action: string, description: string, entityId?: string) =>
    db.from('audit_logs').insert({ action, entity: 'email', entity_id: entityId ?? null, description });

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return fail('בקשה לא תקינה');
  }

  try {
    switch (body.action) {
      case 'status': {
        if (!(await can([...SEND_PERMS, 'emails_view']))) return fail('אין לך הרשאה', 403);
        const cfg = await getEmailConfig();
        const { count: queued } = await supabaseAdmin.from('email_outbox').select('id', { count: 'exact', head: true }).eq('status', 'queued');
        const isAdmin = await can(['email_settings']);
        return NextResponse.json({
          enabled: cfg.enabled,
          configured: !!cfg.gmailUser && !!cfg.password,
          hasPassword: isAdmin ? !!cfg.password : undefined,
          sentToday: await sentToday(),
          dailyLimit: cfg.dailyLimit,
          queued: queued ?? 0,
        });
      }

      case 'save_password': {
        if (!(await can(['email_settings']))) return fail('אין לך הרשאה להגדרות המייל', 403);
        const password = typeof body.password === 'string' ? body.password.replace(/\s+/g, '') : '';
        if (!/^[a-zA-Z]{16}$/.test(password)) return fail('סיסמת אפליקציה של Gmail היא 16 אותיות באנגלית (אפשר להדביק עם רווחים)');
        const { error } = await supabaseAdmin
          .from('email_secrets')
          .update({ gmail_app_password: password, updated_at: new Date().toISOString() })
          .eq('id', 1);
        if (error) return fail(error.message, 500);
        await audit('update', 'עודכנה סיסמת האפליקציה של Gmail');
        return NextResponse.json({ success: true });
      }

      case 'clear_password': {
        if (!(await can(['email_settings']))) return fail('אין לך הרשאה להגדרות המייל', 403);
        const { error } = await supabaseAdmin
          .from('email_secrets')
          .update({ gmail_app_password: null, updated_at: new Date().toISOString() })
          .eq('id', 1);
        if (error) return fail(error.message, 500);
        await audit('update', 'נמחקה סיסמת האפליקציה של Gmail');
        return NextResponse.json({ success: true });
      }

      case 'test': {
        const to = typeof body.to === 'string' ? body.to.trim() : '';
        if (!isValidEmail(to)) return fail('כתובת מייל לא תקינה');
        // קודם בודקים שההגדרות שלמות – כדי שלא יישאר מייל בדיקה תקוע בתור
        const problem = configProblem(await getEmailConfig());
        if (problem) return fail(problem);
        const { data, error } = await db
          .from('email_outbox')
          .insert({
            kind: 'test',
            to_email: to,
            subject: 'מייל בדיקה – מכירת ספרי לימוד',
            body: 'שלום,\n\nזהו מייל בדיקה. אם קיבלת אותו – השליחה מהמערכת עובדת.',
            created_by: user.id,
          })
          .select('id')
          .single();
        if (error) return fail(/row-level security/i.test(error.message) ? 'אין לך הרשאה להגדרות המייל' : error.message, 403);
        const r = await processQueue({ ids: [data.id], max: 1 });
        if (r.problem) return fail(r.problem);
        if (r.failed) return fail(r.errors[0] ?? 'השליחה נכשלה');
        if (r.limitReached && !r.sent) return fail('הגעתם למגבלת השליחה היומית');
        return NextResponse.json({ success: true });
      }

      case 'send': {
        const messages = Array.isArray(body.messages) ? (body.messages as OutgoingEmail[]) : [];
        if (!messages.length) return fail('אין נמענים');
        if (messages.length > MAX_MESSAGES) return fail(`אפשר לשלוח עד ${MAX_MESSAGES} מיילים בפעם אחת`);
        const bad = messages.find((m) => !isValidEmail(m.to) || !m.subject?.trim() || !m.kind);
        if (bad) return fail(`פרטי מייל לא תקינים${bad.to ? ` (${bad.to})` : ''}`);

        const title = typeof body.title === 'string' && body.title.trim() ? body.title.trim() : messages[0].subject;
        const { data: batch, error: bErr } = await db
          .from('email_batches')
          .insert({ kind: messages[0].kind, title, total: messages.length, created_by: user.id })
          .select('id')
          .single();
        if (bErr) return fail(/row-level security/i.test(bErr.message) ? 'אין לך הרשאה לשלוח מיילים' : bErr.message, 403);

        const rows = messages.map((m) => ({
          batch_id: batch.id,
          kind: m.kind,
          to_email: m.to.trim(),
          to_name: m.to_name ?? null,
          subject: m.subject.trim(),
          body: m.body ?? '',
          customer_id: m.customer_id ?? null,
          order_id: m.order_id ?? null,
          supplier_id: m.supplier_id ?? null,
          po_id: m.po_id ?? null,
          attach_po: !!m.attach_po,
          attach_po_prices: !!m.attach_po_prices,
          created_by: user.id,
        }));
        for (let i = 0; i < rows.length; i += 200) {
          const { error } = await db.from('email_outbox').insert(rows.slice(i, i + 200));
          if (error) {
            return fail(/row-level security/i.test(error.message) ? 'אין לך הרשאה לשלוח מיילים מהסוג הזה' : error.message, 403);
          }
        }
        if (messages.length > 1) await audit('insert', `שליחת מיילים: ${title} (${messages.length} נמענים)`, batch.id);
        const r = await processQueue({ batchId: batch.id, attachments: buildAttachments });
        return NextResponse.json({ batchId: batch.id, total: messages.length, ...r });
      }

      case 'process': {
        if (!(await can(SEND_PERMS))) return fail('אין לך הרשאה', 403);
        const batchId = typeof body.batchId === 'string' ? body.batchId : undefined;
        const r = await processQueue({ batchId, attachments: buildAttachments });
        return NextResponse.json(r);
      }

      case 'retry':
      case 'cancel': {
        if (!(await can(SEND_PERMS))) return fail('אין לך הרשאה', 403);
        const id = typeof body.id === 'string' ? body.id : '';
        // הרשומה צריכה להיות גלויה למשתמש (RLS לפי סוג)
        const { data: row } = await db.from('email_outbox').select('id, status').eq('id', id).maybeSingle();
        if (!row) return fail('המייל לא נמצא');
        const from = body.action === 'retry' ? 'failed' : 'queued';
        if (row.status !== from) return fail(body.action === 'retry' ? 'אפשר לשלוח שוב רק מייל שנכשל' : 'אפשר לבטל רק מייל שממתין');
        await supabaseAdmin
          .from('email_outbox')
          .update(body.action === 'retry' ? { status: 'queued', error: null } : { status: 'cancelled' })
          .eq('id', id);
        if (body.action === 'retry') {
          const r = await processQueue({ ids: [id], max: 1, attachments: buildAttachments });
          return NextResponse.json(r);
        }
        return NextResponse.json({ success: true });
      }

      default:
        return fail('פעולה לא מוכרת');
    }
  } catch (err) {
    return fail(err instanceof Error ? err.message : 'שגיאה', 500);
  }
}
