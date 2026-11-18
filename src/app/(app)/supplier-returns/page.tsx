'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowRight, Ban, BadgeCheck, FileSpreadsheet, Printer, Undo2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/components/AuthContext';
import { useYear } from '@/components/YearContext';
import { PageGuard, Protect } from '@/components/Protect';
import DateInput from '@/components/DateInput';
import { Button, EmptyState, Field, inputClass, Modal, PageHeader, Spinner } from '@/components/ui';
import { FilterStatus, heCompare, matches, MultiSelect, SearchBox, useStoredState } from '@/components/filters';
import { toast } from '@/components/Toaster';
import { dbErrorMessage } from '@/lib/dbErrors';
import { exportToExcel } from '@/lib/excel';
import { formatDate, money, normalizeSearch, todayIso, toNumber } from '@/lib/format';
import { fetchBooks, fetchSuppliers, type Book, type Supplier } from '@/lib/entities';
import {
  CREDIT_STATUS_LABELS,
  CREDIT_STATUS_STYLES,
  RETURN_KIND_LABELS,
  type CreditStatus,
  type ReturnKind,
  type ReturnLineInput,
} from '@/lib/purchasing';

export default function SupplierReturnsPage() {
  return (
    <PageGuard permId={['po_view', 'supplier_payments_manage', 'finance_view']}>
      <ReturnsScreen />
    </PageGuard>
  );
}

type Candidate = {
  book_id: string;
  damaged_pending: number;
  wrong_pending: number;
  on_hand: number;
  allocated: number;
  free: number;
  unmet: number;
  surplus: number;
};

type ReturnLine = { id: string; book_id: string; qty: number; kind: ReturnKind; reason: string | null };
type ReturnDoc = {
  id: string;
  number: number;
  supplier_id: string;
  return_date: string;
  notes: string | null;
  credit_status: CreditStatus;
  credit_amount: number | null;
  credit_note: string | null;
  credited_at: string | null;
  credited_by_name: string | null;
  cancelled: boolean;
  cancel_reason: string | null;
  cancelled_by_name: string | null;
  created_by_name: string | null;
  lines: ReturnLine[];
};

type Base = {
  suppliers: Supplier[];
  books: Map<string, Book>;
  /** מחיר קנייה לפי ספק+ספר – רק עם books_view_cost */
  cost: Map<string, number>;
};

const costKey = (supplierId: string, bookId: string) => `${supplierId}:${bookId}`;

/** סיכום שורות לפי ספר וסוג (פגומים שמתחלקים בין כמה קליטות מופיעים כשורה אחת) */
function groupLines(lines: ReturnLine[]) {
  const m = new Map<string, { book_id: string; kind: ReturnKind; qty: number; reasons: Set<string> }>();
  for (const l of lines) {
    const k = `${l.book_id}:${l.kind}`;
    const e = m.get(k) ?? { book_id: l.book_id, kind: l.kind, qty: 0, reasons: new Set<string>() };
    e.qty += l.qty;
    if (l.reason) e.reasons.add(l.reason);
    m.set(k, e);
  }
  return [...m.values()];
}

function ReturnsScreen() {
  const { hasPermission } = useAuth();
  const canSeeCost = hasPermission('books_view_cost');
  const canPoView = hasPermission('po_view');
  const [base, setBase] = useState<Base | null>(null);
  const [tab, setTab] = useState<'pending' | 'log'>(canPoView ? 'pending' : 'log');

  useEffect(() => {
    let cancelled = false;
    void Promise.all([
      fetchSuppliers(),
      fetchBooks(),
      canSeeCost ? supabase.from('book_suppliers').select('book_id, supplier_id, purchase_price') : Promise.resolve({ data: [] }),
    ]).then(([suppliers, books, { data: costs }]) => {
      if (cancelled) return;
      const cost = new Map<string, number>();
      for (const c of (costs ?? []) as { book_id: string; supplier_id: string; purchase_price: number | null }[]) {
        if (c.purchase_price != null) cost.set(costKey(c.supplier_id, c.book_id), Number(c.purchase_price));
      }
      setBase({ suppliers: suppliers.sort((a, b) => heCompare(a.name, b.name)), books: new Map(books.map((b) => [b.id, b])), cost });
    });
    return () => {
      cancelled = true;
    };
  }, [canSeeCost]);

  if (!base) return <Spinner />;

  return (
    <div>
      <div className="print:hidden">
        <PageHeader title="החזרות לספקים" />
      </div>
      <div className="mb-4 flex gap-1 overflow-x-auto border-b border-slate-200 print:hidden">
        {canPoView && (
          <TabButton active={tab === 'pending'} onClick={() => setTab('pending')}>מה אפשר להחזיר</TabButton>
        )}
        <TabButton active={tab === 'log'} onClick={() => setTab('log')}>החזרות שבוצעו</TabButton>
      </div>
      {tab === 'pending' && canPoView && <PendingTab base={base} onCreated={() => setTab('log')} />}
      {tab === 'log' && <LogTab base={base} />}
    </div>
  );
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`whitespace-nowrap border-b-2 px-4 py-2.5 text-sm ${active ? 'border-blue-600 font-semibold text-blue-700' : 'border-transparent text-slate-600'}`}
    >
      {children}
    </button>
  );
}

