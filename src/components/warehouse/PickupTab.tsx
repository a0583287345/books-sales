'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { HandHeart, Search } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/components/AuthContext';
import { useYear } from '@/components/YearContext';
import { DeliverOrderModal } from '@/components/warehouse/DeliverOrderModal';
import { FilterStatus, heCompare, matches, MultiSelect, useStoredState } from '@/components/filters';
import { Button, EmptyState, Spinner } from '@/components/ui';
import { toast } from '@/components/Toaster';
import { dbErrorMessage } from '@/lib/dbErrors';
import { money } from '@/lib/format';

// =====================================================================
// מסירה ללקוח: רשימה לפי מוסד וכיתה + חיפוש (גם טלפון / קוד שקית).
// כפתור "מסירה" בכל שורה פותח חלון אחד של תשלום + מסירה.
// =====================================================================

type PickupRow = {
  order_id: string;
  order_number: number;
  order_status: string;
  student_name: string;
  customer_name: string;
  institution_year_id: string;
  inst_name: string;
  class_name: string;
  qty_total: number;
  qty_packed: number;
  qty_delivered: number;
  balance: number;
  bags_ready: number;
  bags_open: number;
};

const VIEWS = [
  ['ready', 'מוכנות למסירה'],
  ['waiting', 'לא נמסרו'],
  ['delivered', 'נמסרו'],
  ['all', 'הכול'],
] as const;
type View = (typeof VIEWS)[number][0];
type Filters = { view: View; inst: string[]; cls: string[]; pay: string[] };
const DEFAULTS: Filters = { view: 'ready', inst: [], cls: [], pay: [] };
const LIMIT = 300;

const PAY_OPTIONS = [
  { value: 'debt', label: 'יש יתרה לתשלום' },
  { value: 'paid', label: 'שולם' },
];

const classKey = (r: PickupRow) => `${r.institution_year_id}|${r.class_name}`;
const fullyDelivered = (r: PickupRow) => r.qty_total > 0 && r.qty_delivered >= r.qty_total;

