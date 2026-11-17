'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { ArrowRight, Ban, CheckCircle2, FileSpreadsheet, Lock, LockOpen, PackageCheck, Plus, Printer, Send, Undo2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/components/AuthContext';
import { PageGuard, Protect } from '@/components/Protect';
import { PoStatusBadge } from '@/components/purchasing/PoStatusBadge';
import { BookPicker } from '@/components/BookPicker';
import DateInput from '@/components/DateInput';
import { Button, EmptyState, Field, inputClass, Modal, Spinner } from '@/components/ui';
import { toast } from '@/components/Toaster';
import { dbErrorMessage } from '@/lib/dbErrors';
import { exportToExcel } from '@/lib/excel';
import { formatDate, money, nullIfEmpty, toNumber } from '@/lib/format';
import { fetchBooks, type Book } from '@/lib/entities';
import {
  fetchIyNames,
  outstanding,
  PO_COLUMNS,
  PO_ITEM_COLUMNS,
  type IyName,
  type PoAllocation,
  type PoItem,
  type PurchaseOrder,
} from '@/lib/purchasing';

export default function PurchaseOrderPage() {
  return (
    <PageGuard permId={['po_view', 'receiving_do']}>
      <PoScreen />
    </PageGuard>
  );
}

type Receipt = { id: string; received_at: string; received_by_name: string | null; notes: string | null; lines: { po_item_id: string; qty_good: number; qty_damaged: number; qty_wrong: number }[] };
type ItemFull = PoItem & { book: Book | undefined; allocations: PoAllocation[]; cost: number | null; sku: string | null };

async function fetchPo(id: string, canSeeCost: boolean) {
  const { data: po } = await supabase.from('purchase_orders').select(`${PO_COLUMNS}, suppliers(name, phone, email)`).eq('id', id).maybeSingle();
  if (!po) return null;
  const [{ data: items }, { data: allocs }, costs, { data: receipts }, books, iys] = await Promise.all([
    supabase.from('po_items').select(PO_ITEM_COLUMNS).eq('po_id', id),
    supabase.from('po_item_allocations').select('id, po_item_id, institution_year_id, qty, po_items!inner(po_id)').eq('po_items.po_id', id),
    canSeeCost
      ? supabase.from('po_item_costs').select('po_item_id, unit_cost, po_items!inner(po_id)').eq('po_items.po_id', id)
      : Promise.resolve({ data: [] as { po_item_id: string; unit_cost: number | null }[] }),
    supabase.from('po_receipts').select('id, received_at, received_by_name, notes, po_receipt_lines(po_item_id, qty_good, qty_damaged, qty_wrong)').eq('po_id', id).order('received_at', { ascending: false }),
    fetchBooks(),
    fetchIyNames(po.year_id),
  ]);
  const skus = canSeeCost
    ? (await supabase.from('book_suppliers').select('book_id, supplier_sku').eq('supplier_id', po.supplier_id)).data ?? []
    : [];
  const bookMap = new Map(books.map((b) => [b.id, b]));
  const costMap = new Map((costs.data ?? []).map((c) => [c.po_item_id, c.unit_cost]));
  const fullItems: ItemFull[] = (items ?? [])
    .map((it) => ({
      ...it,
      book: bookMap.get(it.book_id),
      allocations: ((allocs ?? []) as unknown as PoAllocation[]).filter((a) => a.po_item_id === it.id),
      cost: costMap.get(it.id) ?? null,
      sku: skus.find((s) => s.book_id === it.book_id)?.supplier_sku ?? null,
    }))
    .sort((a, b) => (a.book?.name ?? '').localeCompare(b.book?.name ?? '', 'he'));
  const sup = po.suppliers as unknown as { name: string; phone: string | null; email: string | null } | null;
  return {
    po: po as unknown as PurchaseOrder,
    supplier: sup,
    items: fullItems,
    receipts: (receipts ?? []).map((r) => ({ ...r, lines: (r.po_receipt_lines as Receipt['lines']) ?? [] })) as Receipt[],
    iys,
    books,
  };
}

