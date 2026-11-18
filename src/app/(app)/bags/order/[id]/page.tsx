'use client';

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { AlertTriangle, ArrowRight, CheckCircle2, ClipboardCheck, HandHeart, Minus, PackagePlus, Pencil, Plus, Printer, Tag, Undo2, XCircle } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/components/AuthContext';
import { PageGuard, Protect } from '@/components/Protect';
import { BagStatusBadge } from '@/components/warehouse/BagStatusBadge';
import { OrderStatusBadge } from '@/components/orders/OrderStatusBadge';
import { DeliverOrderModal } from '@/components/warehouse/DeliverOrderModal';
import { Button, EmptyState, Field, inputClass, Modal, Spinner } from '@/components/ui';
import { toast } from '@/components/Toaster';
import { dbErrorMessage } from '@/lib/dbErrors';
import { formatDate, money } from '@/lib/format';
import { DELIVERY_LABELS, type OrderStatus } from '@/lib/orders';
import { fetchPackDetails, type PackBag, type PackDetails, type PackItem } from '@/lib/warehouse';

export default function PackOrderPage() {
  return (
    <PageGuard permId={['picking_do', 'bags_check', 'pickups_do', 'labels_print']}>
      <Suspense fallback={<Spinner />}>
        <PackScreen />
      </Suspense>
    </PageGuard>
  );
}

