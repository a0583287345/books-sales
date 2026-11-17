'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronDown, FilePlus2, Info } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/components/AuthContext';
import { useYear } from '@/components/YearContext';
import { PageGuard } from '@/components/Protect';
import DateInput from '@/components/DateInput';
import { Button, ClosedYearNotice, EmptyState, Field, inputClass, PageHeader, Spinner } from '@/components/ui';
import { toast } from '@/components/Toaster';
import { dbErrorMessage } from '@/lib/dbErrors';
import { money, toNumber } from '@/lib/format';
import { BOOK_SUPPLIER_COLUMNS, fetchBooks, fetchSuppliers, type Book, type BookSupplier, type Supplier } from '@/lib/entities';
import { fetchDemand, fetchIyNames, fetchStockLevels, type DemandRow, type IyName, type StockLevel } from '@/lib/purchasing';

// =====================================================================
// תכנון רכש: לכל ספק – מה עוד צריך להזמין (נדרש בהזמנות − כבר הוזמן, כולל טיוטות), לפי מוסדות.
// כל כמות ניתנת לעריכה + רזרבה ידנית. בסוף – טיוטת הזמנת רכש לספק.
// =====================================================================

export default function PurchasePlanPage() {
  return (
    <PageGuard permId="po_manage">
      <PlanScreen />
    </PageGuard>
  );
}

type Data = {
  demand: DemandRow[];
  stock: Map<string, StockLevel>;
  iys: Map<string, IyName>;
  books: Map<string, Book>;
  suppliers: Supplier[];
  costs: BookSupplier[];
};

/** כמויות לעריכה: מפתח `${book}|${iy}` (iy ריק = רזרבה) */
type Qty = Record<string, string>;
const key = (book: string, iy: string | null) => `${book}|${iy ?? ''}`;

function PlanScreen() {
  const { year, readOnly } = useYear();
  const { hasPermission } = useAuth();
  const router = useRouter();
  const canSeeCost = hasPermission('books_view_cost');
  const [data, setData] = useState<Data | null>(null);
  const [supplierId, setSupplierId] = useState('');
  const yearId = year?.id ?? null;

  useEffect(() => {
    if (!yearId) return;
    let cancelled = false;
    void Promise.all([
      fetchDemand(yearId),
      fetchStockLevels(),
      fetchIyNames(yearId),
      fetchBooks(),
      fetchSuppliers(),
      canSeeCost ? supabase.from('book_suppliers').select(BOOK_SUPPLIER_COLUMNS) : Promise.resolve({ data: [] }),
    ]).then(([demand, stock, iys, books, suppliers, costs]) => {
      if (cancelled) return;
      setData({
        demand,
        stock,
        iys,
        books: new Map(books.map((b) => [b.id, b])),
        suppliers,
        costs: (costs.data ?? []) as BookSupplier[],
      });
    });
    return () => {
      cancelled = true;
    };
  }, [yearId, canSeeCost]);

  // סיכום לכל ספק: כמה ספרים ויחידות עוד צריך להזמין
  const bySupplier = useMemo(() => {
    const m = new Map<string, { books: Set<string>; need: number }>();
    for (const d of data?.demand ?? []) {
      const need = Math.max(d.demand - d.ordered - d.ordered_draft, 0);
      const k = d.supplier_id ?? '';
      const e = m.get(k) ?? { books: new Set<string>(), need: 0 };
      if (need > 0) e.books.add(d.book_id);
      e.need += need;
      m.set(k, e);
    }
    return m;
  }, [data]);

  if (!year) return <EmptyState>יש לפתוח שנת לימודים.</EmptyState>;
  if (readOnly) return <ClosedYearNotice />;
  if (!data) return <Spinner />;

  const supplierName = new Map(data.suppliers.map((s) => [s.id, s.name]));
  const supplierList = [...bySupplier.entries()].sort((a, b) => b[1].need - a[1].need);

  return (
    <div className="space-y-4">
      <PageHeader title={`תכנון רכש – ${year.name}`} />
      <p className="flex items-start gap-2 rounded-lg bg-blue-50 px-3 py-2 text-sm text-blue-800">
        <Info className="mt-0.5 h-4 w-4 shrink-0" />
        <span>
          &quot;צריך להזמין&quot; = כמות בהזמנות הלקוחות פחות מה שכבר הוזמן מהספק (כולל טיוטות). אפשר לשנות כל כמות, להוסיף רזרבה,
          ולהקטין לפי המלאי הפנוי (מלאי משנים קודמות). הספק של כל ספר נקבע לפי רשימת הכיתה.
        </span>
      </p>

      {supplierList.length === 0 ? (
        <EmptyState>אין עדיין הזמנות לקוחות בשנה הזו.</EmptyState>
      ) : (
        <div className="flex flex-wrap gap-2">
          {supplierList.map(([sid, s]) => (
            <button
              key={sid || 'none'}
              type="button"
              onClick={() => setSupplierId(sid)}
              className={`rounded-xl border px-4 py-3 text-right ${
                supplierId === sid ? 'border-blue-600 bg-blue-50' : 'border-slate-200 bg-white hover:bg-slate-50'
              }`}
            >
              <div className="font-semibold">{sid ? supplierName.get(sid) ?? 'ספק' : 'ללא ספק ברשימת הכיתה'}</div>
              <div className={`text-sm ${s.need ? 'text-red-600' : 'text-emerald-700'}`}>
                {s.need ? `צריך להזמין ${s.need} יח׳ (${s.books.size} ספרים)` : 'הכול הוזמן'}
              </div>
            </button>
          ))}
        </div>
      )}

      {supplierId === '' && bySupplier.has('') && (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
          יש ספרים בהזמנות שלא הוגדר להם ספק ברשימת הכיתה. יש לבחור ספק לספרים האלה במסך &quot;כיתות ורשימות&quot;.
        </p>
      )}

      {supplierId && (
        <SupplierPlan
          key={supplierId}
          supplierId={supplierId}
          supplierName={supplierName.get(supplierId) ?? ''}
          yearId={year.id}
          data={data}
          canSeeCost={canSeeCost}
          onCreated={(id) => router.push(`/purchase-orders/${id}`)}
        />
      )}
    </div>
  );
}