// ---------------------------------------------------------------------
// מה אפשר להחזיר – סיכום לכל ספק, ובחירת ספק → טופס החזרה
// ---------------------------------------------------------------------

function PendingTab({ base, onCreated }: { base: Base; onCreated: () => void }) {
  const [bySupplier, setBySupplier] = useState<Map<string, Candidate[]> | null>(null);
  const [selected, setSelected] = useState<string | null>(null);

  const load = useCallback(async () => {
    const results = await Promise.all(
      base.suppliers.map(async (s) => {
        const { data } = await supabase.rpc('supplier_return_candidates', { p_supplier: s.id });
        return [s.id, (data ?? []) as Candidate[]] as const;
      })
    );
    return new Map(results);
  }, [base.suppliers]);

  useEffect(() => {
    let cancelled = false;
    void load().then((m) => !cancelled && setBySupplier(m));
    return () => {
      cancelled = true;
    };
  }, [load]);

  if (!bySupplier) return <Spinner />;

  if (selected) {
    const sup = base.suppliers.find((s) => s.id === selected);
    return (
      <ReturnForm
        base={base}
        supplier={sup!}
        candidates={bySupplier.get(selected) ?? []}
        onBack={() => setSelected(null)}
        onCreated={async () => {
          setSelected(null);
          setBySupplier(await load());
          onCreated();
        }}
      />
    );
  }

  const rows = base.suppliers
    .map((s) => {
      const c = bySupplier.get(s.id) ?? [];
      return {
        s,
        damaged: c.reduce((x, r) => x + r.damaged_pending, 0),
        wrong: c.reduce((x, r) => x + r.wrong_pending, 0),
        surplus: c.reduce((x, r) => x + r.surplus, 0),
        free: c.reduce((x, r) => x + Math.max(r.free, 0), 0),
      };
    })
    .filter((r) => r.damaged + r.wrong + r.free > 0);

  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-600">
        לכל ספק: פגומים ושגויים שנקלטו ועוד לא הוחזרו, וספרים שנשארו במלאי מעבר למה שצריך להזמנות הפתוחות (למשל אחרי ביטולים או רזרבה
        שלא נוצלה). לוחצים על ספק כדי לרשום החזרה.
      </p>
      {rows.length === 0 ? (
        <EmptyState>אין כרגע ספרים להחזרה – אין פגומים/שגויים ממתינים ואין מלאי פנוי.</EmptyState>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-600">
              <tr>
                <th className="px-3 py-2 text-right">ספק</th>
                <th className="px-3 py-2 text-right">פגומים</th>
                <th className="px-3 py-2 text-right">שגויים</th>
                <th className="px-3 py-2 text-right">עודף במלאי (לא נדרש)</th>
                <th className="px-3 py-2 text-right">מלאי פנוי (לא מוקצה)</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((r) => (
                <tr key={r.s.id} className="hover:bg-blue-50">
                  <td className="px-3 py-2.5 font-medium">{r.s.name}</td>
                  <td className={`px-3 py-2.5 ${r.damaged ? 'font-medium text-amber-700' : 'text-slate-400'}`}>{r.damaged}</td>
                  <td className={`px-3 py-2.5 ${r.wrong ? 'font-medium text-amber-700' : 'text-slate-400'}`}>{r.wrong}</td>
                  <td className={`px-3 py-2.5 ${r.surplus ? 'font-bold text-blue-700' : 'text-slate-400'}`}>{r.surplus}</td>
                  <td className="px-3 py-2.5 text-slate-600">{r.free}</td>
                  <td className="px-3 py-2.5 text-left">
                    <Protect permId="po_manage">
                      <Button variant="secondary" onClick={() => setSelected(r.s.id)}>
                        <Undo2 className="h-4 w-4" /> רישום החזרה
                      </Button>
                    </Protect>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-xs text-slate-400">
        &quot;עודף&quot; = מלאי פנוי פחות מה שעוד חסר להזמנות פעילות בשנים הפתוחות (נדרש − נמסר − מוקצה). ספר שמגיע מכמה ספקים מופיע אצל כל אחד מהם.
      </p>
    </div>
  );
}

type FormLine = { damaged: string; wrong: string; surplus: string; reason: string };

function ReturnForm({
  base,
  supplier,
  candidates,
  onBack,
  onCreated,
}: {
  base: Base;
  supplier: Supplier;
  candidates: Candidate[];
  onBack: () => void;
  onCreated: () => void;
}) {
  const { year } = useYear();
  const [values, setValues] = useState<Record<string, FormLine>>({});
  const [date, setDate] = useState(todayIso());
  const [notes, setNotes] = useState('');
  const [search, setSearch] = useState('');
  const [saving, setSaving] = useState(false);

  const rows = useMemo(
    () =>
      candidates
        .map((c) => ({ ...c, book: base.books.get(c.book_id) }))
        .filter((r) => !search || normalizeSearch(`${r.book?.code} ${r.book?.name}`).includes(normalizeSearch(search)))
        .sort((a, b) => heCompare(a.book?.name ?? '', b.book?.name ?? '')),
    [candidates, base.books, search]
  );

  const v = (id: string): FormLine => values[id] ?? { damaged: '', wrong: '', surplus: '', reason: '' };
  const set = (id: string, patch: Partial<FormLine>) => setValues((x) => ({ ...x, [id]: { ...v(id), ...patch } }));
  const n = (s: string) => Math.max(toNumber(s) ?? 0, 0);

  const fill = (what: 'damaged' | 'surplus') =>
    setValues((x) => {
      const next = { ...x };
      for (const c of candidates) {
        const cur = next[c.book_id] ?? { damaged: '', wrong: '', surplus: '', reason: '' };
        next[c.book_id] =
          what === 'damaged'
            ? { ...cur, damaged: c.damaged_pending ? String(c.damaged_pending) : cur.damaged, wrong: c.wrong_pending ? String(c.wrong_pending) : cur.wrong }
            : { ...cur, surplus: c.surplus ? String(c.surplus) : cur.surplus };
      }
      return next;
    });

  const lines: ReturnLineInput[] = candidates.flatMap((c) => {
    const x = v(c.book_id);
    const reason = x.reason.trim() || undefined;
    return (['damaged', 'wrong', 'surplus'] as const)
      .filter((k) => n(x[k]) > 0)
      .map((k) => ({ book_id: c.book_id, qty: n(x[k]), kind: k, reason }));
  });
  const totalUnits = lines.reduce((s, l) => s + l.qty, 0);
  const totalValue = lines.reduce((s, l) => s + l.qty * (base.cost.get(costKey(supplier.id, l.book_id)) ?? 0), 0);
  const overLimit = candidates.some((c) => {
    const x = v(c.book_id);
    return n(x.damaged) > c.damaged_pending || n(x.wrong) > c.wrong_pending || n(x.surplus) > Math.max(c.free, 0);
  });

  const save = async () => {
    if (!lines.length) return toast.error('לא הוזנו כמויות');
    setSaving(true);
    const { error } = await supabase.rpc('create_supplier_return', {
      p_supplier: supplier.id,
      p_lines: lines,
      p_notes: notes.trim() || undefined,
      p_date: date || undefined,
      p_year: year?.id,
    });
    setSaving(false);
    if (error) return toast.error(dbErrorMessage(error.message));
    toast.success('ההחזרה נרשמה');
    onCreated();
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="ghost" onClick={onBack}>
          <ArrowRight className="h-4 w-4" /> חזרה
        </Button>
        <h2 className="flex-1 text-xl font-bold">החזרה לספק: {supplier.name}</h2>
        <SearchBox value={search} onChange={setSearch} placeholder="חיפוש ספר..." />
      </div>
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" onClick={() => fill('damaged')}>מילוי כל הפגומים והשגויים</Button>
        <Button variant="secondary" onClick={() => fill('surplus')}>מילוי כל העודף</Button>
        <Button variant="ghost" onClick={() => setValues({})}>ניקוי</Button>
      </div>

      {rows.length === 0 ? (
        <EmptyState>אין ספרים של הספק הזה שאפשר להחזיר.</EmptyState>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-600">
              <tr>
                <th className="px-3 py-2 text-right">ספר</th>
                <th className="px-3 py-2 text-right">פגומים</th>
                <th className="px-3 py-2 text-right">שגויים</th>
                <th className="px-3 py-2 text-right">מהמלאי</th>
                <th className="px-3 py-2 text-right">סיבה / הערה</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((r) => {
                const x = v(r.book_id);
                const qtyInput = (k: 'damaged' | 'wrong' | 'surplus', max: number) => (
                  <input
                    className={`${inputClass} w-20 ${n(x[k]) > max ? 'border-red-400 bg-red-50' : ''}`}
                    inputMode="numeric"
                    value={x[k]}
                    disabled={max <= 0}
                    onChange={(e) => set(r.book_id, { [k]: e.target.value })}
                  />
                );
                return (
                  <tr key={r.book_id} className="align-top">
                    <td className="px-3 py-2">
                      <div className="font-medium">{r.book?.name}</div>
                      <div className="text-xs text-slate-400">
                        {r.book?.code} · במלאי {r.on_hand} · מוקצה {r.allocated} · עוד חסר להזמנות {r.unmet}
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      {qtyInput('damaged', r.damaged_pending)}
                      <div className="mt-0.5 text-xs text-slate-400">ממתינים {r.damaged_pending}</div>
                    </td>
                    <td className="px-3 py-2">
                      {qtyInput('wrong', r.wrong_pending)}
                      <div className="mt-0.5 text-xs text-slate-400">ממתינים {r.wrong_pending}</div>
                    </td>
                    <td className="px-3 py-2">
                      {qtyInput('surplus', Math.max(r.free, 0))}
                      <div className={`mt-0.5 text-xs ${r.surplus ? 'font-medium text-blue-700' : 'text-slate-400'}`}>
                        עודף {r.surplus}
                        {r.free > r.surplus && <span className="text-slate-400"> · פנוי {r.free}</span>}
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      <input className={inputClass} value={x.reason} onChange={(e) => set(r.book_id, { reason: e.target.value })} placeholder="למשל: נשאר מביטולים" />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <div className="grid gap-3 rounded-xl bg-white p-4 shadow-sm sm:grid-cols-3">
        <Field label="תאריך ההחזרה">
          <DateInput value={date} onChange={setDate} />
        </Field>
        <Field label="הערות" className="sm:col-span-2">
          <input className={inputClass} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="למשל: נאסף ע״י השליח של הספק" />
        </Field>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button variant="success" onClick={save} loading={saving} disabled={!lines.length || overLimit}>
          <Undo2 className="h-4 w-4" /> רישום החזרה ({totalUnits} יח׳)
        </Button>
        {base.cost.size > 0 && totalValue > 0 && <span className="text-sm text-slate-600">שווי לפי מחיר קנייה: {money(totalValue)}</span>}
        {overLimit && <span className="text-sm text-red-600">יש כמות גדולה ממה שאפשר להחזיר (מסומן באדום)</span>}
      </div>
      <p className="text-xs text-slate-400">
        ספרים &quot;מהמלאי&quot; יוצאים מהמלאי מיד. פגומים ושגויים לא נמצאים במלאי ממילא. הזיכוי מהספק לא נרשם אוטומטית – מסמנים אותו ב&quot;החזרות שבוצעו&quot;.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------
// החזרות שבוצעו
// ---------------------------------------------------------------------

type LogFilters = { supplier: string[]; credit: string[]; showCancelled: boolean };
const DEFAULT_LOG: LogFilters = { supplier: [], credit: [], showCancelled: false };

function LogTab({ base }: { base: Base }) {
  const { hasPermission } = useAuth();
  const [docs, setDocs] = useState<ReturnDoc[] | null>(null);
  const [search, setSearch] = useState('');
  const [f, setF] = useStoredState('supplier-returns', DEFAULT_LOG);
  const [crediting, setCrediting] = useState<ReturnDoc | null>(null);
  const [printing, setPrinting] = useState<ReturnDoc | null>(null);
  const supplierName = useMemo(() => new Map(base.suppliers.map((s) => [s.id, s.name])), [base.suppliers]);

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('supplier_returns')
      .select(
        'id, number, supplier_id, return_date, notes, credit_status, credit_amount, credit_note, credited_at, credited_by_name, cancelled, cancel_reason, cancelled_by_name, created_by_name, supplier_return_lines(id, book_id, qty, kind, reason)'
      )
      .order('number', { ascending: false });
    return (data ?? []).map((d) => ({ ...d, lines: (d.supplier_return_lines ?? []) as ReturnLine[] })) as unknown as ReturnDoc[];
  }, []);
  const reload = async () => setDocs(await load());
  useEffect(() => {
    let cancelled = false;
    void load().then((d) => !cancelled && setDocs(d));
    return () => {
      cancelled = true;
    };
  }, [load]);

  useEffect(() => {
    if (!printing) return;
    const t = setTimeout(() => window.print(), 100);
    const done = () => setPrinting(null);
    window.addEventListener('afterprint', done);
    return () => {
      clearTimeout(t);
      window.removeEventListener('afterprint', done);
    };
  }, [printing]);

  const valueOf = useCallback(
    (d: ReturnDoc) => d.lines.reduce((s, l) => s + l.qty * (base.cost.get(costKey(d.supplier_id, l.book_id)) ?? 0), 0),
    [base.cost]
  );

  const filtered = useMemo(() => {
    const q = normalizeSearch(search);
    return (docs ?? []).filter(
      (d) =>
        (f.showCancelled || !d.cancelled) &&
        matches(f.supplier, d.supplier_id) &&
        matches(f.credit, d.credit_status) &&
        (!q ||
          String(d.number) === q ||
          normalizeSearch(supplierName.get(d.supplier_id) ?? '').includes(q) ||
          d.lines.some((l) => normalizeSearch(`${base.books.get(l.book_id)?.name ?? ''} ${base.books.get(l.book_id)?.code ?? ''}`).includes(q)))
    );
  }, [docs, search, f, supplierName, base.books]);

  if (!docs) return <Spinner />;

  const active = filtered.filter((d) => !d.cancelled);
  const totals = {
    units: active.reduce((s, d) => s + d.lines.reduce((x, l) => x + l.qty, 0), 0),
    pending: active.filter((d) => d.credit_status === 'pending').length,
    pendingValue: active.filter((d) => d.credit_status === 'pending').reduce((s, d) => s + valueOf(d), 0),
    credited: active.filter((d) => d.credit_status === 'credited').reduce((s, d) => s + Number(d.credit_amount ?? 0), 0),
  };
  const byKind = (['damaged', 'wrong', 'surplus'] as const).map((k) => [k, active.reduce((s, d) => s + d.lines.filter((l) => l.kind === k).reduce((x, l) => x + l.qty, 0), 0)] as const);

  const supplierOptions = [...new Set(docs.map((d) => d.supplier_id))]
    .map((id) => ({ value: id, label: supplierName.get(id) ?? '' }))
    .sort((a, b) => heCompare(a.label, b.label));
  const filterActive = !!search.trim() || f.supplier.length + f.credit.length > 0 || f.showCancelled;

  const cancelDoc = async (d: ReturnDoc) => {
    const reason = window.prompt(`ביטול החזרה מס׳ ${d.number} (הספרים יחזרו למלאי / לפגומים הממתינים).\nסיבת הביטול:`);
    if (!reason?.trim()) return;
    const { error } = await supabase.rpc('cancel_supplier_return', { p_return: d.id, p_reason: reason.trim() });
    if (error) return toast.error(dbErrorMessage(error.message));
    toast.success('ההחזרה בוטלה');
    await reload();
  };

  const exportExcel = () =>
    exportToExcel('החזרות לספקים', [
      {
        name: 'החזרות',
        rows: filtered.map((d) => ({
          מספר: d.number,
          תאריך: formatDate(d.return_date),
          ספק: supplierName.get(d.supplier_id),
          'יחידות': d.lines.reduce((s, l) => s + l.qty, 0),
          ...(base.cost.size ? { 'שווי לפי מחיר קנייה': valueOf(d) } : {}),
          זיכוי: d.cancelled ? 'בוטלה' : CREDIT_STATUS_LABELS[d.credit_status],
          'סכום זיכוי': d.credit_amount ?? '',
          'הערת זיכוי': d.credit_note ?? '',
          הערות: d.notes ?? '',
          'נרשם ע״י': d.created_by_name ?? '',
        })),
      },
      {
        name: 'ספרים',
        rows: filtered.flatMap((d) =>
          groupLines(d.lines).map((l) => ({
            'מס׳ החזרה': d.number,
            תאריך: formatDate(d.return_date),
            ספק: supplierName.get(d.supplier_id),
            'קוד ספר': base.books.get(l.book_id)?.code,
            ספר: base.books.get(l.book_id)?.name,
            סוג: RETURN_KIND_LABELS[l.kind],
            כמות: l.qty,
            סיבה: [...l.reasons].join(' · '),
            בוטלה: d.cancelled ? 'כן' : '',
          }))
        ),
      },
    ]);

  return (
    <div className="space-y-3">
      <div className={printing ? 'print:hidden' : ''}>
        <div className="mb-3 grid gap-2 sm:grid-cols-4">
          <SummaryCard label="יחידות שהוחזרו" value={String(totals.units)} sub={byKind.filter(([, q]) => q).map(([k, q]) => `${RETURN_KIND_LABELS[k].split(' ')[0]} ${q}`).join(' · ')} />
          <SummaryCard label="ממתינות לזיכוי" value={String(totals.pending)} sub={base.cost.size && totals.pendingValue ? `שווי משוער ${money(totals.pendingValue)}` : undefined} tone={totals.pending ? 'warn' : undefined} />
          <SummaryCard label="זוכה מספקים" value={money(totals.credited)} />
          <SummaryCard label="מסמכי החזרה" value={String(active.length)} />
        </div>

        <div className="mb-3 flex flex-wrap items-center gap-2 print:hidden">
          <SearchBox value={search} onChange={setSearch} placeholder="מס׳ / ספק / ספר..." />
          <MultiSelect label="ספק" options={supplierOptions} value={f.supplier} onChange={(supplier) => setF({ supplier })} />
          <MultiSelect
            label="זיכוי"
            options={(Object.keys(CREDIT_STATUS_LABELS) as CreditStatus[]).map((s) => ({ value: s, label: CREDIT_STATUS_LABELS[s] }))}
            value={f.credit}
            onChange={(credit) => setF({ credit })}
          />
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={f.showCancelled} onChange={(e) => setF({ showCancelled: e.target.checked })} /> כולל מבוטלות
          </label>
          <div className="flex-1" />
          <Protect permId="export_excel">
            <Button variant="secondary" onClick={exportExcel} disabled={!filtered.length}>
              <FileSpreadsheet className="h-4 w-4" /> אקסל
            </Button>
          </Protect>
        </div>
        <FilterStatus
          active={filterActive}
          shown={filtered.length}
          total={docs.length}
          noun="החזרות"
          onClear={() => {
            setSearch('');
            setF(DEFAULT_LOG);
          }}
        />

        {filtered.length === 0 ? (
          <EmptyState>{docs.length ? 'אין החזרות שמתאימות לסינון' : 'עדיין לא נרשמו החזרות לספקים.'}</EmptyState>
        ) : (
          <div className="space-y-2">
            {filtered.map((d) => {
              const value = valueOf(d);
              return (
                <div key={d.id} className={`rounded-xl border bg-white p-3 shadow-sm ${d.cancelled ? 'border-slate-200 opacity-60' : 'border-slate-200'}`}>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <span className="font-bold">מס׳ {d.number}</span>
                    <span className="font-medium">{supplierName.get(d.supplier_id)}</span>
                    <span className="text-sm text-slate-500">{formatDate(d.return_date)}</span>
                    {d.cancelled ? (
                      <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs text-red-700">בוטלה</span>
                    ) : (
                      <span className={`rounded-full px-2 py-0.5 text-xs ${CREDIT_STATUS_STYLES[d.credit_status]}`}>
                        {CREDIT_STATUS_LABELS[d.credit_status]}
                        {d.credit_status === 'credited' && ` ${money(d.credit_amount)}`}
                      </span>
                    )}
                    {base.cost.size > 0 && value > 0 && <span className="text-xs text-slate-500">שווי {money(value)}</span>}
                    <div className="flex-1" />
                    <Button variant="ghost" onClick={() => setPrinting(d)} title="הדפסת תעודת החזרה">
                      <Printer className="h-4 w-4" />
                    </Button>
                    {!d.cancelled && hasPermission('supplier_payments_manage') && (
                      <Button variant="secondary" onClick={() => setCrediting(d)}>
                        <BadgeCheck className="h-4 w-4" /> זיכוי
                      </Button>
                    )}
                    {!d.cancelled && d.credit_status !== 'credited' && hasPermission('po_manage') && (
                      <Button variant="ghost" className="text-red-600" onClick={() => cancelDoc(d)} title="ביטול ההחזרה">
                        <Ban className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                  <ul className="mt-1.5 space-y-0.5 text-sm text-slate-700">
                    {groupLines(d.lines).map((l) => (
                      <li key={`${l.book_id}:${l.kind}`}>
                        {base.books.get(l.book_id)?.name} – <b>{l.qty}</b> <span className="text-slate-500">({RETURN_KIND_LABELS[l.kind]})</span>
                        {l.reasons.size > 0 && <span className="text-xs text-slate-500"> · {[...l.reasons].join(' · ')}</span>}
                      </li>
                    ))}
                  </ul>
                  <div className="mt-1 text-xs text-slate-500">
                    {d.notes && <span>{d.notes} · </span>}
                    נרשם ע״י {d.created_by_name ?? '—'}
                    {d.credit_status !== 'pending' && d.credited_by_name && ` · ${CREDIT_STATUS_LABELS[d.credit_status]} – סומן ע״י ${d.credited_by_name}`}
                    {d.credit_note && ` (${d.credit_note})`}
                    {d.cancelled && ` · בוטלה ע״י ${d.cancelled_by_name ?? ''}: ${d.cancel_reason ?? ''}`}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {printing && <PrintDoc doc={printing} base={base} supplierName={supplierName.get(printing.supplier_id) ?? ''} />}
      {crediting && (
        <CreditModal
          doc={crediting}
          estimate={valueOf(crediting)}
          onClose={() => setCrediting(null)}
          onDone={async () => {
            setCrediting(null);
            await reload();
          }}
        />
      )}
    </div>
  );
}

function SummaryCard({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: 'warn' }) {
  return (
    <div className={`rounded-xl border bg-white p-3 ${tone === 'warn' ? 'border-amber-300' : 'border-slate-200'}`}>
      <div className="text-xs text-slate-500">{label}</div>
      <div className="text-xl font-bold">{value}</div>
      {sub && <div className="text-xs text-slate-500">{sub}</div>}
    </div>
  );
}

function CreditModal({ doc, estimate, onClose, onDone }: { doc: ReturnDoc; estimate: number; onClose: () => void; onDone: () => void }) {
  const [status, setStatus] = useState<CreditStatus>(doc.credit_status === 'pending' ? 'credited' : doc.credit_status);
  const [amount, setAmount] = useState(doc.credit_amount != null ? String(doc.credit_amount) : estimate ? String(Math.round(estimate * 100) / 100) : '');
  const [note, setNote] = useState(doc.credit_note ?? '');
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    const { error } = await supabase.rpc('set_supplier_return_credit', {
      p_return: doc.id,
      p_status: status,
      p_amount: status === 'credited' ? toNumber(amount) ?? undefined : undefined,
      p_note: note.trim() || undefined,
    });
    setSaving(false);
    if (error) return toast.error(dbErrorMessage(error.message));
    toast.success('נשמר');
    onDone();
  };

  return (
    <Modal
      title={`זיכוי על החזרה מס׳ ${doc.number}`}
      onClose={onClose}
      size="md"
      footer={
        <>
          <Button variant="success" onClick={save} loading={saving}>שמירה</Button>
          <Button variant="secondary" onClick={onClose}>ביטול</Button>
        </>
      }
    >
      <div className="grid gap-3 rounded-xl bg-white p-4 sm:grid-cols-2">
        <Field label="מצב">
          <select className={inputClass} value={status} onChange={(e) => setStatus(e.target.value as CreditStatus)}>
            {(Object.keys(CREDIT_STATUS_LABELS) as CreditStatus[]).map((s) => (
              <option key={s} value={s}>{CREDIT_STATUS_LABELS[s]}</option>
            ))}
          </select>
        </Field>
        {status === 'credited' && (
          <Field label="סכום הזיכוי (₪)" hint={estimate ? `לפי מחיר קנייה: ${money(estimate)}` : undefined}>
            <input className={inputClass} inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </Field>
        )}
        <Field label="הערה" className="sm:col-span-2">
          <input className={inputClass} value={note} onChange={(e) => setNote(e.target.value)} placeholder="למשל: מס׳ תעודת זיכוי / קוזז בחשבונית" />
        </Field>
        <p className="text-xs text-slate-500 sm:col-span-2">סכום שסומן &quot;זוכה&quot; יורד מהחוב לספק במסך כספים ← ספקים.</p>
      </div>
    </Modal>
  );
}

function PrintDoc({ doc, base, supplierName }: { doc: ReturnDoc; base: Base; supplierName: string }) {
  const lines = groupLines(doc.lines).sort((a, b) => heCompare(base.books.get(a.book_id)?.name ?? '', base.books.get(b.book_id)?.name ?? ''));
  return (
    <div className="hidden print:block">
      <h1 className="text-2xl font-bold">תעודת החזרה לספק מס׳ {doc.number}</h1>
      <p className="mt-1">
        ספק: <b>{supplierName}</b> · תאריך: {formatDate(doc.return_date)}
      </p>
      {doc.notes && <p className="mt-1">הערות: {doc.notes}</p>}
      <table className="mt-4 w-full border-collapse text-sm">
        <thead>
          <tr>
            <th className="border border-slate-400 px-2 py-1 text-right">קוד</th>
            <th className="border border-slate-400 px-2 py-1 text-right">ספר</th>
            <th className="border border-slate-400 px-2 py-1 text-right">סוג</th>
            <th className="border border-slate-400 px-2 py-1 text-right">כמות</th>
            <th className="border border-slate-400 px-2 py-1 text-right">הערה</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((l) => (
            <tr key={`${l.book_id}:${l.kind}`}>
              <td className="border border-slate-400 px-2 py-1">{base.books.get(l.book_id)?.code}</td>
              <td className="border border-slate-400 px-2 py-1">{base.books.get(l.book_id)?.name}</td>
              <td className="border border-slate-400 px-2 py-1">{l.kind === 'surplus' ? 'החזרת עודף' : RETURN_KIND_LABELS[l.kind]}</td>
              <td className="border border-slate-400 px-2 py-1 font-bold">{l.qty}</td>
              <td className="border border-slate-400 px-2 py-1">{[...l.reasons].join(' · ')}</td>
            </tr>
          ))}
          <tr>
            <td className="border border-slate-400 px-2 py-1 font-bold" colSpan={3}>סה״כ</td>
            <td className="border border-slate-400 px-2 py-1 font-bold">{lines.reduce((s, l) => s + l.qty, 0)}</td>
            <td className="border border-slate-400" />
          </tr>
        </tbody>
      </table>
      <div className="mt-12 grid grid-cols-2 gap-8 text-sm">
        <div className="border-t border-slate-500 pt-1">שם וחתימת המוסר</div>
        <div className="border-t border-slate-500 pt-1">שם וחתימת המקבל מטעם הספק</div>
      </div>
    </div>
  );
}