function PoScreen() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { hasPermission } = useAuth();
  const canSeeCost = hasPermission('books_view_cost');
  const [data, setData] = useState<Awaited<ReturnType<typeof fetchPo>> | undefined>(undefined);
  const [closing, setClosing] = useState(false);
  const [returning, setReturning] = useState<ItemFull | null>(null);

  const reload = useCallback(async () => setData(await fetchPo(id, canSeeCost)), [id, canSeeCost]);
  useEffect(() => {
    let cancelled = false;
    void fetchPo(id, canSeeCost).then((d) => !cancelled && setData(d));
    return () => {
      cancelled = true;
    };
  }, [id, canSeeCost]);

  if (data === undefined) return <Spinner />;
  if (data === null) return <EmptyState>הזמנת הרכש לא נמצאה</EmptyState>;
  const { po, supplier, items, receipts, iys, books } = data;
  const canManage = hasPermission('po_manage');
  const editable = canManage && ['draft', 'sent', 'partial', 'received'].includes(po.status);
  const anyReceived = items.some((i) => i.qty_received + i.qty_damaged + i.qty_wrong > 0);
  const totalOrdered = items.reduce((s, i) => s + i.qty_ordered, 0);
  const totalReceived = items.reduce((s, i) => s + i.qty_received, 0);
  const totalCost = items.reduce((s, i) => s + i.qty_ordered * (i.cost ?? 0), 0);

  const setStatus = async (status: string, note?: string, confirmText?: string) => {
    if (confirmText && !window.confirm(confirmText)) return;
    const { error } = await supabase.rpc('set_po_status', { p_po: po.id, p_status: status, p_note: note });
    if (error) return toast.error(dbErrorMessage(error.message));
    toast.success('עודכן');
    await reload();
  };

  const updatePo = async (patch: { notes?: string | null; expected_date?: string | null }) => {
    const { error } = await supabase.from('purchase_orders').update(patch).eq('id', po.id);
    if (error) return toast.error(dbErrorMessage(error.message));
    await reload();
  };

  const setAllocQty = async (it: ItemFull, iy: string | null, value: string) => {
    const q = Math.max(toNumber(value) ?? 0, 0);
    const existing = it.allocations.find((a) => a.institution_year_id === iy);
    if (existing && existing.qty === q) return;
    const { error } = existing
      ? q === 0 && it.allocations.length > 1
        ? await supabase.from('po_item_allocations').delete().eq('id', existing.id)
        : await supabase.from('po_item_allocations').update({ qty: q }).eq('id', existing.id)
      : q > 0
        ? await supabase.from('po_item_allocations').insert({ po_item_id: it.id, institution_year_id: iy, qty: q })
        : { error: null };
    if (error) return toast.error(dbErrorMessage(error.message));
    await reload();
  };

  const setCost = async (it: ItemFull, value: string) => {
    const c = toNumber(value);
    if (c === it.cost) return;
    const { error } = await supabase.from('po_item_costs').upsert({ po_item_id: it.id, unit_cost: c });
    if (error) return toast.error(dbErrorMessage(error.message));
    await reload();
  };

  const addBook = async (book: Book) => {
    const qtyText = window.prompt(`כמה יחידות של "${book.name}" להזמין? (יירשמו כרזרבה – אפשר לחלק למוסדות אחר כך)`, '1');
    const q = Math.max(toNumber(qtyText) ?? 0, 0);
    if (!q) return;
    const { data: it, error } = await supabase.from('po_items').insert({ po_id: po.id, book_id: book.id }).select('id').single();
    if (error) return toast.error(dbErrorMessage(error.message));
    const { error: e2 } = await supabase.from('po_item_allocations').insert({ po_item_id: it.id, institution_year_id: null, qty: q });
    if (e2) return toast.error(dbErrorMessage(e2.message));
    await reload();
  };

  const removeItem = async (it: ItemFull) => {
    if (!window.confirm(`להסיר את "${it.book?.name}" מהזמנת הרכש?`)) return;
    const { error } = await supabase.from('po_items').delete().eq('id', it.id);
    if (error) return toast.error(dbErrorMessage(error.message));
    await reload();
  };

  const exportForSupplier = () =>
    exportToExcel(`הזמנת רכש ${po.number} – ${supplier?.name ?? ''}`, [
      {
        name: `הזמנה ${po.number}`,
        rows: items.map((i) => ({
          'קוד ספר': i.book?.code,
          'מק״ט ספק': i.sku ?? '',
          'שם הספר': i.book?.name,
          'הוצאה לאור': i.book?.publisher ?? '',
          כמות: i.qty_ordered,
          ...(canSeeCost ? { 'מחיר ליחידה': i.cost ?? '', 'סה״כ': i.cost != null ? i.cost * i.qty_ordered : '' } : {}),
          התקבל: i.qty_received,
          חסר: outstanding(i),
        })),
      },
      {
        name: 'חלוקה למוסדות',
        rows: items.flatMap((i) =>
          i.allocations.map((a) => ({
            ספר: i.book?.name,
            מוסד: a.institution_year_id ? iys.get(a.institution_year_id)?.name ?? '' : 'רזרבה',
            כמות: a.qty,
          }))
        ),
      },
    ]);

  const iyOptions = [...iys.values()].sort((a, b) => a.name.localeCompare(b.name, 'he'));
  const existingBooks = new Set(items.map((i) => i.book_id));

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <div className="flex flex-wrap items-center gap-2 print:hidden">
        <Button variant="ghost" onClick={() => router.push('/purchase-orders')}>
          <ArrowRight className="h-4 w-4" /> להזמנות הרכש
        </Button>
        <div className="flex-1" />
        <Protect permId="export_excel">
          <Button variant="secondary" onClick={exportForSupplier}>
            <FileSpreadsheet className="h-4 w-4" /> אקסל לספק
          </Button>
        </Protect>
        <Button variant="secondary" onClick={() => window.print()}>
          <Printer className="h-4 w-4" /> הדפסה
        </Button>
        {['sent', 'partial', 'received'].includes(po.status) && (
          <Protect permId="receiving_do">
            <Link href={`/receiving?po=${po.id}`} className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-700">
              <PackageCheck className="h-4 w-4" /> קליטת סחורה
            </Link>
          </Protect>
        )}
      </div>

      <div className="rounded-xl bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-bold">הזמנת רכש {po.number}</h1>
          <PoStatusBadge status={po.status} />
          <span className="text-sm text-slate-500">
            {supplier?.name} · נוצרה {new Date(po.created_at).toLocaleDateString('he-IL')}
            {po.created_by_name && ` ע״י ${po.created_by_name}`}
            {po.order_date && ` · נשלחה ${formatDate(po.order_date)}`}
          </span>
        </div>
        {po.status === 'closed' && (
          <p className="mt-2 rounded-lg bg-slate-100 px-3 py-2 text-sm">
            נסגרה {po.closed_at && new Date(po.closed_at).toLocaleDateString('he-IL')} {po.closed_by_name && `ע״י ${po.closed_by_name}`}
            {po.close_note && ` – ${po.close_note}`}
          </p>
        )}

        {/* פעולות סטטוס */}
        <div className="mt-3 flex flex-wrap gap-2 print:hidden">
          {po.status === 'draft' && (
            <Protect permId="po_manage">
              <Button onClick={() => setStatus('sent', undefined, 'לסמן שההזמנה נשלחה לספק? אחרי זה אפשר לקלוט סחורה.')}>
                <Send className="h-4 w-4" /> סימון: נשלחה לספק
              </Button>
            </Protect>
          )}
          {po.status === 'sent' && !anyReceived && (
            <Protect permId="po_manage">
              <Button variant="secondary" onClick={() => setStatus('draft')}>
                <Undo2 className="h-4 w-4" /> החזרה לטיוטה
              </Button>
            </Protect>
          )}
          {['sent', 'partial', 'received'].includes(po.status) && (
            <Protect permId="po_close">
              <Button variant="secondary" onClick={() => setClosing(true)}>
                <Lock className="h-4 w-4" /> סגירת ההזמנה
              </Button>
            </Protect>
          )}
          {po.status === 'closed' && (
            <Protect permId="po_close">
              <Button variant="secondary" onClick={() => setStatus('reopen')}>
                <LockOpen className="h-4 w-4" /> פתיחה מחדש
              </Button>
            </Protect>
          )}
          {['draft', 'sent'].includes(po.status) && !anyReceived && (
            <Protect permId="po_manage">
              <Button variant="danger" onClick={() => setStatus('cancelled', undefined, 'לבטל את הזמנת הרכש?')}>
                <Ban className="h-4 w-4" /> ביטול
              </Button>
            </Protect>
          )}
        </div>

        <div className="mt-3 grid gap-3 border-t border-slate-100 pt-3 sm:grid-cols-3 print:hidden">
          <Field label="צפי אספקה">
            <DateInput value={po.expected_date ?? ''} disabled={!editable} onChange={(v) => void updatePo({ expected_date: v || null })} />
          </Field>
          <Field label="הערות" className="sm:col-span-2">
            <input
              className={inputClass}
              disabled={!editable}
              defaultValue={po.notes ?? ''}
              key={po.notes ?? ''}
              onBlur={(e) => nullIfEmpty(e.target.value) !== po.notes && void updatePo({ notes: nullIfEmpty(e.target.value) })}
            />
          </Field>
        </div>
      </div>

      {/* ספרים */}
      <div className="rounded-xl bg-white p-4 shadow-sm">
        <div className="mb-3 flex flex-wrap items-center gap-3">
          <h2 className="flex-1 text-lg font-bold">
            ספרים ({items.length}) · הוזמנו {totalOrdered} · התקבלו {totalReceived}
            {canSeeCost && totalCost > 0 && <span className="mr-2 text-sm font-normal text-slate-500">· {money(totalCost)}</span>}
          </h2>
          {editable && ['draft', 'sent'].includes(po.status) && (
            <div className="w-full sm:w-80 print:hidden">
              <BookPicker books={books} excludeIds={existingBooks} onPick={addBook} placeholder="הוספת ספר להזמנה..." />
            </div>
          )}
        </div>

        <div className="space-y-3">
          {items.map((it) => {
            const short = outstanding(it);
            const extra = Math.max(it.qty_received - it.qty_ordered, 0);
            return (
              <div key={it.id} className="rounded-lg border border-slate-200 p-3">
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                  <div className="min-w-48 flex-1">
                    <div className="font-semibold">{it.book?.name}</div>
                    <div className="text-xs text-slate-400">
                      {it.book?.code}
                      {it.sku && ` · מק״ט ספק ${it.sku}`}
                    </div>
                  </div>
                  <Stat label="הוזמן" value={it.qty_ordered} />
                  <Stat label="התקבל" value={it.qty_received} tone="good" />
                  <Stat label="חסר" value={short} tone={short ? 'bad' : undefined} />
                  {extra > 0 && <Stat label="עודף" value={extra} tone="warn" />}
                  {it.qty_damaged > 0 && <Stat label="פגומים" value={it.qty_damaged} tone="warn" />}
                  {it.qty_wrong > 0 && <Stat label="שגויים" value={it.qty_wrong} tone="warn" />}
                  {it.qty_returned > 0 && <Stat label="הוחזרו" value={it.qty_returned} />}
                  {canSeeCost && (
                    <label className="text-xs text-slate-500">
                      מחיר ליח׳
                      <input
                        className={`${inputClass} mt-0.5 w-20`}
                        inputMode="decimal"
                        disabled={!editable}
                        defaultValue={it.cost ?? ''}
                        onBlur={(e) => void setCost(it, e.target.value)}
                      />
                    </label>
                  )}
                  <div className="flex gap-1 print:hidden">
                    {canManage && (it.qty_damaged + it.qty_wrong + extra > 0) && (
                      <Button variant="ghost" onClick={() => setReturning(it)}>החזרה לספק</Button>
                    )}
                    {editable && ['draft', 'sent'].includes(po.status) && it.qty_received + it.qty_damaged + it.qty_wrong === 0 && (
                      <Button variant="ghost" onClick={() => removeItem(it)} className="text-red-600">הסרה</Button>
                    )}
                  </div>
                </div>
                {it.shortage_note && <p className="mt-1 text-xs text-slate-500">טיפול בחוסר: {it.shortage_note}</p>}

                {/* חלוקה למוסדות */}
                <div className="mt-2 flex flex-wrap gap-2 print:hidden">
                  {it.allocations
                    .slice()
                    .sort((a, b) => (a.institution_year_id ? 0 : 1) - (b.institution_year_id ? 0 : 1))
                    .map((a) => (
                      <label key={a.id} className="flex items-center gap-1 rounded-lg bg-slate-50 px-2 py-1 text-xs">
                        {a.institution_year_id ? iys.get(a.institution_year_id)?.name ?? 'מוסד' : 'רזרבה'}
                        <input
                          className="w-14 rounded border border-slate-300 px-1 py-0.5 text-sm"
                          inputMode="numeric"
                          disabled={!editable}
                          defaultValue={a.qty}
                          onBlur={(e) => void setAllocQty(it, a.institution_year_id, e.target.value)}
                        />
                      </label>
                    ))}
                  {editable && <AddAllocation item={it} iyOptions={iyOptions} onAdd={(iy, q) => setAllocQty(it, iy, String(q))} />}
                </div>
                <div className="mt-1 hidden text-xs print:block">
                  {it.allocations.map((a) => `${a.institution_year_id ? iys.get(a.institution_year_id)?.name : 'רזרבה'}: ${a.qty}`).join(' · ')}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* קליטות */}
      <div className="rounded-xl bg-white p-4 shadow-sm print:hidden">
        <h2 className="mb-2 text-lg font-bold">היסטוריית קליטה ({receipts.length})</h2>
        {receipts.length === 0 && <p className="text-sm text-slate-400">עדיין לא נקלטה סחורה.</p>}
        <ul className="space-y-2 text-sm">
          {receipts.map((r) => (
            <li key={r.id} className="rounded-lg bg-slate-50 px-3 py-2">
              <div className="font-medium">
                {new Date(r.received_at).toLocaleString('he-IL', { dateStyle: 'short', timeStyle: 'short' })}
                {r.received_by_name && ` · ${r.received_by_name}`}
                {r.notes && <span className="font-normal text-slate-500"> · {r.notes}</span>}
              </div>
              <div className="text-slate-600">
                {r.lines
                  .map((l) => {
                    const b = items.find((i) => i.id === l.po_item_id)?.book?.name;
                    return `${b}: ${l.qty_good}${l.qty_damaged ? ` (+${l.qty_damaged} פגומים)` : ''}${l.qty_wrong ? ` (+${l.qty_wrong} שגויים)` : ''}`;
                  })
                  .join(' · ')}
              </div>
            </li>
          ))}
        </ul>
      </div>

      {closing && (
        <CloseModal
          items={items}
          onClose={() => setClosing(false)}
          onConfirm={async (note) => {
            setClosing(false);
            await setStatus('closed', note);
          }}
        />
      )}
      {returning && (
        <ReturnModal
          item={returning}
          onClose={() => setReturning(null)}
          onDone={async () => {
            setReturning(null);
            await reload();
          }}
        />
      )}
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: 'good' | 'bad' | 'warn' }) {
  const color = tone === 'good' ? 'text-emerald-700' : tone === 'bad' ? 'text-red-600' : tone === 'warn' ? 'text-amber-700' : 'text-slate-700';
  return (
    <div className="text-center">
      <div className="text-[11px] text-slate-400">{label}</div>
      <div className={`text-base font-bold ${color}`}>{value}</div>
    </div>
  );
}

function AddAllocation({ item, iyOptions, onAdd }: { item: ItemFull; iyOptions: IyName[]; onAdd: (iy: string | null, q: number) => void }) {
  const [iy, setIy] = useState('');
  const used = new Set(item.allocations.map((a) => a.institution_year_id ?? 'reserve'));
  const options = iyOptions.filter((o) => !used.has(o.id));
  return (
    <span className="flex items-center gap-1 text-xs">
      <select className="rounded border border-slate-300 px-1 py-0.5" value={iy} onChange={(e) => setIy(e.target.value)}>
        <option value="">+ חלוקה למוסד...</option>
        {!used.has('reserve') && <option value="reserve">רזרבה</option>}
        {options.map((o) => (
          <option key={o.id} value={o.id}>{o.name}</option>
        ))}
      </select>
      {iy && (
        <button
          type="button"
          className="rounded bg-blue-600 px-2 py-0.5 text-white"
          onClick={() => {
            const q = toNumber(window.prompt('כמות:', '1'));
            if (q && q > 0) onAdd(iy === 'reserve' ? null : iy, q);
            setIy('');
          }}
        >
          <Plus className="h-3 w-3" />
        </button>
      )}
    </span>
  );
}

function CloseModal({ items, onClose, onConfirm }: { items: ItemFull[]; onClose: () => void; onConfirm: (note?: string) => void }) {
  const short = useMemo(() => items.filter((i) => outstanding(i) > 0 && !i.shortage_note), [items]);
  const [note, setNote] = useState('');
  return (
    <Modal
      title="סגירת הזמנת רכש"
      onClose={onClose}
      size="md"
      footer={
        <>
          <Button variant="success" onClick={() => onConfirm(note.trim() || undefined)} disabled={short.length > 0 && !note.trim()}>
            <CheckCircle2 className="h-4 w-4" /> סגירה
          </Button>
          <Button variant="secondary" onClick={onClose}>חזרה</Button>
        </>
      }
    >
      <div className="space-y-3 rounded-xl bg-white p-4 text-sm">
        {short.length === 0 ? (
          <p>כל הספרים התקבלו. אפשר לסגור.</p>
        ) : (
          <>
            <p className="rounded-lg bg-amber-50 px-3 py-2 text-amber-800">
              יש חוסרים פתוחים: {short.map((i) => `${i.book?.name} (${outstanding(i)})`).join(', ')}. כדי לסגור יש לרשום איך מטפלים בחוסר.
            </p>
            <Field label="טיפול בחוסר">
              <input className={inputClass} value={note} onChange={(e) => setNote(e.target.value)} placeholder="למשל: יוזמן בסבב הבא / הספק לא יספק / הוזמן מספק אחר" autoFocus />
            </Field>
          </>
        )}
      </div>
    </Modal>
  );
}

function ReturnModal({ item, onClose, onDone }: { item: ItemFull; onClose: () => void; onDone: () => void }) {
  const extra = Math.max(item.qty_received - item.qty_ordered, 0);
  const kinds = [
    { k: 'damaged', label: `פגומים (${item.qty_damaged})`, max: item.qty_damaged },
    { k: 'wrong', label: `שגויים (${item.qty_wrong})`, max: item.qty_wrong },
    { k: 'excess', label: `עודף (${extra}) – יוצא מהמלאי`, max: extra },
  ].filter((x) => x.max > 0);
  const [kind, setKind] = useState(kinds[0]?.k ?? 'damaged');
  const [qty, setQty] = useState('1');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);

  const run = async () => {
    setSaving(true);
    const { error } = await supabase.rpc('return_to_supplier', {
      p_po_item: item.id,
      p_qty: Math.max(toNumber(qty) ?? 0, 0),
      p_kind: kind,
      p_reason: reason.trim() || undefined,
    });
    setSaving(false);
    if (error) return toast.error(dbErrorMessage(error.message));
    toast.success('ההחזרה נרשמה');
    onDone();
  };

  return (
    <Modal
      title={`החזרה לספק: ${item.book?.name}`}
      onClose={onClose}
      size="md"
      footer={
        <>
          <Button variant="success" onClick={run} loading={saving}>רישום החזרה</Button>
          <Button variant="secondary" onClick={onClose}>ביטול</Button>
        </>
      }
    >
      <div className="grid gap-3 rounded-xl bg-white p-4 sm:grid-cols-3">
        <Field label="סוג">
          <select className={inputClass} value={kind} onChange={(e) => setKind(e.target.value)}>
            {kinds.map((x) => (
              <option key={x.k} value={x.k}>{x.label}</option>
            ))}
          </select>
        </Field>
        <Field label="כמות">
          <input className={inputClass} inputMode="numeric" value={qty} onChange={(e) => setQty(e.target.value)} />
        </Field>
        <Field label="סיבה">
          <input className={inputClass} value={reason} onChange={(e) => setReason(e.target.value)} />
        </Field>
        {item.qty_returned > 0 && <p className="text-xs text-slate-500 sm:col-span-3">כבר הוחזרו {item.qty_returned} יחידות מהספר הזה.</p>}
      </div>
    </Modal>
  );
}
