'use client';

import { useMemo, useState } from 'react';
import { CheckCircle2, Loader2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { formatDate, money } from '@/lib/format';
import { validIsraeliId, validIsraeliPhone, type PersonalForm, type PublicClass, type PublicForm, type SubmitResult } from '@/lib/online';
import {
  BottomBar,
  bigButton,
  Card,
  Choice,
  Contact,
  PublicHeader,
  PublicInput,
  publicInput,
  SumRow,
  TextBlock,
} from './PublicUi';

// =====================================================================
// טופס ההזמנה להורים: קישור למוסד / לכיתה (פרטי תלמיד + ת"ז), או קישור אישי (הפרטים כבר ידועים).
// =====================================================================

type Details = { first: string; last: string; idNumber: string; phone: string; email: string; parent: string };
const EMPTY: Details = { first: '', last: '', idNumber: '', phone: '', email: '', parent: '' };
type Done = Extract<SubmitResult, { ok: true }>;

export function PublicOrderForm({ form, code, personal }: { form: PublicForm | PersonalForm; code: string; personal?: PersonalForm['student'] }) {
  const classes = useMemo(() => form.classes ?? [], [form.classes]);
  const [classId, setClassId] = useState<string | null>(classes.length === 1 ? classes[0].id : null);
  const cls = classes.find((c) => c.id === classId) ?? null;
  const [d, setD] = useState<Details>(EMPTY);
  const [selected, setSelected] = useState<Set<string>>(() => defaultSelection(classes.length === 1 ? classes[0] : null));
  const [delivery, setDelivery] = useState<'pickup' | 'institution_day'>('pickup');
  const [notes, setNotes] = useState('');
  const [trap, setTrap] = useState('');
  const [errors, setErrors] = useState<Partial<Record<keyof Details | 'books', string>>>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState<Done | null>(null);

  const chooseClass = (c: PublicClass) => {
    setClassId(c.id);
    setSelected(defaultSelection(c));
  };

  const total = useMemo(
    () => (cls?.books ?? []).filter((b) => selected.has(b.book_id) && !b.closed).reduce((s, b) => s + b.price * b.qty, 0),
    [cls, selected]
  );

  const set = (patch: Partial<Details>) => setD((prev) => ({ ...prev, ...patch }));
  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const validate = () => {
    const e: typeof errors = {};
    if (!personal) {
      if (d.first.trim().length < 2) e.first = 'יש למלא שם פרטי';
      if (d.last.trim().length < 2) e.last = 'יש למלא שם משפחה';
      if (!validIsraeliId(d.idNumber)) e.idNumber = 'מספר תעודת הזהות לא תקין';
      if (!validIsraeliPhone(d.phone)) e.phone = 'מספר הטלפון לא תקין';
    } else if (d.phone.trim() && !validIsraeliPhone(d.phone)) {
      e.phone = 'מספר הטלפון לא תקין';
    }
    if (d.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(d.email.trim())) e.email = 'כתובת המייל לא תקינה';
    if (!cls?.books.some((b) => selected.has(b.book_id) && !b.closed)) e.books = 'יש לבחור לפחות ספר אחד';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const submit = async () => {
    setServerError(null);
    if (!cls || !validate()) return;
    setSending(true);
    const items = cls.books.filter((b) => selected.has(b.book_id) && !b.closed).map((b) => b.book_id);
    const { data, error } = personal
      ? await supabase.rpc('submit_personal_order', {
          p_code: code,
          p_class_id: cls.id,
          p_items: items,
          p_delivery: delivery,
          p_notes: notes.trim(),
          p_email: d.email.trim(),
          p_phone: d.phone.trim(),
          p_trap: trap,
        })
      : await supabase.rpc('submit_online_order', {
          p_code: code,
          p_class_id: cls.id,
          p_first_name: d.first.trim(),
          p_last_name: d.last.trim(),
          p_id_number: d.idNumber.trim(),
          p_phone: d.phone.trim(),
          p_email: d.email.trim(),
          p_parent_name: d.parent.trim(),
          p_items: items,
          p_delivery: delivery,
          p_notes: notes.trim(),
          p_trap: trap,
        });
    setSending(false);
    if (error) return setServerError('אירעה תקלה בשליחה. אפשר לנסות שוב בעוד רגע.');
    const res = data as unknown as SubmitResult;
    if (!res.ok) return setServerError(res.message);
    setDone(res);
    window.scrollTo({ top: 0 });
    // מייל אישור (אם יש מייל) – ברקע, לא מעכב את ההורה
    if (res.email_ok) {
      void fetch('/api/public/order-confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: res.view_code }),
      }).catch(() => undefined);
    }
  };

  if (done) return <DoneScreen form={form} cls={cls} result={done} delivery={delivery} />;

  return (
    <>
      <PublicHeader
        institution={form.institution}
        year={form.year}
        subtitle={
          form.deadline && (
            <p className="mt-2 inline-block rounded-full bg-amber-100 px-3 py-1 text-sm text-amber-900">
              ניתן להזמין עד {formatDate(form.deadline)}
            </p>
          )
        }
      />

      {personal && (
        <Card className="mb-3 text-center">
          <p className="text-lg">
            הזמנה עבור <b>{personal.first_name} {personal.last_name}</b>
          </p>
        </Card>
      )}

      {classes.length === 0 && (
        <Card className="text-center">
          <p>עדיין אין רשימות ספרים להזמנה.</p>
          <Contact contact={form.contact} />
        </Card>
      )}

      {classes.length > 1 && (
        <Card className="mb-3">
          <h2 className="mb-2 text-lg font-bold">באיזו כיתה {personal ? personal.first_name : 'התלמיד/ה'} בשנה הזו?</h2>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {classes.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => chooseClass(c)}
                className={`rounded-xl border px-3 py-3 text-base font-medium ${
                  c.id === classId ? 'border-blue-600 bg-blue-600 text-white' : 'border-slate-300 bg-white hover:bg-slate-50'
                }`}
              >
                {c.name}
              </button>
            ))}
          </div>
        </Card>
      )}

      {cls && (
        <>
          {!personal ? (
            <Card className="mb-3 space-y-3">
              <h2 className="text-lg font-bold">פרטי התלמיד/ה{classes.length > 1 && ` · כיתה ${cls.name}`}</h2>
              <div className="grid grid-cols-2 gap-3">
                <PublicInput label="שם פרטי" value={d.first} onChange={(v) => set({ first: v })} error={errors.first} autoComplete="off" />
                <PublicInput label="שם משפחה" value={d.last} onChange={(v) => set({ last: v })} error={errors.last} autoComplete="family-name" />
              </div>
              <PublicInput
                label="תעודת זהות של התלמיד/ה"
                value={d.idNumber}
                onChange={(v) => set({ idNumber: v.replace(/[^\d]/g, '').slice(0, 9) })}
                error={errors.idNumber}
                inputMode="numeric"
                dir="ltr"
              />
              <PublicInput label="טלפון" value={d.phone} onChange={(v) => set({ phone: v })} error={errors.phone} inputMode="tel" type="tel" dir="ltr" autoComplete="tel" />
              <PublicInput
                label="מייל (מומלץ – לקבלת אישור על ההזמנה)"
                value={d.email}
                onChange={(v) => set({ email: v })}
                error={errors.email}
                inputMode="email"
                type="email"
                dir="ltr"
                autoComplete="email"
              />
              <PublicInput label="שם ההורה (לא חובה)" value={d.parent} onChange={(v) => set({ parent: v })} autoComplete="name" />
            </Card>
          ) : (
            (!personal.has_email || !personal.has_phone) && (
              <Card className="mb-3 space-y-3">
                <h2 className="text-lg font-bold">פרטים ליצירת קשר</h2>
                {!personal.has_phone && (
                  <PublicInput label="טלפון" value={d.phone} onChange={(v) => set({ phone: v })} error={errors.phone} inputMode="tel" type="tel" dir="ltr" />
                )}
                {!personal.has_email && (
                  <PublicInput
                    label="מייל (מומלץ – לקבלת אישור על ההזמנה)"
                    value={d.email}
                    onChange={(v) => set({ email: v })}
                    error={errors.email}
                    inputMode="email"
                    type="email"
                    dir="ltr"
                  />
                )}
              </Card>
            )
          )}
          {/* שדה מלכודת לרובוטים – מוסתר מאנשים */}
          <input
            type="text"
            tabIndex={-1}
            autoComplete="off"
            aria-hidden="true"
            className="absolute -left-[9999px] h-0 w-0 opacity-0"
            name="website"
            value={trap}
            onChange={(e) => setTrap(e.target.value)}
          />

          <Card className="mb-3">
            <h2 className="text-lg font-bold">ספרים{personal && classes.length > 1 ? ` · כיתה ${cls.name}` : ''}</h2>
            <p className="mb-2 text-sm text-slate-500">ספרי החובה מסומנים. אם כבר יש לכם ספר – אפשר להוריד את הסימון.</p>
            <ul className="divide-y divide-slate-100">
              {cls.books.map((b) => {
                const on = selected.has(b.book_id) && !b.closed;
                return (
                  <li key={b.book_id}>
                    <label className={`flex items-center gap-3 py-3 ${b.closed ? 'opacity-50' : 'cursor-pointer'}`}>
                      <input type="checkbox" className="h-6 w-6 shrink-0 accent-blue-600" checked={on} disabled={b.closed} onChange={() => toggle(b.book_id)} />
                      <span className="flex-1">
                        <span className="block font-medium">{b.name}</span>
                        <span className="text-xs text-slate-500">
                          {b.closed ? 'לא ניתן להזמין עוד' : b.required ? 'חובה' : 'רשות'}
                          {b.qty > 1 && ` · ${b.qty} יחידות`}
                        </span>
                      </span>
                      <span className="whitespace-nowrap text-slate-700">{money(b.price * b.qty)}</span>
                    </label>
                  </li>
                );
              })}
            </ul>
            {errors.books && <p className="mt-1 text-sm text-red-600">{errors.books}</p>}
          </Card>

          <Card className="mb-3 space-y-3">
            {form.sale_day_date ? (
              <div>
                <h2 className="mb-2 text-lg font-bold">איך לקבל את הספרים?</h2>
                <div className="grid gap-2">
                  <Choice checked={delivery === 'institution_day'} onClick={() => setDelivery('institution_day')}>
                    ביום המכירה ב{form.institution} – {formatDate(form.sale_day_date)}
                    {form.sale_day_notes && <span className="block text-sm text-slate-500">{form.sale_day_notes}</span>}
                  </Choice>
                  <Choice checked={delivery === 'pickup'} onClick={() => setDelivery('pickup')}>
                    איסוף עצמי
                    {cls.pickup_info && <span className="block whitespace-pre-line text-sm text-slate-500">{cls.pickup_info}</span>}
                  </Choice>
                </div>
              </div>
            ) : (
              <TextBlock title="איסוף" text={cls.pickup_info} />
            )}
            <label className="block">
              <span className="mb-1 block font-medium">הערות (לא חובה)</span>
              <textarea className={`${publicInput} min-h-20`} value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={500} />
            </label>
          </Card>

          <Card className="mb-28">
            <SumRow label="סה״כ לתשלום" value={money(total)} bold />
            <TextBlock title="הוראות תשלום" text={cls.payment_instructions} />
            <p className="mt-2 text-xs text-slate-500">אין תשלום באתר. התשלום לפי ההוראות.</p>
            <Contact contact={form.contact} />
          </Card>

          <BottomBar error={serverError ?? (Object.keys(errors).length > 0 ? 'יש שדות שצריך לתקן (מסומנים באדום)' : null)}>
            <button type="button" onClick={submit} disabled={sending} className={bigButton}>
              {sending && <Loader2 className="h-5 w-5 animate-spin" />}
              שליחת ההזמנה · {money(total)}
            </button>
          </BottomBar>
        </>
      )}
    </>
  );
}

