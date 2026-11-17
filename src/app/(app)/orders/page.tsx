'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FileSpreadsheet, Plus, Search } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useYear } from '@/components/YearContext';
import { PageGuard, Protect } from '@/components/Protect';
import { OrderStatusBadge } from '@/components/orders/OrderStatusBadge';
import { Button, EmptyState, inputClass, PageHeader, Spinner } from '@/components/ui';
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

function OrdersScreen() {
  const { year } = useYear();
  const router = useRouter();
  const [orders, setOrders] = useState<OrderListRow[] | null>(null);
  const [search, setSearch] = useState('');
  const [inst, setInst] = useState('');
  const [cls, setCls] = useState('');
  const [status, setStatus] = useState('active');
  const [delivery, setDelivery] = useState('');

  const yearId = year?.id ?? null;
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

  const institutions = useMemo(() => {
    const m = new Map<string, string>();
    for (const o of orders ?? []) m.set(o.institution_year_id, `${o.instNumber} – ${o.instName}`);
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1], 'he'));
  }, [orders]);
  const classes = useMemo(() => {
    const m = new Map<string, string>();
    for (const o of orders ?? []) if (!inst || o.institution_year_id === inst) m.set(o.class_id, o.className);
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1], 'he'));
  }, [orders, inst]);

  const filtered = useMemo(() => {
    const q = normalizeSearch(search);
    const qDigits = search.replace(/\D/g, '');
    return (orders ?? []).filter((o) => {
      if (inst && o.institution_year_id !== inst) return false;
      if (cls && o.class_id !== cls) return false;
      if (status === 'active' && o.status === 'cancelled') return false;
      if (status && status !== 'active' && o.status !== status) return false;
      if (delivery && o.delivery_method !== delivery) return false;
      if (!q) return true;
      return (
        String(o.number) === q ||
        String(o.customerNumber) === q ||
        normalizeSearch(`${o.customerName} ${o.student_name}`).includes(q) ||
        (qDigits.length >= 3 && o.customerPhoneDigits.includes(qDigits))
      );
    });
  }, [orders, search, inst, cls, status, delivery]);

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
          לקוח: o.customerName,
          טלפון: o.customerPhone,
          תלמיד: o.student_name,
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

  const select = `${inputClass} w-auto`;

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
        <div className="relative w-full sm:w-72">
          <Search className="absolute right-2.5 top-2.5 h-4 w-4 text-slate-400" />
          <input
            className="w-full rounded-lg border border-slate-300 py-2 pl-3 pr-8 text-sm"
            placeholder="מס׳ הזמנה, שם, טלפון, תלמיד..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <select className={select} value={inst} onChange={(e) => { setInst(e.target.value); setCls(''); }}>
          <option value="">כל המוסדות</option>
          {institutions.map(([id, name]) => (
            <option key={id} value={id}>{name}</option>
          ))}
        </select>
        <select className={select} value={cls} onChange={(e) => setCls(e.target.value)}>
          <option value="">כל הכיתות</option>
          {classes.map(([id, name]) => (
            <option key={id} value={id}>{name}</option>
          ))}
        </select>
        <select className={select} value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="active">כל הפעילות (בלי מבוטלות)</option>
          <option value="">כל הסטטוסים</option>
          {ORDER_STATUSES.map((s) => (
            <option key={s} value={s}>{ORDER_STATUS_LABELS[s]}</option>
          ))}
        </select>
        <select className={select} value={delivery} onChange={(e) => setDelivery(e.target.value)}>
          <option value="">כל אופני המסירה</option>
          {Object.entries(DELIVERY_LABELS).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
      </div>

      <div className="mb-2 text-sm text-slate-500">
        {filtered.length} הזמנות · סה״כ {money(totals.total)}
        <Protect permId="finance_view" lockedFallback={null}>
          {' '}· יתרה לתשלום {money(totals.balance)}
        </Protect>
        {filtered.length > SHOW_LIMIT && ` · מוצגות ${SHOW_LIMIT} האחרונות – צמצמו בסינון`}
      </div>

      {filtered.length === 0 ? (
        <EmptyState>{orders.length ? 'אין הזמנות שמתאימות לסינון' : 'עדיין אין הזמנות בשנה הזו'}</EmptyState>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-600">
              <tr>
                <th className="px-3 py-2 text-right">מס׳</th>
                <th className="px-3 py-2 text-right">תאריך</th>
                <th className="px-3 py-2 text-right">לקוח</th>
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
                  <td className="px-3 py-2.5">{o.student_name}</td>
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
