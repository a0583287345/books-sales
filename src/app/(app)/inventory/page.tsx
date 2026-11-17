'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Boxes, FileSpreadsheet, History, PackagePlus, Printer, Search, Share2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/components/AuthContext';
import { useYear } from '@/components/YearContext';
import { PageGuard, Protect } from '@/components/Protect';
import { Button, EmptyState, Field, inputClass, Modal, PageHeader, Spinner } from '@/components/ui';
import { toast } from '@/components/Toaster';
import { dbErrorMessage } from '@/lib/dbErrors';
import { exportToExcel } from '@/lib/excel';
import { formatDate, normalizeSearch, toNumber } from '@/lib/format';
import { fetchBooks, fetchSuppliers, type Book } from '@/lib/entities';
import { fetchDemand, fetchIyNames, fetchStockLevels, type DemandRow, type IyName, type StockLevel } from '@/lib/purchasing';

export default function InventoryPage() {
  return (
    <PageGuard permId="inventory_view">
      <InventoryScreen />
    </PageGuard>
  );
}

type Data = {
  demand: DemandRow[];
  stock: Map<string, StockLevel>;
  iys: Map<string, IyName>;
  books: Map<string, Book>;
  supplierName: Map<string, string>;
  /** צפי אספקה מוקדם ביותר לספר (מהזמנות רכש פתוחות) */
  expected: Map<string, string>;
};

async function loadData(yearId: string): Promise<Data> {
  const [demand, stock, iys, books, suppliers, { data: pos }] = await Promise.all([
    fetchDemand(yearId),
    fetchStockLevels(),
    fetchIyNames(yearId),
    fetchBooks(),
    fetchSuppliers(),
    supabase.from('purchase_orders').select('expected_date, status, po_items(book_id, qty_ordered, qty_received)').eq('year_id', yearId).in('status', ['sent', 'partial']),
  ]);
  const expected = new Map<string, string>();
  for (const p of pos ?? []) {
    if (!p.expected_date) continue;
    for (const i of (p.po_items as unknown as { book_id: string; qty_ordered: number; qty_received: number }[]) ?? []) {
      if (i.qty_received >= i.qty_ordered) continue;
      const cur = expected.get(i.book_id);
      if (!cur || p.expected_date < cur) expected.set(i.book_id, p.expected_date);
    }
  }
  return {
    demand,
    stock,
    iys,
    books: new Map(books.map((b) => [b.id, b])),
    supplierName: new Map(suppliers.map((s) => [s.id, s.name])),
    expected,
  };
}

type Tab = 'stock' | 'supplier' | 'institution';

function InventoryScreen() {
  const { year } = useYear();
  const [data, setData] = useState<Data | null>(null);
  const [tab, setTab] = useState<Tab>('stock');
  const yearId = year?.id ?? null;

  const reload = useCallback(async () => {
    if (yearId) setData(await loadData(yearId));
  }, [yearId]);
  useEffect(() => {
    if (!yearId) return;
    let cancelled = false;
    void loadData(yearId).then((d) => !cancelled && setData(d));
    return () => {
      cancelled = true;
    };
  }, [yearId]);

  if (!year) return <EmptyState>יש לפתוח שנת לימודים.</EmptyState>;
  if (!data) return <Spinner />;

  const tabs: [Tab, string][] = [
    ['stock', 'מצב מלאי והקצאה'],
    ['supplier', 'חוסרים לפי ספק'],
    ['institution', 'דוח למוסד'],
  ];

  return (
    <div>
      <PageHeader title={`מלאי וחוסרים – ${year.name}`} />
      <div className="mb-4 flex gap-1 overflow-x-auto border-b border-slate-200 print:hidden">
        {tabs.map(([t, label]) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`whitespace-nowrap border-b-2 px-4 py-2.5 text-sm ${tab === t ? 'border-blue-600 font-semibold text-blue-700' : 'border-transparent text-slate-600'}`}
          >
            {label}
          </button>
        ))}
      </div>
      {tab === 'stock' && <StockTab data={data} onChanged={reload} />}
      {tab === 'supplier' && <SupplierReport data={data} yearName={year.name} />}
      {tab === 'institution' && <InstitutionReport data={data} yearName={year.name} />}
    </div>
  );
}

// ---------------------------------------------------------------------
// מצב מלאי
// ---------------------------------------------------------------------

