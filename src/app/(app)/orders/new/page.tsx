'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { AlertTriangle, Check, Minus, Plus, ShoppingCart, UserRound, X } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/components/AuthContext';
import { useYear } from '@/components/YearContext';
import { PageGuard, Protect } from '@/components/Protect';
import { CustomerPicker, type PickedCustomer } from '@/components/orders/CustomerPicker';
import { Button, ClosedYearNotice, EmptyState, Field, inputClass, PageHeader, Spinner } from '@/components/ui';
import { toast } from '@/components/Toaster';
import { dbErrorMessage } from '@/lib/dbErrors';
import { formatDate, money, toNumber } from '@/lib/format';
import {
  DELIVERY_LABELS,
  fetchClassBookOptions,
  isPast,
  israelToday,
  ORDER_ITEM_COLUMNS,
  type ClassBookOption,
  type DeliveryMethod,
  type OrderItem,
} from '@/lib/orders';

export default function NewOrderPage() {
  return (
    <PageGuard permId="orders_create">
      <Suspense fallback={<Spinner />}>
        <NewOrderScreen />
      </Suspense>
    </PageGuard>
  );
}

type IyOption = {
  id: string;
  institution_id: string;
  instName: string;
  instNumber: number;
  sale_open_date: string | null;
  sale_close_date: string | null;
  sale_day_date: string | null;
};
type ClassOption = { id: string; name: string };
type Student = { id: string; name: string };

/** נתונים להעתקת הזמנה קודמת – ממולאים פעם אחת כשהכיתה נטענת */
type CopySource = {
  orderId: string;
  number: number;
  institutionId: string;
  className: string;
  qtyByBook: Map<string, number>;
};

