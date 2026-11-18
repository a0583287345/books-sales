'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FileSpreadsheet, Plus } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useYear } from '@/components/YearContext';
import { PageGuard, Protect } from '@/components/Protect';
import { OrderStatusBadge } from '@/components/orders/OrderStatusBadge';
import { Button, EmptyState, PageHeader, Spinner } from '@/components/ui';
import { FilterStatus, heCompare, matches, MultiSelect, SearchBox, SortSelect, useStoredState } from '@/components/filters';
import { toast } from '@/components/Toaster';
import { dbErrorMessage } from '@/lib/dbErrors';
import { exportToExcel } from '@/lib/excel';
import { money, normalizeSearch } from '@/lib/format';
import {
  DELIVERY_LABELS,
  ORDER_LIST_SELECT,
  ORDER_STATUS_LABELS,
  ORDER_STATUSES,
  SOURCE_LABELS,
  toListRow,
  type OrderListRow,
} from '@/lib/orders';

export default function OrdersPage() {
  return (
    <PageGuard permId="orders_view">
      <OrdersScreen />
    </PageGuard>
  );
}

const SHOW_LIMIT = 300;

const SORTS = [
  ['date', 'תאריך הזמנה'],
  ['number', 'מספר הזמנה'],
  ['name', 'שם התלמיד (א-ב)'],
  ['inst', 'מוסד וכיתה'],
  ['total', 'סכום'],
  ['balance', 'יתרה לתשלום'],
] as const;
type SortKey = (typeof SORTS)[number][0];

const PAY_OPTIONS = [
  { value: 'debt', label: 'יש יתרה לתשלום' },
  { value: 'paid', label: 'שולם במלואו' },
  { value: 'credit', label: 'יתרת זכות' },
];
const payState = (o: OrderListRow) => (o.balance > 0 ? 'debt' : o.balance < 0 ? 'credit' : 'paid');

type Filters = { inst: string[]; cls: string[]; status: string[]; delivery: string[]; source: string[]; pay: string[]; sort: SortKey; desc: boolean };
const DEFAULT_FILTERS: Filters = { inst: [], cls: [], status: [], delivery: [], source: [], pay: [], sort: 'date', desc: true };