type BookSummary = {
  book: Book;
  onHand: number;
  allocated: number;
  free: number;
  demand: number;
  missing: number; // נדרש − הוקצה
  onOrder: number;
  inDraft: number;
  toOrder: number; // חסר שלא מכוסה ע"י מלאי פנוי והזמנות פתוחות
};

function summarize(data: Data): BookSummary[] {
  const demandByBook = new Map<string, { demand: number; allocated: number }>();
  for (const d of data.demand) {
    const e = demandByBook.get(d.book_id) ?? { demand: 0, allocated: 0 };
    e.demand += d.demand;
    e.allocated += Math.min(d.allocated, d.demand);
    demandByBook.set(d.book_id, e);
  }
  const ids = new Set([...demandByBook.keys(), ...data.stock.keys()]);
  return [...ids]
    .map((id) => {
      const book = data.books.get(id);
      if (!book) return null;
      const s = data.stock.get(id);
      const dm = demandByBook.get(id) ?? { demand: 0, allocated: 0 };
      const onHand = s?.on_hand ?? 0;
      const allocated = s?.allocated ?? 0;
      const free = onHand - allocated;
      const missing = Math.max(dm.demand - dm.allocated, 0);
      const onOrder = s?.on_order ?? 0;
      const inDraft = s?.in_draft ?? 0;
      return { book, onHand, allocated, free, demand: dm.demand, missing, onOrder, inDraft, toOrder: Math.max(missing - free - onOrder - inDraft, 0) };
    })
    .filter((x): x is BookSummary => !!x)
    .sort((a, b) => a.book.name.localeCompare(b.book.name, 'he'));
}

