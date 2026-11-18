'use client';

import { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Loader2, Mail, Send } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import PhoneLink from '@/components/PhoneLink';
import { Button, Field, inputClass, Modal, Spinner } from '@/components/ui';
import { toast } from '@/components/Toaster';
import { dbErrorMessage } from '@/lib/dbErrors';
import { formatDate } from '@/lib/format';
import { fetchEmailSettings, fetchEmailStatus, progressSummary, sendEmails, type EmailStatus, type SendProgress } from '@/lib/email/client';
import { isValidEmail, renderTemplate, type EmailTemplate, type OutgoingEmail } from '@/lib/email/templates';
import { orderLinkUrl } from '@/lib/online';

// =====================================================================
// "הזמנה להזמין" (ח5): מייל עם קישור אישי (הטופס ממולא) ללקוחות שהזמינו במוסד בשנים קודמות / בכיתה מסוימת.
// לא נשלח למי שביקש הסרה ולא למי שכבר הזמין השנה. בכל מייל – קישור להסרה מרשימת התפוצה.
// =====================================================================

type Candidate = {
  customer_id: string;
  number: number;
  name: string;
  first_name: string;
  last_name: string;
  parent_name: string | null;
  email: string | null;
  phone: string | null;
  opt_out: boolean;
  ordered: boolean;
  last_invite: string | null;
};
type SourceClass = { id: string; label: string };

