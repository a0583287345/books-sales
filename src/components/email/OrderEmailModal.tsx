'use client';

import { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Loader2, Mail, Send } from 'lucide-react';
import PhoneLink from '@/components/PhoneLink';
import { Button, Field, inputClass, Modal, Spinner } from '@/components/ui';
import { toast } from '@/components/Toaster';
import { formatDate, money } from '@/lib/format';
import { fetchEmailSettings, fetchEmailStatus, progressSummary, sendEmails, type EmailStatus, type SendProgress } from '@/lib/email/client';
import {
  alreadySent,
  buildOrderEmail,
  fetchOrderEmailData,
  hasEmail,
  kindFor,
  orderValues,
  type OrderEmailData,
  type OrderMailMode,
} from '@/lib/email/orderEmails';
import { renderTemplate, TEMPLATE_LABELS, type EmailTemplates } from '@/lib/email/templates';

// =====================================================================
// שליחת "ההזמנה מוכנה" / "תזכורת תשלום" – להזמנה אחת או לרשימה (כיתה / מוסד / מה שמסונן).
// מציג מי יקבל, מי כבר קיבל, מי בלי מייל (עם טלפון) ומי לא מתאים; תצוגה מקדימה ועריכה לשליחה הזו.
// =====================================================================

export function OrderEmailModal({
  orderIds,
  initialMode = 'ready',
  scopeLabel,
  onClose,
  onSent,
}: {
  orderIds: string[];
  initialMode?: OrderMailMode;
  /** למשל: "12 ההזמנות שברשימה" */
  scopeLabel: string;
  onClose: () => void;
  onSent?: () => void;
}) {
  const [rows, setRows] = useState<OrderEmailData[] | null>(null);
  const [templates, setTemplates] = useState<EmailTemplates | null>(null);
  const [status, setStatus] = useState<EmailStatus | null>(null);
  const [mode, setMode] = useState<OrderMailMode>(initialMode);
  const [includePartial, setIncludePartial] = useState(false);
  const [resend, setResend] = useState(false);
  const [progress, setProgress] = useState<SendProgress | null>(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void Promise.all([fetchOrderEmailData(orderIds), fetchEmailSettings(), fetchEmailStatus().catch(() => null)])
      .then(([data, settings, st]) => {
        if (cancelled) return;
        setRows(data);
        setTemplates(settings?.templates ?? null);
        setStatus(st);
      })
      .catch((e: Error) => !cancelled && setError(e.message));
    return () => {
      cancelled = true;
    };
  }, [orderIds]);

  const groups = useMemo(() => {
    const g = { send: [] as OrderEmailData[], already: [] as OrderEmailData[], noEmail: [] as OrderEmailData[], notEligible: [] as OrderEmailData[] };
    for (const o of rows ?? []) {
      if (!kindFor(o, mode, includePartial)) g.notEligible.push(o);
      else if (!hasEmail(o)) g.noEmail.push(o);
      else if (alreadySent(o, mode)) g.already.push(o);
      else g.send.push(o);
    }
    return g;
  }, [rows, mode, includePartial]);

  const recipients = resend ? [...groups.send, ...groups.already] : groups.send;
  const mainKey = mode === 'payment_reminder' ? 'payment_reminder' : 'ready';
  const preview = recipients[0] ?? groups.already[0] ?? groups.noEmail[0];
  const roomToday = status ? Math.max(status.dailyLimit - status.sentToday, 0) : null;

  const setTemplate = (key: 'ready' | 'ready_partial' | 'payment_reminder', patch: Partial<{ subject: string; body: string }>) =>
    templates && setTemplates({ ...templates, [key]: { ...templates[key], ...patch } });

  const send = async () => {
    if (!templates || !recipients.length) return;
    const messages = recipients.map((o) => {
      const kind = kindFor(o, mode, includePartial)!;
      return buildOrderEmail(o, kind, templates[kind]);
    });
    setSending(true);
    try {
      const title =
        mode === 'payment_reminder' ? `תזכורת תשלום – ${scopeLabel}` : `ההזמנה מוכנה – ${scopeLabel}`;
      const p = await sendEmails(messages, { title, onProgress: setProgress });
      if (p.failed && !p.sent) toast.error(p.errors[0] ?? 'השליחה נכשלה');
      else toast.success(progressSummary(p));
      onSent?.();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSending(false);
    }
  };

  const done = progress?.done;

  return (
    <Modal
      title={
        <span className="flex items-center gap-2">
          <Mail className="h-5 w-5 text-slate-500" /> שליחת מייל – {scopeLabel}
        </span>
      }
      onClose={onClose}
      footer={
        done ? (
          <Button onClick={onClose}>סגירה</Button>
        ) : (
          <>
            <Button onClick={send} loading={sending} disabled={!recipients.length || !templates} className="px-6 py-2.5 text-base">
              <Send className="h-5 w-5" /> שליחה ל-{recipients.length} נמענים
            </Button>
            <Button variant="secondary" onClick={onClose} disabled={sending}>
              ביטול
            </Button>
          </>
        )
      }
    >
      {error ? (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-red-700">{error}</p>
      ) : !rows ? (
        <Spinner />
      ) : progress ? (
        <SendingView p={progress} />
      ) : (
        <div className="space-y-4">
          {/* סוג המייל */}
          <div className="flex flex-wrap items-center gap-2 rounded-xl bg-white p-3">
            {(['ready', 'payment_reminder'] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => {
                  setMode(m);
                  setResend(false);
                }}
                className={`rounded-full px-4 py-2 text-sm ${mode === m ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-700'}`}
              >
                {m === 'ready' ? 'ההזמנה מוכנה' : 'תזכורת תשלום'}
              </button>
            ))}
            {mode === 'ready' && (
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={includePartial} onChange={(e) => setIncludePartial(e.target.checked)} />
                לכלול גם הזמנות מוכנות חלקית (בנוסח &quot;מוכנה חלקית&quot;)
              </label>
            )}
          </div>

          {/* סיכום */}
          <div className="grid gap-2 sm:grid-cols-4">
            <Stat label="יקבלו מייל" n={recipients.length} tone="blue" />
            <Stat label={mode === 'ready' ? 'כבר קיבלו' : 'קיבלו תזכורת בשבוע האחרון'} n={groups.already.length} tone="slate" />
            <Stat label="בלי מייל" n={groups.noEmail.length} tone="amber" />
            <Stat label={mode === 'ready' ? 'לא מוכנות' : 'אין יתרה לתשלום'} n={groups.notEligible.length} tone="slate" />
          </div>
          {groups.already.length > 0 && (
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={resend} onChange={(e) => setResend(e.target.checked)} />
              לשלוח שוב גם למי שכבר קיבל ({groups.already.length})
            </label>
          )}
          {roomToday !== null && recipients.length > roomToday && (
            <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
              נשארו היום {roomToday} מיילים במגבלה היומית – {recipients.length - roomToday} יישלחו מחר אוטומטית.
            </p>
          )}
          {status && !status.enabled && (
            <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
              שליחת המיילים כבויה בהגדרות – המיילים ייכנסו לתור ויצאו כשתופעל.
            </p>
          )}

          {/* בלי מייל – להתקשר */}
          {groups.noEmail.length > 0 && (
            <details className="rounded-xl bg-white p-3">
              <summary className="cursor-pointer text-sm font-medium text-amber-800">
                {groups.noEmail.length} בלי כתובת מייל – רשימה להתקשרות / וואטסאפ
              </summary>
              <ul className="mt-2 divide-y divide-slate-100 text-sm">
                {groups.noEmail.map((o) => (
                  <li key={o.order_id} className="flex flex-wrap items-center gap-3 py-1.5">
                    <span className="flex-1">
                      {o.student_name} <span className="text-slate-400">· {o.inst_name} / {o.class_name} · הזמנה {o.number}</span>
                    </span>
                    {mode === 'payment_reminder' && <span className="text-red-600">{money(o.balance)}</span>}
                    {o.phone && <PhoneLink phone={o.phone} />}
                  </li>
                ))}
              </ul>
            </details>
          )}

          {/* נוסח + תצוגה מקדימה */}
          {templates && (
            <div className="grid gap-3 lg:grid-cols-2">
              <div className="space-y-2 rounded-xl bg-white p-3">
                <div className="text-sm font-medium text-slate-700">
                  הנוסח: {TEMPLATE_LABELS[mainKey]} <span className="font-normal text-slate-400">(שינוי כאן – לשליחה הזו בלבד)</span>
                </div>
                <Field label="נושא">
                  <input className={inputClass} value={templates[mainKey].subject} onChange={(e) => setTemplate(mainKey, { subject: e.target.value })} />
                </Field>
                <Field label="תוכן">
                  <textarea className={`${inputClass} min-h-56 text-sm leading-relaxed`} value={templates[mainKey].body} onChange={(e) => setTemplate(mainKey, { body: e.target.value })} />
                </Field>
                {mode === 'ready' && includePartial && (
                  <p className="text-xs text-slate-500">להזמנות שמוכנות חלקית יישלח הנוסח &quot;מוכנה חלקית&quot; מההגדרות.</p>
                )}
              </div>
              <div className="rounded-xl bg-white p-3">
                <div className="mb-2 text-sm font-medium text-slate-700">
                  תצוגה מקדימה{preview ? ` – ${preview.student_name}` : ''}
                </div>
                {preview ? (
                  <PreviewBox o={preview} templates={templates} mode={mode} includePartial={includePartial} />
                ) : (
                  <p className="text-sm text-slate-400">אין נמענים מתאימים.</p>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}

function PreviewBox({ o, templates, mode, includePartial }: { o: OrderEmailData; templates: EmailTemplates; mode: OrderMailMode; includePartial: boolean }) {
  const kind = kindFor(o, mode, includePartial) ?? (mode === 'payment_reminder' ? 'payment_reminder' : 'ready');
  const values = orderValues(o);
  const t = templates[kind];
  return (
    <div className="space-y-2 text-sm">
      <div className="text-slate-500">
        אל: <span dir="ltr">{o.email || '—'}</span>
      </div>
      <div className="font-semibold">{renderTemplate(t.subject, values)}</div>
      <div className="whitespace-pre-wrap rounded-lg border border-slate-200 bg-slate-50 p-3 leading-relaxed">{renderTemplate(t.body, values)}</div>
      {o.last_ready_email && mode === 'ready' && <div className="text-xs text-slate-400">נשלח כבר ב-{formatDate(o.last_ready_email.slice(0, 10))}</div>}
    </div>
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

function SendingView({ p }: { p: SendProgress }) {
  const pct = p.total ? Math.round(((p.sent + p.failed) / p.total) * 100) : 0;
  return (
    <div className="space-y-3 rounded-xl bg-white p-4">
      <div className="flex items-center gap-2 font-medium">
        {p.done ? <CheckCircle2 className="h-5 w-5 text-emerald-600" /> : <Loader2 className="h-5 w-5 animate-spin text-slate-400" />}
        {p.done ? 'הסתיים' : 'שולח...'}
      </div>
      <div className="h-3 overflow-hidden rounded-full bg-slate-100">
        <div className="h-full bg-emerald-500 transition-all" style={{ width: `${pct}%` }} />
      </div>
      <p className="text-sm">{progressSummary(p)}</p>
      {p.errors.length > 0 && (
        <ul className="list-disc pr-5 text-sm text-red-700">
          {p.errors.map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      )}
      {p.done && p.remaining > 0 && <p className="text-xs text-slate-500">מה שממתין יישלח אוטומטית (ההרצה היומית) או מ&quot;הגדרות ← מיילים ← שליחת הממתינים&quot;.</p>}
    </div>
  );
}
