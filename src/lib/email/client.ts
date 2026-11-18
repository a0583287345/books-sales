import { callServerApi } from '@/lib/apiClient';
import { supabase } from '@/lib/supabase';
import { mergeTemplates, type EmailTemplates, type OutgoingEmail } from './templates';

// =====================================================================
// מיילים – צד הדפדפן: שליחה בחלקים עם התקדמות, וקריאת ההגדרות (בלי הסיסמה)
// =====================================================================

export type SendProgress = {
  total: number;
  sent: number;
  failed: number;
  remaining: number;
  limitReached: boolean;
  disabled: boolean;
  problem: string | null;
  errors: string[];
  done: boolean;
};

type ProcessResponse = {
  sent: number;
  failed: number;
  remaining: number;
  limitReached: boolean;
  disabled: boolean;
  problem: string | null;
  errors: string[];
};

/** שליחה: הכנסה לתור ואז שליחה בחלקים עד שנגמר / מגבלה יומית / שליחה כבויה */
export async function sendEmails(
  messages: OutgoingEmail[],
  opts: { title?: string; onProgress?: (p: SendProgress) => void } = {}
): Promise<SendProgress> {
  const first = await callServerApi<ProcessResponse & { batchId: string; total: number }>('/api/email', {
    action: 'send',
    title: opts.title,
    messages,
  });
  const p: SendProgress = { total: first.total, ...pick(first), done: false };
  opts.onProgress?.({ ...p });
  let last: ProcessResponse = first;
  while (last.remaining > 0 && last.sent + last.failed > 0 && !last.limitReached && !last.disabled && !last.problem) {
    if (/גוגל דחה|גוגל חסם/.test(last.errors.join(' '))) break;
    last = await callServerApi<ProcessResponse>('/api/email', { action: 'process', batchId: first.batchId });
    p.sent += last.sent;
    p.failed += last.failed;
    p.remaining = last.remaining;
    p.limitReached = last.limitReached;
    p.disabled = last.disabled;
    p.problem = last.problem;
    for (const e of last.errors) if (!p.errors.includes(e)) p.errors.push(e);
    opts.onProgress?.({ ...p });
  }
  p.done = true;
  opts.onProgress?.({ ...p });
  return p;
}

function pick(r: ProcessResponse) {
  return {
    sent: r.sent,
    failed: r.failed,
    remaining: r.remaining,
    limitReached: r.limitReached,
    disabled: r.disabled,
    problem: r.problem,
    errors: [...r.errors],
  };
}

/** משפט סיכום לתוצאת שליחה */
export function progressSummary(p: SendProgress): string {
  const parts = [`נשלחו ${p.sent} מתוך ${p.total}`];
  if (p.failed) parts.push(`${p.failed} נכשלו`);
  if (p.remaining) {
    if (p.problem) parts.push(`${p.remaining} ממתינים – ${p.problem}`);
    else if (p.disabled) parts.push(`${p.remaining} ממתינים – השליחה כבויה בהגדרות`);
    else if (p.limitReached) parts.push(`${p.remaining} יישלחו מחר (הגעתם למגבלה היומית)`);
    else parts.push(`${p.remaining} ממתינים בתור`);
  }
  return parts.join(' · ');
}

export type EmailSettingsRow = {
  enabled: boolean;
  gmail_user: string | null;
  from_name: string;
  reply_to: string | null;
  signature: string | null;
  daily_limit: number;
  templates: EmailTemplates;
  default_payment_instructions: string | null;
  default_pickup_info: string | null;
  public_contact: string | null;
};

/** ההגדרות (קריאה: מי שמגדיר או שולח). null = אין הרשאה */
export async function fetchEmailSettings(): Promise<EmailSettingsRow | null> {
  const { data } = await supabase
    .from('email_settings')
    .select('enabled, gmail_user, from_name, reply_to, signature, daily_limit, templates, default_payment_instructions, default_pickup_info, public_contact')
    .eq('id', 1)
    .maybeSingle();
  if (!data) return null;
  return { ...data, templates: mergeTemplates(data.templates) };
}

export type EmailStatus = {
  enabled: boolean;
  configured: boolean;
  hasPassword?: boolean;
  sentToday: number;
  dailyLimit: number;
  queued: number;
};

export const fetchEmailStatus = () => callServerApi<EmailStatus>('/api/email', { action: 'status' });
