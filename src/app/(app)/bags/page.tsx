'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Printer, ScanLine, Search } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useYear } from '@/components/YearContext';
import { PageGuard, Protect } from '@/components/Protect';
import { OrderStatusBadge } from '@/components/orders/OrderStatusBadge';
import { Button, EmptyState, inputClass, PageHeader, Spinner } from '@/components/ui';
import { toast } from '@/components/Toaster';
import { dbErrorMessage } from '@/lib/dbErrors';
import { normalizeSearch } from '@/lib/format';
import { DELIVERY_LABELS, type OrderStatus } from '@/lib/orders';

export default function BagsPage() {
  return (
    <PageGuard permId={['picking_do', 'bags_check', 'labels_print']}>
      <BagsScreen />
    </PageGuard>
  );
}

type Row = {
  order_id: string;
  order_number: number;
  order_status: string;
  delivery_method: string;
  student_name: string;
  customer_name: string;
  institution_year_id: string;
  inst_name: string;
  class_name: string;
  qty_total: number;
  qty_packed: number;
  qty_delivered: number;
  bags_open: number;
  bags_ready: number;
};

type Avail = { institution_year_id: string; book_id: string; allocated: number; packed_open: number };

const VIEWS = [
  ['todo', 'לאריזה'],
  ['partial', 'ארוזות חלקית'],
  ['open', 'בליקוט / לבדיקה'],
  ['ready', 'מוכנות'],
  ['delivered', 'נמסרו'],
  ['all', 'הכול'],
] as const;
type View = (typeof VIEWS)[number][0];