export function InviteEmailModal({
  institutionYearId,
  institutionId,
  instName,
  deadline,
  onClose,
}: {
  institutionYearId: string;
  institutionId: string;
  instName: string;
  deadline: string | null;
  onClose: () => void;
}) {
  const [mode, setMode] = useState<'prev_institution' | 'class'>('prev_institution');
  const [sourceClasses, setSourceClasses] = useState<SourceClass[]>([]);
  const [sourceClass, setSourceClass] = useState('');
  const [rows, setRows] = useState<Candidate[] | null>(null);
  const [template, setTemplate] = useState<EmailTemplate | null>(null);
  const [status, setStatus] = useState<EmailStatus | null>(null);
  const [resend, setResend] = useState(false);
  const [sending, setSending] = useState(false);
  const [progress, setProgress] = useState<SendProgress | null>(null);

  // כיתות מהשנים הקודמות של המוסד, הגדרות ומצב השליחה
  useEffect(() => {
    let cancelled = false;
    void Promise.all([
      supabase
        .from('institution_years')
        .select('id, academic_years(name, start_date), classes(id, name, sort_order)')
        .eq('institution_id', institutionId)
        .neq('id', institutionYearId),
      fetchEmailSettings(),
      fetchEmailStatus().catch(() => null),
    ]).then(([{ data }, settings, st]) => {
      if (cancelled) return;
      type IyRow = { id: string; academic_years: { name: string; start_date: string | null } | null; classes: { id: string; name: string; sort_order: number }[] };
      const list = ((data ?? []) as unknown as IyRow[])
        .sort((a, b) => (b.academic_years?.start_date ?? '').localeCompare(a.academic_years?.start_date ?? ''))
        .flatMap((iy) =>
          [...iy.classes].sort((a, b) => a.sort_order - b.sort_order).map((c) => ({ id: c.id, label: `${iy.academic_years?.name ?? ''} – כיתה ${c.name}` }))
        );
      setSourceClasses(list);
      setTemplate(settings ? { ...settings.templates.invite } : null);
      setStatus(st);
    });
    return () => {
      cancelled = true;
    };
  }, [institutionId, institutionYearId]);

  // הקהל
  useEffect(() => {
    if (mode === 'class' && !sourceClass) return;
    let cancelled = false;
    void supabase
      .rpc('invite_candidates', { p_iy: institutionYearId, p_mode: mode, p_source: mode === 'class' ? sourceClass : undefined })
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) toast.error(dbErrorMessage(error.message));
        setRows((data as unknown as Candidate[]) ?? []);
      });
    return () => {
      cancelled = true;
    };
  }, [mode, sourceClass, institutionYearId]);

  const groups = useMemo(() => {
    const all = mode === 'class' && !sourceClass ? [] : rows ?? [];
    const ordered = all.filter((c) => c.ordered);
    const optOut = all.filter((c) => !c.ordered && c.opt_out);
    const rest = all.filter((c) => !c.ordered && !c.opt_out);
    const noEmail = rest.filter((c) => !isValidEmail(c.email));
    const withEmail = rest.filter((c) => isValidEmail(c.email));
    const already = withEmail.filter((c) => c.last_invite);
    const recipients = resend ? withEmail : withEmail.filter((c) => !c.last_invite);
    return { all, ordered, optOut, noEmail, already, recipients };
  }, [rows, mode, sourceClass, resend]);

  const valuesFor = (c: Candidate, code: string) => ({
    תלמיד: `${c.first_name} ${c.last_name}`,
    הורה: c.parent_name ?? '',
    מוסד: instName,
    כיתה: '',
    קישור_הזמנה: orderLinkUrl(code),
    מועד_אחרון: deadline ? formatDate(deadline) : '',
    קישור_הסרה: `${orderLinkUrl(code)}?unsubscribe=1`,
  });

  const build = (c: Candidate, code: string): OutgoingEmail => {
    const v = valuesFor(c, code);
    let body = renderTemplate(template!.body, v);
    // שורת הסרה – חובה במייל פרסומי (חוק התקשורת)
    if (!body.includes(v.קישור_הסרה)) body += `\n\nלהסרה מרשימת התפוצה: ${v.קישור_הסרה}`;
    return { kind: 'invite', to: c.email!.trim(), to_name: v.תלמיד, subject: renderTemplate(template!.subject, v), body, customer_id: c.customer_id };
  };

  const send = async () => {
    if (!template || !groups.recipients.length) return;
    setSending(true);
    try {
      const { data, error } = await supabase.rpc('invite_links', {
        p_iy: institutionYearId,
        p_customers: groups.recipients.map((c) => c.customer_id),
      });
      if (error) throw new Error(dbErrorMessage(error.message));
      const codes = data as unknown as Record<string, string>;
      const messages = groups.recipients.filter((c) => codes[c.customer_id]).map((c) => build(c, codes[c.customer_id]));
      const p = await sendEmails(messages, { title: `הזמנה להזמין – ${instName} (${messages.length} נמענים)`, onProgress: setProgress });
      if (p.failed) toast.error(progressSummary(p));
      else toast.success(progressSummary(p));
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSending(false);
    }
  };

  const preview = groups.recipients[0];
  const roomToday = status ? Math.max(status.dailyLimit - status.sentToday, 0) : null;
  const done = progress?.done;

  return (
    <Modal
      title={
        <span className="flex items-center gap-2">
          <Mail className="h-5 w-5 text-slate-500" /> הזמנה להזמין – {instName}
        </span>
      }
      onClose={onClose}
      footer={
        done ? (
          <Button onClick={onClose}>סגירה</Button>
        ) : (
          <>
            <Button onClick={send} loading={sending} disabled={!groups.recipients.length || !template} className="px-6 py-2.5 text-base">
              <Send className="h-5 w-5" /> שליחה ל-{groups.recipients.length} נמענים
            </Button>
            <Button variant="secondary" onClick={onClose} disabled={sending}>
              ביטול
            </Button>
          </>
        )
      }
    >
      {progress ? (
        <div className="space-y-3 rounded-xl bg-white p-4">
          <div className="flex items-center gap-2 font-medium">
            {done ? <CheckCircle2 className="h-5 w-5 text-emerald-600" /> : <Loader2 className="h-5 w-5 animate-spin text-slate-400" />}
            {done ? 'הסתיים' : 'שולח...'}
          </div>
          <p className="text-sm">{progressSummary(progress)}</p>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="space-y-2 rounded-xl bg-white p-3">
            <div className="text-sm font-medium">למי לשלוח?</div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setMode('prev_institution')}
                className={`rounded-full px-4 py-2 text-sm ${mode === 'prev_institution' ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-700'}`}
              >
                הזמינו במוסד בשנים קודמות
              </button>
              <button
                type="button"
                onClick={() => setMode('class')}
                className={`rounded-full px-4 py-2 text-sm ${mode === 'class' ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-700'}`}
              >
                הזמינו בכיתה מסוימת
              </button>
            </div>
            {mode === 'class' && (
              <select className={inputClass} value={sourceClass} onChange={(e) => setSourceClass(e.target.value)}>
                <option value="">בחירת כיתה משנה קודמת...</option>
                {sourceClasses.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))}
              </select>
            )}
            <p className="text-xs text-slate-500">כל נמען מקבל קישור אישי: הטופס ממולא בפרטים שלו, והוא רק בוחר כיתה וספרים.</p>
          </div>

          {!rows ? (
            <Spinner />
          ) : (
            <>
              <div className="grid gap-2 sm:grid-cols-4">
                <Stat label="יקבלו מייל" n={groups.recipients.length} tone="blue" />
                <Stat label="כבר הזמינו השנה" n={groups.ordered.length} tone="slate" />
                <Stat label="בלי מייל" n={groups.noEmail.length} tone="amber" />
                <Stat label="ביקשו הסרה" n={groups.optOut.length} tone="slate" />
              </div>
              {groups.already.length > 0 && (
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={resend} onChange={(e) => setResend(e.target.checked)} />
                  לשלוח שוב גם למי שכבר קיבל הזמנה ({groups.already.length})
                </label>
              )}
              {roomToday !== null && groups.recipients.length > roomToday && (
                <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
                  נשארו היום {roomToday} מיילים במגבלה היומית – {groups.recipients.length - roomToday} יישלחו מחר אוטומטית.
                </p>
              )}
              {status && !status.enabled && (
                <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">שליחת המיילים כבויה בהגדרות – המיילים ייכנסו לתור ויצאו כשתופעל.</p>
              )}
              {groups.ordered.length > 0 && (
                <details className="rounded-xl bg-white p-3">
                  <summary className="cursor-pointer text-sm font-medium text-slate-700">{groups.ordered.length} כבר הזמינו השנה – לא יקבלו</summary>
                  <p className="mt-2 text-sm text-slate-600">{groups.ordered.map((c) => c.name).join(' · ')}</p>
                </details>
              )}
              {groups.noEmail.length > 0 && (
                <details className="rounded-xl bg-white p-3">
                  <summary className="cursor-pointer text-sm font-medium text-amber-800">
                    {groups.noEmail.length} בלי כתובת מייל – רשימה להתקשרות / וואטסאפ
                  </summary>
                  <ul className="mt-2 divide-y divide-slate-100 text-sm">
                    {groups.noEmail.map((c) => (
                      <li key={c.customer_id} className="flex items-center gap-3 py-1.5">
                        <span className="flex-1">
                          {c.name} <span className="text-slate-400">· מס׳ {c.number}</span>
                        </span>
                        {c.phone && <PhoneLink phone={c.phone} />}
                      </li>
                    ))}
                  </ul>
                </details>
              )}

              {template && (
                <div className="grid gap-3 lg:grid-cols-2">
                  <div className="space-y-2 rounded-xl bg-white p-3">
                    <div className="text-sm font-medium text-slate-700">
                      הנוסח <span className="font-normal text-slate-400">(שינוי כאן – לשליחה הזו בלבד)</span>
                    </div>
                    <Field label="נושא">
                      <input className={inputClass} value={template.subject} onChange={(e) => setTemplate({ ...template, subject: e.target.value })} />
                    </Field>
                    <Field label="תוכן" hint="{קישור_הזמנה} – הקישור האישי; שורת הסרה מתווספת אוטומטית אם הוסרה מהנוסח">
                      <textarea className={`${inputClass} min-h-48 text-sm leading-relaxed`} value={template.body} onChange={(e) => setTemplate({ ...template, body: e.target.value })} />
                    </Field>
                  </div>
                  <div className="rounded-xl bg-white p-3">
                    <div className="mb-2 text-sm font-medium text-slate-700">תצוגה מקדימה{preview ? ` – ${preview.name}` : ''}</div>
                    {preview ? (
                      <div className="space-y-2 text-sm">
                        <div className="text-slate-500">
                          אל: <span dir="ltr">{preview.email}</span>
                        </div>
                        <div className="font-semibold">{renderTemplate(template.subject, valuesFor(preview, 'XXXXXXXXXXXXXXXXXXXXXXXX'))}</div>
                        <div className="whitespace-pre-wrap rounded-lg border border-slate-200 bg-slate-50 p-3 leading-relaxed">
                          {build(preview, 'XXXXXXXXXXXXXXXXXXXXXXXX').body}
                        </div>
                        <div className="text-xs text-slate-400">הקישור האישי נוצר בשליחה</div>
                      </div>
                    ) : (
                      <p className="text-sm text-slate-400">אין נמענים מתאימים.</p>
                    )}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </Modal>
  );
}

function Stat({ label, n, tone }: { label: string; n: number; tone: 'blue' | 'slate' | 'amber' }) {
  const c = { blue: 'bg-blue-50 text-blue-800', slate: 'bg-slate-100 text-slate-600', amber: 'bg-amber-50 text-amber-800' }[tone];
  return (
    <div className={`rounded-xl px-3 py-2 ${c}`}>
      <div className="text-2xl font-bold">{n}</div>
      <div className="text-xs">{label}</div>
    </div>
  );
}
