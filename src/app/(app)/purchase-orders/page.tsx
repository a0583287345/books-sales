'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ClipboardList } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useYear } from '@/components/YearContext';
import { PageGuard, Protect } from '@/components/Protect';
import { PoStatusBadge } from '@/components/purchasing/PoStatusBadge';
import { EmptyState, PageHeader, Spinner } from '@/components/ui';
import { FilterStatus, heCompare, matches, MultiSelect, SearchBox, SortSelect, useStoredState } from '@/components/filters';
import { formatDate, normalizeSearch } from '@/lib/format';
import { PO_COLUMNS, PO_STATUS_LABELS, type PoStatus, type PurchaseOrder } from '@/lib/purchasing';

export default function PurchaseOrdersPage() {
  return (
    <PageGuard permId="po_view">
      <PurchaseOrdersScreen />
    </PageGuard>
  );
}

const SORTS = [
  ['number', 'מספר הזמנה'],
  ['order_date', 'תאריך שליחה'],
  ['expected', 'צפי אספקה'],
  ['supplier', 'ספק (א-ב)'],
  ['progress', 'אחוז שהתקבל'],
] as const;
type SortKey = (typeof SORTS)[number][0];

/** "פתוחות" = כל מה שעוד לא נסגר/בוטל */
const OPEN_STATUSES: string[] = ['draft', 'sent', 'partial', 'received'];

type Filters = { status: string[]; supplier: string[]; sort: SortKey; desc: boolean };
const DEFAULT_FILTERS: Filters = { status: OPEN_STATUSES, supplier: [], sort: 'number', desc: true };

type Row = PurchaseOrder & { supplierName: string; units: number; received: number; books: number };

