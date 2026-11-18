'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, Check, X } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useYear } from '@/components/YearContext';
import { PageGuard, Protect } from '@/components/Protect';
import { OrderStatusBadge } from '@/components/orders/OrderStatusBadge';
import { Button, EmptyState, Field, inputClass, Modal, PageHeader, Spinner } from '@/components/ui';
import { toast } from '@/components/Toaster';
import { dbErrorMessage } from '@/lib/dbErrors';
import { money } from '@/lib/format';
import { DELIVERY_LABELS, type DeliveryMethod, type OrderStatus } from '@/lib/orders';
import { notifyChangeDecision } from '@/lib/online';

// =====================================================================
// בקשות שינוי מהקישור (ח5): מה מבוקש מול מה שיש, ההפרש בסכום, אישור (מבצע את השינוי דרך הכללים
// הרגילים – מחירים, מועדי ביטול, ספרים ארוזים) או דחייה עם סיבה. ההורה מקבל מייל על ההחלטה.
// =====================================================================

export default function ChangeRequestsPage() {
  return (
    <PageGuard permId={['orders_view', 'online_changes_approve']}>
      <RequestsScreen />
    </PageGuard>
  );
}

type Req = {
  id: string;
  order_id: string;
  status: 'pending' | 'approved' | 'rejected' | 'replaced';
  add_books: string[];
  remove_books: string[];
  delivery_method: DeliveryMethod | null;
  cancel_order: boolean;
  note: string | null;
  created_at: string;
  decided_at: string | null;
  decided_by_name: string | null;
  decision_reason: string | null;
  orders: {
    number: number;
    student_name: string;
    class_id: string;
    total: number;
    status: OrderStatus;
    delivery_method: DeliveryMethod;
    classes: { name: string } | null;
    institution_years: { institutions: { name: string } | null } | null;
  } | null;
};
type Line = { name: string; amount: number };
type Row = Req & { addLines: Line[]; removeLines: Line[]; diff: number };

const STATUS_LABEL: Record<Req['status'], string> = { pending: 'ממתינה', approved: 'אושרה', rejected: 'נדחתה', replaced: 'הוחלפה בבקשה חדשה' };

async function fetchRequests(yearId: string, showDone: boolean): Promise<Row[]> {
  let q = supabase
    .from('online_change_requests')
    .select(
      `id, order_id, status, add_books, remove_books, delivery_method, cancel_order, note, created_at, decided_at, decided_by_name, decision_reason,
       orders!inner(number, student_name, class_id, total, status, delivery_method, year_id, classes(name), institution_years(institutions(name)))`
    )
    .eq('orders.year_id', yearId)
    .order('created_at', { ascending: !showDone })
    .limit(300);
  q = showDone ? q.in('status', ['approved', 'rejected']) : q.eq('status', 'pending');
  const { data, error } = await q;
  if (error) toast.error(dbErrorMessage(error.message));
  const reqs = (data ?? []) as unknown as Req[];

  const bookIds = [...new Set(reqs.flatMap((r) => [...r.add_books, ...r.remove_books]))];
  const classIds = [...new Set(reqs.map((r) => r.orders?.class_id).filter(Boolean) as string[])];
  const orderIds = reqs.map((r) => r.order_id);
  const [{ data: books }, { data: cbs }, { data: items }] = await Promise.all([
    bookIds.length ? supabase.from('books').select('id, name').in('id', bookIds) : Promise.resolve({ data: [] }),
    classIds.length && bookIds.length
      ? supabase.from('class_books').select('class_id, book_id, sale_price, qty_per_student').in('class_id', classIds).in('book_id', bookIds)
      : Promise.resolve({ data: [] }),
    orderIds.length
      ? supabase.from('order_items').select('order_id, book_id, unit_price, qty').in('order_id', orderIds).eq('status', 'active')
      : Promise.resolve({ data: [] }),
  ]);
  const name = new Map((books ?? []).map((b: { id: string; name: string }) => [b.id, b.name]));
  type Cb = { class_id: string; book_id: string; sale_price: number; qty_per_student: number };
  type It = { order_id: string; book_id: string; unit_price: number; qty: number };

  return reqs.map((r) => {
    const addLines = r.add_books.map((b) => {
      const cb = (cbs as Cb[] | null)?.find((x) => x.class_id === r.orders?.class_id && x.book_id === b);
      return { name: name.get(b) ?? '?', amount: cb ? Number(cb.sale_price) * Math.max(cb.qty_per_student, 1) : 0 };
    });
    const removeLines = r.remove_books.map((b) => {
      const it = (items as It[] | null)?.find((x) => x.order_id === r.order_id && x.book_id === b);
      return { name: name.get(b) ?? '?', amount: it ? Number(it.unit_price) * it.qty : 0 };
    });
    const diff = r.cancel_order
      ? -(r.orders?.total ?? 0)
      : addLines.reduce((s, l) => s + l.amount, 0) - removeLines.reduce((s, l) => s + l.amount, 0);
    return { ...r, addLines, removeLines, diff };
  });
}

