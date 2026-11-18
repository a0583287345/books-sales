'use client';

import { useEffect, useRef, useState } from 'react';
import { CheckCircle2, KeyRound, Mail, RotateCcw, Save, Send, Trash2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { callServerApi } from '@/lib/apiClient';
import { useAuth } from '@/components/AuthContext';
import { Button, Field, inputClass, Spinner } from '@/components/ui';
import { toast } from '@/components/Toaster';
import { dbErrorMessage } from '@/lib/dbErrors';
import { fetchEmailSettings, fetchEmailStatus, type EmailSettingsRow, type EmailStatus } from '@/lib/email/client';
import { DEFAULT_TEMPLATES, isValidEmail, TEMPLATE_FIELDS, TEMPLATE_LABELS, type TemplateKey } from '@/lib/email/templates';

// =====================================================================
// הגדרות → מיילים: חשבון Gmail, סיסמת אפליקציה, בדיקה, חתימה, ברירות מחדל ותבניות
// =====================================================================

export function EmailSettingsTab() {
  const { hasPermission } = useAuth();
  const canEdit = hasPermission('email_settings');
  const [s, setS] = useState<EmailSettingsRow | null>(null);
  const [status, setStatus] = useState<EmailStatus | null>(null);
  const [saving, setSaving] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    void Promise.all([fetchEmailSettings(), fetchEmailStatus().catch(() => null)]).then(([settings, st]) => {
      if (cancelled) return;
      setS(settings);
      setStatus(st);
    });
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);
  const reload = () => setReloadKey((k) => k + 1);

  if (!s) return <Spinner />;
  const set = (patch: Partial<EmailSettingsRow>) => setS({ ...s, ...patch });

  const save = async (patch?: Partial<EmailSettingsRow>) => {
    const next = { ...s, ...patch };
    if (next.gmail_user && !isValidEmail(next.gmail_user)) return toast.error('כתובת Gmail לא תקינה');
    if (next.reply_to && !isValidEmail(next.reply_to)) return toast.error('כתובת לתשובות לא תקינה');
    if (!(next.daily_limit >= 1 && next.daily_limit <= 2000)) return toast.error('מגבלה יומית: בין 1 ל-2000');
    setSaving(true);
    const { error } = await supabase
      .from('email_settings')
      .update({
        enabled: next.enabled,
        gmail_user: next.gmail_user?.trim() || null,
        from_name: next.from_name.trim() || 'מכירת ספרי לימוד',
        reply_to: next.reply_to?.trim() || null,
        signature: next.signature?.trim() || null,
        daily_limit: next.daily_limit,
        templates: next.templates,
        default_payment_instructions: next.default_payment_instructions?.trim() || null,
        default_pickup_info: next.default_pickup_info?.trim() || null,
        public_contact: next.public_contact?.trim() || null,
      })
      .eq('id', 1);
    setSaving(false);
    if (error) return toast.error(dbErrorMessage(error.message));
    toast.success('נשמר');
    reload();
  };

  return (
    <div className="max-w-4xl space-y-4">
      {/* מצב */}
      <section className="rounded-xl bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-center gap-3">
          <Mail className="h-6 w-6 text-slate-500" />
          <div className="flex-1">
            <div className="font-bold">שליחת מיילים {s.enabled ? 'פעילה' : 'כבויה'}</div>
            <div className="text-sm text-slate-500">
              {status && (
                <>
                  נשלחו היום {status.sentToday} מתוך {status.dailyLimit}
                  {status.queued > 0 && ` · ${status.queued} ממתינים בתור`}
                  {!status.configured && ' · עדיין לא הוגדרו חשבון וסיסמה'}
                </>
              )}
            </div>
          </div>
          {status && status.queued > 0 && <SendPendingButton onDone={reload} />}
          {canEdit && (
            <Button variant={s.enabled ? 'secondary' : 'success'} onClick={() => save({ enabled: !s.enabled })} loading={saving}>
              {s.enabled ? 'כיבוי השליחה' : 'הפעלת השליחה'}
            </Button>
          )}
        </div>
        {!s.enabled && <p className="mt-2 text-xs text-slate-500">כשהשליחה כבויה, מיילים נשארים בתור ולא יוצאים (מייל בדיקה יוצא תמיד).</p>}
      </section>

      {/* חשבון */}
      <section className="space-y-3 rounded-xl bg-white p-4 shadow-sm">
        <h2 className="font-bold">חשבון Gmail</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="כתובת Gmail שממנה נשלח">
            <input className={inputClass} dir="ltr" disabled={!canEdit} value={s.gmail_user ?? ''} onChange={(e) => set({ gmail_user: e.target.value })} placeholder="name@gmail.com" />
          </Field>
          <Field label="שם השולח">
            <input className={inputClass} disabled={!canEdit} value={s.from_name} onChange={(e) => set({ from_name: e.target.value })} />
          </Field>
          <Field label="כתובת לתשובות (לא חובה)" hint="אם רוצים שתשובות יגיעו לכתובת אחרת">
            <input className={inputClass} dir="ltr" disabled={!canEdit} value={s.reply_to ?? ''} onChange={(e) => set({ reply_to: e.target.value })} />
          </Field>
          <Field label="מגבלה יומית" hint="חשבון Gmail רגיל: עד 500 ביום. מה שמעבר נשלח למחרת">
            <input className={inputClass} inputMode="numeric" disabled={!canEdit} value={s.daily_limit} onChange={(e) => set({ daily_limit: Number(e.target.value.replace(/\D/g, '')) || 0 })} />
          </Field>
        </div>
        {canEdit && <PasswordBox hasPassword={!!status?.hasPassword} onChanged={reload} />}
        {canEdit && <TestBox defaultTo={s.reply_to || s.gmail_user || ''} />}
      </section>

      {/* חתימה וברירות מחדל */}
      <section className="space-y-3 rounded-xl bg-white p-4 shadow-sm">
        <h2 className="font-bold">חתימה וברירות מחדל</h2>
        <Field label="חתימה (מתווספת לסוף כל מייל)">
          <textarea className={`${inputClass} min-h-20`} disabled={!canEdit} value={s.signature ?? ''} onChange={(e) => set({ signature: e.target.value })} placeholder={'מכירת ספרי לימוד\nטלפון: ...'} />
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="הוראות תשלום – ברירת מחדל" hint="אפשר לקבוע אחרת לכל מוסד ולכל כיתה">
            <textarea className={`${inputClass} min-h-24`} disabled={!canEdit} value={s.default_payment_instructions ?? ''} onChange={(e) => set({ default_payment_instructions: e.target.value })} placeholder={'תשלום בביט למספר ...\nאו במזומן/צ׳ק באיסוף'} />
          </Field>
          <Field label="פרטי איסוף – ברירת מחדל">
            <textarea className={`${inputClass} min-h-24`} disabled={!canEdit} value={s.default_pickup_info ?? ''} onChange={(e) => set({ default_pickup_info: e.target.value })} placeholder={'כתובת: ...\nשעות: א׳–ה׳ 16:00–19:00'} />
          </Field>
        </div>
        <Field label="פרטי התקשרות למשרד – בדף ההזמנה בקישור" hint="מוצג להורים בדף ההזמנה, וגם כשהקישור סגור (לפני הפתיחה / אחרי המועד האחרון)">
          <textarea className={`${inputClass} min-h-16`} disabled={!canEdit} value={s.public_contact ?? ''} onChange={(e) => set({ public_contact: e.target.value })} placeholder="משרד מכירת הספרים: 02-1234567 (א׳–ה׳ 9:00–13:00)" />
        </Field>
      </section>

      <TemplatesEditor s={s} set={set} canEdit={canEdit} />

      {canEdit && (
        <div className="sticky bottom-2 flex justify-end">
          <Button onClick={() => save()} loading={saving} className="px-6 py-2.5 shadow-lg">
            <Save className="h-4 w-4" /> שמירת ההגדרות
          </Button>
        </div>
      )}
    </div>
  );
}

