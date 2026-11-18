'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Check, Mail, Printer, ScanLine } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useYear } from '@/components/YearContext';
import { PageGuard, Protect } from '@/components/Protect';
import { OrderStatusBadge } from '@/components/orders/OrderStatusBadge';
import { Button, EmptyState, Modal, PageHeader, Spinner } from '@/components/ui';
import { OrderEmailModal } from '@/components/email/OrderEmailModal';
import { FilterStatus, heCompare, matches, MultiSelect, SearchBox, SortSelect, useStoredState } from '@/components/filters';
import { toast } from '@/components/Toaster';
import { dbErrorMessage } from '@/lib/dbErrors';
import { normalizeSearch } from '@/lib/format';
import { DELIVERY_LABELS, type OrderStatus } from '@/lib/orders';
import { openLabels } from '@/lib/warehouse';

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
  ['open', 'בליקוט'],
  ['partial', 'ארוזות חלקית'],
  ['ready', 'מוכנות'],
  ['delivered', 'נמסרו'],
  ['all', 'הכול'],
] as const;
type View = (typeof VIEWS)[number][0];

/**
 * השלב של ההזמנה – כל הזמנה בלשונית אחת בלבד (נבדק לפי הסדר):
 * נמסרו – כל הספרים נמסרו · בליקוט – יש שקית שעוד לא סומנה מוכנה · מוכנות – הכול בשקיות מוכנות/שנמסרו, בלי חוסר ·
 * ארוזות חלקית – יש שקית מוכנה/שנמסרה אבל חסרים ספרים · לאריזה – לא נארז כלום (חוץ מ"ממתינה לאישור").
 * null = מופיעה רק ב"הכול" (ממתינה לאישור / בלי ספרים פעילים)
 */
function stageOf(r: Row): Exclude<View, 'all'> | null {
  if (r.qty_total > 0 && r.qty_delivered >= r.qty_total) return 'delivered';
  if (r.bags_open > 0) return 'open';
  if (r.qty_total > 0 && r.qty_packed >= r.qty_total) return 'ready';
  if (r.qty_packed > 0) return 'partial';
  if (r.qty_total > 0 && r.order_status !== 'pending') return 'todo';
  return null;
}

const SORTS = [
  ['inst', 'מוסד, כיתה ושם'],
  ['name', 'שם התלמיד (א-ב)'],
  ['number', 'מספר הזמנה'],
  ['packed', 'כמה נארז'],
] as const;
type SortKey = (typeof SORTS)[number][0];

type Filters = { view: View; inst: string[]; cls: string[]; delivery: string[]; sort: SortKey; desc: boolean };
const DEFAULT_FILTERS: Filters = { view: 'todo', inst: [], cls: [], delivery: [], sort: 'inst', desc: false };

/** מפתח כיתה – שם הכיתה בתוך המוסד */
const classKey = (r: Row) => `${r.institution_year_id}|${r.class_name}`;

