import 'server-only';
import nodemailer from 'nodemailer';
import { supabaseAdmin } from '@/lib/supabase-admin';
import type { Database } from '@/types/database';
import { isValidEmail } from './templates';

// =====================================================================
// מיילים – צד שרת בלבד (Gmail עם סיסמת אפליקציה, דרך nodemailer).
// service_role משמש כאן רק לשני דברים שאין להם דרך אחרת: קריאת סיסמת האפליקציה
// (טבלה סגורה לגמרי) ועדכון הסטטוס של מייל אחרי השליחה. ההוספה לתור נעשית בשם המשתמש (RLS).
// =====================================================================

type OutboxRow = Database['public']['Tables']['email_outbox']['Row'];

export type EmailConfig = {
  enabled: boolean;
  gmailUser: string | null;
  password: string | null;
  fromName: string;
  replyTo: string | null;
  signature: string | null;
  dailyLimit: number;
};

export async function getEmailConfig(): Promise<EmailConfig> {
  const [{ data: s }, { data: secret }] = await Promise.all([
    supabaseAdmin.from('email_settings').select('*').eq('id', 1).maybeSingle(),
    supabaseAdmin.from('email_secrets').select('gmail_app_password').eq('id', 1).maybeSingle(),
  ]);
  return {
    enabled: !!s?.enabled,
    gmailUser: s?.gmail_user?.trim() || null,
    password: secret?.gmail_app_password || null,
    fromName: s?.from_name || 'מכירת ספרי לימוד',
    replyTo: isValidEmail(s?.reply_to) ? s!.reply_to!.trim() : null,
    signature: s?.signature?.trim() || null,
    dailyLimit: s?.daily_limit ?? 450,
  };
}

/** מה חסר כדי לשלוח (null = אפשר) */
export function configProblem(cfg: EmailConfig): string | null {
  if (!cfg.gmailUser) return 'לא הוגדרה כתובת Gmail (הגדרות ← מיילים)';
  if (!cfg.password) return 'לא נשמרה סיסמת אפליקציה (הגדרות ← מיילים)';
  return null;
}

/** תחילת היום הנוכחי לפי שעון ישראל, כ-ISO (השרת רץ ב-UTC) */
export function israelDayStart(now = new Date()): string {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Jerusalem', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' })
      .formatToParts(now)
      .map((p) => [p.type, p.value])
  );
  const sinceMidnight = (Number(parts.hour) * 3600 + Number(parts.minute) * 60 + Number(parts.second)) * 1000;
  return new Date(now.getTime() - sinceMidnight - now.getMilliseconds()).toISOString();
}

export async function sentToday(): Promise<number> {
  const { count } = await supabaseAdmin
    .from('email_outbox')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'sent')
    .gte('sent_at', israelDayStart());
  return count ?? 0;
}