function OrdersScreen() {
  const { year } = useYear();
  const router = useRouter();
  const [orders, setOrders] = useState<OrderListRow[] | null>(null);
  const [search, setSearch] = useState('');
  const yearId = year?.id ?? null;
  const [f, setF] = useStoredState(yearId ? `orders:${yearId}` : null, DEFAULT_FILTERS);
  useEffect(() => {
    if (!yearId) return;
    let cancelled = false;
    void supabase
      .from('orders')
      .select(ORDER_LIST_SELECT)
      .eq('year_id', yearId)
      .order('number', { ascending: false })
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) toast.error(dbErrorMessage(error.message));
        setOrders((data ?? []).map(toListRow));
      });
    return () => {
      cancelled = true;
    };
  }, [yearId]);

  const instOptions = useMemo(() => {
    const m = new Map<string, string>();
    for (const o of orders ?? []) m.set(o.institution_year_id, o.instName);
    return [...m.entries()].sort((x, y) => heCompare(x[1], y[1])).map(([value, label]) => ({ value, label }));
  }, [orders]);
  const classOptions = useMemo(() => {
    const m = new Map<string, { label: string; sub: string }>();
    for (const o of orders ?? []) if (matches(f.inst, o.institution_year_id)) m.set(o.class_id, { label: o.className, sub: o.instName });
    return [...m.entries()]
      .sort((x, y) => heCompare(x[1].sub, y[1].sub) || heCompare(x[1].label, y[1].label))
      .map(([value, v]) => ({ value, ...v }));
  }, [orders, f.inst]);

  const filtered = useMemo(() => {
    const q = normalizeSearch(search);
    const qDigits = search.replace(/D/g, '');
    const list = (orders ?? []).filter((o) => {
      if (!matches(f.inst, o.institution_year_id)) return false;
      if (!matches(f.cls, o.class_id)) return false;
      if (f.status.length === 0 ? o.status === 'cancelled' : !f.status.includes(o.status)) return false;
      if (!matches(f.delivery, o.delivery_method)) return false;
      if (!matches(f.source, o.source)) return false;
      if (f.pay.length && !f.pay.includes(payState(o))) return false;
      if (!q) return true;
      return (
        String(o.number) === q ||
        String(o.customerNumber) === q ||
        normalizeSearch(`${o.customerName} ${o.student_name}`).includes(q) ||
        (qDigits.length >= 3 && o.customerPhoneDigits.includes(qDigits))
      );
    });
    const cmp: Record<SortKey, (a: OrderListRow, b: OrderListRow) => number> = {
      date: (a, b) => a.created_at.localeCompare(b.created_at) || a.number - b.number,
      number: (a, b) => a.number - b.number,
      name: (a, b) => heCompare(a.customerName, b.customerName),
      inst: (a, b) => heCompare(a.instName, b.instName) || heCompare(a.className, b.className) || heCompare(a.customerName, b.customerName),
      total: (a, b) => a.total - b.total,
      balance: (a, b) => a.balance - b.balance,
    };
    const c = cmp[f.sort] ?? cmp.date;
    return list.sort((a, b) => (f.desc ? -c(a, b) : c(a, b)));
  }, [orders, search, f]);

  const filterActive =
    !!search.trim() || f.inst.length + f.cls.length + f.status.length + f.delivery.length + f.source.length + f.pay.length > 0;
  const clearAll = () => {
    setSearch('');
    setF((prev) => ({ ...DEFAULT_FILTERS, sort: prev.sort, desc: prev.desc }));
  };
  const activeCount = (orders ?? []).filter((o) => o.status !== 'cancelled').length;

  const totals = useMemo(
    () =>
      filtered.reduce(
        (acc, o) => (o.status === 'cancelled' ? acc : { total: acc.total + o.total, balance: acc.balance + o.balance }),
        { total: 0, balance: 0 }
      ),
    [filtered]
  );

  const exportExcel = () =>
    exportToExcel(`הזמנות ${year?.name ?? ''}`, [
      {
        name: 'הזמנות',
        rows: filtered.map((o) => ({
          'מספר הזמנה': o.number,
          תאריך: new Date(o.created_at).toLocaleDateString('he-IL'),
          'מספר לקוח': o.customerNumber,
          תלמיד: o.customerName,
          טלפון: o.customerPhone,
          מוסד: o.instName,
          כיתה: o.className,
          'סכום לפני הנחה': o.subtotal,
          הנחה: o.discount,
          'סכום כולל': o.total,
          שולם: o.paid_amount,
          יתרה: o.balance,
          'אופן מסירה': DELIVERY_LABELS[o.delivery_method],
          סטטוס: ORDER_STATUS_LABELS[o.status],
          מקור: SOURCE_LABELS[o.source] ?? o.source,
        })),
      },
    ]);

  if (!year) return <EmptyState>יש לפתוח שנת לימודים במסך &quot;שנות לימודים&quot;.</EmptyState>;
  if (!orders) return <Spinner />;

  return (
    <div>
      <PageHeader title={`הזמנות – ${year.name}`}>
        <Protect permId="export_excel">
          <Button variant="secondary" onClick={exportExcel} disabled={!filtered.length}>
            <FileSpreadsheet className="h-4 w-4" /> אקסל
          </Button>
        </Protect>
        <Protect permId="orders_create">
          <Button onClick={() => router.push('/orders/new')}>
            <Plus className="h-4 w-4" /> הזמנה חדשה
          </Button>
        </Protect>
      </PageHeader>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <SearchBox value={search} onChange={setSearch} placeholder="מס׳ הזמנה, שם, טלפון..." />
        <MultiSelect label="מוסד" options={instOptions} value={f.inst} onChange={(inst) => setF({ inst, cls: [] })} />
        <MultiSelect label="כיתה" options={classOptions} value={f.cls} onChange={(cls) => setF({ cls })} />
        <MultiSelect
          label="סטטוס"
          options={ORDER_STATUSES.map((s) => ({ value: s, label: ORDER_STATUS_LABELS[s] }))}
          value={f.status}
          onChange={(status) => setF({ status })}
          emptyText="פעילות (בלי מבוטלות)"
        />
        <MultiSelect
          label="מסירה"
          options={Object.entries(DELIVERY_LABELS).map(([value, label]) => ({ value, label }))}
          value={f.delivery}
          onChange={(delivery) => setF({ delivery })}
        />
        <Protect permId="finance_view" lockedFallback={null}>
          <MultiSelect label="תשלום" options={PAY_OPTIONS} value={f.pay} onChange={(pay) => setF({ pay })} />
        </Protect>
        <MultiSelect
          label="מקור"
          options={Object.entries(SOURCE_LABELS).map(([value, label]) => ({ value, label }))}
          value={f.source}
          onChange={(source) => setF({ source })}
        />
        <SortSelect options={SORTS} value={f.sort} desc={f.desc} onChange={(sort, desc) => setF({ sort, desc })} />
      </div>

      <FilterStatus active={filterActive} shown={filtered.length} total={activeCount} noun="הזמנות פעילות" onClear={clearAll}>
        <span>
          סה״כ {money(totals.total)}
          <Protect permId="finance_view" lockedFallback={null}>
            {' '}· יתרה לתשלום {money(totals.balance)}
          </Protect>
          {filtered.length > SHOW_LIMIT && ` · מוצגות ${SHOW_LIMIT} הראשונות – צמצמו בסינון`}
        </span>
      </FilterStatus>

      {filtered.length === 0 ? (
        <EmptyState>{orders.length ? 'אין הזמנות שמתאימות לסינון' : 'עדיין אין הזמנות בשנה הזו'}</EmptyState>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-600">
              <tr>
                <th className="px-3 py-2 text-right">מס׳</th>
                <th className="px-3 py-2 text-right">תאריך</th>
                <th className="px-3 py-2 text-right">תלמיד</th>
                <th className="px-3 py-2 text-right">מוסד / כיתה</th>
                <th className="px-3 py-2 text-right">סכום</th>
                <th className="px-3 py-2 text-right">יתרה</th>
                <th className="px-3 py-2 text-right">מסירה</th>
                <th className="px-3 py-2 text-right">סטטוס</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.slice(0, SHOW_LIMIT).map((o) => (
                <tr key={o.id} className="hover:bg-blue-50">
                  <td className="px-3 py-2.5 font-medium">
                    <Link href={`/orders/${o.id}`} className="text-blue-700 hover:underline">
                      {o.number}
                    </Link>
                  </td>
                  <td className="px-3 py-2.5 text-slate-500">{new Date(o.created_at).toLocaleDateString('he-IL')}</td>
                  <td className="px-3 py-2.5">{o.customerName}</td>
                  <td className="px-3 py-2.5">
                    {o.instName} / {o.className}
                  </td>
                  <td className="px-3 py-2.5">{money(o.total)}</td>
                  <td className={`px-3 py-2.5 ${o.balance > 0 && o.status !== 'cancelled' ? 'font-medium text-red-600' : 'text-slate-400'}`}>
                    <Protect permId="finance_view">{money(o.balance)}</Protect>
                  </td>
                  <td className="px-3 py-2.5 text-slate-600">{DELIVERY_LABELS[o.delivery_method]}</td>
                  <td className="px-3 py-2.5">
                    <OrderStatusBadge status={o.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
