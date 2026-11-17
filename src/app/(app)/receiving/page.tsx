'use client';

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowRight, CheckCheck, Minus, PackageCheck, Plus, Truck } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useYear } from '@/components/YearContext';
import { PageGuard } from '@/components/Protect';
import { PoStatusBadge } from '@/components/purchasing/PoStatusBadge';
import { Button, EmptyState, Field, inputClass, PageHeader, Spinner } from '@/components/ui';
import { toast } from '@/components/Toaster';
import { dbErrorMessage } from '@/lib/dbErrors';
import { formatDate } from '@/lib/format';
import { fetchIyNames, outstanding, PO_COLUMNS, PO_ITEM_COLUMNS, type IyName, type PoItem, type PurchaseOrder } from '@/lib/purchasing';

export default function ReceivingPage() {
  return (
    <PageGuard permId="receiving_do">
      <Suspense fallback={<Spinner />}>
        <ReceivingScreen />
      </Suspense>
    </PageGuard>
  );
}

type PoCard = PurchaseOrder & { supplierName: string; outstanding: number };

function ReceivingScreen() {
  const { year } = useYear();
  const params = useSearchParams();
  const router = useRouter();
  const poId = params.get('po');
  const [pos, setPos] = useState<PoCard[] | null>(null);
  const yearId = year?.id ?? null;

  useEffect(() => {
    if (!yearId || poId) return;
    let cancelled = false;
    void supabase
      .from('purchase_orders')
      .select(`${PO_COLUMNS}, suppliers(name), po_items(qty_ordered, qty_received)`)
      .eq('year_id', yearId)
      .in('status', ['sent', 'partial'])
      .order('expected_date', { ascending: true, nullsFirst: false })
      .then(({ data }) => {
        if (cancelled) return;
        setPos(
          (data ?? []).map((p) => ({
            ...(p as unknown as PurchaseOrder),
            supplierName: (p.suppliers as unknown as { name: string } | null)?.name ?? '',
            outstanding: ((p.po_items as unknown as PoItem[]) ?? []).reduce((s, i) => s + outstanding(i), 0),
          }))
        );
      });
    return () => {
      cancelled = true;
    };
  }, [yearId, poId]);

  if (!year) return <EmptyState>יש לפתוח שנת לימודים.</EmptyState>;
  if (poId) return <ReceiveForm key={poId} poId={poId} onBack={() => router.push('/receiving')} />;
  if (!pos) return <Spinner />;

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader title="קליטת סחורה" />
      {pos.length === 0 ? (
        <EmptyState>אין הזמנות רכש שממתינות לסחורה.</EmptyState>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {pos.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => router.push(`/receiving?po=${p.id}`)}
              className="flex items-center gap-4 rounded-2xl border border-slate-200 bg-white p-5 text-right shadow-sm hover:border-blue-400 hover:bg-blue-50"
            >
              <Truck className="h-10 w-10 shrink-0 text-blue-600" />
              <div className="flex-1">
                <div className="text-lg font-bold">{p.supplierName}</div>
                <div className="text-sm text-slate-500">
                  הזמנה {p.number}
                  {p.expected_date && ` · צפי ${formatDate(p.expected_date)}`}
                </div>
                <div className="mt-1 flex items-center gap-2">
                  <PoStatusBadge status={p.status} />
                  <span className="text-sm font-medium text-red-600">ממתינים {p.outstanding} יח׳</span>
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

type Line = { good: number; damaged: number; wrong: number };
type ItemRow = PoItem & { bookName: string; bookCode: string; destinations: { name: string; qty: number }[] };

function ReceiveForm({ poId, onBack }: { poId: string; onBack: () => void }) {
  const [po, setPo] = useState<(PurchaseOrder & { supplierName: string }) | null>(null);
  const [items, setItems] = useState<ItemRow[] | null>(null);
  const [lines, setLines] = useState<Record<string, Line>>({});
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data: p } = await supabase.from('purchase_orders').select(`${PO_COLUMNS}, suppliers(name)`).eq('id', poId).maybeSingle();
    if (!p) return null;
    const [{ data: its }, { data: allocs }, iys] = await Promise.all([
      supabase.from('po_items').select(`${PO_ITEM_COLUMNS}, books(name, code)`).eq('po_id', poId),
      supabase.from('po_item_allocations').select('po_item_id, institution_year_id, qty, po_items!inner(po_id)').eq('po_items.po_id', poId),
      fetchIyNames(p.year_id),
    ]);
    const nameOf = (iy: string | null, map: Map<string, IyName>) => (iy ? map.get(iy)?.name ?? 'מוסד' : 'רזרבה');
    return {
      po: { ...(p as unknown as PurchaseOrder), supplierName: (p.suppliers as unknown as { name: string } | null)?.name ?? '' },
      items: (its ?? [])
        .map((i) => {
          const b = i.books as unknown as { name: string; code: string } | null;
          return {
            ...(i as unknown as PoItem),
            bookName: b?.name ?? '',
            bookCode: b?.code ?? '',
            destinations: (allocs ?? [])
              .filter((a) => a.po_item_id === i.id && a.qty > 0)
              .map((a) => ({ name: nameOf(a.institution_year_id, iys), qty: a.qty })),
          };
        })
        .sort((a, b) => a.bookName.localeCompare(b.bookName, 'he')),
    };
  }, [poId]);

  useEffect(() => {
    let cancelled = false;
    void load().then((d) => {
      if (cancelled || !d) return;
      setPo(d.po);
      setItems(d.items);
    });
    return () => {
      cancelled = true;
    };
  }, [load]);

  const line = (id: string): Line => lines[id] ?? { good: 0, damaged: 0, wrong: 0 };
  const change = (id: string, field: keyof Line, delta: number) =>
    setLines((l) => {
      const cur = l[id] ?? { good: 0, damaged: 0, wrong: 0 };
      return { ...l, [id]: { ...cur, [field]: Math.max(cur[field] + delta, 0) } };
    });
  const setField = (id: string, field: keyof Line, v: string) =>
    setLines((l) => {
      const cur = l[id] ?? { good: 0, damaged: 0, wrong: 0 };
      return { ...l, [id]: { ...cur, [field]: Math.max(Number(v.replace(/\D/g, '')) || 0, 0) } };
    });
  const allArrived = () =>
    setLines(Object.fromEntries((items ?? []).map((i) => [i.id, { ...line(i.id), good: outstanding(i) }])));

  const totals = useMemo(() => {
    let g = 0, d = 0, w = 0;
    for (const l of Object.values(lines)) {
      g += l.good;
      d += l.damaged;
      w += l.wrong;
    }
    return { g, d, w };
  }, [lines]);

  const submit = async () => {
    const payload = Object.entries(lines)
      .filter(([, l]) => l.good + l.damaged + l.wrong > 0)
      .map(([po_item_id, l]) => ({ po_item_id, ...l }));
    if (!payload.length) return toast.error('לא הוזנו כמויות');
    setSaving(true);
    const { error } = await supabase.rpc('receive_po', { p_po: poId, p_lines: payload, p_notes: notes.trim() || undefined });
    setSaving(false);
    if (error) return toast.error(dbErrorMessage(error.message));
    const left = (items ?? []).reduce((s, i) => s + Math.max(outstanding(i) - line(i.id).good, 0), 0);
    setDone(left > 0 ? `נקלטו ${totals.g} ספרים. עדיין חסרים ${left} – ההזמנה נשארת פתוחה.` : `נקלטו ${totals.g} ספרים. ההזמנה התקבלה במלואה.`);
  };

  if (!po || !items) return <Spinner />;

  if (done) {
    return (
      <div className="mx-auto flex max-w-xl flex-col items-center gap-4 rounded-2xl bg-white p-10 text-center shadow-sm">
        <PackageCheck className="h-16 w-16 text-emerald-600" />
        <p className="text-xl font-bold">הקליטה נשמרה</p>
        <p className="text-slate-600">{done}</p>
        <p className="text-sm text-slate-500">הספרים נכנסו למלאי. ההקצאה למוסדות נעשית במסך &quot;מלאי וחוסרים&quot;.</p>
        <Button onClick={onBack} className="px-6 py-3 text-base">חזרה לרשימת ההזמנות</Button>
      </div>
    );
  }

  const step = (onClick: () => void, icon: React.ReactNode, label: string) => (
    <button type="button" onClick={onClick} aria-label={label} className="flex h-11 w-11 items-center justify-center rounded-lg border border-slate-300 bg-white active:bg-slate-100">
      {icon}
    </button>
  );

  return (
    <div className="mx-auto max-w-4xl space-y-4 pb-28">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="ghost" onClick={onBack}>
          <ArrowRight className="h-4 w-4" /> חזרה
        </Button>
        <h1 className="flex-1 text-xl font-bold">
          קליטה – {po.supplierName} (הזמנה {po.number})
        </h1>
        <Button variant="secondary" onClick={allArrived} className="py-2.5">
          <CheckCheck className="h-5 w-5" /> הכול הגיע
        </Button>
      </div>

      {items.map((it) => {
        const l = line(it.id);
        const out = outstanding(it);
        const over = l.good > out;
        return (
          <div key={it.id} className={`rounded-2xl border bg-white p-4 shadow-sm ${l.good + l.damaged + l.wrong > 0 ? 'border-emerald-300' : 'border-slate-200'}`}>
            <div className="flex flex-wrap items-baseline gap-x-3">
              <span className="text-lg font-bold">{it.bookName}</span>
              <span className="text-xs text-slate-400">{it.bookCode}</span>
              <span className="text-sm text-slate-600">
                הוזמן {it.qty_ordered} · התקבל {it.qty_received} · <b className={out ? 'text-red-600' : 'text-emerald-700'}>ממתין {out}</b>
              </span>
            </div>
            {it.destinations.length > 0 && (
              <div className="mt-1 text-xs text-slate-500">מיועד ל: {it.destinations.map((d) => `${d.name} (${d.qty})`).join(' · ')}</div>
            )}
            <div className="mt-3 grid gap-3 sm:grid-cols-3">
              {(
                [
                  ['good', 'תקינים שהגיעו', 'border-emerald-300'],
                  ['damaged', 'פגומים', 'border-amber-300'],
                  ['wrong', 'שגויים (ספר לא נכון)', 'border-amber-300'],
                ] as const
              ).map(([field, label, border]) => (
                <div key={field}>
                  <div className="mb-1 text-sm font-medium text-slate-600">{label}</div>
                  <div className="flex items-center gap-2">
                    {step(() => change(it.id, field, -1), <Minus className="h-5 w-5" />, 'פחות')}
                    <input
                      inputMode="numeric"
                      className={`h-11 w-20 rounded-lg border-2 text-center text-xl font-bold ${l[field] ? border : 'border-slate-200'}`}
                      value={l[field] || ''}
                      placeholder="0"
                      onChange={(e) => setField(it.id, field, e.target.value)}
                    />
                    {step(() => change(it.id, field, 1), <Plus className="h-5 w-5" />, 'יותר')}
                    {field === 'good' && out > 0 && l.good !== out && (
                      <button type="button" onClick={() => setField(it.id, 'good', String(out))} className="rounded-lg bg-emerald-50 px-2 py-2 text-sm text-emerald-700">
                        הכול ({out})
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
            {over && <p className="mt-2 text-sm text-amber-700">התקבלו יותר מהממתין ({l.good - out} עודפים) – ייכנסו למלאי ויסומנו כעודף.</p>}
          </div>
        );
      })}

      <Field label="הערות לקליטה (תעודת משלוח, מצב החבילות...)">
        <input className={inputClass} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </Field>

      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-slate-200 bg-white/95 px-4 py-3 backdrop-blur lg:mr-60">
        <div className="mx-auto flex max-w-4xl items-center gap-3">
          <span className="flex-1 text-sm">
            תקינים <b>{totals.g}</b>
            {totals.d > 0 && <> · פגומים {totals.d}</>}
            {totals.w > 0 && <> · שגויים {totals.w}</>}
          </span>
          <Button variant="success" onClick={submit} loading={saving} disabled={totals.g + totals.d + totals.w === 0} className="px-6 py-3 text-base">
            <PackageCheck className="h-5 w-5" /> שמירת הקליטה
          </Button>
        </div>
      </div>
    </div>
  );
}