function RequestsScreen() {
  const { year } = useYear();
  const [showDone, setShowDone] = useState(false);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState<Row | null>(null);
  const yearId = year?.id ?? null;

  const reload = useCallback(async () => {
    if (yearId) setRows(await fetchRequests(yearId, showDone));
  }, [yearId, showDone]);
  useEffect(() => {
    if (!yearId) return;
    let cancelled = false;
    void fetchRequests(yearId, showDone).then((r) => !cancelled && setRows(r));
    return () => {
      cancelled = true;
    };
  }, [yearId, showDone]);

  const decide = async (r: Row, approve: boolean, reason?: string) => {
    setBusy(r.id);
    const { error } = await supabase.rpc('decide_change_request', { p_request: r.id, p_approve: approve, p_reason: reason ?? '' });
    setBusy(null);
    if (error) return toast.error(dbErrorMessage(error.message));
    toast.success(approve ? 'הבקשה אושרה וההזמנה עודכנה' : 'הבקשה נדחתה');
    setRejecting(null);
    void notifyChangeDecision(r.id);
    await reload();
  };

  if (!year) return <EmptyState>יש לפתוח שנת לימודים.</EmptyState>;

  return (
    <div>
      <Link href="/orders" className="mb-2 inline-flex items-center gap-1 text-sm text-blue-700 hover:underline">
        <ArrowRight className="h-4 w-4" /> להזמנות
      </Link>
      <PageHeader title={`בקשות שינוי מהקישור – ${year.name}`}>
        <div className="flex rounded-lg border border-slate-300 bg-white p-0.5 text-sm">
          <button type="button" onClick={() => setShowDone(false)} className={`rounded-md px-3 py-1.5 ${!showDone ? 'bg-blue-600 text-white' : ''}`}>
            ממתינות
          </button>
          <button type="button" onClick={() => setShowDone(true)} className={`rounded-md px-3 py-1.5 ${showDone ? 'bg-blue-600 text-white' : ''}`}>
            טופלו
          </button>
        </div>
      </PageHeader>
      <p className="mb-3 text-sm text-slate-500">
        הורים מבקשים שינוי מקישור הצפייה בהזמנה (שבמייל האישור). ההזמנה לא משתנה עד האישור; האישור מבצע את השינוי לפי הכללים
        הרגילים (מחירים מרשימת הכיתה, מועד ביטול, ספרים שכבר נארזו). ההורה מקבל מייל על ההחלטה.
      </p>

      {!rows ? (
        <Spinner />
      ) : rows.length === 0 ? (
        <EmptyState>{showDone ? 'אין בקשות שטופלו' : 'אין בקשות שממתינות לאישור'}</EmptyState>
      ) : (
        <div className="space-y-3">
          {rows.map((r) => (
            <div key={r.id} className="rounded-xl bg-white p-4 shadow-sm">
              <div className="flex flex-wrap items-center gap-2">
                <Link href={`/orders/${r.order_id}`} className="text-lg font-bold text-blue-700 hover:underline">
                  הזמנה {r.orders?.number}
                </Link>
                {r.orders && <OrderStatusBadge status={r.orders.status} />}
                <span className="text-slate-700">
                  {r.orders?.student_name} · {r.orders?.institution_years?.institutions?.name} / {r.orders?.classes?.name}
                </span>
                <span className="mr-auto text-xs text-slate-400">
                  {new Date(r.created_at).toLocaleString('he-IL', { dateStyle: 'short', timeStyle: 'short' })}
                </span>
              </div>

              <div className="mt-2 grid gap-2 text-sm sm:grid-cols-2">
                {r.cancel_order ? (
                  <div className="rounded-lg bg-red-50 p-2 text-red-800 sm:col-span-2">
                    <b>ביטול כל ההזמנה</b> ({money(r.orders?.total ?? 0)})
                  </div>
                ) : (
                  <>
                    {r.addLines.length > 0 && (
                      <div className="rounded-lg bg-emerald-50 p-2">
                        <div className="font-bold text-emerald-800">להוסיף</div>
                        {r.addLines.map((l, i) => (
                          <div key={i} className="flex justify-between">
                            <span>{l.name}</span>
                            <span>+{money(l.amount)}</span>
                          </div>
                        ))}
                      </div>
                    )}
                    {r.removeLines.length > 0 && (
                      <div className="rounded-lg bg-amber-50 p-2">
                        <div className="font-bold text-amber-800">להוריד</div>
                        {r.removeLines.map((l, i) => (
                          <div key={i} className="flex justify-between">
                            <span>{l.name}</span>
                            <span>−{money(l.amount)}</span>
                          </div>
                        ))}
                      </div>
                    )}
                    {r.delivery_method && r.orders && (
                      <div className="rounded-lg bg-slate-50 p-2">
                        אופן מסירה: {DELIVERY_LABELS[r.orders.delivery_method]} ← <b>{DELIVERY_LABELS[r.delivery_method]}</b>
                      </div>
                    )}
                  </>
                )}
                {r.note && (
                  <div className="rounded-lg bg-slate-50 p-2 sm:col-span-2">
                    {r.cancel_order ? 'סיבה' : 'הערת ההורה'}: {r.note}
                  </div>
                )}
              </div>

              <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
                {(r.addLines.length > 0 || r.removeLines.length > 0 || r.cancel_order) && (
                  <span className={r.diff >= 0 ? 'text-emerald-700' : 'text-amber-700'}>
                    הפרש: {r.diff >= 0 ? '+' : '−'}
                    {money(Math.abs(r.diff))} · סכום ההזמנה {money(r.orders?.total ?? 0)} ← {money(Math.max((r.orders?.total ?? 0) + r.diff, 0))}
                  </span>
                )}
                {r.status === 'pending' ? (
                  <Protect permId="online_changes_approve">
                    <div className="mr-auto flex gap-2">
                      <Button variant="success" loading={busy === r.id} onClick={() => decide(r, true)}>
                        <Check className="h-4 w-4" /> אישור
                      </Button>
                      <Button variant="danger" disabled={busy === r.id} onClick={() => setRejecting(r)}>
                        <X className="h-4 w-4" /> דחייה
                      </Button>
                    </div>
                  </Protect>
                ) : (
                  <span className={`mr-auto rounded px-2 py-0.5 text-xs ${r.status === 'approved' ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800'}`}>
                    {STATUS_LABEL[r.status]}
                    {r.decided_by_name && ` · ${r.decided_by_name}`}
                    {r.decided_at && ` · ${new Date(r.decided_at).toLocaleDateString('he-IL')}`}
                    {r.decision_reason && ` · ${r.decision_reason}`}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {rejecting && <RejectModal row={rejecting} busy={busy === rejecting.id} onClose={() => setRejecting(null)} onReject={(why) => decide(rejecting, false, why)} />}
    </div>
  );
}

function RejectModal({ row, busy, onClose, onReject }: { row: Row; busy: boolean; onClose: () => void; onReject: (why: string) => void }) {
  const [why, setWhy] = useState('');
  return (
    <Modal
      title={`דחיית בקשת שינוי – הזמנה ${row.orders?.number}`}
      onClose={onClose}
      size="md"
      footer={
        <>
          <Button variant="danger" loading={busy} disabled={!why.trim()} onClick={() => onReject(why.trim())}>
            דחייה
          </Button>
          <Button variant="secondary" onClick={onClose}>
            ביטול
          </Button>
        </>
      }
    >
      <Field label="סיבה (תישלח להורה במייל)">
        <textarea className={`${inputClass} min-h-20`} value={why} onChange={(e) => setWhy(e.target.value)} autoFocus />
      </Field>
    </Modal>
  );
}