function escapeHtml(text: string) {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** טקסט → HTML מימין לשמאל, קישורים לחיצים */
function toHtml(text: string) {
  const linked = escapeHtml(text).replace(/https?:\/\/[^\s<]+/g, (url) => `<a href="${url}" style="color:#1d4ed8">${url}</a>`);
  return (
    '<div dir="rtl" style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.7;color:#0f172a;' +
    `white-space:pre-wrap;text-align:right">${linked}</div>`
  );
}

export function withSignature(body: string, signature: string | null) {
  return signature ? `${body.trimEnd()}\n\n${signature}` : body;
}

export type Attachment = { filename: string; content: Buffer; contentType?: string };

export async function sendEmail(
  cfg: EmailConfig,
  msg: { to: string; subject: string; body: string; attachments?: Attachment[] }
) {
  const problem = configProblem(cfg);
  if (problem) throw new Error(problem);
  const transporter = nodemailer.createTransport({ service: 'gmail', auth: { user: cfg.gmailUser!, pass: cfg.password! } });
  const text = withSignature(msg.body, cfg.signature);
  try {
    await transporter.sendMail({
      from: `"${cfg.fromName.replace(/"/g, '')}" <${cfg.gmailUser}>`,
      to: msg.to,
      replyTo: cfg.replyTo ?? undefined,
      subject: msg.subject,
      text,
      html: toHtml(text),
      attachments: msg.attachments,
    });
  } catch (err) {
    const m = err instanceof Error ? err.message : String(err);
    if (/535|Username and Password not accepted|BadCredentials|Invalid login/i.test(m)) {
      throw new Error(
        'גוגל דחה את ההתחברות: יש לוודא שהכתובת היא בדיוק החשבון שבו נוצרה סיסמת האפליקציה, ' +
          'שאימות דו-שלבי פעיל בחשבון, ושהודבקה סיסמת אפליקציה (16 אותיות) ולא הסיסמה הרגילה'
      );
    }
    if (/limit|quota|550 5\.4\.5|daily/i.test(m)) throw new Error('גוגל חסם זמנית את השליחה (הגעתם למגבלה היומית של החשבון)');
    throw err;
  }
}

/** מצרף קבצים לפי סוג המייל (למשל אקסל של הזמנת רכש). מוגדר במודול נפרד כדי לא לטעון אותו סתם */
export type AttachmentBuilder = (row: OutboxRow) => Promise<Attachment[]>;

export type ProcessResult = {
  sent: number;
  failed: number;
  /** כמה עוד ממתינים (בבאץ' / ברשימה, או בכלל) */
  remaining: number;
  /** הגענו למגבלה היומית – השאר יישלח מחר */
  limitReached: boolean;
  /** השליחה כבויה בהגדרות – שום דבר לא יצא */
  disabled: boolean;
  /** בעיה בהגדרות (אין סיסמה וכו') */
  problem: string | null;
  sentToday: number;
  dailyLimit: number;
  errors: string[];
};

/**
 * שליחת מיילים שממתינים בתור: עד max, לפי המגבלה היומית.
 * batchId / ids – רק מתוך הבאץ' / המזהים האלה. מייל בדיקה יוצא גם כשהשליחה כבויה.
 */
export async function processQueue(opts: {
  batchId?: string;
  ids?: string[];
  max?: number;
  attachments?: AttachmentBuilder;
}): Promise<ProcessResult> {
  const cfg = await getEmailConfig();
  const today = await sentToday();
  const base = { sent: 0, failed: 0, limitReached: false, disabled: false, problem: null as string | null, sentToday: today, dailyLimit: cfg.dailyLimit, errors: [] as string[] };

  const countRemaining = async () => {
    let q = supabaseAdmin.from('email_outbox').select('id', { count: 'exact', head: true }).eq('status', 'queued');
    if (opts.batchId) q = q.eq('batch_id', opts.batchId);
    if (opts.ids) q = q.in('id', opts.ids);
    const { count } = await q;
    return count ?? 0;
  };

  const problem = configProblem(cfg);
  if (problem) return { ...base, problem, remaining: await countRemaining() };

  const room = Math.max(cfg.dailyLimit - today, 0);
  const max = Math.min(opts.max ?? 15, room);

  let q = supabaseAdmin.from('email_outbox').select('*').eq('status', 'queued').order('created_at').limit(Math.max(max, 1));
  if (opts.batchId) q = q.eq('batch_id', opts.batchId);
  if (opts.ids) q = q.in('id', opts.ids);
  if (!cfg.enabled) q = q.eq('kind', 'test');
  const { data: rows, error } = await q;
  if (error) throw new Error(error.message);

  const result = { ...base, disabled: !cfg.enabled };
  if (room === 0) {
    result.limitReached = true;
    return { ...result, remaining: await countRemaining() };
  }

  for (const row of (rows ?? []).slice(0, max)) {
    try {
      const attachments = opts.attachments ? await opts.attachments(row) : [];
      await sendEmail(cfg, { to: row.to_email, subject: row.subject, body: row.body, attachments });
      await supabaseAdmin
        .from('email_outbox')
        .update({ status: 'sent', sent_at: new Date().toISOString(), error: null, attempts: row.attempts + 1 })
        .eq('id', row.id);
      result.sent++;
      result.sentToday++;
    } catch (err) {
      const m = err instanceof Error ? err.message : String(err);
      await supabaseAdmin.from('email_outbox').update({ status: 'failed', error: m, attempts: row.attempts + 1 }).eq('id', row.id);
      result.failed++;
      if (!result.errors.includes(m)) result.errors.push(m);
      // בעיית התחברות – אין טעם להמשיך עם השאר
      if (/גוגל דחה את ההתחברות|גוגל חסם/.test(m)) break;
    }
  }
  result.limitReached = result.sentToday >= cfg.dailyLimit;
  return { ...result, remaining: await countRemaining() };
}