function BagsScreen() {
  const { year } = useYear();
  const router = useRouter();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [inst, setInst] = useState('');
  const [cls, setCls] = useState('');
  const [view, setView] = useState<View>('todo');
  const [search, setSearch] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [availByIy, setAvailByIy] = useState<Map<string, number>>(new Map());
  const yearId = year?.id ?? null;

  useEffect(() => {
    if (!yearId) return;
    let cancelled = false;
    void Promise.all([
      supabase.rpc('packing_queue', { p_year: yearId }),
      supabase.rpc('pack_availability', { p_year: yearId }),
    ]).then(([q, a]) => {
      if (cancelled) return;
      if (q.error) {
        setError(dbErrorMessage(q.error.message));
        setRows([]);
        return;
      }
      setRows((q.data ?? []) as Row[]);
      // כמה עותקים פנויים לאריזה בכל מוסד (סה"כ) – רמז בלבד; הבדיקה המדויקת במסך האריזה
      const m = new Map<string, number>();
      for (const x of (a.data ?? []) as Avail[]) m.set(x.institution_year_id, (m.get(x.institution_year_id) ?? 0) + Math.max(x.allocated - x.packed_open, 0));
      setAvailByIy(m);
    });
    return () => {
      cancelled = true;
    };
  }, [yearId]);

  const institutions = useMemo(
    () => [...new Map((rows ?? []).map((r) => [r.institution_year_id, r.inst_name])).entries()].sort((a, b) => a[1].localeCompare(b[1], 'he')),
    [rows]
  );
  const classes = useMemo(
    () => [...new Set((rows ?? []).filter((r) => !inst || r.institution_year_id === inst).map((r) => r.class_name))].sort((a, b) => a.localeCompare(b, 'he')),
    [rows, inst]
  );

  const filtered = useMemo(() => {
    const q = normalizeSearch(search);
    return (rows ?? [])
      .filter((r) => {
        if (inst && r.institution_year_id !== inst) return false;
        if (cls && r.class_name !== cls) return false;
        const remaining = r.qty_total - r.qty_packed;
        if (view === 'todo' && !(r.qty_packed === 0 && r.qty_total > 0)) return false;
        if (view === 'partial' && !(r.qty_packed > 0 && remaining > 0)) return false;
        if (view === 'open' && r.bags_open === 0) return false;
        if (view === 'ready' && r.bags_ready === 0) return false;
        if (view === 'delivered' && !(r.qty_delivered > 0)) return false;
        if (q && !(String(r.order_number) === q || normalizeSearch(`${r.student_name} ${r.customer_name}`).includes(q))) return false;
        return true;
      })
      .sort((a, b) => a.inst_name.localeCompare(b.inst_name, 'he') || a.class_name.localeCompare(b.class_name, 'he') || a.student_name.localeCompare(b.student_name, 'he'));
  }, [rows, inst, cls, view, search]);

  const printReadyLabels = async () => {
    const ids = filtered.map((r) => r.order_id);
    if (!ids.length) return;
    const { data, error: e } = await supabase.from('bags').select('id').in('order_id', ids).in('status', ['picked', 'checked', 'ready']);
    if (e) return toast.error(dbErrorMessage(e.message));
    if (!data?.length) return toast.info('אין שקיות ארוזות ברשימה המסוננת');
    router.push(`/bags/labels?ids=${data.map((b) => b.id).join(',')}`);
  };

  if (!year) return <EmptyState>יש לפתוח שנת לימודים.</EmptyState>;
  if (!rows) return <Spinner />;

  return (
    <div>
      <PageHeader title="הכנת שקיות">
        <Link href="/scan" className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm hover:bg-slate-50">
          <ScanLine className="h-4 w-4" /> סריקה
        </Link>
        <Protect permId="labels_print">
          <Button variant="secondary" onClick={printReadyLabels} disabled={!filtered.length}>
            <Printer className="h-4 w-4" /> מדבקות לשקיות ברשימה
          </Button>
        </Protect>
      </PageHeader>
      {error && <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      <div className="mb-3 flex flex-wrap gap-1">
        {VIEWS.map(([v, label]) => (
          <button
            key={v}
            type="button"
            onClick={() => setView(v)}
            className={`rounded-full px-4 py-2 text-sm ${view === v ? 'bg-blue-600 text-white' : 'bg-white text-slate-700 ring-1 ring-slate-200'}`}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="mb-3 flex flex-wrap gap-2">
        <select className={`${inputClass} w-auto`} value={inst} onChange={(e) => { setInst(e.target.value); setCls(''); }}>
          <option value="">כל המוסדות</option>
          {institutions.map(([id, name]) => (
            <option key={id} value={id}>{name}</option>
          ))}
        </select>
        <select className={`${inputClass} w-auto`} value={cls} onChange={(e) => setCls(e.target.value)}>
          <option value="">כל הכיתות</option>
          {classes.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
        <div className="relative">
          <Search className="absolute right-2.5 top-2.5 h-4 w-4 text-slate-400" />
          <input className="rounded-lg border border-slate-300 py-2 pl-3 pr-8 text-sm" placeholder="מס׳ הזמנה / שם..." value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <span className="self-center text-sm text-slate-500">{filtered.length} הזמנות</span>
      </div>

      {filtered.length === 0 ? (
        <EmptyState>אין הזמנות ברשימה הזו</EmptyState>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-600">
              <tr>
                <th className="px-3 py-2 text-right">הזמנה</th>
                <th className="px-3 py-2 text-right">תלמיד</th>
                <th className="px-3 py-2 text-right">מוסד / כיתה</th>
                <th className="px-3 py-2 text-right">ספרים</th>
                <th className="px-3 py-2 text-right">ארוז</th>
                <th className="px-3 py-2 text-right">מסירה</th>
                <th className="px-3 py-2 text-right">סטטוס</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map((r) => {
                const remaining = r.qty_total - r.qty_packed;
                return (
                  <tr key={r.order_id} className="cursor-pointer hover:bg-blue-50" onClick={() => router.push(`/bags/order/${r.order_id}`)}>
                    <td className="px-3 py-3 font-medium text-blue-700">{r.order_number}</td>
                    <td className="px-3 py-3">
                      <div className="font-medium">{r.student_name}</div>
                    </td>
                    <td className="px-3 py-3">
                      {r.inst_name} / {r.class_name}
                      {remaining > 0 && !availByIy.get(r.institution_year_id) && (
                        <div className="text-xs text-red-600">אין מלאי מוקצה למוסד</div>
                      )}
                    </td>
                    <td className="px-3 py-3">{r.qty_total}</td>
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-2">
                        <div className="h-2 w-16 overflow-hidden rounded bg-slate-100">
                          <div className={`h-full ${remaining ? 'bg-amber-400' : 'bg-emerald-500'}`} style={{ width: `${r.qty_total ? (r.qty_packed / r.qty_total) * 100 : 0}%` }} />
                        </div>
                        <span className="text-xs text-slate-500">{r.qty_packed}/{r.qty_total}</span>
                      </div>
                    </td>
                    <td className="px-3 py-3 text-slate-600">{DELIVERY_LABELS[r.delivery_method as 'pickup']}</td>
                    <td className="px-3 py-3"><OrderStatusBadge status={r.order_status as OrderStatus} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
