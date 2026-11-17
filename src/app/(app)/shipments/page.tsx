'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { HandHeart, Plus, ScanLine, Search, Truck } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/components/AuthContext';
import { useYear } from '@/components/YearContext';
import { PageGuard, Protect } from '@/components/Protect';
import DateInput from '@/components/DateInput';
import { OrderStatusBadge } from '@/components/orders/OrderStatusBadge';
import { Button, EmptyState, Field, inputClass, Modal, PageHeader, Spinner } from '@/components/ui';
import { toast } from '@/components/Toaster';
import { dbErrorMessage } from '@/lib/dbErrors';
import { formatDate, money, toNumber } from '@/lib/format';
import type { OrderStatus } from '@/lib/orders';
import { fetchIyNames, type IyName } from '@/lib/purchasing';
import { DELIVERY_STATUS_LABELS, type DeliveryStatus } from '@/lib/warehouse';

export default function ShipmentsPage() {
  return (
    <PageGuard permId={['shipments_view', 'pickups_do']}>
      <ShipmentsScreen />
    </PageGuard>
  );
}

function ShipmentsScreen() {
  const { hasPermission } = useAuth();
  const [tab, setTab] = useState<'pickup' | 'deliveries'>(hasPermission('pickups_do') ? 'pickup' : 'deliveries');
  return (
    <div>
      <PageHeader title="מסירה ומשלוחים למוסדות">
        <Link href="/scan" className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm hover:bg-slate-50">
          <ScanLine className="h-4 w-4" /> סריקה
        </Link>
      </PageHeader>
      <div className="mb-4 flex gap-1 border-b border-slate-200">
        {hasPermission('pickups_do') && (
          <TabBtn active={tab === 'pickup'} onClick={() => setTab('pickup')}>
            <HandHeart className="h-4 w-4" /> מסירה ללקוח
          </TabBtn>
        )}
        {(hasPermission('shipments_view') || hasPermission('shipments_manage')) && (
          <TabBtn active={tab === 'deliveries'} onClick={() => setTab('deliveries')}>
            <Truck className="h-4 w-4" /> משלוחים למוסדות (יום מכירה)
          </TabBtn>
        )}
      </div>
      {tab === 'pickup' ? <PickupTab /> : <DeliveriesTab />}
    </div>
  );
}

function TabBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-2 whitespace-nowrap border-b-2 px-4 py-2.5 text-sm ${active ? 'border-blue-600 font-semibold text-blue-700' : 'border-transparent text-slate-600'}`}
    >
      {children}
    </button>
  );
}

// ---------------------------------------------------------------------
// מסירה ללקוח
// ---------------------------------------------------------------------

type PickupRow = {
  order_id: string;
  order_number: number;
  order_status: string;
  student_name: string;
  customer_name: string;
  customer_phone: string | null;
  inst_name: string;
  class_name: string;
  balance: number;
  bags_ready: number;
  bags_open: number;
  bags_delivered: number;
};

function PickupTab() {
  const { year } = useYear();
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [rows, setRows] = useState<PickupRow[] | null>(null);
  const yearId = year?.id ?? null;

  useEffect(() => {
    if (!yearId || query.trim().length < 2) return;
    let cancelled = false;
    const t = setTimeout(() => {
      void supabase.rpc('find_orders_for_pickup', { p_year: yearId, p_query: query.trim() }).then(({ data, error }) => {
        if (cancelled) return;
        if (error) toast.error(dbErrorMessage(error.message));
        setRows((data ?? []) as PickupRow[]);
      });
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [query, yearId]);

  if (!year) return <EmptyState>יש לפתוח שנת לימודים.</EmptyState>;
  const shown = query.trim().length >= 2 ? rows : null;

  return (
    <div className="mx-auto max-w-3xl space-y-3">
      <div className="relative">
        <Search className="absolute right-3 top-3.5 h-5 w-5 text-slate-400" />
        <input
          className="w-full rounded-xl border border-slate-300 py-3 pl-3 pr-11 text-lg"
          placeholder="שם, טלפון, תלמיד, מס׳ הזמנה..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          autoFocus
        />
      </div>
      {shown === null ? (
        <p className="text-center text-sm text-slate-400">הקלידו לפחות 2 תווים, או סרקו את המדבקה.</p>
      ) : shown.length === 0 ? (
        <EmptyState>לא נמצאו הזמנות</EmptyState>
      ) : (
        shown.map((r) => (
          <button
            key={r.order_id}
            type="button"
            onClick={() => router.push(`/bags/order/${r.order_id}`)}
            className="flex w-full flex-wrap items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4 text-right shadow-sm hover:border-blue-400"
          >
            <div className="min-w-48 flex-1">
              <div className="text-lg font-bold">{r.student_name}</div>
              <div className="text-sm text-slate-600">
                {r.customer_name} · {r.inst_name} / {r.class_name} · הזמנה {r.order_number}
              </div>
            </div>
            <div className="text-sm">
              {r.bags_ready > 0 && <span className="rounded-full bg-teal-100 px-2 py-0.5 text-teal-800">{r.bags_ready} שקיות מוכנות</span>}
              {r.bags_open > 0 && <span className="mr-1 rounded-full bg-amber-100 px-2 py-0.5 text-amber-800">{r.bags_open} בהכנה</span>}
              {r.bags_delivered > 0 && <span className="mr-1 rounded-full bg-emerald-100 px-2 py-0.5 text-emerald-800">{r.bags_delivered} נמסרו</span>}
              {r.bags_ready + r.bags_open + r.bags_delivered === 0 && <span className="text-slate-400">עדיין לא נארזה</span>}
            </div>
            <div className={`text-sm font-medium ${r.balance > 0 ? 'text-red-600' : 'text-emerald-700'}`}>
              {r.balance > 0 ? `לתשלום ${money(r.balance)}` : 'שולם'}
            </div>
            <OrderStatusBadge status={r.order_status as OrderStatus} />
          </button>
        ))
      )}
    </div>
  );
}

// ---------------------------------------------------------------------
// משלוחים למוסדות
// ---------------------------------------------------------------------

type DeliveryRow = {
  id: string;
  number: number;
  institution_year_id: string;
  delivery_date: string | null;
  carrier: string | null;
  status: DeliveryStatus;
  receiver_name: string | null;
  boxes_count: number | null;
  bags: number;
};

function DeliveriesTab() {
  const { year } = useYear();
  const router = useRouter();
  const [rows, setRows] = useState<DeliveryRow[] | null>(null);
  const [iys, setIys] = useState<Map<string, IyName>>(new Map());
  const [creating, setCreating] = useState(false);
  const yearId = year?.id ?? null;

  useEffect(() => {
    if (!yearId) return;
    let cancelled = false;
    void Promise.all([
      supabase
        .from('institution_deliveries')
        .select('id, number, institution_year_id, delivery_date, carrier, status, receiver_name, boxes_count, bags(count), institution_years!inner(year_id)')
        .eq('institution_years.year_id', yearId)
        .order('number', { ascending: false }),
      fetchIyNames(yearId),
    ]).then(([{ data, error }, names]) => {
      if (cancelled) return;
      if (error) toast.error(dbErrorMessage(error.message));
      setIys(names);
      setRows(
        (data ?? []).map((d) => ({
          ...(d as unknown as DeliveryRow),
          bags: (d.bags as unknown as { count: number }[])?.[0]?.count ?? 0,
        }))
      );
    });
    return () => {
      cancelled = true;
    };
  }, [yearId]);

  if (!year) return <EmptyState>יש לפתוח שנת לימודים.</EmptyState>;
  if (!rows) return <Spinner />;

  return (
    <div className="space-y-3">
      <Protect permId="shipments_manage">
        <Button onClick={() => setCreating(true)}>
          <Plus className="h-4 w-4" /> משלוח חדש למוסד
        </Button>
      </Protect>
      {rows.length === 0 ? (
        <EmptyState>עדיין אין משלוחים למוסדות בשנה הזו</EmptyState>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-600">
              <tr>
                <th className="px-3 py-2 text-right">מס׳</th>
                <th className="px-3 py-2 text-right">מוסד</th>
                <th className="px-3 py-2 text-right">תאריך</th>
                <th className="px-3 py-2 text-right">נהג / חברה</th>
                <th className="px-3 py-2 text-right">שקיות</th>
                <th className="px-3 py-2 text-right">ארגזים</th>
                <th className="px-3 py-2 text-right">מצב</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((d) => (
                <tr key={d.id} className="cursor-pointer hover:bg-blue-50" onClick={() => router.push(`/shipments/${d.id}`)}>
                  <td className="px-3 py-2.5 font-medium text-blue-700">{d.number}</td>
                  <td className="px-3 py-2.5">{iys.get(d.institution_year_id)?.name}</td>
                  <td className="px-3 py-2.5">{formatDate(d.delivery_date) || '—'}</td>
                  <td className="px-3 py-2.5">{d.carrier}</td>
                  <td className="px-3 py-2.5">{d.bags}</td>
                  <td className="px-3 py-2.5">{d.boxes_count ?? ''}</td>
                  <td className="px-3 py-2.5">
                    {DELIVERY_STATUS_LABELS[d.status]}
                    {d.receiver_name && <span className="text-xs text-slate-500"> · {d.receiver_name}</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {creating && (
        <DeliveryFormModal
          iys={[...iys.values()].sort((a, b) => a.name.localeCompare(b.name, 'he'))}
          onClose={() => setCreating(false)}
          onSaved={(id) => router.push(`/shipments/${id}`)}
        />
      )}
    </div>
  );
}

type DeliveryForm ={ iy: string; date: string; carrier: string; cost: string; paid_by: string; boxes: string; notes: string };

function DeliveryFormModal({ iys, onClose, onSaved }: { iys: IyName[]; onClose: () => void; onSaved: (id: string) => void }) {
  const [f, setF] = useState<DeliveryForm>({ iy: iys[0]?.id ?? '', date: '', carrier: '', cost: '', paid_by: '', boxes: '', notes: '' });
  const [saving, setSaving] = useState(false);
  const save = async () => {
    if (!f.iy) return toast.error('יש לבחור מוסד');
    setSaving(true);
    const { data, error } = await supabase.rpc('save_delivery', {
      p_iy: f.iy,
      p_date: f.date || undefined,
      p_carrier: f.carrier || undefined,
      p_cost: toNumber(f.cost) ?? undefined,
      p_paid_by: f.paid_by || undefined,
      p_boxes: toNumber(f.boxes) ?? undefined,
      p_notes: f.notes || undefined,
    });
    setSaving(false);
    if (error) return toast.error(dbErrorMessage(error.message));
    onSaved(data);
  };
  return (
    <Modal
      title="משלוח חדש למוסד"
      onClose={onClose}
      size="md"
      footer={
        <>
          <Button variant="success" onClick={save} loading={saving}>יצירה</Button>
          <Button variant="secondary" onClick={onClose}>ביטול</Button>
        </>
      }
    >
      <div className="grid gap-3 rounded-xl bg-white p-4 sm:grid-cols-2">
        <Field label="מוסד" className="sm:col-span-2">
          <select className={inputClass} value={f.iy} onChange={(e) => setF({ ...f, iy: e.target.value })}>
            {iys.map((x) => (
              <option key={x.id} value={x.id}>{x.number} – {x.name}</option>
            ))}
          </select>
        </Field>
        <Field label="תאריך יציאה">
          <DateInput value={f.date} onChange={(v) => setF({ ...f, date: v })} />
        </Field>
        <Field label="נהג / חברת שליחויות">
          <input className={inputClass} value={f.carrier} onChange={(e) => setF({ ...f, carrier: e.target.value })} />
        </Field>
        <Field label="עלות המשלוח (₪)">
          <input className={inputClass} inputMode="decimal" value={f.cost} onChange={(e) => setF({ ...f, cost: e.target.value })} />
        </Field>
        <Field label="מי שילם / כמה">
          <input className={inputClass} value={f.paid_by} onChange={(e) => setF({ ...f, paid_by: e.target.value })} />
        </Field>
        <Field label="מספר ארגזים">
          <input className={inputClass} inputMode="numeric" value={f.boxes} onChange={(e) => setF({ ...f, boxes: e.target.value })} />
        </Field>
        <Field label="הערות">
          <input className={inputClass} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} />
        </Field>
      </div>
    </Modal>
  );
}