function PackScreen() {
  const { id } = useParams<{ id: string }>();
  const params = useSearchParams();
  const highlight = params.get('bag');
  const router = useRouter();
  const { hasPermission } = useAuth();
  const [data, setData] = useState<PackDetails | null | undefined>(undefined);
  const [editing, setEditing] = useState<PackBag | 'new' | null>(null);
  const [delivering, setDelivering] = useState<PackBag | null>(null);

  const reload = useCallback(async () => setData(await fetchPackDetails(id)), [id]);
  useEffect(() => {
    let cancelled = false;
    void fetchPackDetails(id).then((d) => !cancelled && setData(d));
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (data === undefined) return <Spinner />;
  if (!data) return <EmptyState>ההזמנה לא נמצאה</EmptyState>;
  const { order, items, bags } = data;
  const remaining = items.reduce((s, i) => s + Math.max(i.qty - i.packed, 0), 0);
  const canPack = hasPermission('picking_do') && !['cancelled', 'delivered'].includes(order.status);
  const activeBags = bags.filter((b) => b.status !== 'cancelled');

  const setStatus = async (bag: PackBag, status: string, confirmText?: string) => {
    if (confirmText && !window.confirm(confirmText)) return;
    const { error } = await supabase.rpc('set_bag_status', { p_bag: bag.id, p_status: status });
    if (error) return toast.error(dbErrorMessage(error.message));
    toast.success('עודכן');
    await reload();
  };

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <div className="flex flex-wrap items-center gap-2 print:hidden">
        <Button variant="ghost" onClick={() => router.push('/bags')}>
          <ArrowRight className="h-4 w-4" /> לרשימה
        </Button>
        <div className="flex-1" />
        {activeBags.length > 0 && (
          <Protect permId="labels_print">
            <Button variant="secondary" onClick={() => router.push(`/bags/labels?ids=${activeBags.filter((b) => b.status !== 'delivered').map((b) => b.id).join(',')}`)}>
              <Tag className="h-4 w-4" /> מדבקות
            </Button>
          </Protect>
        )}
        <Button variant="secondary" onClick={() => window.print()}>
          <Printer className="h-4 w-4" /> דף תכולה
        </Button>
      </div>

      {/* פרטי ההזמנה */}
      <div className="rounded-2xl bg-white p-4 shadow-sm print:shadow-none">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-bold">{order.student_name}</h1>
          <OrderStatusBadge status={order.status as OrderStatus} />
        </div>
        <div className="mt-1 text-slate-600">
          הזמנה {order.number} · {order.inst_name} / כיתה {order.class_name} · {DELIVERY_LABELS[order.delivery_method]}
          {order.delivery_method === 'institution_day' && order.sale_day_date && ` (${formatDate(order.sale_day_date)})`}
        </div>
        <div className={`mt-2 inline-block rounded-lg px-3 py-1 text-sm font-medium ${order.balance > 0 ? 'bg-red-50 text-red-700' : 'bg-emerald-50 text-emerald-700'}`}>
          {order.balance > 0 ? `לתשלום: ${money(order.balance)}` : 'שולם ✓'}
        </div>
        {order.notes && <p className="mt-2 text-sm text-slate-500">הערות: {order.notes}</p>}
      </div>

      {/* ספרים */}
      <div className="rounded-2xl bg-white p-4 shadow-sm print:shadow-none">
        <div className="mb-2 flex items-center gap-2">
          <h2 className="flex-1 text-lg font-bold">
            ספרים · {remaining > 0 ? <span className="text-amber-700">נותרו לאריזה {remaining}</span> : <span className="text-emerald-700">הכול ארוז</span>}
          </h2>
          {canPack && remaining > 0 && (
            <Button onClick={() => setEditing('new')} className="py-2.5 print:hidden">
              <PackagePlus className="h-5 w-5" /> אריזת שקית {activeBags.length ? 'נוספת' : ''}
            </Button>
          )}
        </div>
        <table className="w-full text-sm">
          <thead className="text-slate-500">
            <tr>
              <th className="py-1 text-right">ספר</th>
              <th className="py-1 text-right">הוזמן</th>
              <th className="py-1 text-right">ארוז</th>
              <th className="py-1 text-right">נמסר</th>
              <th className="py-1 text-right print:hidden">זמין לאריזה (מהמוקצה למוסד)</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {items.map((i) => {
              const avail = Math.max(i.allocated - i.packed_open, 0);
              const left = Math.max(i.qty - i.packed, 0);
              return (
                <tr key={i.id}>
                  <td className="py-2">
                    <div className="font-medium">{i.book_name}</div>
                    <div className="text-xs text-slate-400">{i.book_code}</div>
                  </td>
                  <td className="py-2">{i.qty}</td>
                  <td className={`py-2 ${i.packed >= i.qty ? 'text-emerald-700' : ''}`}>{i.packed}</td>
                  <td className="py-2">{i.delivered}</td>
                  <td className={`py-2 print:hidden ${left > 0 && avail < left ? 'font-medium text-red-600' : 'text-slate-500'}`}>
                    {left > 0 ? (avail >= left ? `✓ ${avail}` : `${avail} (חסרים ${left - avail})`) : '—'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* שקיות */}
      <div className="space-y-3">
        {bags.map((b) => {
          const its = b.items.map((x) => ({ ...x, item: items.find((i) => i.id === x.order_item_id) }));
          const isHighlight = highlight === b.code;
          return (
            <div key={b.id} className={`rounded-2xl bg-white p-4 shadow-sm print:break-inside-avoid print:shadow-none ${isHighlight ? 'ring-2 ring-blue-500' : ''} ${b.status === 'cancelled' ? 'opacity-60 print:hidden' : ''}`}>
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-lg font-bold">
                  שקית {b.bag_no}
                  <span className="mr-2 text-sm font-normal text-slate-400" dir="ltr">{b.code}</span>
                </h3>
                <BagStatusBadge status={b.status} partial={b.is_partial} />
                {b.label_printed_at && <span className="text-xs text-slate-400 print:hidden">מדבקה הודפסה</span>}
              </div>
              <ul className="mt-2 grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
                {its.map((x) => (
                  <li key={x.order_item_id} className="flex justify-between border-b border-dotted border-slate-200 py-1">
                    <span>{x.item?.book_name}</span>
                    <span className="font-medium">× {x.qty}</span>
                  </li>
                ))}
              </ul>
              {/* שמות העובדים – רק במסך, לא בהדפסה ללקוח */}
              <div className="mt-2 text-xs text-slate-500 print:hidden">
                {b.picked_by_name && `לוקטה ע״י ${b.picked_by_name}`}
                {b.checked_by_name && ` · נבדקה ע״י ${b.checked_by_name}`}
                {b.status === 'delivered' && ` · נמסרה ל${b.received_by} ${b.delivered_at ? new Date(b.delivered_at).toLocaleString('he-IL', { dateStyle: 'short', timeStyle: 'short' }) : ''} (${b.delivered_by_name ?? ''})`}
              </div>
              {!['delivered', 'cancelled'].includes(b.status) && (
                <div className="mt-3 flex flex-wrap gap-2 print:hidden">
                  {['picked', 'ready'].includes(b.status) && (
                    <Protect permId="bags_check">
                      <Button variant="secondary" onClick={() => setStatus(b, 'checked')}>
                        <ClipboardCheck className="h-4 w-4" /> נבדקה
                      </Button>
                    </Protect>
                  )}
                  {['picked', 'checked'].includes(b.status) && (
                    <Protect permId="bags_check">
                      <Button onClick={() => setStatus(b, 'ready')}>
                        <CheckCircle2 className="h-4 w-4" /> מוכנה למסירה
                      </Button>
                    </Protect>
                  )}
                  {b.status !== 'picking' && (
                    <Protect permId="pickups_do">
                      <Button variant="success" onClick={() => setDelivering(b)}>
                        <HandHeart className="h-4 w-4" /> מסירה
                      </Button>
                    </Protect>
                  )}
                  {canPack && (
                    <Button variant={b.status === 'picking' ? 'primary' : 'secondary'} onClick={() => setEditing(b)}>
                      <Pencil className="h-4 w-4" /> {b.status === 'picking' ? 'סיום אריזה' : 'עריכת התכולה'}
                    </Button>
                  )}
                  {canPack && b.status !== 'picking' && (
                    <Button variant="ghost" onClick={() => setStatus(b, 'picking')}>
                      <Undo2 className="h-4 w-4" /> חזרה לליקוט
                    </Button>
                  )}
                  {canPack && (
                    <Button variant="danger" onClick={() => setStatus(b, 'cancelled', `לפרק את שקית ${b.bag_no}? הספרים יחזרו למלאי המוקצה למוסד.`)}>
                      <XCircle className="h-4 w-4" /> פירוק
                    </Button>
                  )}
                </div>
              )}
            </div>
          );
        })}
        {bags.length === 0 && <EmptyState>עדיין אין שקיות להזמנה הזו</EmptyState>}
      </div>

      {editing && (
        <PackModal
          data={data}
          bag={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={async () => {
            setEditing(null);
            await reload();
          }}
        />
      )}
      {delivering && (
        <DeliverOrderModal
          orderId={order.id}
          bagId={delivering.id}
          onClose={() => setDelivering(null)}
          onDone={async () => {
            setDelivering(null);
            await reload();
          }}
        />
      )}
    </div>
  );
}

function PackModal({ data, bag, onClose, onSaved }: { data: PackDetails; bag: PackBag | null; onClose: () => void; onSaved: () => void }) {
  const { order, items } = data;
  // כמה אפשר לשים בשקית הזו לכל פריט: לא יותר ממה שנשאר בהזמנה ולא יותר מהזמין לאריזה
  const limits = useMemo(() => {
    const m = new Map<string, number>();
    for (const i of items) {
      const inThisBag = bag?.items.find((x) => x.order_item_id === i.id)?.qty ?? 0;
      const leftInOrder = i.qty - (i.packed - inThisBag);
      const availToPack = i.allocated - (i.packed_open - inThisBag);
      m.set(i.id, Math.max(Math.min(leftInOrder, availToPack), 0));
    }
    return m;
  }, [items, bag]);
  const [qty, setQty] = useState<Record<string, number>>(() =>
    Object.fromEntries(
      items.map((i) => [i.id, bag ? bag.items.find((x) => x.order_item_id === i.id)?.qty ?? 0 : limits.get(i.id) ?? 0])
    )
  );
  const [notes, setNotes] = useState(bag?.notes ?? '');
  const [saving, setSaving] = useState(false);

  const total = Object.values(qty).reduce((s, v) => s + v, 0);
  const missingAfter = items.reduce((s, i) => {
    const inThisBag = bag?.items.find((x) => x.order_item_id === i.id)?.qty ?? 0;
    return s + Math.max(i.qty - (i.packed - inThisBag) - (qty[i.id] ?? 0), 0);
  }, 0);

  const change = (i: PackItem, delta: number) =>
    setQty((q) => ({ ...q, [i.id]: Math.min(Math.max((q[i.id] ?? 0) + delta, 0), limits.get(i.id) ?? 0) }));

  const save = async () => {
    setSaving(true);
    const { error } = await supabase.rpc('save_bag', {
      p_order: order.id,
      p_bag: bag?.id,
      p_lines: items.filter((i) => (qty[i.id] ?? 0) > 0).map((i) => ({ order_item_id: i.id, qty: qty[i.id] })),
      p_notes: notes.trim() || undefined,
    });
    setSaving(false);
    if (error) return toast.error(dbErrorMessage(error.message));
    toast.success(bag ? 'השקית עודכנה' : 'השקית נארזה');
    onSaved();
  };

  return (
    <Modal
      title={bag ? `עריכת שקית ${bag.bag_no}` : 'אריזת שקית'}
      onClose={onClose}
      footer={
        <>
          <Button variant="success" onClick={save} loading={saving} disabled={total === 0} className="px-6 py-3 text-base">
            <PackagePlus className="h-5 w-5" /> {bag ? 'שמירה' : 'השקית ארוזה'} ({total} ספרים)
          </Button>
          <Button variant="secondary" onClick={onClose}>ביטול</Button>
        </>
      }
    >
      {missingAfter > 0 && (
        <p className="flex items-center gap-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
          <AlertTriangle className="h-4 w-4" /> השקית תסומן &quot;חסר&quot; – עוד {missingAfter} עותקים יחכו לשקית השלמה.
        </p>
      )}
      <div className="space-y-2">
        {items.map((i) => {
          const lim = limits.get(i.id) ?? 0;
          const v = qty[i.id] ?? 0;
          return (
            <div key={i.id} className={`flex flex-wrap items-center gap-3 rounded-xl bg-white p-3 ${v ? 'ring-2 ring-emerald-300' : ''}`}>
              <div className="min-w-40 flex-1">
                <div className="font-semibold">{i.book_name}</div>
                <div className="text-xs text-slate-500">
                  הוזמן {i.qty} · אפשר לשים בשקית עד {lim}
                  {lim < i.qty - i.packed && <span className="text-red-600"> (חסר במלאי המוקצה)</span>}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button type="button" onClick={() => change(i, -1)} className="flex h-11 w-11 items-center justify-center rounded-lg border" aria-label="פחות">
                  <Minus className="h-5 w-5" />
                </button>
                <span className="w-10 text-center text-xl font-bold">{v}</span>
                <button type="button" onClick={() => change(i, 1)} disabled={v >= lim} className="flex h-11 w-11 items-center justify-center rounded-lg border disabled:opacity-30" aria-label="יותר">
                  <Plus className="h-5 w-5" />
                </button>
              </div>
            </div>
          );
        })}
      </div>
      <Field label="הערה לשקית">
        <input className={inputClass} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </Field>
    </Modal>
  );
}