function BagsScreen() {
  const { year } = useYear();
  const router = useRouter();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [search, setSearch] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [availByIy, setAvailByIy] = useState<Map<string, number>>(new Map());
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [printing, setPrinting] = useState(false);
  const [mailIds, setMailIds] = useState<string[] | null>(null);
  const yearId = year?.id ?? null;
  const [f, setF] = useStoredState(yearId ? `bags:${yearId}` : null, DEFAULT_FILTERS);
  const view = f.view;

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

  // לפי מוסד/כיתה/מסירה (בלי הלשונית והחיפוש) – גם בשביל המונים על הלשוניות
  const baseRows = useMemo(
    () =>
      (rows ?? []).filter(
        (r) => matches(f.inst, r.institution_year_id) && matches(f.cls, classKey(r)) && matches(f.delivery, r.delivery_method)
      ),
    [rows, f.inst, f.cls, f.delivery]
  );
  const viewCounts = useMemo(() => {
    const m = new Map<View, number>([['all', baseRows.length]]);
    for (const r of baseRows) {
      const s = stageOf(r);
      if (s) m.set(s, (m.get(s) ?? 0) + 1);
    }
    return m;
  }, [baseRows]);

  const filtered = useMemo(() => {
    const q = normalizeSearch(search);
    const list = baseRows.filter((r) => {
      if (view !== 'all' && stageOf(r) !== view) return false;
      if (q && !(String(r.order_number) === q || normalizeSearch(`${r.student_name} ${r.customer_name}`).includes(q))) return false;
      return true;
    });
    const share = (r: Row) => (r.qty_total ? r.qty_packed / r.qty_total : 0);
    const cmp: Record<SortKey, (a: Row, b: Row) => number> = {
      inst: (a, b) => heCompare(a.inst_name, b.inst_name) || heCompare(a.class_name, b.class_name) || heCompare(a.student_name, b.student_name),
      name: (a, b) => heCompare(a.student_name, b.student_name),
      number: (a, b) => a.order_number - b.order_number,
      packed: (a, b) => share(a) - share(b),
    };
    const c = cmp[f.sort] ?? cmp.inst;
    return list.sort((a, b) => (f.desc ? -c(a, b) : c(a, b)));
  }, [baseRows, f.sort, f.desc, view, search]);

  const filterActive = !!search.trim() || f.inst.length + f.cls.length + f.delivery.length > 0;
  const clearAll = () => {
    setSearch('');
    setF({ inst: [], cls: [], delivery: [] });
  };

  // בחירת שורות להדפסה – רק מתוך מה שמוצג
  const shownSelected = filtered.filter((r) => selected.has(r.order_id));
  const allChecked = filtered.length > 0 && shownSelected.length === filtered.length;
  const toggleRow = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const toggleAll = () => setSelected(allChecked ? new Set() : new Set(filtered.map((r) => r.order_id)));
  const printScope = shownSelected.length ? shownSelected : filtered;

  if (!year) return <EmptyState>יש לפתוח שנת לימודים.</EmptyState>;
  if (!rows) return <Spinner />;

  return (
    <div>
      <PageHeader title="הכנת שקיות">
        <Link href="/scan" className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm hover:bg-slate-50">
          <ScanLine className="h-4 w-4" /> סריקה
        </Link>
        <Protect permId="emails_send" lockedFallback={null}>
          <Button variant="secondary" onClick={() => setMailIds(printScope.map((r) => r.order_id))} disabled={!filtered.length} title="ההזמנה מוכנה – להזמנות שנבחרו, או לכל הרשימה המסוננת">
            <Mail className="h-4 w-4" /> מייל: ההזמנה מוכנה
            {shownSelected.length > 0 ? ` (${shownSelected.length})` : ''}
          </Button>
        </Protect>
        <Protect permId="labels_print">
          <Button variant="secondary" onClick={() => setPrinting(true)} disabled={!filtered.length}>
            <Printer className="h-4 w-4" /> הדפסת מדבקות
            {shownSelected.length > 0 ? ` (${shownSelected.length} נבחרו)` : ''}
          </Button>
        </Protect>
      </PageHeader>
      {error && <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      <div className="mb-3 flex flex-wrap gap-1">
        {VIEWS.map(([v, label]) => (
          <button
            key={v}
            type="button"
            onClick={() => setF({ view: v })}
            className={`rounded-full px-4 py-2 text-sm ${view === v ? 'bg-blue-600 text-white' : 'bg-white text-slate-700 ring-1 ring-slate-200'}`}
          >
            {label} <span className={view === v ? 'text-blue-100' : 'text-slate-400'}>({viewCounts.get(v) ?? 0})</span>
          </button>
        ))}
      </div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <SearchBox value={search} onChange={setSearch} placeholder="מס׳ הזמנה / שם..." />
        <MultiSelect label="מוסד" options={instOptions} value={f.inst} onChange={(inst) => setF({ inst, cls: [] })} />
        <MultiSelect label="כיתה" options={classOptions} value={f.cls} onChange={(cls) => setF({ cls })} />
        <MultiSelect
          label="מסירה"
          options={Object.entries(DELIVERY_LABELS).map(([value, label]) => ({ value, label }))}
          value={f.delivery}
          onChange={(delivery) => setF({ delivery })}
        />
        <SortSelect options={SORTS} value={f.sort} desc={f.desc} onChange={(sort, desc) => setF({ sort, desc })} />
      </div>
      <FilterStatus active={filterActive} shown={filtered.length} total={rows.length} noun="הזמנות" onClear={clearAll}>
        {shownSelected.length > 0 && (
          <span>
            · {shownSelected.length} נבחרו{' '}
            <button type="button" className="text-blue-700 hover:underline" onClick={() => setSelected(new Set())}>
              (ביטול הבחירה)
            </button>
          </span>
        )}
      </FilterStatus>

      {filtered.length === 0 ? (
        <EmptyState>אין הזמנות ברשימה הזו</EmptyState>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-600">
              <tr>
                <th className="w-10 px-3 py-2">
                  <CheckBox on={allChecked} onClick={toggleAll} label="בחירת הכול" />
                </th>
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
                const on = selected.has(r.order_id);
                return (
                  <tr key={r.order_id} className={`cursor-pointer hover:bg-blue-50 ${on ? 'bg-blue-50/60' : ''}`} onClick={() => router.push(`/bags/order/${r.order_id}`)}>
                    <td className="px-3 py-3" onClick={(e) => e.stopPropagation()}>
                      <CheckBox on={on} onClick={() => toggleRow(r.order_id)} label={`בחירת הזמנה ${r.order_number}`} />
                    </td>
                    <td className="px-3 py-3 font-medium text-blue-700">{r.order_number}</td>
                    <td className="px-3 py-3">
                      <div className="font-medium">{r.student_name}</div>
                    </td>
                    <td className="px-3 py-3">
                      {r.inst_name} / {r.class_name}
                      {remaining > 0 && !availByIy.get(r.institution_year_id) && <div className="text-xs text-red-600">אין מלאי מוקצה למוסד</div>}
                    </td>
                    <td className="px-3 py-3">{r.qty_total}</td>
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-2">
                        <div className="h-2 w-16 overflow-hidden rounded bg-slate-100">
                          <div className={`h-full ${remaining ? 'bg-amber-400' : 'bg-emerald-500'}`} style={{ width: `${r.qty_total ? (r.qty_packed / r.qty_total) * 100 : 0}%` }} />
                        </div>
                        <span className="text-xs text-slate-500">
                          {r.qty_packed}/{r.qty_total}
                        </span>
                      </div>
                    </td>
                    <td className="px-3 py-3 text-slate-600">{DELIVERY_LABELS[r.delivery_method as 'pickup']}</td>
                    <td className="px-3 py-3">
                      <OrderStatusBadge status={r.order_status as OrderStatus} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {mailIds && (
        <OrderEmailModal
          orderIds={mailIds}
          scopeLabel={shownSelected.length ? mailIds.length + ' הזמנות שנבחרו' : mailIds.length + ' הזמנות' + (filterActive ? ' (לפי הסינון)' : '')}
          onClose={() => setMailIds(null)}
        />
      )}
      {printing && (
        <PrintLabelsModal
          orders={printScope}
          selectedCount={shownSelected.length}
          onClose={() => setPrinting(false)}
          onGo={(ids) => openLabels(router, ids)}
        />
      )}
    </div>
  );
}

function CheckBox({ on, onClick, label }: { on: boolean; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-pressed={on}
      className={`flex h-6 w-6 items-center justify-center rounded border ${on ? 'border-blue-600 bg-blue-600 text-white' : 'border-slate-300 bg-white'}`}
    >
      {on && <Check className="h-4 w-4" />}
    </button>
  );
}

type BagLite = { id: string; status: string; label_printed_at: string | null };
type PrintKind = 'ready' | 'unprinted' | 'packed';

const PACKED = ['picked', 'checked', 'ready'];
const PRINT_KINDS: { key: PrintKind; label: string; test: (b: BagLite) => boolean }[] = [
  { key: 'ready', label: 'כל השקיות המוכנות למסירה', test: (b) => b.status === 'ready' },
  { key: 'unprinted', label: 'שקיות ארוזות שעוד לא הודפסה להן מדבקה', test: (b) => PACKED.includes(b.status) && !b.label_printed_at },
  { key: 'packed', label: 'כל השקיות הארוזות (שלא נמסרו)', test: (b) => PACKED.includes(b.status) },
];

/** הדפסת מדבקות בבת אחת להזמנות שברשימה (או לנבחרות) */
function PrintLabelsModal({
  orders,
  selectedCount,
  onClose,
  onGo,
}: {
  orders: Row[];
  selectedCount: number;
  onClose: () => void;
  onGo: (ids: string[]) => void;
}) {
  const [bags, setBags] = useState<BagLite[] | null>(null);
  const [kind, setKind] = useState<PrintKind>('ready');

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const ids = orders.map((o) => o.order_id);
      const out: BagLite[] = [];
      // בחלקים – כדי שהבקשה לא תהיה ארוכה מדי
      for (let i = 0; i < ids.length; i += 150) {
        const { data, error } = await supabase.from('bags').select('id, status, label_printed_at').in('order_id', ids.slice(i, i + 150));
        if (error) {
          toast.error(dbErrorMessage(error.message));
          break;
        }
        out.push(...((data ?? []) as BagLite[]));
      }
      if (!cancelled) setBags(out);
    })();
    return () => {
      cancelled = true;
    };
  }, [orders]);

  const test = PRINT_KINDS.find((k) => k.key === kind)!.test;
  const chosen = (bags ?? []).filter(test);

  return (
    <Modal
      title="הדפסת מדבקות"
      onClose={onClose}
      size="md"
      footer={
        <>
          <Button onClick={() => onGo(chosen.map((b) => b.id))} disabled={!chosen.length} className="px-6 py-2.5 text-base">
            <Printer className="h-5 w-5" /> למדבקות ({chosen.length})
          </Button>
          <Button variant="secondary" onClick={onClose}>
            ביטול
          </Button>
        </>
      }
    >
      <div className="space-y-3 rounded-xl bg-white p-4">
        <p className="text-sm text-slate-600">
          מתוך {selectedCount ? `${selectedCount} ההזמנות שנבחרו` : `${orders.length} ההזמנות שברשימה (לפי הסינון)`}:
        </p>
        {bags === null ? (
          <Spinner />
        ) : (
          <div className="space-y-2">
            {PRINT_KINDS.map((k) => (
              <label
                key={k.key}
                className={`flex cursor-pointer items-center gap-3 rounded-xl border p-3 ${kind === k.key ? 'border-blue-500 bg-blue-50' : 'border-slate-200'}`}
              >
                <input type="radio" name="kind" checked={kind === k.key} onChange={() => setKind(k.key)} className="h-5 w-5" />
                <span className="flex-1">{k.label}</span>
                <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-sm font-medium">{bags.filter(k.test).length}</span>
              </label>
            ))}
          </div>
        )}
      </div>
    </Modal>
  );
}
