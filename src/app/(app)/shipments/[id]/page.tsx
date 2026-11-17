'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowRight, Ban, CheckCircle2, Minus, Plus, Printer, Truck, Undo2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/components/AuthContext';
import { PageGuard } from '@/components/Protect';
import { BagStatusBadge } from '@/components/warehouse/BagStatusBadge';
import { Button, EmptyState, Field, inputClass, Modal, Spinner } from '@/components/ui';
import { toast } from '@/components/Toaster';
import { dbErrorMessage } from '@/lib/dbErrors';
import { formatDate, money } from '@/lib/format';
import { DELIVERY_STATUS_LABELS, type BagStatus, type DeliveryStatus } from '@/lib/warehouse';

export default function DeliveryPage() {
  return (
    <PageGuard permId={['shipments_view', 'shipments_manage']}>
      <DeliveryScreen />
    </PageGuard>
  );
}

type Report = {
  delivery: {
    id: string;
    number: number;
    status: DeliveryStatus;
    delivery_date: string | null;
    carrier: string | null;
    boxes_count: number | null;
    receiver_name: string | null;
    notes: string | null;
    bags_count: number;
  };
  institution: { name: string; number: number; address: string | null; city: string | null; contact_name: string | null; phone: string | null; year_name: string };
  rows: { book_name: string; book_code: string; supplier_name: string | null; required: number; supplied: number }[];
};

type BagRow = {
  id: string;
  code: string;
  bag_no: number;
  status: BagStatus;
  is_partial: boolean;
  delivery_id: string | null;
  order_id: string;
  student?: string;
  className?: string;
  delivery_method?: string;
};

async function load(id: string) {
  const { data: rep } = await supabase.rpc('delivery_report', { p_delivery: id });
  const report = rep as unknown as Report | null;
  if (!report) return null;
  const { data: dl } = await supabase.from('institution_deliveries').select('institution_year_id, cost, paid_by').eq('id', id).single();
  const iyId = dl?.institution_year_id ?? '';
  const { data: iy } = await supabase.from('institution_years').select('year_id').eq('id', iyId).single();
  // שקיות המוסד (במשלוח הזה + מועמדות) ושמות התלמידים מתור האריזה
  const [{ data: queue }, { data: bags }] = await Promise.all([
    supabase.rpc('packing_queue', { p_year: iy?.year_id ?? '' }),
    supabase
      .from('bags')
      .select('id, code, bag_no, status, is_partial, delivery_id, order_id')
      .or(`delivery_id.eq.${id},and(delivery_id.is.null,status.in.(picked,checked,ready))`),
  ]);
  const byOrder = new Map((queue ?? []).filter((q) => q.institution_year_id === iyId).map((q) => [q.order_id, q]));
  const rows: BagRow[] = ((bags ?? []) as BagRow[])
    .filter((b) => byOrder.has(b.order_id))
    .map((b) => {
      const q = byOrder.get(b.order_id)!;
      return { ...b, student: q.student_name, className: q.class_name, delivery_method: q.delivery_method };
    })
    .sort((a, b) => (a.className ?? '').localeCompare(b.className ?? '', 'he') || (a.student ?? '').localeCompare(b.student ?? '', 'he'));
  return { report, bags: rows, cost: dl?.cost ?? null, paidBy: dl?.paid_by ?? null };
}

