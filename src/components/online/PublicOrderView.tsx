'use client';

import { useMemo, useState } from 'react';
import { CheckCircle2, Clock, Loader2, XCircle } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { formatDate, money } from '@/lib/format';
import { PUBLIC_STATUS_LABELS, type PublicOrderFull } from '@/lib/online';
import { BottomBar, bigButton, Card, Choice, Contact, PublicHeader, publicInput, SumRow, TextBlock } from './PublicUi';

// =====================================================================
// צפייה בהזמנה (הקישור שבמייל האישור) + בקשת שינוי. השינוי לא מיידי – המשרד מאשר.
// =====================================================================

const DELIVERY = { pickup: 'איסוף עצמי', institution_day: 'יום מכירה במוסד' } as const;

export function PublicOrderView({ data, code, onReload }: { data: PublicOrderFull; code: string; onReload: () => void }) {
  const order = data.order!;
  const [editing, setEditing] = useState(false);
  const [sentMsg, setSentMsg] = useState(false);

  if (editing) {
    return (
      <ChangeForm
        data={data}
        code={code}
        onCancel={() => setEditing(false)}
        onSent={() => {
          setEditing(false);
          setSentMsg(true);
          onReload();
          window.scrollTo({ top: 0 });
        }}
      />
    );
  }

  const p = data.pending;
  const last = data.last_decision;
  return (
    <>
      <PublicHeader institution={data.institution} year={data.year} />
      {sentMsg && (
        <Card className="mb-3 border border-emerald-200 bg-emerald-50 text-center text-emerald-900">
          <CheckCircle2 className="mx-auto mb-1 h-7 w-7" />
          בקשת השינוי נשלחה למשרד. ההזמנה תתעדכן אחרי האישור.
        </Card>
      )}
      <Card className="mb-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-xl font-bold">הזמנה {order.number}</h2>
          <span className="rounded-full bg-blue-100 px-3 py-1 text-sm text-blue-800">{PUBLIC_STATUS_LABELS[order.status] ?? order.status}</span>
        </div>
        <p className="mt-1 text-slate-600">
          {order.student_name} · כיתה {order.class_name}
        </p>
        <ul className="mt-3 divide-y divide-slate-100">
          {order.books.map((b) => (
            <li key={b.book_id} className="flex justify-between gap-2 py-2">
              <span>
                {b.name}
                {b.qty > 1 && <span className="text-slate-500"> × {b.qty}</span>}
              </span>
              <span className="whitespace-nowrap text-slate-600">{money(b.price * b.qty)}</span>
            </li>
          ))}
        </ul>
        <div className="mt-2 space-y-1 border-t pt-3">
          <SumRow label="סה״כ" value={money(order.total)} bold />
          {order.paid_amount > 0 && <SumRow label="שולם" value={money(order.paid_amount)} />}
          {order.status !== 'cancelled' && (
            <SumRow label={order.balance > 0 ? 'יתרה לתשלום' : 'מצב תשלום'} value={order.balance > 0 ? money(order.balance) : 'שולם – תודה!'} bold />
          )}
        </div>
        {order.status !== 'cancelled' && (
          <>
            {order.balance > 0 && <TextBlock title="הוראות תשלום" text={order.payment_instructions} />}
            {order.delivery_method === 'institution_day' ? (
              <TextBlock
                title="מסירה"
                text={`ביום המכירה ב${data.institution ?? 'מוסד'}${order.sale_day_date ? ` – ${formatDate(order.sale_day_date)}` : ''}`}
              />
            ) : (
              <TextBlock title="פרטי איסוף" text={order.pickup_info} />
            )}
          </>
        )}
      </Card>

      {p && (
        <Card className="mb-3 border border-amber-200 bg-amber-50">
          <div className="flex items-center gap-2 font-bold text-amber-900">
            <Clock className="h-5 w-5" /> בקשת שינוי ממתינה לאישור המשרד
          </div>
          <ul className="mt-1 list-inside list-disc text-sm text-amber-950">
            {p.cancel_order && <li>ביטול ההזמנה</li>}
            {p.add.length > 0 && <li>להוסיף: {p.add.join(', ')}</li>}
            {p.remove.length > 0 && <li>להוריד: {p.remove.join(', ')}</li>}
            {p.delivery_method && <li>אופן מסירה: {DELIVERY[p.delivery_method]}</li>}
            {p.note && <li>{p.cancel_order ? 'סיבה' : 'הערה'}: {p.note}</li>}
          </ul>
          <p className="mt-1 text-xs text-amber-800">נשלחה ב-{new Date(p.created_at).toLocaleString('he-IL', { dateStyle: 'short', timeStyle: 'short' })}</p>
        </Card>
      )}
      {!p && last && (
        <Card className={`mb-3 text-sm ${last.status === 'approved' ? 'bg-emerald-50 text-emerald-900' : 'bg-red-50 text-red-900'}`}>
          <div className="flex items-center gap-2 font-bold">
            {last.status === 'approved' ? <CheckCircle2 className="h-5 w-5" /> : <XCircle className="h-5 w-5" />}
            בקשת השינוי האחרונה {last.status === 'approved' ? 'אושרה' : 'לא אושרה'}
          </div>
          {last.reason && <p className="mt-1">{last.reason}</p>}
        </Card>
      )}

      <Card className={data.can_change ? 'mb-28' : ''}>
        {data.can_change ? (
          <p className="text-sm text-slate-600">
            אפשר לבקש שינוי בהזמנה {data.deadline ? `עד ${formatDate(data.deadline)}` : ''}. השינוי ייכנס לתוקף אחרי אישור המשרד.
          </p>
        ) : (
          <p className="text-sm text-slate-600">לשינוי בהזמנה – אפשר לפנות למשרד.</p>
        )}
        <Contact contact={data.contact} />
      </Card>

      {data.can_change && (
        <BottomBar>
          <button type="button" className={bigButton} onClick={() => setEditing(true)}>
            {p ? 'עדכון בקשת השינוי' : 'בקשת שינוי בהזמנה'}
          </button>
        </BottomBar>
      )}
    </>
  );
}

