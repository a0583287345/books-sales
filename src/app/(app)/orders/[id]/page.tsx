'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { AlertTriangle, ArrowRight, Ban, Copy, History, Minus, Plus, Printer, RotateCcw, Save } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/components/AuthContext';
import { PageGuard, Protect } from '@/components/Protect';
import PhoneLink from '@/components/PhoneLink';
import { OrderStatusBadge } from '@/components/orders/OrderStatusBadge';
import { OrderPayments } from '@/components/finance/OrderPayments';
import { Button, EmptyState, Field, inputClass, Modal, Spinner } from '@/components/ui';
import { toast } from '@/components/Toaster';
import { dbErrorMessage } from '@/lib/dbErrors';
import { formatDate, money, toNumber } from '@/lib/format';
import {
  ADVANCED_STATUSES,
  DELIVERY_LABELS,
  fetchClassBookOptions,
  isPast,
  ORDER_COLUMNS,
  ORDER_ITEM_COLUMNS,
  ORDER_STATUS_LABELS,
  ORDER_STATUSES,
  SOURCE_LABELS,
  type ClassBookOption,
  type DeliveryMethod,
  type OrderItem,
  type OrderRow,
  type OrderStatus,
} from '@/lib/orders';

export default function OrderPage() {
  return (
    <PageGuard permId="orders_view">
      <OrderScreen />
    </PageGuard>
  );
}

type Extra = {
  customer: { id: string; number: number; first_name: string; last_name: string; phone: string | null; phone2: string | null; parent_name: string | null } | null;
  className: string;
  instName: string;
  yearName: string;
  yearClosed: boolean;
  saleDay: string | null;
  copiedFromNumber: number | null;
};
type Event = { id: number; created_at: string; user_name: string | null; event: string; description: string };

async function fetchOrder(id: string) {
  const [{ data: o }, { data: items }, { data: events }] = await Promise.all([
    supabase
      .from('orders')
      .select(`${ORDER_COLUMNS}, customers(id, number, first_name, last_name, phone, phone2, parent_name), classes(name),
        institution_years(sale_day_date, institutions(name)), academic_years(name, status)`)
      .eq('id', id)
      .maybeSingle(),
    supabase.from('order_items').select(`${ORDER_ITEM_COLUMNS}, books(name, code)`).eq('order_id', id).order('created_at'),
    supabase.from('order_events').select('id, created_at, user_name, event, description').eq('order_id', id).order('id', { ascending: false }),
  ]);
  if (!o) return null;
  const raw = o as unknown as OrderRow & {
    customers: Extra['customer'];
    classes: { name: string } | null;
    institution_years: { sale_day_date: string | null; institutions: { name: string } | null } | null;
    academic_years: { name: string; status: string } | null;
  };
  let copiedFromNumber: number | null = null;
  if (raw.copied_from) {
    const { data } = await supabase.from('orders').select('number').eq('id', raw.copied_from).maybeSingle();
    copiedFromNumber = data?.number ?? null;
  }
  const extra: Extra = {
    customer: raw.customers,
    className: raw.classes?.name ?? '',
    instName: raw.institution_years?.institutions?.name ?? '',
    saleDay: raw.institution_years?.sale_day_date ?? null,
    yearName: raw.academic_years?.name ?? '',
    yearClosed: raw.academic_years?.status === 'closed',
    copiedFromNumber,
  };
  const itemRows = (items ?? []).map((i) => {
    const b = i.books as unknown as { name: string; code: string } | null;
    return { ...(i as unknown as OrderItem), bookName: b?.name ?? '', bookCode: b?.code ?? '' };
  });
  return { order: raw as OrderRow, extra, items: itemRows, events: (events ?? []) as Event[] };
}

type ItemRow = OrderItem & { bookName: string; bookCode: string };