export function PickupTab() {
  const { year } = useYear();
  const router = useRouter();
  const { hasPermission } = useAuth();
  const [query, setQuery] = useState('');
  const [rows, setRows] = useState<PickupRow[] | null>(null);
  const [found, setFound] = useState<Set<string> | null>(null);
  const [delivering, setDelivering] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const yearId = year?.id ?? null;
  const [f, setF] = useStoredState(yearId ? `pickup:${yearId}` : null, DEFAULTS);

  useEffect(() => {
    if (!yearId) return;
    let cancelled = false;
    void supabase.rpc('packing_queue', { p_year: yearId }).then(({ data, error }) => {
      if (cancelled) return;
      if (error) toast.error(dbErrorMessage(error.message));
      setRows((data ?? []) as PickupRow[]);
    });
    return () => {
      cancelled = true;
    };
  }, [yearId, reloadKey]);

  // חיפוש במסד – שם, טלפון, מס׳ הזמנה, קוד שקית
  const q = query.trim();
  const searching = q.length >= 2;
  useEffect(() => {
    if (!yearId || q.length < 2) return;
    let cancelled = false;
    const t = setTimeout(() => {
      void supabase.rpc('find_orders_for_pickup', { p_year: yearId, p_query: q }).then(({ data, error }) => {
        if (cancelled) return;
        if (error) toast.error(dbErrorMessage(error.message));
        setFound(new Set(((data ?? []) as { order_id: string }[]).map((r) => r.order_id)));
      });
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [q, yearId, reloadKey]);

  const instOptions = useMemo(
    () =>
      [...new Map((rows ?? []).map((r) => [r.institution_year_id, r.inst_name])).entries()]
        .sort((x, y) => heCompare(x[1], y[1]))
        .map(([value, label]) => ({ value, label })),
    [rows]
  );
  const classOptions = useMemo(() => {
    const m = new Map<string, { label: string; sub: string }>();
    for (const r of rows ?? []) if (matches(f.inst, r.institution_year_id)) m.set(classKey(r), { label: r.class_name, sub: r.inst_name });
    return [...m.entries()]
      .sort((x, y) => heCompare(x[1].sub, y[1].sub) || heCompare(x[1].label, y[1].label))
      .map(([value, v]) => ({ value, ...v }));
  }, [rows, f.inst]);

  const filtered = useMemo(() => {
    const list = (rows ?? []).filter((r) => {
      if (!matches(f.inst, r.institution_year_id)) return false;
      if (!matches(f.cls, classKey(r))) return false;
      if (f.pay.length && !f.pay.includes(r.balance > 0 ? 'debt' : 'paid')) return false;
      if (searching) return found?.has(r.order_id) ?? false; // בחיפוש – מכל המצבים
      if (f.view === 'ready') return r.bags_ready > 0;
      if (f.view === 'waiting') return !fullyDelivered(r);
      if (f.view === 'delivered') return r.qty_delivered > 0;
      return true;
    });
    return list.sort(
      (a, b) => heCompare(a.inst_name, b.inst_name) || heCompare(a.class_name, b.class_name) || heCompare(a.student_name, b.student_name)
    );
  }, [rows, f, searching, found]);

  // קיבוץ לפי מוסד → כיתה
  const groups = useMemo(() => {
    const out: { key: string; inst: string; cls: string; rows: PickupRow[] }[] = [];
    for (const r of filtered.slice(0, LIMIT)) {
      const key = classKey(r);
      const last = out[out.length - 1];
      if (last?.key === key) last.rows.push(r);
      else out.push({ key, inst: r.inst_name, cls: r.class_name, rows: [r] });
    }
    return out;
  }, [filtered]);

  if (!year) return <EmptyState>יש לפתוח שנת לימודים.</EmptyState>;
  if (!rows) return <Spinner />;

  const filterActive = searching || f.inst.length + f.cls.length + f.pay.length > 0;
  const clearAll = () => {
    setQuery('');
    setF({ inst: [], cls: [], pay: [] });
  };
  const canDeliverAny = hasPermission('pickups_do');

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search className="absolute right-3 top-3.5 h-5 w-5 text-slate-400" />
        <input
          className={`w-full rounded-xl border py-3 pl-3 pr-11 text-lg ${searching ? 'border-blue-500 bg-blue-50' : 'border-slate-300 bg-white'}`}
          placeholder="חיפוש: שם, טלפון, מס׳ הזמנה, קוד שקית..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          autoFocus
        />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {VIEWS.map(([v, label]) => (
          <button
            key={v}
            type="button"
            onClick={() => setF({ view: v })}
            disabled={searching}
            className={`rounded-full px-4 py-2 text-sm disabled:opacity-40 ${f.view === v ? 'bg-blue-600 text-white' : 'bg-white text-slate-700 ring-1 ring-slate-200'}`}
          >
            {label}
          </button>
        ))}
        <MultiSelect label="מוסד" options={instOptions} value={f.inst} onChange={(inst) => setF({ inst, cls: [] })} />
        <MultiSelect label="כיתה" options={classOptions} value={f.cls} onChange={(cls) => setF({ cls })} />
        <MultiSelect label="תשלום" options={PAY_OPTIONS} value={f.pay} onChange={(pay) => setF({ pay })} />
      </div>

      <FilterStatus active={filterActive} shown={filtered.length} total={rows.length} noun="הזמנות" onClear={clearAll}>
        {searching && <span>· תוצאות חיפוש (מכל המצבים)</span>}
        {filtered.length > LIMIT && <span>· מוצגות {LIMIT} הראשונות – צמצמו בסינון</span>}
      </FilterStatus>

      {filtered.length === 0 ? (
        <EmptyState>{searching ? 'לא נמצאו הזמנות' : 'אין הזמנות ברשימה הזו'}</EmptyState>
      ) : (
        groups.map((g) => (
          <section key={g.key}>
            <h3 className="mb-1 rounded-lg bg-slate-100 px-3 py-1.5 text-sm font-bold text-slate-700">
              {g.inst} · כיתה {g.cls} <span className="font-normal text-slate-500">({g.rows.length})</span>
            </h3>
            <div className="space-y-1.5">
              {g.rows.map((r) => {
                const done = fullyDelivered(r);
                const canDeliver = r.bags_ready + r.bags_open > 0 && !done;
                return (
                  <div
                    key={r.order_id}
                    onClick={() => router.push(`/bags/order/${r.order_id}`)}
                    className="flex cursor-pointer flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 hover:border-blue-400"
                  >
                    <div className="min-w-40 flex-1">
                      <div className="text-lg font-bold">{r.student_name}</div>
                      <div className="text-xs text-slate-500">הזמנה {r.order_number}</div>
                    </div>
                    <div className="flex flex-wrap gap-1 text-sm">
                      {r.bags_ready > 0 && <span className="rounded-full bg-teal-100 px-2 py-0.5 text-teal-800">{r.bags_ready} מוכנות</span>}
                      {r.bags_open > 0 && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-amber-800">{r.bags_open} בהכנה</span>}
                      {done && <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-emerald-800">נמסרה</span>}
                      {!done && r.qty_delivered > 0 && <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-emerald-800">נמסרה חלקית</span>}
                      {r.qty_packed === 0 && <span className="text-slate-400">עדיין לא נארזה</span>}
                    </div>
                    <div className={`w-28 text-sm font-medium ${r.balance > 0 ? 'text-red-600' : 'text-emerald-700'}`}>
                      {r.balance > 0 ? `לתשלום ${money(r.balance)}` : 'שולם'}
                    </div>
                    {canDeliverAny && (
                      <Button
                        variant="success"
                        disabled={!canDeliver}
                        className="px-5 py-2.5 text-base"
                        onClick={(e) => {
                          e.stopPropagation();
                          setDelivering(r.order_id);
                        }}
                      >
                        <HandHeart className="h-5 w-5" /> מסירה
                      </Button>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        ))
      )}

      {delivering && (
        <DeliverOrderModal
          orderId={delivering}
          onClose={() => setDelivering(null)}
          onDone={() => {
            setDelivering(null);
            setReloadKey((k) => k + 1);
          }}
        />
      )}
    </div>
  );
}
