'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Plus, ShoppingCart } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/components/AuthContext';
import { Protect } from '@/components/Protect';
import { OrderStatusBadge } from '@/components/orders/OrderStatusBadge';
import { money } from '@/lib/format';
import type { OrderStatus } from '@/lib/orders';

type OrderHistoryRow = {
  id: string;
  number: number;
  created_at: string;
  status: OrderStatus;
  total: number;
  balance: number;
  className: string;
  instName: string;
  yearName: string;
};

/** היסטוריית ההזמנות של התלמיד – לפי שנה, מוסד וכיתה */
export function CustomerOrders({ customerId }: { customerId: string }) {
  const { hasPermission } = useAuth();
  const [orders, setOrders] = useState<OrderHistoryRow[] | null>(null);
  const canView = hasPermission('orders_view');

  useEffect(() => {
    if (!canView) return;
    let cancelled = false;
    void supabase
      .from('orders')
      .select('id, number, created_at, status, total, balance, classes(name), institution_years(institutions(name)), academic_years(name)')
      .eq('customer_id', customerId)
      .order('created_at', { ascending: false })
      .then(({ data }) => {
        if (cancelled) return;
        setOrders(
          (data ?? []).map((o) => ({
            ...(o as unknown as OrderHistoryRow),
            className: (o.classes as unknown as { name: string } | null)?.name ?? '',
            instName: (o.institution_years as unknown as { institutions: { name: string } | null } | null)?.institutions?.name ?? '',
            yearName: (o.academic_years as unknown as { name: string } | null)?.name ?? '',
          }))
        );
      });
    return () => {
      cancelled = true;
    };
  }, [customerId, canView]);

  if (!canView) return null;

  return (
    <div className="rounded-xl bg-white p-4">
      <div className="mb-2 flex items-center gap-2">
        <h3 className="flex flex-1 items-center gap-2 font-semibold">
          <ShoppingCart className="h-4 w-4 text-slate-500" /> היסטוריית הזמנות ({orders?.length ?? 0})
        </h3>
        <Protect permId="orders_create" lockedFallback={null}>
          <Link href={`/orders/new?customer=${customerId}`} className="inline-flex items-center gap-1 rounded-lg bg-blue-600 px-3 py-1.5 text-sm text-white hover:bg-blue-700">
            <Plus className="h-4 w-4" /> הזמנה חדשה
          </Link>
        </Protect>
      </div>
      {orders && orders.length === 0 && <p className="text-sm text-slate-400">אין הזמנות.</p>}
      {orders && orders.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-slate-500">
              <tr>
                <th className="py-1 text-right">מס׳</th>
                <th className="py-1 text-right">שנה</th>
                <th className="py-1 text-right">מוסד / כיתה</th>
                <th className="py-1 text-right">סכום</th>
                <th className="py-1 text-right">יתרה</th>
                <th className="py-1 text-right">סטטוס</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {orders.map((o) => (
                <tr key={o.id}>
                  <td className="py-1.5">
                    <Link href={`/orders/${o.id}`} className="text-blue-700 hover:underline">{o.number}</Link>
                  </td>
                  <td className="py-1.5">{o.yearName}</td>
                  <td className="py-1.5">{o.instName} / {o.className}</td>
                  <td className="py-1.5">{money(o.total)}</td>
                  <td className="py-1.5">
                    <Protect permId="finance_view">{money(o.balance)}</Protect>
                  </td>
                  <td className="py-1.5"><OrderStatusBadge status={o.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