function PasswordBox({ hasPassword, onChanged }: { hasPassword: boolean; onChanged: () => void }) {
  const [pw, setPw] = useState('');
  const [busy, setBusy] = useState(false);
  const run = async (action: 'save_password' | 'clear_password') => {
    if (action === 'clear_password' && !window.confirm('למחוק את סיסמת האפליקציה? לא יישלחו מיילים עד שתישמר סיסמה חדשה.')) return;
    setBusy(true);
    try {
      await callServerApi('/api/email', { action, password: pw });
      toast.success(action === 'save_password' ? 'הסיסמה נשמרה' : 'הסיסמה נמחקה');
      setPw('');
      onChanged();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="rounded-lg border border-slate-200 p-3">
      <div className="mb-2 flex items-center gap-2 font-medium">
        <KeyRound className="h-4 w-4 text-slate-500" /> סיסמת אפליקציה
        {hasPassword ? (
          <span className="flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs text-emerald-700">
            <CheckCircle2 className="h-3.5 w-3.5" /> שמורה
          </span>
        ) : (
          <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs text-amber-800">לא נשמרה</span>
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        <input className={`${inputClass} w-64`} dir="ltr" type="password" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} placeholder="xxxx xxxx xxxx xxxx" />
        <Button onClick={() => run('save_password')} loading={busy} disabled={!pw.trim()}>
          {hasPassword ? 'החלפת הסיסמה' : 'שמירת הסיסמה'}
        </Button>
        {hasPassword && (
          <Button variant="danger" onClick={() => run('clear_password')} disabled={busy}>
            <Trash2 className="h-4 w-4" /> מחיקה
          </Button>
        )}
      </div>
      <details className="mt-2 text-sm text-slate-600">
        <summary className="cursor-pointer text-blue-700">איך יוצרים סיסמת אפליקציה?</summary>
        <ol className="mt-2 list-decimal space-y-1 pr-5">
          <li>נכנסים לחשבון Google שממנו ישלחו המיילים ← &quot;ניהול חשבון Google&quot; ← &quot;אבטחה&quot;.</li>
          <li>מפעילים &quot;אימות דו-שלבי&quot; (חובה – בלעדיו אין סיסמאות אפליקציה).</li>
          <li>מחפשים בחיפוש של החשבון &quot;סיסמאות אפליקציה&quot; (App passwords).</li>
          <li>יוצרים סיסמה חדשה בשם &quot;מכירת ספרים&quot; ומעתיקים את 16 האותיות לכאן.</li>
        </ol>
        <p className="mt-1 text-xs text-slate-400">הסיסמה נשמרת בשרת בלבד ולא מוצגת שוב.</p>
      </details>
    </div>
  );
}

function TestBox({ defaultTo }: { defaultTo: string }) {
  const [to, setTo] = useState(defaultTo);
  const [busy, setBusy] = useState(false);
  const run = async () => {
    setBusy(true);
    try {
      await callServerApi('/api/email', { action: 'test', to });
      toast.success(`מייל בדיקה נשלח אל ${to}`);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="flex flex-wrap items-end gap-2">
      <Field label="מייל בדיקה אל" className="w-72">
        <input className={inputClass} dir="ltr" value={to} onChange={(e) => setTo(e.target.value)} />
      </Field>
      <Button variant="secondary" onClick={run} loading={busy} disabled={!isValidEmail(to)}>
        <Send className="h-4 w-4" /> שליחת בדיקה
      </Button>
      <span className="pb-2 text-xs text-slate-400">יש לשמור קודם את הכתובת ואת הסיסמה</span>
    </div>
  );
}

function SendPendingButton({ onDone }: { onDone: () => void }) {
  const [busy, setBusy] = useState(false);
  const run = async () => {
    setBusy(true);
    try {
      let total = 0;
      for (let i = 0; i < 70; i++) {
        const r = await callServerApi<{ sent: number; failed: number; remaining: number; limitReached: boolean; disabled: boolean; problem: string | null }>('/api/email', { action: 'process' });
        total += r.sent;
        if (r.problem) {
          toast.error(r.problem);
          break;
        }
        if (r.disabled) {
          toast.info('השליחה כבויה – מפעילים אותה ואז שולחים');
          break;
        }
        if (r.limitReached) {
          toast.info('הגעתם למגבלה היומית – השאר יישלח מחר');
          break;
        }
        if (!r.remaining || r.sent + r.failed === 0) break;
      }
      toast.success(`נשלחו ${total} מיילים`);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
      onDone();
    }
  };
  return (
    <Button variant="secondary" onClick={run} loading={busy}>
      <Send className="h-4 w-4" /> שליחת הממתינים
    </Button>
  );
}

function TemplatesEditor({ s, set, canEdit }: { s: EmailSettingsRow; set: (p: Partial<EmailSettingsRow>) => void; canEdit: boolean }) {
  const [key, setKey] = useState<TemplateKey>('ready');
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const t = s.templates[key];
  const setT = (patch: Partial<typeof t>) => set({ templates: { ...s.templates, [key]: { ...t, ...patch } } });

  const insert = (field: string) => {
    const el = bodyRef.current;
    if (!el) return setT({ body: t.body + field });
    const start = el.selectionStart ?? t.body.length;
    const end = el.selectionEnd ?? start;
    setT({ body: t.body.slice(0, start) + field + t.body.slice(end) });
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(start + field.length, start + field.length);
    });
  };

  return (
    <section className="space-y-3 rounded-xl bg-white p-4 shadow-sm">
      <h2 className="font-bold">תבניות</h2>
      <div className="flex flex-wrap gap-1">
        {(Object.keys(TEMPLATE_LABELS) as TemplateKey[]).map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => setKey(k)}
            className={`rounded-full px-3 py-1.5 text-sm ${key === k ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}
          >
            {TEMPLATE_LABELS[k]}
          </button>
        ))}
      </div>
      <Field label="נושא">
        <input className={inputClass} disabled={!canEdit} value={t.subject} onChange={(e) => setT({ subject: e.target.value })} />
      </Field>
      <Field label="תוכן">
        <textarea ref={bodyRef} className={`${inputClass} min-h-56 leading-relaxed`} disabled={!canEdit} value={t.body} onChange={(e) => setT({ body: e.target.value })} />
      </Field>
      {canEdit && (
        <div className="flex flex-wrap items-center gap-1 text-sm">
          <span className="text-slate-500">הוספת שדה:</span>
          {TEMPLATE_FIELDS[key].map((f) => (
            <button key={f.key} type="button" onClick={() => insert(f.key)} className="rounded-lg border border-slate-200 px-2 py-1 hover:bg-blue-50" title={f.key}>
              {f.label}
            </button>
          ))}
          <button type="button" onClick={() => setT(DEFAULT_TEMPLATES[key])} className="mr-auto flex items-center gap-1 rounded-lg px-2 py-1 text-slate-500 hover:bg-slate-100">
            <RotateCcw className="h-3.5 w-3.5" /> חזרה לנוסח המקורי
          </button>
        </div>
      )}
      <p className="text-xs text-slate-400">שדה שאין לו ערך (למשל הורה) פשוט לא יופיע. החתימה מתווספת אוטומטית בסוף.</p>
    </section>
  );
}