function StockTab({ data, onChanged }: { data: Data; onChanged: () => void }) {
  const { hasPermission } = useAuth();
  const [search, setSearch] = useState('');
  const [onlyMissing, setOnlyMissing] = useState(false);
  const [adjusting, setAdjusting] = useState<Book | null>(null);
  const [allocating, setAllocating] = useState<BookSummary | null>(null);
  const [history, setHistory] = useState<Book | null>(null);
  const [addingOpening, setAddingOpening] = useState(false);

  const rows = useMemo(() => summarize(data), [data]);
  const filtered = rows.filter(
    (r) =>
      (!onlyMissing || r.missing > 0) &&
      (!search || normalizeSearch(`${r.book.code} ${r.book.name}`).includes(normalizeSearch(search)))
  );

  const exportExcel = () =>
    exportToExcel('מצב מלאי', [
      {
        name: 'מלאי',
        rows: filtered.map((r) => ({
          קוד: r.book.code,
          ספר: r.book.name,
          'במלאי': r.onHand,
          'מוקצה למוסדות': r.allocated,
          'פנוי': r.free,
          'נדרש בהזמנות': r.demand,
          'חסר למוסדות': r.missing,
          'בהזמנות רכש פתוחות': r.onOrder,
          'בטיוטות': r.inDraft,
          'עוד להזמין': r.toOrder,
        })),
      },
    ]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 print:hidden">
        <div className="relative">
          <Search className="absolute right-2.5 top-2.5 h-4 w-4 text-slate-400" />
          <input className="rounded-lg border border-slate-300 py-2 pl-3 pr-8 text-sm" placeholder="חיפוש ספר..." value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={onlyMissing} onChange={(e) => setOnlyMissing(e.target.checked)} /> רק ספרים עם חוסר
        </label>
        <div className="flex-1" />
        <Protect permId="inventory_adjust">
          <Button variant="secondary" onClick={() => setAddingOpening(true)}>
            <PackagePlus className="h-4 w-4" /> מלאי פתיחה לספר
          </Button>
        </Protect>
        <Protect permId="export_excel">
          <Button variant="secondary" onClick={exportExcel} disabled={!filtered.length}>
            <FileSpreadsheet className="h-4 w-4" /> אקסל
          </Button>
        </Protect>
      </div>

      {filtered.length === 0 ? (
        <EmptyState>{rows.length ? 'אין ספרים שמתאימים לסינון' : 'אין עדיין מלאי או הזמנות.'}</EmptyState>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-600">
              <tr>
                <th className="px-3 py-2 text-right">ספר</th>
                <th className="px-3 py-2 text-right">במלאי</th>
                <th className="px-3 py-2 text-right">מוקצה</th>
                <th className="px-3 py-2 text-right">פנוי</th>
                <th className="px-3 py-2 text-right">נדרש</th>
                <th className="px-3 py-2 text-right">חסר למוסדות</th>
                <th className="px-3 py-2 text-right">בהזמנת רכש</th>
                <th className="px-3 py-2 text-right">עוד להזמין</th>
                <th className="px-3 py-2 print:hidden" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map((r) => (
                <tr key={r.book.id}>
                  <td className="px-3 py-2">
                    <div className="font-medium">{r.book.name}</div>
                    <div className="text-xs text-slate-400">{r.book.code}</div>
                  </td>
                  <td className="px-3 py-2 font-medium">{r.onHand}</td>
                  <td className="px-3 py-2">{r.allocated}</td>
                  <td className={`px-3 py-2 ${r.free > 0 ? 'font-medium text-emerald-700' : r.free < 0 ? 'text-red-600' : 'text-slate-400'}`}>{r.free}</td>
                  <td className="px-3 py-2">{r.demand}</td>
                  <td className={`px-3 py-2 ${r.missing ? 'font-medium text-red-600' : 'text-slate-400'}`}>{r.missing}</td>
                  <td className="px-3 py-2">
                    {r.onOrder}
                    {r.inDraft > 0 && <span className="text-xs text-slate-400"> (+{r.inDraft} טיוטה)</span>}
                  </td>
                  <td className={`px-3 py-2 ${r.toOrder ? 'font-bold text-red-600' : 'text-slate-400'}`}>{r.toOrder}</td>
                  <td className="px-3 py-2 print:hidden">
                    <div className="flex justify-end gap-1">
                      {hasPermission('inventory_allocate') && r.demand > 0 && (
                        <Button variant="secondary" onClick={() => setAllocating(r)}>
                          <Share2 className="h-4 w-4" /> הקצאה
                        </Button>
                      )}
                      <Protect permId="inventory_adjust">
                        <Button variant="ghost" onClick={() => setAdjusting(r.book)} title="תיקון מלאי">
                          <Boxes className="h-4 w-4" />
                        </Button>
                      </Protect>
                      <Button variant="ghost" onClick={() => setHistory(r.book)} title="תנועות מלאי">
                        <History className="h-4 w-4" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-xs text-slate-400">
        &quot;עוד להזמין&quot; = חסר למוסדות פחות המלאי הפנוי ומה שכבר בהזמנות רכש (כולל טיוטות). הקצאה = שיוך ספרים מהמלאי למוסד.
      </p>

      {(adjusting || addingOpening) && (
        <AdjustModal
          book={adjusting}
          books={[...data.books.values()]}
          stock={data.stock}
          onClose={() => {
            setAdjusting(null);
            setAddingOpening(false);
          }}
          onDone={async () => {
            setAdjusting(null);
            setAddingOpening(false);
            await onChanged();
          }}
        />
      )}
      {allocating && (
        <AllocateModal
          summary={allocating}
          data={data}
          onClose={() => setAllocating(null)}
          onDone={async () => {
            setAllocating(null);
            await onChanged();
          }}
        />
      )}
      {history && <MovementsModal book={history} iys={data.iys} onClose={() => setHistory(null)} />}
    </div>
  );
}

function AdjustModal({
  book,
  books,
  stock,
  onClose,
  onDone,
}: {
  book: Book | null;
  books: Book[];
  stock: Map<string, StockLevel>;
  onClose: () => void;
  onDone: () => void;
}) {
  const [bookId, setBookId] = useState(book?.id ?? '');
  const [kind, setKind] = useState<'opening' | 'adjust'>(book ? 'adjust' : 'opening');
  const [qty, setQty] = useState('');
  const [reason, setReason] = useState(book ? '' : 'מלאי משנה קודמת');
  const [saving, setSaving] = useState(false);
  const s = stock.get(bookId);

  const run = async () => {
    const q = toNumber(qty);
    if (!bookId) return toast.error('יש לבחור ספר');
    if (!q) return toast.error('יש להזין כמות');
    setSaving(true);
    const { error } = await supabase.rpc('adjust_stock', { p_book: bookId, p_qty: q, p_kind: kind, p_reason: reason });
    setSaving(false);
    if (error) return toast.error(dbErrorMessage(error.message));
    toast.success('המלאי עודכן');
    onDone();
  };

  return (
    <Modal
      title={book ? `תיקון מלאי: ${book.name}` : 'מלאי פתיחה'}
      onClose={onClose}
      size="md"
      footer={
        <>
          <Button variant="success" onClick={run} loading={saving}>שמירה</Button>
          <Button variant="secondary" onClick={onClose}>ביטול</Button>
        </>
      }
    >
      <div className="grid gap-3 rounded-xl bg-white p-4 sm:grid-cols-2">
        {!book && (
          <Field label="ספר" className="sm:col-span-2">
            <select className={inputClass} value={bookId} onChange={(e) => setBookId(e.target.value)}>
              <option value="">בחירה...</option>
              {books
                .filter((b) => b.is_active)
                .sort((a, b) => a.name.localeCompare(b.name, 'he'))
                .map((b) => (
                  <option key={b.id} value={b.id}>{b.code} – {b.name}</option>
                ))}
            </select>
          </Field>
        )}
        <Field label="סוג">
          <select className={inputClass} value={kind} onChange={(e) => setKind(e.target.value as 'opening' | 'adjust')}>
            <option value="opening">מלאי פתיחה (משנים קודמות)</option>
            <option value="adjust">תיקון (ספירה, נזק, אבדן)</option>
          </select>
        </Field>
        <Field label="כמות" hint="חיובית להוספה, שלילית להורדה (למשל ‎-3)">
          <input className={inputClass} dir="ltr" value={qty} onChange={(e) => setQty(e.target.value)} />
        </Field>
        <Field label="סיבה" className="sm:col-span-2">
          <input className={inputClass} value={reason} onChange={(e) => setReason(e.target.value)} />
        </Field>
        {bookId && (
          <p className="text-sm text-slate-500 sm:col-span-2">
            כרגע במלאי: {s?.on_hand ?? 0} · מוקצה: {s?.allocated ?? 0}
          </p>
        )}
      </div>
    </Modal>
  );
}

function AllocateModal({ summary, data, onClose, onDone }: { summary: BookSummary; data: Data; onClose: () => void; onDone: () => void }) {
  const rows = useMemo(
    () =>
      data.demand
        .filter((d) => d.book_id === summary.book.id && (d.demand > 0 || d.allocated > 0))
        .sort((a, b) => (data.iys.get(a.institution_year_id)?.name ?? '').localeCompare(data.iys.get(b.institution_year_id)?.name ?? '', 'he')),
    [data, summary.book.id]
  );
  const [values, setValues] = useState<Record<string, string>>(() => Object.fromEntries(rows.map((r) => [r.institution_year_id, String(r.allocated)])));
  const [saving, setSaving] = useState(false);

  const n = (iy: string) => Math.max(toNumber(values[iy]) ?? 0, 0);
  // מוקצה למוסדות בשנים אחרות – לא מופיע כאן אבל תופס מלאי
  const thisYearOld = rows.reduce((s, r) => s + r.allocated, 0);
  const otherAllocated = summary.allocated - thisYearOld;
  const totalNew = rows.reduce((s, r) => s + n(r.institution_year_id), 0);
  const available = summary.onHand - otherAllocated;
  const over = totalNew > available;

  const fillByDemand = () => {
    let left = available;
    const next: Record<string, string> = {};
    for (const r of rows) {
      const give = Math.min(r.demand, Math.max(left, 0));
      next[r.institution_year_id] = String(give);
      left -= give;
    }
    setValues(next);
  };

  const save = async () => {
    setSaving(true);
    // קודם הקטנות ואחר כך הגדלות – כדי לא לחרוג מהמלאי באמצע
    const changes = rows
      .filter((r) => n(r.institution_year_id) !== r.allocated)
      .sort((a, b) => n(a.institution_year_id) - a.allocated - (n(b.institution_year_id) - b.allocated));
    for (const r of changes) {
      const { error } = await supabase.rpc('set_allocation', { p_iy: r.institution_year_id, p_book: summary.book.id, p_qty: n(r.institution_year_id) });
      if (error) {
        setSaving(false);
        toast.error(`${data.iys.get(r.institution_year_id)?.name}: ${dbErrorMessage(error.message)}`);
        return onDone();
      }
    }
    setSaving(false);
    toast.success('ההקצאה נשמרה');
    onDone();
  };

  return (
    <Modal
      title={`הקצאה למוסדות: ${summary.book.name}`}
      onClose={onClose}
      footer={
        <>
          <Button variant="success" onClick={save} loading={saving} disabled={over}>שמירת ההקצאה</Button>
          <Button variant="secondary" onClick={fillByDemand}>מילוי לפי הדרישה</Button>
          <Button variant="secondary" onClick={onClose}>ביטול</Button>
        </>
      }
    >
      <p className={`rounded-lg px-3 py-2 text-sm ${over ? 'bg-red-50 text-red-800' : 'bg-blue-50 text-blue-800'}`}>
        במלאי {summary.onHand}
        {otherAllocated > 0 && ` (מתוכם ${otherAllocated} מוקצים לשנים אחרות)`} · זמין להקצאה כאן {available} · מוקצה בטופס {totalNew}
        {over && ' – יותר מהמלאי!'}
      </p>
      <div className="overflow-x-auto rounded-xl bg-white">
        <table className="w-full text-sm">
          <thead className="text-slate-500">
            <tr>
              <th className="px-3 py-2 text-right">מוסד</th>
              <th className="px-3 py-2 text-right">נדרש</th>
              <th className="px-3 py-2 text-right">הוזמן מספק</th>
              <th className="px-3 py-2 text-right">מוקצה</th>
              <th className="px-3 py-2 text-right">חסר</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((r) => {
              const v = n(r.institution_year_id);
              return (
                <tr key={r.institution_year_id}>
                  <td className="px-3 py-2 font-medium">{data.iys.get(r.institution_year_id)?.name}</td>
                  <td className="px-3 py-2">{r.demand}</td>
                  <td className="px-3 py-2 text-slate-500">{r.ordered}</td>
                  <td className="px-3 py-2">
                    <input
                      className={`${inputClass} w-20`}
                      inputMode="numeric"
                      value={values[r.institution_year_id] ?? ''}
                      onChange={(e) => setValues((x) => ({ ...x, [r.institution_year_id]: e.target.value }))}
                    />
                  </td>
                  <td className={`px-3 py-2 ${r.demand - v > 0 ? 'text-red-600' : 'text-slate-400'}`}>{Math.max(r.demand - v, 0)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Modal>
  );
}

const KIND_LABELS: Record<string, string> = {
  opening: 'מלאי פתיחה',
  adjust: 'תיקון',
  receipt: 'קליטה מספק',
  supplier_return: 'החזרה לספק',
  delivered: 'נמסר ללקוח',
};

function MovementsModal({ book, iys, onClose }: { book: Book; iys: Map<string, IyName>; onClose: () => void }) {
  const [rows, setRows] = useState<{ id: number; qty: number; kind: string; reason: string | null; created_at: string; created_by_name: string | null; institution_year_id: string | null }[] | null>(null);
  useEffect(() => {
    let cancelled = false;
    void supabase
      .from('stock_movements')
      .select('id, qty, kind, reason, created_at, created_by_name, institution_year_id')
      .eq('book_id', book.id)
      .order('id', { ascending: false })
      .limit(200)
      .then(({ data }) => !cancelled && setRows(data ?? []));
    return () => {
      cancelled = true;
    };
  }, [book.id]);

  return (
    <Modal title={`תנועות מלאי: ${book.name}`} onClose={onClose}>
      {!rows ? (
        <Spinner />
      ) : rows.length === 0 ? (
        <p className="text-sm text-slate-400">אין תנועות.</p>
      ) : (
        <table className="w-full rounded-xl bg-white text-sm">
          <thead className="text-slate-500">
            <tr>
              <th className="px-3 py-2 text-right">תאריך</th>
              <th className="px-3 py-2 text-right">סוג</th>
              <th className="px-3 py-2 text-right">כמות</th>
              <th className="px-3 py-2 text-right">פרטים</th>
              <th className="px-3 py-2 text-right">ע״י</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="px-3 py-1.5">{new Date(r.created_at).toLocaleDateString('he-IL')}</td>
                <td className="px-3 py-1.5">{KIND_LABELS[r.kind] ?? r.kind}</td>
                <td className={`px-3 py-1.5 font-medium ${r.qty > 0 ? 'text-emerald-700' : 'text-red-600'}`} dir="ltr" style={{ textAlign: 'right' }}>
                  {r.qty > 0 ? `+${r.qty}` : r.qty}
                </td>
                <td className="px-3 py-1.5 text-slate-600">
                  {r.reason}
                  {r.institution_year_id && ` · ${iys.get(r.institution_year_id)?.name ?? ''}`}
                </td>
                <td className="px-3 py-1.5 text-slate-500">{r.created_by_name}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Modal>
  );
}

// ---------------------------------------------------------------------
// דוח חוסרים לפי ספק
// ---------------------------------------------------------------------

function SupplierReport({ data, yearName }: { data: Data; yearName: string }) {
  const groups = useMemo(() => {
    const summaries = new Map(summarize(data).map((s) => [s.book.id, s]));
    const bySup = new Map<string, Map<string, DemandRow[]>>();
    for (const d of data.demand) {
      if (d.demand - d.allocated <= 0) continue;
      const sk = d.supplier_id ?? '';
      const books = bySup.get(sk) ?? new Map<string, DemandRow[]>();
      books.set(d.book_id, [...(books.get(d.book_id) ?? []), d]);
      bySup.set(sk, books);
    }
    return [...bySup.entries()]
      .map(([sid, books]) => ({
        sid,
        name: sid ? data.supplierName.get(sid) ?? 'ספק' : 'ללא ספק',
        books: [...books.entries()]
          .map(([bookId, rows]) => ({ bookId, book: data.books.get(bookId), rows, summary: summaries.get(bookId) }))
          .sort((a, b) => (a.book?.name ?? '').localeCompare(b.book?.name ?? '', 'he')),
      }))
      .sort((a, b) => a.name.localeCompare(b.name, 'he'));
  }, [data]);

  const exportExcel = () =>
    exportToExcel(`חוסרים לפי ספק – ${yearName}`, [
      {
        name: 'חוסרים',
        rows: groups.flatMap((g) =>
          g.books.flatMap((b) =>
            b.rows
              .filter((r) => r.demand - r.allocated > 0)
              .map((r) => ({
                ספק: g.name,
                'קוד ספר': b.book?.code,
                ספר: b.book?.name,
                מוסד: data.iys.get(r.institution_year_id)?.name,
                נדרש: r.demand,
                מוקצה: r.allocated,
                חסר: r.demand - r.allocated,
                'הוזמן מספק למוסד': r.ordered,
                'בהזמנות רכש פתוחות (לספר)': b.summary?.onOrder ?? 0,
                'צפי אספקה': formatDate(data.expected.get(b.bookId)),
              }))
          )
        ),
      },
    ]);

  if (groups.length === 0) return <EmptyState>אין חוסרים – כל מה שנדרש הוקצה. 🎉</EmptyState>;

  return (
    <div className="space-y-4">
      <div className="flex justify-end gap-2 print:hidden">
        <Protect permId="export_excel">
          <Button variant="secondary" onClick={exportExcel}>
            <FileSpreadsheet className="h-4 w-4" /> אקסל
          </Button>
        </Protect>
        <Button variant="secondary" onClick={() => window.print()}>
          <Printer className="h-4 w-4" /> הדפסה
        </Button>
      </div>
      <h2 className="hidden text-xl font-bold print:block">דוח חוסרים לפי ספק – {yearName}</h2>
      {groups.map((g) => (
        <div key={g.sid || 'none'} className="rounded-xl bg-white p-4 shadow-sm print:break-inside-avoid print:shadow-none">
          <h3 className="mb-2 text-lg font-bold">{g.name}</h3>
          <table className="w-full text-sm">
            <thead className="text-slate-500">
              <tr>
                <th className="py-1 text-right">ספר</th>
                <th className="py-1 text-right">חסר למוסדות</th>
                <th className="py-1 text-right">מלאי פנוי</th>
                <th className="py-1 text-right">בהזמנות פתוחות</th>
                <th className="py-1 text-right">עוד להזמין</th>
                <th className="py-1 text-right">צפי</th>
                <th className="py-1 text-right">לפי מוסד</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {g.books.map((b) => (
                <tr key={b.bookId} className="align-top">
                  <td className="py-1.5 font-medium">{b.book?.name}</td>
                  <td className="py-1.5 text-red-600">{b.rows.reduce((s, r) => s + Math.max(r.demand - r.allocated, 0), 0)}</td>
                  <td className="py-1.5">{b.summary?.free ?? 0}</td>
                  <td className="py-1.5">{(b.summary?.onOrder ?? 0) + (b.summary?.inDraft ?? 0)}</td>
                  <td className={`py-1.5 font-bold ${b.summary?.toOrder ? 'text-red-600' : 'text-slate-400'}`}>{b.summary?.toOrder ?? 0}</td>
                  <td className="py-1.5">{formatDate(data.expected.get(b.bookId)) || '—'}</td>
                  <td className="py-1.5 text-xs text-slate-600">
                    {b.rows.map((r) => `${data.iys.get(r.institution_year_id)?.name}: ${r.demand - r.allocated}`).join(' · ')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------
// דוח למוסד
// ---------------------------------------------------------------------

function InstitutionReport({ data, yearName }: { data: Data; yearName: string }) {
  const iyList = useMemo(
    () => [...data.iys.values()].filter((iy) => data.demand.some((d) => d.institution_year_id === iy.id)).sort((a, b) => a.name.localeCompare(b.name, 'he')),
    [data]
  );
  const [iyId, setIyId] = useState(iyList[0]?.id ?? '');
  const rows = data.demand
    .filter((d) => d.institution_year_id === iyId && d.demand > 0)
    .map((d) => ({ ...d, book: data.books.get(d.book_id) }))
    .sort((a, b) => (a.book?.name ?? '').localeCompare(b.book?.name ?? '', 'he'));
  const iy = data.iys.get(iyId);

  const exportExcel = () =>
    exportToExcel(`דוח מוסד – ${iy?.name ?? ''} – ${yearName}`, [
      {
        name: iy?.name ?? 'מוסד',
        rows: rows.map((r) => ({
          'קוד ספר': r.book?.code,
          ספר: r.book?.name,
          נדרש: r.demand,
          'הוקצה (התקבל)': r.allocated,
          חסר: Math.max(r.demand - r.allocated, 0),
          ספק: r.supplier_id ? data.supplierName.get(r.supplier_id) : '',
          'צפי אספקה': formatDate(data.expected.get(r.book_id)),
        })),
      },
    ]);

  if (iyList.length === 0) return <EmptyState>אין הזמנות במוסדות בשנה הזו.</EmptyState>;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 print:hidden">
        <select className={`${inputClass} w-auto`} value={iyId} onChange={(e) => setIyId(e.target.value)}>
          {iyList.map((x) => (
            <option key={x.id} value={x.id}>{x.number} – {x.name}</option>
          ))}
        </select>
        <div className="flex-1" />
        <Protect permId="export_excel">
          <Button variant="secondary" onClick={exportExcel}>
            <FileSpreadsheet className="h-4 w-4" /> אקסל
          </Button>
        </Protect>
        <Button variant="secondary" onClick={() => window.print()}>
          <Printer className="h-4 w-4" /> הדפסה
        </Button>
      </div>
      <h2 className="hidden text-xl font-bold print:block">
        {iy?.name} – מצב ספרים – {yearName}
      </h2>
      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-600">
            <tr>
              <th className="px-3 py-2 text-right">ספר</th>
              <th className="px-3 py-2 text-right">נדרש</th>
              <th className="px-3 py-2 text-right">הוקצה</th>
              <th className="px-3 py-2 text-right">חסר</th>
              <th className="px-3 py-2 text-right">ספק</th>
              <th className="px-3 py-2 text-right">צפי אספקה</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((r) => {
              const missing = Math.max(r.demand - r.allocated, 0);
              return (
                <tr key={r.book_id}>
                  <td className="px-3 py-2 font-medium">{r.book?.name}</td>
                  <td className="px-3 py-2">{r.demand}</td>
                  <td className="px-3 py-2">{r.allocated}</td>
                  <td className={`px-3 py-2 ${missing ? 'font-bold text-red-600' : 'text-emerald-700'}`}>{missing || '✓'}</td>
                  <td className="px-3 py-2">{r.supplier_id ? data.supplierName.get(r.supplier_id) : '—'}</td>
                  <td className="px-3 py-2">{missing ? formatDate(data.expected.get(r.book_id)) || '—' : ''}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
