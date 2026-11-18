'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { FileSpreadsheet, History, Plus, Search, Star, Trash2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/components/AuthContext';
import { PageGuard, Protect } from '@/components/Protect';
import { Button, EmptyState, Field, inputClass, Modal, PageHeader, Spinner } from '@/components/ui';
import { toast } from '@/components/Toaster';
import { dbErrorMessage } from '@/lib/dbErrors';
import { exportToExcel } from '@/lib/excel';
import { ImportButton, ImportExcelModal } from '@/components/ImportExcelModal';
import { booksImporter } from '@/lib/importers';
import { money, normalizeSearch, nullIfEmpty, toNumber } from '@/lib/format';
import {
  BOOK_SUPPLIER_COLUMNS,
  fetchBooks,
  fetchSuppliers,
  type Book,
  type BookSupplier,
  type Supplier,
} from '@/lib/entities';

export default function BooksPage() {
  return (
    <PageGuard permId="books_view">
      <BooksScreen />
    </PageGuard>
  );
}

async function fetchLinks(canSeeCost: boolean): Promise<BookSupplier[]> {
  if (!canSeeCost) return [];
  const { data } = await supabase.from('book_suppliers').select(BOOK_SUPPLIER_COLUMNS);
  return data ?? [];
}

function BooksScreen() {
  const { hasPermission } = useAuth();
  const canSeeCost = hasPermission('books_view_cost');
  const [books, setBooks] = useState<Book[] | null>(null);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [links, setLinks] = useState<BookSupplier[]>([]);
  const [search, setSearch] = useState('');
  const [showInactive, setShowInactive] = useState(false);
  const [editing, setEditing] = useState<Book | 'new' | null>(null);
  const [importing, setImporting] = useState(false);

  const load = useCallback(
    () => Promise.all([fetchBooks(), fetchSuppliers(), fetchLinks(canSeeCost)]),
    [canSeeCost]
  );
  const apply = useCallback(([b, s, l]: Awaited<ReturnType<typeof load>>) => {
    setBooks(b);
    setSuppliers(s);
    setLinks(l);
  }, []);
  const reload = useCallback(async () => apply(await load()), [apply, load]);

  useEffect(() => {
    let cancelled = false;
    void load().then((d) => !cancelled && apply(d));
    return () => {
      cancelled = true;
    };
  }, [load, apply]);

  const supplierName = useMemo(() => new Map(suppliers.map((s) => [s.id, s.name])), [suppliers]);
  const preferredByBook = useMemo(() => {
    const m = new Map<string, BookSupplier>();
    for (const l of links) if (l.is_preferred || !m.has(l.book_id)) m.set(l.book_id, l);
    return m;
  }, [links]);

  const filtered = useMemo(() => {
    const q = normalizeSearch(search);
    return (books ?? []).filter(
      (b) =>
        (showInactive || b.is_active) &&
        (!q || normalizeSearch(`${b.code} ${b.name} ${b.publisher ?? ''}`).includes(q))
    );
  }, [books, search, showInactive]);

  const exportExcel = () =>
    exportToExcel('קטלוג ספרים', [
      {
        name: 'קטלוג',
        rows: filtered.map((b) => {
          const p = preferredByBook.get(b.id);
          return {
            קוד: b.code,
            שם: b.name,
            'הוצאה לאור': b.publisher,
            'מחיר מכירה': b.sale_price,
            ...(canSeeCost
              ? { 'ספק מועדף': p ? supplierName.get(p.supplier_id) : '', 'מחיר קנייה': p?.purchase_price ?? '' }
              : {}),
            פעיל: b.is_active ? 'כן' : 'לא',
          };
        }),
      },
    ]);

  if (!books) return <Spinner />;

  return (
    <div>
      <PageHeader title="קטלוג ספרים">
        <Protect permId="export_excel">
          <Button variant="secondary" onClick={exportExcel} disabled={!filtered.length}>
            <FileSpreadsheet className="h-4 w-4" /> אקסל
          </Button>
        </Protect>
        <ImportButton editPerm="books_manage" onClick={() => setImporting(true)} />
        <Protect permId="books_manage">
          <Button onClick={() => setEditing('new')}>
            <Plus className="h-4 w-4" /> ספר חדש
          </Button>
        </Protect>
      </PageHeader>

      <div className="mb-3 flex flex-wrap items-center gap-3">
        <div className="relative">
          <Search className="absolute right-2.5 top-2.5 h-4 w-4 text-slate-400" />
          <input
            className="rounded-lg border border-slate-300 py-2 pl-3 pr-8 text-sm"
            placeholder="חיפוש לפי שם, קוד, הוצאה..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <label className="flex items-center gap-2 text-sm text-slate-600">
          <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} />
          להציג גם לא פעילים
        </label>
        <span className="text-xs text-slate-400">{filtered.length} ספרים</span>
      </div>

      {filtered.length === 0 ? (
        <EmptyState>{books.length ? 'אין ספרים שמתאימים לחיפוש' : 'הקטלוג ריק – הוסיפו את הספר הראשון'}</EmptyState>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-600">
              <tr>
                <th className="px-3 py-2 text-right">קוד</th>
                <th className="px-3 py-2 text-right">שם הספר</th>
                <th className="px-3 py-2 text-right">הוצאה לאור</th>
                <th className="px-3 py-2 text-right">מחיר מכירה</th>
                {canSeeCost && <th className="px-3 py-2 text-right">ספק מועדף</th>}
                {canSeeCost && <th className="px-3 py-2 text-right">מחיר קנייה</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map((b) => {
                const p = preferredByBook.get(b.id);
                return (
                  <tr
                    key={b.id}
                    onClick={() => setEditing(b)}
                    className={`cursor-pointer hover:bg-blue-50 ${b.is_active ? '' : 'text-slate-400'}`}
                  >
                    <td className="px-3 py-2.5 text-slate-500">{b.code}</td>
                    <td className="px-3 py-2.5 font-medium">{b.name}</td>
                    <td className="px-3 py-2.5">{b.publisher}</td>
                    <td className="px-3 py-2.5">{money(b.sale_price)}</td>
                    {canSeeCost && <td className="px-3 py-2.5">{p ? supplierName.get(p.supplier_id) : ''}</td>}
                    {canSeeCost && <td className="px-3 py-2.5">{p ? money(p.purchase_price) : ''}</td>}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {importing && (
        <ImportExcelModal
          title="ייבוא ספרים לקטלוג מאקסל"
          templateName="תבנית ייבוא קטלוג ספרים"
          {...booksImporter(books, suppliers, canSeeCost)}
          onClose={() => setImporting(false)}
          onDone={reload}
        />
      )}
      {editing && (
        <BookModal
          key={editing === 'new' ? 'new' : editing.id}
          book={editing === 'new' ? null : editing}
          suppliers={suppliers}
          initialLinks={editing === 'new' ? [] : links.filter((l) => l.book_id === editing.id)}
          onClose={() => setEditing(null)}
          onSaved={async (close) => {
            if (close) setEditing(null);
            await reload();
          }}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------

type PriceHistoryRow = {
  id: number;
  kind: string;
  old_price: number | null;
  new_price: number | null;
  changed_at: string;
  changed_by_name: string | null;
  supplier_id: string | null;
};

function BookModal({
  book,
  suppliers,
  initialLinks,
  onClose,
  onSaved,
}: {
  book: Book | null;
  suppliers: Supplier[];
  initialLinks: BookSupplier[];
  onClose: () => void;
  onSaved: (close: boolean) => void;
}) {
  const { hasPermission } = useAuth();
  const canEdit = hasPermission('books_manage');
  const canSeeCost = hasPermission('books_view_cost');
  const [bookId, setBookId] = useState<string | null>(book?.id ?? null);
  const [form, setForm] = useState({
    code: book?.code ?? '',
    name: book?.name ?? '',
    publisher: book?.publisher ?? '',
    sale_price: book?.sale_price?.toString() ?? '',
    notes: book?.notes ?? '',
    is_active: book?.is_active ?? true,
  });
  const [links, setLinks] = useState<BookSupplier[]>(initialLinks);
  const [history, setHistory] = useState<PriceHistoryRow[] | null>(null);
  const [saving, setSaving] = useState(false);
  const set = (k: keyof typeof form, v: string | boolean) => setForm((f) => ({ ...f, [k]: v }));
  const supplierName = useMemo(() => new Map(suppliers.map((s) => [s.id, s.name])), [suppliers]);

  const save = async () => {
    if (!form.name.trim()) return toast.error('יש להזין שם ספר');
    setSaving(true);
    const payload = {
      name: form.name.trim(),
      publisher: nullIfEmpty(form.publisher),
      sale_price: toNumber(form.sale_price) ?? 0,
      notes: nullIfEmpty(form.notes),
      is_active: form.is_active,
      ...(form.code.trim() ? { code: form.code.trim() } : {}),
    };
    const { data, error } = bookId
      ? await supabase.from('books').update(payload).eq('id', bookId).select('id, code').single()
      : await supabase.from('books').insert(payload).select('id, code').single();
    setSaving(false);
    if (error) return toast.error(dbErrorMessage(error.message));
    toast.success('הספר נשמר');
    if (!bookId) {
      // ספר חדש – נשארים בחלון כדי להוסיף ספקים
      setBookId(data.id);
      setForm((f) => ({ ...f, code: data.code }));
      onSaved(false);
      return;
    }
    onSaved(true);
  };

  const remove = async () => {
    if (!bookId) return;
    if (!window.confirm(`למחוק את "${form.name}" מהקטלוג?`)) return;
    const { error } = await supabase.from('books').delete().eq('id', bookId);
    if (error) return toast.error(dbErrorMessage(error.message));
    toast.success('הספר נמחק');
    onSaved(true);
  };

  const reloadLinks = async () => {
    if (!bookId) return;
    const { data } = await supabase.from('book_suppliers').select(BOOK_SUPPLIER_COLUMNS).eq('book_id', bookId);
    setLinks(data ?? []);
    onSaved(false);
  };

  const loadHistory = async () => {
    if (!bookId) return;
    const { data } = await supabase
      .from('book_price_history')
      .select('id, kind, old_price, new_price, changed_at, changed_by_name, supplier_id')
      .eq('book_id', bookId)
      .order('changed_at', { ascending: false })
      .limit(100);
    setHistory(data ?? []);
  };

  return (
    <Modal
      title={bookId ? `ספר: ${form.name || book?.name}` : 'ספר חדש'}
      onClose={onClose}
      footer={
        canEdit ? (
          <>
            <Button variant="success" onClick={save} loading={saving}>
              {bookId ? 'שמירה' : 'שמירה והמשך להוספת ספקים'}
            </Button>
            <Button variant="secondary" onClick={onClose}>סגירה</Button>
            <div className="flex-1" />
            {bookId && <Button variant="danger" onClick={remove}>מחיקה</Button>}
          </>
        ) : undefined
      }
    >
      <fieldset disabled={!canEdit} className="grid gap-3 rounded-xl bg-white p-4 sm:grid-cols-3">
        <Field label="קוד ספר" hint={bookId ? undefined : 'ריק = קוד אוטומטי'}>
          <input className={inputClass} dir="ltr" value={form.code} onChange={(e) => set('code', e.target.value)} />
        </Field>
        <Field label="שם הספר" className="sm:col-span-2">
          <input className={inputClass} value={form.name} onChange={(e) => set('name', e.target.value)} />
        </Field>
        <Field label="הוצאה לאור">
          <input className={inputClass} value={form.publisher} onChange={(e) => set('publisher', e.target.value)} />
        </Field>
        <Field label="מחיר מכירה (₪)" hint="ברירת המחדל לרשימות הכיתות">
          <input className={inputClass} inputMode="decimal" value={form.sale_price} onChange={(e) => set('sale_price', e.target.value)} />
        </Field>
        <label className="flex items-center gap-2 self-end pb-2 text-sm">
          <input type="checkbox" checked={form.is_active} onChange={(e) => set('is_active', e.target.checked)} /> ספר פעיל
        </label>
        <Field label="הערות" className="sm:col-span-3">
          <textarea className={inputClass} rows={2} value={form.notes} onChange={(e) => set('notes', e.target.value)} />
        </Field>
      </fieldset>

      {bookId && canSeeCost && (
        <BookSuppliersEditor
          bookId={bookId}
          links={links}
          suppliers={suppliers}
          canEdit={canEdit}
          onChanged={reloadLinks}
        />
      )}

      {bookId && canSeeCost && (
        <div className="rounded-xl bg-white p-4">
          {history === null ? (
            <Button variant="ghost" onClick={loadHistory}>
              <History className="h-4 w-4" /> היסטוריית מחירים
            </Button>
          ) : (
            <>
              <h3 className="mb-2 font-semibold">היסטוריית מחירים</h3>
              {history.length === 0 ? (
                <p className="text-sm text-slate-400">אין שינויים</p>
              ) : (
                <table className="w-full text-sm">
                  <thead className="text-slate-500">
                    <tr>
                      <th className="py-1 text-right">תאריך</th>
                      <th className="py-1 text-right">סוג</th>
                      <th className="py-1 text-right">מחיר קודם</th>
                      <th className="py-1 text-right">מחיר חדש</th>
                      <th className="py-1 text-right">שונה ע״י</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {history.map((h) => (
                      <tr key={h.id}>
                        <td className="py-1.5">{new Date(h.changed_at).toLocaleDateString('he-IL')}</td>
                        <td className="py-1.5">
                          {h.kind === 'sale' ? 'מכירה' : `קנייה – ${supplierName.get(h.supplier_id ?? '') ?? 'ספק'}`}
                        </td>
                        <td className="py-1.5">{money(h.old_price)}</td>
                        <td className="py-1.5 font-medium">{money(h.new_price)}</td>
                        <td className="py-1.5 text-slate-500">{h.changed_by_name}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </>
          )}
        </div>
      )}
    </Modal>
  );
}

function BookSuppliersEditor({
  bookId,
  links,
  suppliers,
  canEdit,
  onChanged,
}: {
  bookId: string;
  links: BookSupplier[];
  suppliers: Supplier[];
  canEdit: boolean;
  onChanged: () => void;
}) {
  const [adding, setAdding] = useState({ supplier_id: '', supplier_sku: '', purchase_price: '' });
  const available = suppliers.filter((s) => s.is_active && !links.some((l) => l.supplier_id === s.id));
  const supplierName = new Map(suppliers.map((s) => [s.id, s.name]));

  const add = async () => {
    if (!adding.supplier_id) return toast.error('יש לבחור ספק');
    const { error } = await supabase.from('book_suppliers').insert({
      book_id: bookId,
      supplier_id: adding.supplier_id,
      supplier_sku: nullIfEmpty(adding.supplier_sku),
      purchase_price: toNumber(adding.purchase_price),
      is_preferred: links.length === 0,
    });
    if (error) return toast.error(dbErrorMessage(error.message));
    setAdding({ supplier_id: '', supplier_sku: '', purchase_price: '' });
    onChanged();
  };

  const update = async (link: BookSupplier, patch: Partial<BookSupplier>) => {
    const { error } = await supabase.from('book_suppliers').update(patch).eq('id', link.id);
    if (error) return toast.error(dbErrorMessage(error.message));
    onChanged();
  };

  const makePreferred = async (link: BookSupplier) => {
    const current = links.find((l) => l.is_preferred);
    if (current) {
      const { error } = await supabase.from('book_suppliers').update({ is_preferred: false }).eq('id', current.id);
      if (error) return toast.error(dbErrorMessage(error.message));
    }
    await update(link, { is_preferred: true });
  };

  const remove = async (link: BookSupplier) => {
    if (!window.confirm(`להסיר את הספק "${supplierName.get(link.supplier_id)}" מהספר?`)) return;
    const { error } = await supabase.from('book_suppliers').delete().eq('id', link.id);
    if (error) return toast.error(dbErrorMessage(error.message));
    onChanged();
  };

  return (
    <div className="rounded-xl bg-white p-4">
      <h3 className="mb-2 font-semibold">ספקים ומחירי קנייה</h3>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-slate-500">
            <tr>
              <th className="py-1 text-right">מועדף</th>
              <th className="py-1 text-right">ספק</th>
              <th className="py-1 text-right">מק״ט ספק</th>
              <th className="py-1 text-right">מחיר קנייה (₪)</th>
              <th />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {links.map((l) => (
              <tr key={l.id}>
                <td className="py-1.5">
                  <button
                    type="button"
                    disabled={!canEdit || l.is_preferred}
                    onClick={() => makePreferred(l)}
                    title={l.is_preferred ? 'הספק המועדף' : 'סימון כספק מועדף'}
                  >
                    <Star className={`h-4 w-4 ${l.is_preferred ? 'fill-amber-400 text-amber-500' : 'text-slate-300'}`} />
                  </button>
                </td>
                <td className="py-1.5">{supplierName.get(l.supplier_id)}</td>
                <td className="py-1.5">
                  <input
                    disabled={!canEdit}
                    className={`${inputClass} max-w-40`}
                    defaultValue={l.supplier_sku ?? ''}
                    onBlur={(e) => e.target.value !== (l.supplier_sku ?? '') && update(l, { supplier_sku: nullIfEmpty(e.target.value) })}
                  />
                </td>
                <td className="py-1.5">
                  <input
                    disabled={!canEdit}
                    inputMode="decimal"
                    className={`${inputClass} max-w-28`}
                    defaultValue={l.purchase_price ?? ''}
                    onBlur={(e) =>
                      toNumber(e.target.value) !== l.purchase_price && update(l, { purchase_price: toNumber(e.target.value) })
                    }
                  />
                </td>
                <td className="py-1.5">
                  {canEdit && (
                    <button type="button" onClick={() => remove(l)} title="הסרה" className="p-1 text-red-500">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {links.length === 0 && <p className="text-sm text-slate-400">עדיין לא שויכו ספקים לספר.</p>}

      {canEdit && (
        <div className="mt-3 flex flex-wrap items-end gap-2 border-t border-slate-100 pt-3">
          <Field label="הוספת ספק">
            <select
              className={inputClass}
              value={adding.supplier_id}
              onChange={(e) => setAdding({ ...adding, supplier_id: e.target.value })}
            >
              <option value="">בחירה...</option>
              {available.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </Field>
          <Field label="מק״ט">
            <input className={`${inputClass} max-w-40`} value={adding.supplier_sku} onChange={(e) => setAdding({ ...adding, supplier_sku: e.target.value })} />
          </Field>
          <Field label="מחיר קנייה">
            <input className={`${inputClass} max-w-28`} inputMode="decimal" value={adding.purchase_price} onChange={(e) => setAdding({ ...adding, purchase_price: e.target.value })} />
          </Field>
          <Button onClick={add}>
            <Plus className="h-4 w-4" /> הוספה
          </Button>
        </div>
      )}
    </div>
  );
}