function DeliveryScreen() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { hasPermission } = useAuth();
  const [data, setData] = useState<Awaited<ReturnType<typeof load>> | undefined>(undefined);
  const [receiving, setReceiving] = useState(false);
  const [onlyDay, setOnlyDay] = useState(true);

  const reload = useCallback(async () => setData(await load(id)), [id]);
  useEffect(() => {
    let cancelled = false;
    void load(id).then((d) => !cancelled && setData(d));
    return () => {
      cancelled = true;
    };
  }, [id]);

  const inDelivery = useMemo(() => data?.bags.filter((b) => b.delivery_id === id) ?? [], [data, id]);
  const candidates = useMemo(
    () => data?.bags.filter((b) => !b.delivery_id && (!onlyDay || b.delivery_method === 'institution_day')) ?? [],
    [data, onlyDay]
  );

  if (data === undefined) return <Spinner />;
  if (!data) return <EmptyState>המשלוח לא נמצא</EmptyState>;
  const { report } = data;
  const d = report.delivery;
  const canManage = hasPermission('shipments_manage') && ['planned', 'sent'].includes(d.status);

  const assign = async (bagIds: string[], remove = false) => {
    const { error } = await supabase.rpc('assign_bags_to_delivery', { p_delivery: id, p_bags: bagIds, p_remove: remove });
    if (error) return toast.error(dbErrorMessage(error.message));
    await reload();
  };
  const setStatus = async (status: string, receiver?: string, confirmText?: string) => {
    if (confirmText && !window.confirm(confirmText)) return;
    const { error } = await supabase.rpc('set_delivery_status', { p_delivery: id, p_status: status, p_receiver: receiver });
    if (error) return toast.error(dbErrorMessage(error.message));
    toast.success('עודכן');
    await reload();
  };

  const totals = report.rows.reduce(
    (a, r) => ({ req: a.req + r.required, sup: a.sup + Math.min(r.supplied, r.required) }),
    { req: 0, sup: 0 }
  );
  const missingBySupplier = new Map<string, number>();
  for (const r of report.rows) {
    const m = r.required - r.supplied;
    if (m > 0) missingBySupplier.set(r.supplier_name ?? 'ללא ספק', (missingBySupplier.get(r.supplier_name ?? 'ללא ספק') ?? 0) + m);
  }

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <div className="flex flex-wrap items-center gap-2 print:hidden">
        <Button variant="ghost" onClick={() => router.push('/shipments')}>
          <ArrowRight className="h-4 w-4" /> למשלוחים
        </Button>
        <div className="flex-1" />
        {d.status === 'planned' && hasPermission('shipments_manage') && (
          <>
            <Button onClick={() => setStatus('sent')} disabled={!inDelivery.length}>
              <Truck className="h-4 w-4" /> יצא לדרך
            </Button>
            <Button variant="danger" onClick={() => setStatus('cancelled', undefined, 'לבטל את המשלוח? השקיות יחזרו להמתנה.')}>
              <Ban className="h-4 w-4" /> ביטול
            </Button>
          </>
        )}
        {d.status === 'sent' && hasPermission('shipments_manage') && (
          <>
            <Button variant="success" onClick={() => setReceiving(true)}>
              <CheckCircle2 className="h-4 w-4" /> נמסר למוסד
            </Button>
            <Button variant="secondary" onClick={() => setStatus('planned')}>
              <Undo2 className="h-4 w-4" /> חזרה לתכנון
            </Button>
          </>
        )}
        <Button variant="secondary" onClick={() => window.print()}>
          <Printer className="h-4 w-4" /> דוח אספקה
        </Button>
      </div>

      {/* דוח אספקה – גם למסך וגם להדפסה */}
      <div className="rounded-2xl bg-white p-5 shadow-sm print:p-0 print:shadow-none">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold">דוח אספקה – {report.institution.name}</h1>
            <div className="text-sm text-slate-600">
              מוסד {report.institution.number}
              {report.institution.address && ` · ${report.institution.address}`}
              {report.institution.city && `, ${report.institution.city}`}
              {report.institution.contact_name && ` · ${report.institution.contact_name}`}
              {report.institution.phone && ` · ${report.institution.phone}`}
            </div>
          </div>
          <div className="text-sm">
            <div>שנת לימודים: <b>{report.institution.year_name}</b></div>
            <div>משלוח מס׳ <b>{d.number}</b> · {DELIVERY_STATUS_LABELS[d.status]}</div>
            <div>תאריך אספקה: {formatDate(d.delivery_date) || '________'}</div>
            <div>
              שקיות: {d.bags_count} · ארגזים: {d.boxes_count ?? '____'}
              {d.carrier && ` · ${d.carrier}`}
            </div>
            {(data.cost != null || data.paidBy) && (
              <div className="print:hidden">
                עלות: {money(data.cost)} {data.paidBy && `· ${data.paidBy}`}
              </div>
            )}
          </div>
        </div>

        <table className="mt-4 w-full border-collapse text-sm">
          <thead>
            <tr className="bg-slate-50">
              {['שם הספר', 'כמות נדרשת', 'כמות שסופקה', 'כמות חסרה', 'ספק'].map((h) => (
                <th key={h} className="border border-slate-300 px-2 py-1.5 text-right">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {report.rows.map((r) => {
              const missing = Math.max(r.required - r.supplied, 0);
              return (
                <tr key={r.book_code}>
                  <td className="border border-slate-300 px-2 py-1">{r.book_name}</td>
                  <td className="border border-slate-300 px-2 py-1">{r.required}</td>
                  <td className="border border-slate-300 px-2 py-1">{Math.min(r.supplied, r.required)}</td>
                  <td className={`border border-slate-300 px-2 py-1 ${missing ? 'font-bold' : ''}`}>{missing}</td>
                  <td className="border border-slate-300 px-2 py-1">{missing ? r.supplier_name ?? '' : ''}</td>
                </tr>
              );
            })}
            <tr className="bg-slate-50 font-bold">
              <td className="border border-slate-300 px-2 py-1">סה״כ</td>
              <td className="border border-slate-300 px-2 py-1">{totals.req}</td>
              <td className="border border-slate-300 px-2 py-1">{totals.sup}</td>
              <td className="border border-slate-300 px-2 py-1">{totals.req - totals.sup}</td>
              <td className="border border-slate-300 px-2 py-1" />
            </tr>
          </tbody>
        </table>

        {missingBySupplier.size > 0 && (
          <p className="mt-3 text-sm">
            <b>חוסרים לפי ספק:</b> {[...missingBySupplier.entries()].map(([s, n]) => `${s}: ${n}`).join(' · ')}
          </p>
        )}
        {d.notes && <p className="mt-2 text-sm">הערות: {d.notes}</p>}

        <div className="mt-8 grid grid-cols-2 gap-8 text-sm">
          <div>
            שם המקבל: {d.receiver_name ?? '______________________'}
          </div>
          <div>חתימה: ______________________</div>
        </div>
      </div>

      {/* שקיות במשלוח */}
      <div className="rounded-2xl bg-white p-4 shadow-sm print:hidden">
        <h2 className="mb-2 text-lg font-bold">שקיות במשלוח ({inDelivery.length})</h2>
        <BagList bags={inDelivery} action={canManage ? { label: 'הוצאה', icon: <Minus className="h-4 w-4" />, run: (ids) => assign(ids, true) } : undefined} />
      </div>

      {canManage && (
        <div className="rounded-2xl bg-white p-4 shadow-sm print:hidden">
          <div className="mb-2 flex flex-wrap items-center gap-3">
            <h2 className="flex-1 text-lg font-bold">שקיות ארוזות שממתינות ({candidates.length})</h2>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={onlyDay} onChange={(e) => setOnlyDay(e.target.checked)} /> רק הזמנות ליום מכירה במוסד
            </label>
            {candidates.length > 0 && (
              <Button onClick={() => assign(candidates.map((b) => b.id))}>
                <Plus className="h-4 w-4" /> הוספת כולן
              </Button>
            )}
          </div>
          <BagList bags={candidates} action={{ label: 'הוספה', icon: <Plus className="h-4 w-4" />, run: (ids) => assign(ids) }} />
        </div>
      )}

      {receiving && (
        <ReceiverModal
          onClose={() => setReceiving(false)}
          onConfirm={async (name) => {
            setReceiving(false);
            await setStatus('delivered', name);
          }}
        />
      )}
    </div>
  );
}

function BagList({ bags, action }: { bags: BagRow[]; action?: { label: string; icon: React.ReactNode; run: (ids: string[]) => void } }) {
  if (!bags.length) return <p className="text-sm text-slate-400">אין שקיות</p>;
  return (
    <ul className="divide-y divide-slate-100">
      {bags.map((b) => (
        <li key={b.id} className="flex flex-wrap items-center gap-3 py-2 text-sm">
          <span className="w-24 text-slate-400" dir="ltr">{b.code}</span>
          <span className="min-w-40 flex-1 font-medium">
            {b.student} <span className="font-normal text-slate-500">· כיתה {b.className}</span>
          </span>
          <BagStatusBadge status={b.status} partial={b.is_partial} />
          {action && (
            <Button variant="ghost" onClick={() => action.run([b.id])}>
              {action.icon} {action.label}
            </Button>
          )}
        </li>
      ))}
    </ul>
  );
}

function ReceiverModal({ onClose, onConfirm }: { onClose: () => void; onConfirm: (name: string) => void }) {
  const [name, setName] = useState('');
  return (
    <Modal
      title="המשלוח נמסר למוסד"
      onClose={onClose}
      size="md"
      footer={
        <>
          <Button variant="success" onClick={() => onConfirm(name.trim())} disabled={!name.trim()}>
            <CheckCircle2 className="h-4 w-4" /> אישור
          </Button>
          <Button variant="secondary" onClick={onClose}>ביטול</Button>
        </>
      }
    >
      <div className="rounded-xl bg-white p-4">
        <Field label="שם מקבל הסחורה במוסד">
          <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        </Field>
        <p className="mt-2 text-xs text-slate-500">השקיות עצמן יסומנו &quot;נמסרה&quot; כשההורים יאספו אותן ביום המכירה (סריקה או חיפוש).</p>
      </div>
    </Modal>
  );
}