function OrderScreen() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { hasPermission } = useAuth();
  const [data, setData] = useState<Awaited<ReturnType<typeof fetchOrder>> | undefined>(undefined);
  const [cancelTarget, setCancelTarget] = useState<ItemRow | 'order' | null>(null);
  const [adding, setAdding] = useState(false);

  const reload = useCallback(async () => setData(await fetchOrder(id)), [id]);
  useEffect(() => {
    let cancelled = false;
    void fetchOrder(id).then((d) => !cancelled && setData(d));
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (data === undefined) return <Spinner />;
  if (data === null) return <EmptyState>ההזמנה לא נמצאה</EmptyState>;

  const { order, extra, items, events } = data;
  const locked = extra.yearClosed || order.status === 'cancelled';
  const canEdit = hasPermission('orders_edit') && !locked;
  const canCancel = hasPermission('orders_cancel') && !locked;
  const active = items.filter((i) => i.status === 'active');
  const cancelledItems = items.filter((i) => i.status === 'cancelled');
  const advanced = ADVANCED_STATUSES.includes(order.status);

  const updateOrder = async (
    patch: Partial<Pick<OrderRow, 'status' | 'delivery_method' | 'notes' | 'discount' | 'discount_reason'>>,
    success: string
  ) => {
    const { error } = await supabase.from('orders').update(patch).eq('id', order.id);
    if (error) return toast.error(dbErrorMessage(error.message));
    toast.success(success);
    await reload();
  };

  const changeQty = async (item: ItemRow, delta: number) => {
    const next = item.qty + delta;
    if (next < 1) return setCancelTarget(item);
    if (delta < 0 && advanced && !window.confirm(`ההזמנה כבר במצב "${ORDER_STATUS_LABELS[order.status]}". להפחית בכל זאת?`)) return;
    const { error } = await supabase.from('order_items').update({ qty: next }).eq('id', item.id);
    if (error) return toast.error(dbErrorMessage(error.message));
    await reload();
  };

  const restore = async (item: ItemRow) => {
    const { error } = await supabase.from('order_items').update({ status: 'active' }).eq('id', item.id);
    if (error) return toast.error(dbErrorMessage(error.message));
    toast.success('הספר הוחזר להזמנה');
    await reload();
  };

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      {/* כותרת */}
      <div className="flex flex-wrap items-center gap-2 print:hidden">
        <Button variant="ghost" onClick={() => router.push('/orders')}>
          <ArrowRight className="h-4 w-4" /> להזמנות
        </Button>
        <div className="flex-1" />
        <Protect permId="orders_copy">
          <Button variant="secondary" onClick={() => router.push(`/orders/new?copy=${order.id}`)}>
            <Copy className="h-4 w-4" /> העתקת ההזמנה
          </Button>
        </Protect>
        <Button variant="secondary" onClick={() => window.print()}>
          <Printer className="h-4 w-4" /> הדפסה
        </Button>
        {order.status !== 'cancelled' && !extra.yearClosed && (
          <Protect permId="orders_cancel">
            <Button variant="danger" onClick={() => setCancelTarget('order')}>
              <Ban className="h-4 w-4" /> ביטול ההזמנה
            </Button>
          </Protect>
        )}
      </div>

      <div className="rounded-xl bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-bold">הזמנה {order.number}</h1>
          <OrderStatusBadge status={order.status} />
          <span className="text-sm text-slate-500">
            {new Date(order.created_at).toLocaleString('he-IL', { dateStyle: 'short', timeStyle: 'short' })}
            {order.created_by_name && ` · ${order.created_by_name}`} · {SOURCE_LABELS[order.source] ?? order.source}
            {extra.copiedFromNumber && order.copied_from && (
              <>
                {' '}מהזמנה{' '}
                <Link href={`/orders/${order.copied_from}`} className="text-blue-700 underline">
                  {extra.copiedFromNumber}
                </Link>
              </>
            )}
          </span>
        </div>
        {order.status === 'cancelled' && (
          <p className="mt-2 rounded-lg bg-slate-100 px-3 py-2 text-sm">
            בוטלה {order.cancelled_at && new Date(order.cancelled_at).toLocaleDateString('he-IL')}
            {order.cancelled_by_name && ` ע״י ${order.cancelled_by_name}`}
            {order.cancel_reason && ` – ${order.cancel_reason}`}
          </p>
        )}
        {extra.yearClosed && <p className="mt-2 text-sm text-amber-700">שנת הלימודים {extra.yearName} סגורה – ההזמנה לקריאה בלבד.</p>}

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Info label="תלמיד">
            {extra.customer && (
              <>
                <div className="font-medium">
                  {extra.customer.last_name} {extra.customer.first_name}
                  <span className="mr-1 text-xs text-slate-400">מס׳ {extra.customer.number}</span>
                </div>
                {extra.customer.parent_name && <div className="text-sm text-slate-500">הורה: {extra.customer.parent_name}</div>}
                <Protect permId="customers_view_contact">
                  <div className="flex gap-3 text-sm">
                    {extra.customer.phone && <PhoneLink phone={extra.customer.phone} />}
                    {extra.customer.phone2 && <PhoneLink phone={extra.customer.phone2} />}
                  </div>
                </Protect>
              </>
            )}
          </Info>
          <Info label="מוסד / כיתה / שנה">
            <div className="font-medium">
              {extra.instName} · כיתה {extra.className}
            </div>
            <div className="text-sm text-slate-500">{extra.yearName}</div>
          </Info>
        </div>

        {/* סטטוס ומסירה */}
        <div className="mt-4 flex flex-wrap items-end gap-3 border-t border-slate-100 pt-4 print:hidden">
          <Field label="סטטוס">
            <select
              className={`${inputClass} w-auto`}
              value={order.status}
              disabled={!canEdit}
              onChange={(e) => void updateOrder({ status: e.target.value as OrderStatus }, 'הסטטוס עודכן')}
            >
              {ORDER_STATUSES.filter((s) => s !== 'cancelled').map((s) => (
                <option key={s} value={s}>{ORDER_STATUS_LABELS[s]}</option>
              ))}
              {order.status === 'cancelled' && <option value="cancelled">בוטלה</option>}
            </select>
          </Field>
          <Field label="אופן מסירה">
            <select
              className={`${inputClass} w-auto`}
              value={order.delivery_method}
              disabled={!canEdit}
              onChange={(e) => void updateOrder({ delivery_method: e.target.value as DeliveryMethod }, 'אופן המסירה עודכן')}
            >
              {(Object.keys(DELIVERY_LABELS) as DeliveryMethod[]).map((d) => (
                <option key={d} value={d}>{DELIVERY_LABELS[d]}</option>
              ))}
            </select>
          </Field>
          {order.delivery_method === 'institution_day' && extra.saleDay && (
            <span className="pb-2 text-sm text-slate-600">יום מכירה: {formatDate(extra.saleDay)}</span>
          )}
        </div>
        <NotesEditor key={order.notes ?? ''} notes={order.notes} canEdit={canEdit} onSave={(notes) => updateOrder({ notes }, 'ההערות נשמרו')} />
      </div>

      {/* ספרים */}
      <div className="rounded-xl bg-white p-4 shadow-sm">
        <div className="mb-3 flex items-center gap-2">
          <h2 className="flex-1 text-lg font-bold">ספרים ({active.length})</h2>
          {canEdit && (
            <Button variant="secondary" onClick={() => setAdding(true)} className="print:hidden">
              <Plus className="h-4 w-4" /> הוספת ספר
            </Button>
          )}
        </div>
        {advanced && order.status !== 'delivered' && (
          <p className="mb-3 flex items-center gap-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800 print:hidden">
            <AlertTriangle className="h-4 w-4" /> ההזמנה כבר במצב &quot;{ORDER_STATUS_LABELS[order.status]}&quot; – שינוי או ביטול ספרים עלול לחייב פירוק שקית.
          </p>
        )}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-slate-500">
              <tr>
                <th className="py-1.5 text-right">ספר</th>
                <th className="py-1.5 text-right">כמות</th>
                <th className="py-1.5 text-right">מחיר</th>
                <th className="py-1.5 text-right">סה״כ</th>
                <th className="py-1.5 text-right">ביטול עד</th>
                <th className="print:hidden" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {active.map((i) => {
                const late = isPast(i.cancel_deadline);
                return (
                  <tr key={i.id}>
                    <td className="py-2">
                      <div className="font-medium">{i.bookName}</div>
                      <div className="text-xs text-slate-400">
                        {i.bookCode} · {i.is_required ? 'חובה' : 'רשות'}
                      </div>
                    </td>
                    <td className="py-2">
                      <div className="flex items-center gap-1">
                        {canEdit || canCancel ? (
                          <>
                            <button type="button" disabled={!canCancel} onClick={() => changeQty(i, -1)} className="rounded border p-1 disabled:opacity-30 print:hidden" aria-label="פחות">
                              <Minus className="h-3.5 w-3.5" />
                            </button>
                            <span className="w-6 text-center">{i.qty}</span>
                            <button type="button" disabled={!canEdit} onClick={() => changeQty(i, 1)} className="rounded border p-1 disabled:opacity-30 print:hidden" aria-label="יותר">
                              <Plus className="h-3.5 w-3.5" />
                            </button>
                          </>
                        ) : (
                          i.qty
                        )}
                      </div>
                    </td>
                    <td className="py-2">{money(i.unit_price)}</td>
                    <td className="py-2 font-medium">{money(i.unit_price * i.qty)}</td>
                    <td className={`py-2 ${late ? 'text-red-600' : 'text-slate-600'}`}>
                      {formatDate(i.cancel_deadline) || '—'}
                      {late && <span className="mr-1 text-xs">(עבר)</span>}
                    </td>
                    <td className="py-2 text-left print:hidden">
                      {canCancel && (
                        <Button variant="ghost" onClick={() => setCancelTarget(i)} className="text-red-600">
                          <Ban className="h-4 w-4" /> ביטול
                        </Button>
                      )}
                    </td>
                  </tr>
                );
              })}
              {active.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-6 text-center text-slate-400">אין ספרים פעילים בהזמנה</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {cancelledItems.length > 0 && (
          <div className="mt-3 border-t border-slate-100 pt-3 print:hidden">
            <h3 className="mb-1 text-sm font-semibold text-slate-500">ספרים שבוטלו</h3>
            <ul className="space-y-1 text-sm text-slate-500">
              {cancelledItems.map((i) => (
                <li key={i.id} className="flex flex-wrap items-center gap-2">
                  <span className="line-through">{i.bookName} × {i.qty}</span>
                  <span className="text-xs">
                    {i.cancelled_at && new Date(i.cancelled_at).toLocaleDateString('he-IL')}
                    {i.cancelled_by_name && ` · ${i.cancelled_by_name}`}
                    {i.cancel_reason && ` · ${i.cancel_reason}`}
                  </span>
                  {i.cancelled_late && <span className="rounded bg-red-50 px-1.5 text-xs text-red-700">ביטול אחרי המועד</span>}
                  {canEdit && (
                    <button type="button" onClick={() => restore(i)} className="inline-flex items-center gap-1 text-xs text-blue-700 hover:underline">
                      <RotateCcw className="h-3 w-3" /> החזרה
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}

        <Totals order={order} locked={locked} onSaveDiscount={(discount, discount_reason) => updateOrder({ discount, discount_reason }, 'ההנחה עודכנה')} />
        <OrderPayments order={order} onChanged={reload} />
      </div>

      {/* היסטוריה */}
      <div className="rounded-xl bg-white p-4 shadow-sm print:hidden">
        <h2 className="mb-2 flex items-center gap-2 text-lg font-bold">
          <History className="h-5 w-5 text-slate-500" /> היסטוריית שינויים
        </h2>
        <ul className="space-y-1.5 text-sm">
          {events.map((e) => (
            <li key={e.id} className="flex flex-wrap gap-x-3">
              <span className="w-32 shrink-0 text-slate-400">
                {new Date(e.created_at).toLocaleString('he-IL', { dateStyle: 'short', timeStyle: 'short' })}
              </span>
              <span className="w-28 shrink-0 text-slate-600">{e.user_name ?? 'מערכת'}</span>
              <span className="flex-1">{e.description}</span>
            </li>
          ))}
        </ul>
      </div>

      {cancelTarget && (
        <CancelModal
          target={cancelTarget}
          order={order}
          items={active}
          onClose={() => setCancelTarget(null)}
          onDone={async () => {
            setCancelTarget(null);
            await reload();
          }}
        />
      )}
      {adding && (
        <AddBookModal
          order={order}
          items={items}
          onClose={() => setAdding(false)}
          onDone={async () => {
            setAdding(false);
            await reload();
          }}
        />
      )}
    </div>
  );
}

function Info({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-0.5 text-xs text-slate-400">{label}</div>
      {children}
    </div>
  );
}

function NotesEditor({ notes, canEdit, onSave }: { notes: string | null; canEdit: boolean; onSave: (n: string | null) => void }) {
  const [value, setValue] = useState(notes ?? '');
  if (!canEdit && !notes) return null;
  return (
    <div className="mt-3 flex items-end gap-2">
      <Field label="הערות" className="flex-1">
        <textarea className={inputClass} rows={2} value={value} disabled={!canEdit} onChange={(e) => setValue(e.target.value)} />
      </Field>
      {canEdit && value !== (notes ?? '') && (
        <Button variant="success" onClick={() => onSave(value.trim() || null)} className="print:hidden">
          <Save className="h-4 w-4" />
        </Button>
      )}
    </div>
  );
}

function Totals({
  order,
  locked,
  onSaveDiscount,
}: {
  order: OrderRow;
  locked: boolean;
  onSaveDiscount: (discount: number, reason: string | null) => void;
}) {
  const { hasPermission } = useAuth();
  const [editing, setEditing] = useState(false);
  const [discount, setDiscount] = useState(String(order.discount || ''));
  const [reason, setReason] = useState(order.discount_reason ?? '');
  const canDiscount = hasPermission('orders_discount') && !locked;

  return (
    <div className="mt-4 space-y-1 border-t border-slate-200 pt-3 text-sm">
      <Row label="סכום הספרים">{money(order.subtotal)}</Row>
      {editing ? (
        <div className="flex flex-wrap items-end gap-2 py-1 print:hidden">
          <Field label="הנחה (₪)">
            <input className={`${inputClass} w-28`} inputMode="decimal" value={discount} onChange={(e) => setDiscount(e.target.value)} autoFocus />
          </Field>
          <Field label="סיבה" className="flex-1">
            <input className={inputClass} value={reason} onChange={(e) => setReason(e.target.value)} />
          </Field>
          <Button
            variant="success"
            onClick={() => {
              onSaveDiscount(Math.max(0, toNumber(discount) ?? 0), reason.trim() || null);
              setEditing(false);
            }}
          >
            שמירה
          </Button>
          <Button variant="secondary" onClick={() => setEditing(false)}>ביטול</Button>
        </div>
      ) : (
        <Row label={`הנחה${order.discount_reason ? ` (${order.discount_reason})` : ''}`}>
          <span className="text-emerald-700">{order.discount ? `− ${money(order.discount)}` : '—'}</span>
          {canDiscount && (
            <button type="button" onClick={() => setEditing(true)} className="mr-2 text-xs text-blue-700 hover:underline print:hidden">
              {order.discount ? 'שינוי' : 'הוספת הנחה'}
            </button>
          )}
        </Row>
      )}
      <Row label="סה״כ לתשלום" strong>{money(order.total)}</Row>
      <Protect permId="finance_view" lockedFallback={null}>
        <Row label="שולם">{money(order.paid_amount)}</Row>
        <Row label="יתרה" strong>
          <span className={order.balance > 0 && order.status !== 'cancelled' ? 'text-red-600' : ''}>{money(order.balance)}</span>
        </Row>
      </Protect>
    </div>
  );
}

function Row({ label, children, strong }: { label: string; children: React.ReactNode; strong?: boolean }) {
  return (
    <div className={`flex justify-between gap-4 ${strong ? 'text-base font-bold' : ''}`}>
      <span className="text-slate-600">{label}</span>
      <span>{children}</span>
    </div>
  );
}

function CancelModal({
  target,
  order,
  items,
  onClose,
  onDone,
}: {
  target: ItemRow | 'order';
  order: OrderRow;
  items: ItemRow[];
  onClose: () => void;
  onDone: () => void;
}) {
  const { hasPermission } = useAuth();
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const isOrder = target === 'order';
  const lateItems = useMemo(
    () => (isOrder ? items : [target as ItemRow]).filter((i) => isPast(i.cancel_deadline)),
    [isOrder, items, target]
  );
  const canLate = hasPermission('orders_cancel_late');
  const blocked = lateItems.length > 0 && !canLate;
  const advanced = ADVANCED_STATUSES.includes(order.status);

  const run = async () => {
    setSaving(true);
    const { error } = isOrder
      ? await supabase.from('orders').update({ status: 'cancelled', cancel_reason: reason.trim() || null }).eq('id', order.id)
      : await supabase
          .from('order_items')
          .update({ status: 'cancelled', cancel_reason: reason.trim() || null })
          .eq('id', (target as ItemRow).id);
    setSaving(false);
    if (error) return toast.error(dbErrorMessage(error.message));
    toast.success(isOrder ? 'ההזמנה בוטלה' : 'הספר בוטל');
    onDone();
  };

  return (
    <Modal
      title={isOrder ? `ביטול הזמנה ${order.number}` : `ביטול ספר: ${(target as ItemRow).bookName}`}
      onClose={onClose}
      size="md"
      footer={
        <>
          <Button variant="danger" onClick={run} loading={saving} disabled={blocked}>
            <Ban className="h-4 w-4" /> {isOrder ? 'ביטול ההזמנה' : 'ביטול הספר'}
          </Button>
          <Button variant="secondary" onClick={onClose}>חזרה</Button>
        </>
      }
    >
      <div className="space-y-3 rounded-xl bg-white p-4">
        {lateItems.length > 0 && (
          <p className={`flex items-start gap-2 rounded-lg px-3 py-2 text-sm ${blocked ? 'bg-red-50 text-red-800' : 'bg-amber-50 text-amber-800'}`}>
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              עבר המועד האחרון לביטול: {lateItems.map((i) => `${i.bookName} (${formatDate(i.cancel_deadline)})`).join(', ')}.{' '}
              {blocked
                ? 'אין לך הרשאה לבטל אחרי המועד האחרון – יש לפנות למנהל.'
                : 'יש לך הרשאה לבטל – הביטול יסומן "אחרי המועד".'}
            </span>
          </p>
        )}
        {advanced && (
          <p className="flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            ההזמנה כבר במצב &quot;{ORDER_STATUS_LABELS[order.status]}&quot; – ייתכן שהספרים כבר הוזמנו מהספק או נארזו.
          </p>
        )}
        {isOrder && <p className="text-sm">כל {items.length} הספרים בהזמנה יבוטלו. אי אפשר לפתוח הזמנה שבוטלה (אפשר להעתיק אותה).</p>}
        {!blocked && (
          <Field label="סיבת הביטול">
            <input className={inputClass} value={reason} onChange={(e) => setReason(e.target.value)} autoFocus />
          </Field>
        )}
      </div>
    </Modal>
  );
}

function AddBookModal({
  order,
  items,
  onClose,
  onDone,
}: {
  order: OrderRow;
  items: ItemRow[];
  onClose: () => void;
  onDone: () => void;
}) {
  const [options, setOptions] = useState<ClassBookOption[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void fetchClassBookOptions(order.class_id).then((o) => !cancelled && setOptions(o));
    return () => {
      cancelled = true;
    };
  }, [order.class_id]);

  const add = async (cb: ClassBookOption) => {
    setBusy(cb.book_id);
    const existing = items.find((i) => i.book_id === cb.book_id);
    const { error } = existing
      ? await supabase.from('order_items').update({ status: 'active', qty: cb.qty_per_student }).eq('id', existing.id)
      : await supabase.from('order_items').insert({ order_id: order.id, book_id: cb.book_id, qty: cb.qty_per_student });
    setBusy(null);
    if (error) return toast.error(dbErrorMessage(error.message));
    toast.success(`נוסף: ${cb.bookName}`);
    onDone();
  };

  const activeIds = new Set(items.filter((i) => i.status === 'active').map((i) => i.book_id));
  const available = (options ?? []).filter((o) => !activeIds.has(o.book_id));

  return (
    <Modal title="הוספת ספר מרשימת הכיתה" onClose={onClose} size="md">
      {!options ? (
        <Spinner />
      ) : available.length === 0 ? (
        <p className="text-sm text-slate-500">כל הספרים של הכיתה כבר בהזמנה.</p>
      ) : (
        <ul className="divide-y divide-slate-100 rounded-xl bg-white">
          {available.map((cb) => (
            <li key={cb.id} className="flex items-center gap-3 px-3 py-2.5">
              <div className="flex-1">
                <div className="font-medium">{cb.bookName}</div>
                <div className="text-xs text-slate-400">
                  {cb.is_required ? 'חובה' : 'רשות'} · {money(cb.sale_price)}
                  {isPast(cb.order_deadline) && <span className="text-red-600"> · עבר המועד להזמנה</span>}
                </div>
              </div>
              <Button onClick={() => add(cb)} loading={busy === cb.book_id}>
                <Plus className="h-4 w-4" /> הוספה
              </Button>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
}