function PurchaseOrdersScreen() {
  const { year } = useYear();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [search, setSearch] = useState('');
  const yearId = year?.id ?? null;
  const [f, setF] = useStoredState(yearId ? `po:${yearId}` : null, DEFAULT_FILTERS);

  useEffect(() => {
    if (!yearId) return;
    let cancelled = false;
    void supabase
      .from('purchase_orders')
      .select(`${PO_COLUMNS}, suppliers(name), po_items(qty_ordered, qty_received)`)
      .eq('year_id', yearId)
      .order('number', { ascending: false })
      .then(({ data }) => {
        if (cancelled) return;
        setRows(
          (data ?? []).map((p) => {
            const items = (p.po_items as unknown as { qty_ordered: number; qty_received: number }[]) ?? [];
            return {
              ...(p as unknown as PurchaseOrder),
              supplierName: (p.suppliers as unknown as { name: string } | null)?.name ?? '',
              units: items.reduce((s, i) => s + i.qty_ordered, 0),
              received: items.reduce((s, i) => s + Math.min(i.qty_received, i.qty_ordered), 0),
              books: items.length,
            };
          })
        );
      });
    return () => {
      cancelled = true;
    };
  }, [yearId]);

  const supplierOptions = useMemo(
    () =>
      [...new Map((rows ?? []).map((r) => [r.supplier_id, r.supplierName])).entries()]
        .sort((x, y) => heCompare(x[1], y[1]))
        .map(([value, label]) => ({ value, label })),
    [rows]
  );

  const filtered = useMemo(() => {
    const q = normalizeSearch(search);
    const list = (rows ?? []).filter(
      (r) =>
        matches(f.supplier, r.supplier_id) &&
        matches(f.status, r.status) &&
        (!q || String(r.number) === q || normalizeSearch(r.supplierName).includes(q))
    );
    const progress = (r: Row) => (r.units ? r.received / r.units : 0);
    const cmp: Record<SortKey, (a: Row, b: Row) => number> = {
      number: (a, b) => a.number - b.number,
      order_date: (a, b) => (a.order_date ?? '').localeCompare(b.order_date ?? '') || a.number - b.number,
      expected: (a, b) => (a.expected_date ?? '9999').localeCompare(b.expected_date ?? '9999') || a.number - b.number,
      supplier: (a, b) => heCompare(a.supplierName, b.supplierName) || a.number - b.number,
      progress: (a, b) => progress(a) - progress(b),
    };
    const c = cmp[f.sort] ?? cmp.number;
    return list.sort((a, b) => (f.desc ? -c(a, b) : c(a, b)));
  }, [rows, search, f]);

  const filterActive = !!search.trim() || f.status.length + f.supplier.length > 0;
  const clearAll = () => {
    setSearch('');
    setF({ status: [], supplier: [] });
  };

  if (!year) return <EmptyState>יש לפתוח שנת לימודים.</EmptyState>;
  if (!rows) return <Spinner />;

  return (
    <div>
      <PageHeader title={`הזמנות רכש – ${year.name}`}>
        <Protect permId="po_manage">
          <Link href="/purchase-orders/plan" className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700">
            <ClipboardList className="h-4 w-4" /> תכנון רכש / הזמנה חדשה
          </Link>
        </Protect>
      </PageHeader>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <SearchBox value={search} onChange={setSearch} placeholder="מס׳ הזמנה / ספק..." />
        <MultiSelect
          label="סטטוס"
          options={(Object.keys(PO_STATUS_LABELS) as PoStatus[]).map((s) => ({ value: s, label: PO_STATUS_LABELS[s] }))}
          value={f.status}
          onChange={(status) => setF({ status })}
        />
        <MultiSelect label="ספק" options={supplierOptions} value={f.supplier} onChange={(supplier) => setF({ supplier })} />
        <button
          type="button"
          onClick={() => setF({ status: OPEN_STATUSES })}
          className="rounded-lg px-2 py-2 text-sm text-blue-700 hover:bg-blue-50"
        >
          רק פתוחות
        </button>
        <SortSelect options={SORTS} value={f.sort} desc={f.desc} onChange={(sort, desc) => setF({ sort, desc })} />
      </div>
      <FilterStatus active={filterActive} shown={filtered.length} total={rows.length} noun="הזמנות רכש" onClear={clearAll} />

      {filtered.length === 0 ? (
        <EmptyState>{rows.length ? 'אין הזמנות רכש שמתאימות לסינון' : 'עדיין אין הזמנות רכש. מתחילים ב"תכנון רכש".'}</EmptyState>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-600">
              <tr>
                <th className="px-3 py-2 text-right">מס׳</th>
                <th className="px-3 py-2 text-right">ספק</th>
                <th className="px-3 py-2 text-right">נשלחה</th>
                <th className="px-3 py-2 text-right">צפי אספקה</th>
                <th className="px-3 py-2 text-right">ספרים</th>
                <th className="px-3 py-2 text-right">התקבל</th>
                <th className="px-3 py-2 text-right">סטטוס</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map((r) => (
                <tr key={r.id} className="hover:bg-blue-50">
                  <td className="px-3 py-2.5 font-medium">
                    <Link href={`/purchase-orders/${r.id}`} className="text-blue-700 hover:underline">{r.number}</Link>
                  </td>
                  <td className="px-3 py-2.5">{r.supplierName}</td>
                  <td className="px-3 py-2.5 text-slate-600">{formatDate(r.order_date) || '—'}</td>
                  <td className="px-3 py-2.5 text-slate-600">{formatDate(r.expected_date) || '—'}</td>
                  <td className="px-3 py-2.5">{r.books} ספרים · {r.units} יח׳</td>
                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-2">
                      <div className="h-2 w-20 overflow-hidden rounded bg-slate-100">
                        <div className="h-full bg-emerald-500" style={{ width: `${r.units ? (r.received / r.units) * 100 : 0}%` }} />
                      </div>
                      <span className="text-xs text-slate-500">{r.received}/{r.units}</span>
                    </div>
                  </td>
                  <td className="px-3 py-2.5"><PoStatusBadge status={r.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