function defaultSelection(c: PublicClass | null): Set<string> {
  return new Set((c?.books ?? []).filter((b) => b.required && !b.closed).map((b) => b.book_id));
}

function DoneScreen({
  form,
  cls,
  result,
  delivery,
}: {
  form: PublicForm | PersonalForm;
  cls: PublicClass | null;
  result: Done;
  delivery: 'pickup' | 'institution_day';
}) {
  const viewUrl = typeof window !== 'undefined' ? `${window.location.origin}/o/${result.view_code}` : '';
  return (
    <>
      <PublicHeader institution={form.institution} year={form.year} />
      <Card className="text-center">
        <CheckCircle2 className="mx-auto mb-2 h-12 w-12 text-emerald-600" />
        <h2 className="text-2xl font-bold">ההזמנה התקבלה!</h2>
        <p className="mt-1 text-lg">מספר הזמנה: {result.number}</p>
        <p className="mt-1 text-lg font-bold">סה״כ: {money(result.total)}</p>
        <TextBlock title="הוראות תשלום" text={result.payment_instructions} />
        {delivery === 'institution_day' && form.sale_day_date ? (
          <TextBlock title="מסירה" text={`ביום המכירה ב${form.institution} – ${formatDate(form.sale_day_date)}`} />
        ) : (
          <TextBlock title="פרטי איסוף" text={result.pickup_info ?? cls?.pickup_info} />
        )}
        <p className="mt-4 text-sm text-slate-600">
          {result.email_ok
            ? 'שלחנו אישור למייל, עם קישור לצפייה בהזמנה ולבקשת שינוי.'
            : 'כדאי לשמור את הקישור – בו אפשר לראות את ההזמנה ולבקש שינוי:'}
        </p>
        <a href={viewUrl} className="mt-1 block break-all text-sm text-blue-700 underline" dir="ltr">
          {viewUrl}
        </a>
        <Contact contact={form.contact} />
      </Card>
    </>
  );
}