function NewOrderScreen() {
  const { year, readOnly } = useYear();
  const { hasPermission } = useAuth();
  const router = useRouter();
  const params = useSearchParams();
  const copyId = params.get('copy');
  const customerParam = params.get('customer');

  const [customer, setCustomer] = useState<PickedCustomer | null>(null);
  const [students, setStudents] = useState<Student[]>([]);
  const [studentName, setStudentName] = useState('');
  const [studentId, setStudentId] = useState<string | null>(null);
  const [iys, setIys] = useState<IyOption[] | null>(null);
  const [iyId, setIyId] = useState('');
  const [classes, setClasses] = useState<ClassOption[]>([]);
  const [classId, setClassId] = useState('');
  const [classBooks, setClassBooks] = useState<ClassBookOption[] | null>(null);
  const [qty, setQty] = useState<Map<string, number>>(new Map());
  const [delivery, setDelivery] = useState<DeliveryMethod>('pickup');
  const [discount, setDiscount] = useState('');
  const [discountReason, setDiscountReason] = useState('');
  const [notes, setNotes] = useState('');
  const [copy, setCopy] = useState<CopySource | null>(null);
  const [existing, setExisting] = useState<{ id: string; number: number }[]>([]);
  const [saving, setSaving] = useState(false);

  const yearId = year?.id ?? null;

  // המוסדות בשנה
  useEffect(() => {
    if (!yearId) return;
    let cancelled = false;
    void supabase
      .from('institution_years')
      .select('id, institution_id, sale_open_date, sale_close_date, sale_day_date, institutions(name, number)')
      .eq('year_id', yearId)
      .then(({ data }) => {
        if (cancelled) return;
        const list = (data ?? [])
          .map((r) => {
            const i = r.institutions as unknown as { name: string; number: number } | null;
            return { ...r, instName: i?.name ?? '', instNumber: i?.number ?? 0 };
          })
          .sort((a, b) => a.instName.localeCompare(b.instName, 'he'));
        setIys(list);
      });
    return () => {
      cancelled = true;
    };
  }, [yearId]);

  // לקוח מהכתובת (?customer=)
  useEffect(() => {
    if (!customerParam || copyId) return;
    let cancelled = false;
    void supabase
      .from('customers')
      .select('id, number, first_name, last_name, phone, phone_digits')
      .eq('id', customerParam)
      .maybeSingle()
      .then(({ data }) => !cancelled && data && setCustomer(data));
    return () => {
      cancelled = true;
    };
  }, [customerParam, copyId]);

  // העתקת הזמנה (?copy=)
  useEffect(() => {
    if (!copyId) return;
    let cancelled = false;
    void (async () => {
      const { data: o } = await supabase
        .from('orders')
        .select('id, number, customer_id, student_id, student_name, delivery_method, notes, classes(name), institution_years(institution_id), customers(id, number, first_name, last_name, phone, phone_digits)')
        .eq('id', copyId)
        .maybeSingle();
      if (!o || cancelled) return;
      const { data: items } = await supabase
        .from('order_items')
        .select(ORDER_ITEM_COLUMNS)
        .eq('order_id', copyId)
        .eq('status', 'active');
      if (cancelled) return;
      setCustomer(o.customers as unknown as PickedCustomer);
      setStudentName(o.student_name);
      setStudentId(o.student_id);
      setDelivery(o.delivery_method as DeliveryMethod);
      setNotes(o.notes ?? '');
      setCopy({
        orderId: o.id,
        number: o.number,
        institutionId: (o.institution_years as unknown as { institution_id: string }).institution_id,
        className: (o.classes as unknown as { name: string }).name,
        qtyByBook: new Map(((items ?? []) as OrderItem[]).map((i) => [i.book_id, i.qty])),
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [copyId]);

  // בהעתקה: כל עוד לא נבחר מוסד – אותו מוסד בשנה הנבחרת
  const effectiveIyId =
    iyId || (copy ? iys?.find((x) => x.institution_id === copy.institutionId)?.id ?? '' : '');

  // הילדים של הלקוח
  const customerId = customer?.id ?? null;
  useEffect(() => {
    if (!customerId) return;
    let cancelled = false;
    void supabase
      .from('customer_students')
      .select('id, name')
      .eq('customer_id', customerId)
      .order('name')
      .then(({ data }) => !cancelled && setStudents(data ?? []));
    return () => {
      cancelled = true;
    };
  }, [customerId]);

  // הכיתות של המוסד
  useEffect(() => {
    if (!effectiveIyId) return;
    let cancelled = false;
    void supabase
      .from('classes')
      .select('id, name')
      .eq('institution_year_id', effectiveIyId)
      .order('sort_order')
      .order('name')
      .then(({ data }) => {
        if (cancelled) return;
        const list = data ?? [];
        setClasses(list);
        if (copy) {
          const match = list.find((c) => c.name === copy.className);
          if (match) setClassId(match.id);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [effectiveIyId, copy]);

  // רשימת הספרים של הכיתה + בחירה ראשונית
  useEffect(() => {
    if (!classId) return;
    let cancelled = false;
    void fetchClassBookOptions(classId).then((list) => {
      if (cancelled) return;
      setClassBooks(list);
      const initial = new Map<string, number>();
      for (const cb of list) {
        if (copy) {
          const q = copy.qtyByBook.get(cb.book_id);
          if (q) initial.set(cb.book_id, q);
        } else if (cb.is_required) {
          initial.set(cb.book_id, cb.qty_per_student);
        }
      }
      setQty(initial);
    });
    return () => {
      cancelled = true;
    };
  }, [classId, copy]);

  // אזהרה: כבר יש הזמנה פעילה לאותו ילד באותה כיתה
  useEffect(() => {
    if (!customerId || !classId || !studentName.trim()) return;
    let cancelled = false;
    void supabase
      .from('orders')
      .select('id, number')
      .eq('customer_id', customerId)
      .eq('class_id', classId)
      .eq('student_name', studentName.trim())
      .neq('status', 'cancelled')
      .then(({ data }) => !cancelled && setExisting(data ?? []));
    return () => {
      cancelled = true;
    };
  }, [customerId, classId, studentName]);

  const iy = iys?.find((x) => x.id === effectiveIyId) ?? null;
  const selected = (classBooks ?? []).filter((cb) => qty.has(cb.book_id));
  const subtotal = selected.reduce((s, cb) => s + cb.sale_price * (qty.get(cb.book_id) ?? 0), 0);
  const discountNum = Math.max(0, toNumber(discount) ?? 0);
  const total = Math.max(0, subtotal - discountNum);
  const lateBooks = selected.filter((cb) => isPast(cb.order_deadline));
  const saleWarning = useMemo(() => {
    if (!iy) return null;
    if (iy.sale_open_date && iy.sale_open_date > israelToday())
      return `המכירה במוסד נפתחת רק ב-${formatDate(iy.sale_open_date)}`;
    if (isPast(iy.sale_close_date)) return `המכירה במוסד נסגרה ב-${formatDate(iy.sale_close_date)}`;
    return null;
  }, [iy]);

  const toggle = (cb: ClassBookOption) =>
    setQty((m) => {
      const next = new Map(m);
      if (next.has(cb.book_id)) next.delete(cb.book_id);
      else next.set(cb.book_id, cb.qty_per_student);
      return next;
    });
  const changeQty = (cb: ClassBookOption, delta: number) =>
    setQty((m) => {
      const next = new Map(m);
      const v = (next.get(cb.book_id) ?? 0) + delta;
      if (v <= 0) next.delete(cb.book_id);
      else next.set(cb.book_id, v);
      return next;
    });

  const save = async () => {
    if (!customer) return toast.error('יש לבחור לקוח');
    if (!studentName.trim()) return toast.error('יש להזין את שם התלמיד');
    if (!classId) return toast.error('יש לבחור מוסד וכיתה');
    if (!selected.length) return toast.error('יש לבחור לפחות ספר אחד');
    if (existing.length && !window.confirm(`כבר קיימת הזמנה פעילה (מס׳ ${existing[0].number}) ל${studentName} בכיתה הזו. ליצור הזמנה נוספת?`)) return;
    setSaving(true);
    const { data, error } = await supabase.rpc('create_order', {
      p_class_id: classId,
      p_customer_id: customer.id,
      p_student_name: studentName.trim(),
      p_student_id: studentId ?? undefined,
      p_items: selected.map((cb) => ({ book_id: cb.book_id, qty: qty.get(cb.book_id) ?? 1 })),
      p_delivery: delivery,
      p_discount: discountNum,
      p_discount_reason: discountReason.trim() || undefined,
      p_notes: notes.trim() || undefined,
      p_source: copy ? 'copy' : 'manual',
      p_copied_from: copy?.orderId,
    });
    setSaving(false);
    if (error) return toast.error(dbErrorMessage(error.message));
    toast.success('ההזמנה נשמרה');
    router.push(`/orders/${data}`);
  };

  if (!year) return <EmptyState>יש לפתוח שנת לימודים במסך &quot;שנות לימודים&quot;.</EmptyState>;
  if (readOnly) return <ClosedYearNotice />;
  if (!iys) return <Spinner />;

  const step = 'rounded-xl bg-white p-4 shadow-sm space-y-3';
  const stepTitle = 'flex items-center gap-2 text-lg font-bold';

  return (
    <div className="mx-auto max-w-4xl space-y-4 pb-24">
      <PageHeader title={copy ? `הזמנה חדשה – העתקה מהזמנה ${copy.number}` : 'הזמנה חדשה'} />

      {/* 1. לקוח */}
      <section className={step}>
        <h2 className={stepTitle}>
          <Num n={1} done={!!customer} /> לקוח (הורה)
        </h2>
        {customer ? (
          <div className="flex items-center gap-3 rounded-lg bg-blue-50 px-3 py-2">
            <UserRound className="h-5 w-5 text-blue-600" />
            <span className="flex-1 font-medium">
              {customer.last_name} {customer.first_name} <span className="text-sm text-slate-500">· מס׳ {customer.number}</span>
            </span>
            <span className="text-sm text-slate-600" dir="ltr">{customer.phone}</span>
            {!copy && (
              <Button variant="ghost" onClick={() => { setCustomer(null); setStudents([]); setStudentName(''); setStudentId(null); }}>
                <X className="h-4 w-4" /> החלפה
              </Button>
            )}
          </div>
        ) : (
          <CustomerPicker onPick={(c) => { setCustomer(c); setStudentName(''); setStudentId(null); }} />
        )}
      </section>

      {/* 2. תלמיד */}
      {customer && (
        <section className={step}>
          <h2 className={stepTitle}>
            <Num n={2} done={!!studentName.trim()} /> תלמיד
          </h2>
          {students.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {students.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => { setStudentName(s.name); setStudentId(s.id); }}
                  className={`rounded-full border px-4 py-2 text-sm ${
                    studentId === s.id ? 'border-blue-600 bg-blue-600 text-white' : 'border-slate-300 hover:bg-slate-50'
                  }`}
                >
                  {s.name}
                </button>
              ))}
            </div>
          )}
          <Field label={students.length ? 'או ילד אחר:' : 'שם התלמיד (יישמר בכרטיס הלקוח)'}>
            <input
              className={`${inputClass} max-w-sm text-base`}
              value={studentName}
              placeholder="שם פרטי ושם משפחה"
              onChange={(e) => {
                setStudentName(e.target.value);
                setStudentId(students.find((s) => s.name === e.target.value.trim())?.id ?? null);
              }}
            />
          </Field>
        </section>
      )}

      {/* 3. מוסד וכיתה */}
      {customer && studentName.trim() && (
        <section className={step}>
          <h2 className={stepTitle}>
            <Num n={3} done={!!classId} /> מוסד וכיתה
          </h2>
          {iys.length === 0 ? (
            <p className="text-sm text-slate-500">אין מוסדות בשנה הזו.</p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="מוסד">
                <select
                  className={`${inputClass} text-base`}
                  value={effectiveIyId}
                  onChange={(e) => { setIyId(e.target.value); setClassId(''); setClassBooks(null); setQty(new Map()); }}
                >
                  <option value="">בחירה...</option>
                  {iys.map((x) => (
                    <option key={x.id} value={x.id}>{x.instNumber} – {x.instName}</option>
                  ))}
                </select>
              </Field>
              <Field label="כיתה">
                <select
                  className={`${inputClass} text-base`}
                  value={classId}
                  disabled={!effectiveIyId}
                  onChange={(e) => { setClassId(e.target.value); setClassBooks(null); }}
                >
                  <option value="">בחירה...</option>
                  {classes.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </Field>
            </div>
          )}
          {copy && iys.length > 0 && !effectiveIyId && (
            <p className="text-sm text-amber-700">המוסד של ההזמנה המקורית לא נמצא בשנה הזו – יש לבחור מוסד וכיתה.</p>
          )}
          {saleWarning && <Warning>{saleWarning}</Warning>}
          {existing.length > 0 && (
            <Warning>
              כבר קיימת הזמנה פעילה ל{studentName} בכיתה הזו:{' '}
              {existing.map((e) => (
                <a key={e.id} href={`/orders/${e.id}`} className="font-medium underline">
                  {e.number}
                </a>
              ))}
            </Warning>
          )}
        </section>
      )}

      {/* 4. ספרים */}
      {classId && (
        <section className={step}>
          <h2 className={stepTitle}>
            <Num n={4} done={selected.length > 0} /> ספרים
          </h2>
          {!classBooks ? (
            <Spinner />
          ) : classBooks.length === 0 ? (
            <p className="text-sm text-slate-500">רשימת הספרים של הכיתה ריקה.</p>
          ) : (
            <>
              <div className="flex gap-2 text-sm">
                <Button variant="ghost" onClick={() => setQty(new Map(classBooks.map((cb) => [cb.book_id, cb.qty_per_student])))}>
                  לסמן הכול
                </Button>
                <Button variant="ghost" onClick={() => setQty(new Map(classBooks.filter((cb) => cb.is_required).map((cb) => [cb.book_id, cb.qty_per_student])))}>
                  רק חובה
                </Button>
                <Button variant="ghost" onClick={() => setQty(new Map())}>לנקות</Button>
              </div>
              <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
                {classBooks.map((cb) => {
                  const q = qty.get(cb.book_id);
                  const on = q !== undefined;
                  const late = isPast(cb.order_deadline);
                  return (
                    <li key={cb.id} className={`flex flex-wrap items-center gap-3 px-3 py-2.5 ${on ? 'bg-blue-50/60' : ''}`}>
                      <button
                        type="button"
                        onClick={() => toggle(cb)}
                        className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md border-2 ${
                          on ? 'border-blue-600 bg-blue-600 text-white' : 'border-slate-300'
                        }`}
                        aria-label={on ? 'הסרה' : 'בחירה'}
                      >
                        {on && <Check className="h-4 w-4" />}
                      </button>
                      <button type="button" onClick={() => toggle(cb)} className="min-w-40 flex-1 text-right">
                        <span className="font-medium">{cb.bookName}</span>
                        <span className={`mr-2 rounded px-1.5 text-xs ${cb.is_required ? 'bg-slate-100 text-slate-600' : 'bg-amber-50 text-amber-700'}`}>
                          {cb.is_required ? 'חובה' : 'רשות'}
                        </span>
                        {late && <span className="mr-2 text-xs text-red-600">עבר המועד להזמנה ({formatDate(cb.order_deadline)})</span>}
                      </button>
                      {on && (
                        <div className="flex items-center gap-1">
                          <button type="button" onClick={() => changeQty(cb, -1)} className="rounded-md border p-1.5" aria-label="פחות">
                            <Minus className="h-4 w-4" />
                          </button>
                          <span className="w-8 text-center font-medium">{q}</span>
                          <button type="button" onClick={() => changeQty(cb, 1)} className="rounded-md border p-1.5" aria-label="יותר">
                            <Plus className="h-4 w-4" />
                          </button>
                        </div>
                      )}
                      <span className="w-20 text-left text-sm">{money(cb.sale_price * (q ?? cb.qty_per_student))}</span>
                    </li>
                  );
                })}
              </ul>
              {lateBooks.length > 0 && (
                <Warning>
                  {lateBooks.length} מהספרים שנבחרו עברו את המועד האחרון להזמנה. אפשר לשמור – אבל כדאי לוודא שעוד אפשר להזמין אותם מהספק.
                </Warning>
              )}
            </>
          )}
        </section>
      )}

      {/* 5. מסירה, הנחה והערות */}
      {classId && selected.length > 0 && (
        <section className={step}>
          <h2 className={stepTitle}>
            <Num n={5} done /> מסירה ותשלום
          </h2>
          <div className="flex flex-wrap gap-2">
            {(Object.keys(DELIVERY_LABELS) as DeliveryMethod[]).map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => setDelivery(d)}
                className={`rounded-lg border px-4 py-2.5 ${delivery === d ? 'border-blue-600 bg-blue-600 text-white' : 'border-slate-300 hover:bg-slate-50'}`}
              >
                {DELIVERY_LABELS[d]}
                {d === 'institution_day' && iy?.sale_day_date && <span className="mr-1 text-xs opacity-80">({formatDate(iy.sale_day_date)})</span>}
              </button>
            ))}
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <Protect permId="orders_discount" lockedFallback={null}>
              <Field label="הנחה (₪)">
                <input
                  className={inputClass}
                  inputMode="decimal"
                  value={discount}
                  onChange={(e) => setDiscount(e.target.value)}
                  disabled={!hasPermission('orders_discount')}
                />
              </Field>
              <Field label="סיבת ההנחה" className="sm:col-span-2">
                <input className={inputClass} value={discountReason} onChange={(e) => setDiscountReason(e.target.value)} disabled={!hasPermission('orders_discount')} />
              </Field>
            </Protect>
            <Field label="הערות להזמנה" className="sm:col-span-3">
              <textarea className={inputClass} rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
            </Field>
          </div>
        </section>
      )}

      {/* סיכום קבוע בתחתית */}
      {classId && (
        <div className="fixed inset-x-0 bottom-0 z-20 border-t border-slate-200 bg-white/95 px-4 py-3 shadow-[0_-4px_12px_rgba(0,0,0,0.05)] backdrop-blur lg:mr-60">
          <div className="mx-auto flex max-w-4xl flex-wrap items-center gap-3">
            <div className="flex-1 text-sm">
              {selected.length} ספרים · {money(subtotal)}
              {discountNum > 0 && <span className="text-emerald-700"> − הנחה {money(discountNum)}</span>}
              <span className="mr-2 text-lg font-bold">סה״כ {money(total)}</span>
            </div>
            <Button variant="secondary" onClick={() => router.push('/orders')}>ביטול</Button>
            <Button variant="success" onClick={save} loading={saving} disabled={!selected.length || !studentName.trim()} className="px-6 py-2.5 text-base">
              <ShoppingCart className="h-5 w-5" /> שמירת ההזמנה
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function Num({ n, done }: { n: number; done: boolean }) {
  return (
    <span className={`flex h-7 w-7 items-center justify-center rounded-full text-sm ${done ? 'bg-emerald-600 text-white' : 'bg-slate-200 text-slate-600'}`}>
      {done ? <Check className="h-4 w-4" /> : n}
    </span>
  );
}

function Warning({ children }: { children: React.ReactNode }) {
  return (
    <p className="flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
      <span>{children}</span>
    </p>
  );
}