function SupplierPlan({
  supplierId,
  supplierName,
  yearId,
  data,
  canSeeCost,
  onCreated,
}: {
  supplierId: string;
  supplierName: string;
  yearId: string;
  data: Data;
  canSeeCost: boolean;
  onCreated: (id: string) => void;
}) {
  // ספרים של הספק, ולכל ספר – שורות המוסדות
  const books = useMemo(() => {
    const m = new Map<string, DemandRow[]>();
    for (const d of data.demand) {
      if (d.supplier_id !== supplierId) continue;
      const list = m.get(d.book_id) ?? [];
      list.push(d);
      m.set(d.book_id, list);
    }
    return [...m.entries()]
      .map(([bookId, rows]) => ({
        bookId,
        book: data.books.get(bookId),
        rows: rows.sort((a, b) => (data.iys.get(a.institution_year_id)?.name ?? '').localeCompare(data.iys.get(b.institution_year_id)?.name ?? '', 'he')),
      }))
      .sort((a, b) => (a.book?.name ?? '').localeCompare(b.book?.name ?? '', 'he'));
  }, [data, supplierId]);

  const [qty, setQty] = useState<Qty>(() => {
    const q: Qty = {};
    for (const b of books) for (const r of b.rows) {
      const need = Math.max(r.demand - r.ordered - r.ordered_draft, 0);
      if (need > 0) q[key(b.bookId, r.institution_year_id)] = String(need);
    }
    return q;
  });
  const [costs, setCosts] = useState<Record<string, string>>(() => {
    const c: Record<string, string> = {};
    for (const b of books) {
      const bs = data.costs.find((x) => x.book_id === b.bookId && x.supplier_id === supplierId);
      if (bs?.purchase_price != null) c[b.bookId] = String(bs.purchase_price);
    }
    return c;
  });
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [expected, setExpected] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const num = (k: string) => Math.max(toNumber(qty[k]) ?? 0, 0);
  const bookTotal = (bookId: string, rows: DemandRow[]) =>
    rows.reduce((s, r) => s + num(key(bookId, r.institution_year_id)), 0) + num(key(bookId, null));
  const grand = books.reduce((s, b) => s + bookTotal(b.bookId, b.rows), 0);
  const grandCost = books.reduce((s, b) => s + bookTotal(b.bookId, b.rows) * (toNumber(costs[b.bookId]) ?? 0), 0);

  const create = async () => {
    const items = books
      .map((b) => ({
        book_id: b.bookId,
        unit_cost: toNumber(costs[b.bookId]),
        allocations: [
          ...b.rows.map((r) => ({ institution_year_id: r.institution_year_id, qty: num(key(b.bookId, r.institution_year_id)) })),
          { institution_year_id: null, qty: num(key(b.bookId, null)) },
        ].filter((a) => a.qty > 0),
      }))
      .filter((i) => i.allocations.length > 0);
    if (!items.length) return toast.error('אין כמויות להזמנה');
    setSaving(true);
    const { data: id, error } = await supabase.rpc('create_purchase_order', {
      p_supplier: supplierId,
      p_year: yearId,
      p_items: items,
      p_notes: notes.trim() || undefined,
      p_expected: expected || undefined,
    });
    setSaving(false);
    if (error) return toast.error(dbErrorMessage(error.message));
    toast.success('נוצרה טיוטת הזמנת רכש');
    onCreated(id);
  };

  const cell = 'px-2 py-2';
  return (
    <div className="space-y-3 rounded-xl bg-white p-4 shadow-sm">
      <h2 className="text-lg font-bold">הזמנה מ{supplierName}</h2>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-600">
            <tr>
              <th className={`${cell} text-right`}>ספר</th>
              <th className={`${cell} text-right`}>נדרש</th>
              <th className={`${cell} text-right`}>כבר הוזמן</th>
              <th className={`${cell} text-right`}>מלאי פנוי</th>
              <th className={`${cell} text-right`}>רזרבה</th>
              <th className={`${cell} text-right`}>להזמנה עכשיו</th>
              {canSeeCost && <th className={`${cell} text-right`}>מחיר קנייה</th>}
            </tr>
          </thead>
          {books.map((b) => {
            const demand = b.rows.reduce((s, r) => s + r.demand, 0);
            const ordered = b.rows.reduce((s, r) => s + r.ordered + r.ordered_draft, 0);
            const st = data.stock.get(b.bookId);
            const free = st ? st.on_hand - st.allocated : 0;
            const total = bookTotal(b.bookId, b.rows);
            const isOpen = open[b.bookId];
            return (
              <tbody key={b.bookId} className="border-t border-slate-200">
                <tr className={total > 0 ? 'bg-blue-50/40' : ''}>
                  <td className={cell}>
                    <button type="button" onClick={() => setOpen((o) => ({ ...o, [b.bookId]: !isOpen }))} className="flex items-center gap-1 text-right font-medium">
                      <ChevronDown className={`h-4 w-4 transition ${isOpen ? '' : '-rotate-90'}`} />
                      {b.book?.name}
                    </button>
                    <div className="mr-5 text-xs text-slate-400">{b.book?.code} · {b.rows.length} מוסדות</div>
                  </td>
                  <td className={cell}>{demand}</td>
                  <td className={cell}>{ordered}</td>
                  <td className={`${cell} ${free > 0 ? 'font-medium text-emerald-700' : 'text-slate-400'}`}>{free}</td>
                  <td className={cell}>
                    <input
                      className={`${inputClass} w-16`}
                      inputMode="numeric"
                      value={qty[key(b.bookId, null)] ?? ''}
                      placeholder="0"
                      onChange={(e) => setQty((q) => ({ ...q, [key(b.bookId, null)]: e.target.value }))}
                    />
                  </td>
                  <td className={`${cell} text-base font-bold`}>{total}</td>
                  {canSeeCost && (
                    <td className={cell}>
                      <input
                        className={`${inputClass} w-20`}
                        inputMode="decimal"
                        value={costs[b.bookId] ?? ''}
                        onChange={(e) => setCosts((c) => ({ ...c, [b.bookId]: e.target.value }))}
                      />
                    </td>
                  )}
                </tr>
                {isOpen &&
                  b.rows.map((r) => {
                    const k = key(b.bookId, r.institution_year_id);
                    return (
                      <tr key={k} className="text-slate-600">
                        <td className={`${cell} pr-8`}>{data.iys.get(r.institution_year_id)?.name ?? 'מוסד'}</td>
                        <td className={cell}>{r.demand}</td>
                        <td className={cell}>
                          {r.ordered + r.ordered_draft}
                          {r.ordered_draft > 0 && <span className="text-xs text-slate-400"> (טיוטה {r.ordered_draft})</span>}
                        </td>
                        <td className={cell} />
                        <td className={cell} />
                        <td className={cell}>
                          <input
                            className={`${inputClass} w-16`}
                            inputMode="numeric"
                            value={qty[k] ?? ''}
                            placeholder="0"
                            onChange={(e) => setQty((q) => ({ ...q, [k]: e.target.value }))}
                          />
                        </td>
                        {canSeeCost && <td className={cell} />}
                      </tr>
                    );
                  })}
              </tbody>
            );
          })}
        </table>
      </div>

      <div className="grid gap-3 border-t border-slate-100 pt-3 sm:grid-cols-3">
        <Field label="צפי אספקה">
          <DateInput value={expected} onChange={setExpected} />
        </Field>
        <Field label="הערות לספק / פנימיות" className="sm:col-span-2">
          <input className={inputClass} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <span className="flex-1 text-sm">
          סה״כ להזמנה: <b>{grand}</b> יחידות
          {canSeeCost && grandCost > 0 && <> · {money(grandCost)}</>}
        </span>
        <Button variant="success" onClick={create} loading={saving} disabled={grand === 0}>
          <FilePlus2 className="h-4 w-4" /> יצירת טיוטת הזמנת רכש
        </Button>
      </div>
    </div>
  );
}
