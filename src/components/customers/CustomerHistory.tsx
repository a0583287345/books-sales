'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Baby, Pencil, Plus, ShoppingCart, Trash2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/components/AuthContext';
import { Protect } from '@/components/Protect';
import { OrderStatusBadge } from '@/components/orders/OrderStatusBadge';
import { Button, inputClass } from '@/components/ui';
import { toast } from '@/components/Toaster';
import { dbErrorMessage } from '@/lib/dbErrors';
import { money } from '@/lib/format';
import type { OrderStatus } from '@/lib/orders';

type Student = { id: string; name: string };

/** הילדים של הלקוח – נשמרים אוטומטית בהזמנה, וניתנים לעריכה כאן */
export function CustomerChildren({ customerId }: { customerId: string }) {
  const { hasPermission } = useAuth();
  const canEdit = hasPermission('customers_edit');
  const [students, setStudents] = useState<Student[]>([]);
  const [newName, setNewName] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');

  const load = useCallback(
    async () => (await supabase.from('customer_students').select('id, name').eq('customer_id', customerId).order('name')).data ?? [],
    [customerId]
  );
  const reload = async () => setStudents(await load());
  useEffect(() => {
    let cancelled = false;
    void load().then((s) => !cancelled && setStudents(s));
    return () => {
      cancelled = true;
    };
  }, [load]);

  const add = async () => {
    if (!newName.trim()) return;
    const { error } = await supabase.from('customer_students').insert({ customer_id: customerId, name: newName.trim() });
    if (error) return toast.error(dbErrorMessage(error.message));
    setNewName('');
    await reload();
  };
  const rename = async (s: Student) => {
    if (!editName.trim() || editName.trim() === s.name) return setEditingId(null);
    const { error } = await supabase.from('customer_students').update({ name: editName.trim() }).eq('id', s.id);
    if (error) return toast.error(dbErrorMessage(error.message));
    setEditingId(null);
    await reload();
  };
  const remove = async (s: Student) => {
    if (!window.confirm(`להסיר את ${s.name} מרשימת הילדים? (הזמנות קיימות לא נפגעות)`)) return;
    const { error } = await supabase.from('customer_students').delete().eq('id', s.id);
    if (error) return toast.error(dbErrorMessage(error.message));
    await reload();
  };

  return (
    <div className="rounded-xl bg-white p-4">
      <h3 className="mb-2 flex items-center gap-2 font-semibold">
        <Baby className="h-4 w-4 text-slate-500" /> ילדים ({students.length})
      </h3>
      {students.length === 0 && <p className="text-sm text-slate-400">הילדים נשמרים אוטומטית בהזמנה הראשונה.</p>}
      <ul className="space-y-1">
        {students.map((s) => (
          <li key={s.id} className="flex items-center gap-2 text-sm">
            {editingId === s.id ? (
              <>
                <input className={`${inputClass} max-w-60`} value={editName} onChange={(e) => setEditName(e.target.value)} autoFocus />
                <Button variant="success" onClick={() => rename(s)}>שמירה</Button>
                <Button variant="ghost" onClick={() => setEditingId(null)}>ביטול</Button>
              </>
            ) : (
              <>
                <span className="flex-1">{s.name}</span>
                {canEdit && (
                  <>
                    <button type="button" onClick={() => { setEditingId(s.id); setEditName(s.name); }} className="p-1 text-slate-400 hover:text-slate-700" title="שינוי שם">
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button type="button" onClick={() => remove(s)} className="p-1 text-slate-400 hover:text-red-600" title="הסרה">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </>
                )}
              </>
            )}
          </li>
        ))}
      </ul>
      {canEdit && (
        <div className="mt-2 flex gap-2">
          <input
            className={`${inputClass} max-w-60`}
            placeholder="הוספת ילד..."
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && add()}
          />
          <Button variant="secondary" onClick={add} disabled={!newName.trim()}>
            <Plus className="h-4 w-4" />
          </Button>
        </div>
      )}
    </div>
  );
}

type OrderHistoryRow = {
  id: string;
  number: number;
  created_at: string;
  student_name: string;
  status: OrderStatus;
  total: number;
  balance: number;
  className: string;
  instName: string;
  yearName: string;
};

/** היסטוריית ההזמנות של הלקוח – לפי שנה, מוסד וכיתה */
export function CustomerOrders({ customerId }: { customerId: string }) {
  const { hasPermission } = useAuth();
  const [orders, setOrders] = useState<OrderHistoryRow[] | null>(null);
  const canView = hasPermission('orders_view');

  useEffect(() => {
    if (!canView) return;
    let cancelled = false;
    void supabase
      .from('orders')
      .select('id, number, created_at, student_name, status, total, balance, classes(name), institution_years(institutions(name)), academic_years(name)')
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
            <Plus className="h-4 w-4" /> הזמנה חדשה ללקוח
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
                <th className="py-1 text-right">תלמיד</th>
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
                  <td className="py-1.5">{o.student_name}</td>
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
      <p className="mt-2 text-xs text-slate-400">היסטוריית התשלומים והמסירות תתווסף בשלבים ד׳–ה׳.</p>
    </div>
  );
}