function ChangeForm({ data, code, onCancel, onSent }: { data: PublicOrderFull; code: string; onCancel: () => void; onSent: () => void }) {
  const order = data.order!;
  const current = useMemo(() => new Set(order.books.map((b) => b.book_id)), [order.books]);
  const [selected, setSelected] = useState<Set<string>>(() => new Set(current));
  const [delivery, setDelivery] = useState(order.delivery_method);
  const [cancelAll, setCancelAll] = useState(false);
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  // רשימת הכיתה + ספרים שבהזמנה ולא ברשימה (אם הוסרו מהרשימה בינתיים)
  const books = useMemo(() => {
    const list = [...(data.class_books ?? [])];
    for (const b of order.books)
      if (!list.some((x) => x.book_id === b.book_id))
        list.push({ book_id: b.book_id, name: b.name, qty: b.qty, price: b.price, required: false, closed: true });
    return list;
  }, [data.class_books, order.books]);

  const add = books.filter((b) => selected.has(b.book_id) && !current.has(b.book_id)).map((b) => b.book_id);
  const remove = [...current].filter((id) => !selected.has(id));
  // הנחה שניתנה בהזמנה (אם יש) נשארת
  const discount = Math.max(order.books.reduce((s, b) => s + b.price * b.qty, 0) - order.total, 0);
  const newTotal =
    books
      .filter((b) => selected.has(b.book_id))
      .reduce((s, b) => {
        const inOrder = order.books.find((x) => x.book_id === b.book_id);
        return s + (inOrder ? inOrder.price * inOrder.qty : b.price * b.qty);
      }, 0) - discount;

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const send = async () => {
    setError(null);
    if (cancelAll && !note.trim()) return setError('יש לכתוב את סיבת הביטול');
    if (!cancelAll && !add.length && !remove.length && delivery === order.delivery_method && !note.trim())
      return setError('לא סומן שום שינוי');
    if (!cancelAll && selected.size === 0) return setError('כדי להוריד את כל הספרים – יש לבחור "ביטול כל ההזמנה"');
    setSending(true);
    const { data: res, error: err } = await supabase.rpc('request_order_change', {
      p_code: code,
      p_add: cancelAll ? [] : add,
      p_remove: cancelAll ? [] : remove,
      p_delivery: cancelAll || delivery === order.delivery_method ? '' : delivery,
      p_cancel: cancelAll,
      p_note: note.trim(),
    });
    setSending(false);
    if (err) return setError('אירעה תקלה בשליחה. אפשר לנסות שוב בעוד רגע.');
    const r = res as unknown as { ok: boolean; message?: string; request_id?: string };
    if (!r.ok) return setError(r.message ?? 'הבקשה לא נשלחה');
    void fetch('/api/public/change-notify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ request_id: r.request_id, stage: 'received' }),
    }).catch(() => undefined);
    onSent();
  };

  return (
    <>
      <PublicHeader institution={data.institution} year={data.year} />
      <Card className="mb-3">
        <h2 className="text-xl font-bold">בקשת שינוי – הזמנה {order.number}</h2>
        <p className="text-sm text-slate-600">
          {order.student_name} · כיתה {order.class_name}
        </p>
        {data.pending && <p className="mt-2 rounded-lg bg-amber-50 p-2 text-sm text-amber-900">הבקשה הזו תחליף את הבקשה הקודמת שעוד ממתינה.</p>}
        <label className="mt-3 flex items-center gap-3 rounded-xl border border-red-200 p-3">
          <input type="checkbox" className="h-6 w-6 accent-red-600" checked={cancelAll} onChange={(e) => setCancelAll(e.target.checked)} />
          <span className="font-medium text-red-700">ביטול כל ההזמנה</span>
        </label>
      </Card>

      {!cancelAll && (
        <>
          <Card className="mb-3">
            <h3 className="text-lg font-bold">ספרים</h3>
            <p className="mb-2 text-sm text-slate-500">מסמנים את מה שרוצים בהזמנה. ספר שמסירים את הסימון ממנו – יוסר.</p>
            <ul className="divide-y divide-slate-100">
              {books.map((b) => {
                const inOrder = current.has(b.book_id);
                const disabled = b.closed && !inOrder;
                const on = selected.has(b.book_id);
                return (
                  <li key={b.book_id}>
                    <label className={`flex items-center gap-3 py-3 ${disabled ? 'opacity-50' : 'cursor-pointer'}`}>
                      <input type="checkbox" className="h-6 w-6 shrink-0 accent-blue-600" checked={on} disabled={disabled} onChange={() => toggle(b.book_id)} />
                      <span className="flex-1">
                        <span className="block font-medium">{b.name}</span>
                        <span className="text-xs text-slate-500">
                          {disabled ? 'לא ניתן להזמין עוד' : inOrder ? (on ? 'בהזמנה' : 'יוסר') : on ? 'יתווסף' : b.required ? 'חובה' : 'רשות'}
                        </span>
                      </span>
                      <span className="whitespace-nowrap text-slate-700">{money(b.price * b.qty)}</span>
                    </label>
                  </li>
                );
              })}
            </ul>
          </Card>
          {data.sale_day_date && (
            <Card className="mb-3">
              <h3 className="mb-2 text-lg font-bold">אופן מסירה</h3>
              <div className="grid gap-2">
                <Choice checked={delivery === 'institution_day'} onClick={() => setDelivery('institution_day')}>
                  ביום המכירה ב{data.institution} – {formatDate(data.sale_day_date)}
                </Choice>
                <Choice checked={delivery === 'pickup'} onClick={() => setDelivery('pickup')}>
                  איסוף עצמי
                </Choice>
              </div>
            </Card>
          )}
        </>
      )}

      <Card className="mb-28">
        <label className="block">
          <span className="mb-1 block font-medium">{cancelAll ? 'סיבת הביטול (חובה)' : 'הערה למשרד (לא חובה)'}</span>
          <textarea className={`${publicInput} min-h-20`} value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} />
        </label>
        {!cancelAll && (add.length > 0 || remove.length > 0) && (
          <div className="mt-3">
            <SumRow label="סה״כ אחרי השינוי (משוער)" value={money(Math.max(newTotal, 0))} bold />
          </div>
        )}
        <button type="button" onClick={onCancel} className="mt-3 w-full rounded-xl border border-slate-300 py-3 text-slate-700">
          חזרה בלי לשנות
        </button>
      </Card>

      <BottomBar error={error}>
        <button type="button" className={bigButton} onClick={send} disabled={sending}>
          {sending && <Loader2 className="h-5 w-5 animate-spin" />}
          שליחת הבקשה למשרד
        </button>
      </BottomBar>
    </>
  );
}
