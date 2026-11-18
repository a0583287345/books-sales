'use client';

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ClipboardCopy, Copy, FileSpreadsheet, Pencil, Plus, Printer, Trash2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/components/AuthContext';
import { useYear, type AcademicYear } from '@/components/YearContext';
import { PageGuard, Protect } from '@/components/Protect';
import DateInput from '@/components/DateInput';
import { BookPicker } from '@/components/BookPicker';
import { Button, ClosedYearNotice, EmptyState, Field, inputClass, Modal, PageHeader, Spinner } from '@/components/ui';
import { toast } from '@/components/Toaster';
import { dbErrorMessage } from '@/lib/dbErrors';
import { exportToExcel } from '@/lib/excel';
import { ImportButton, ImportExcelModal } from '@/components/ImportExcelModal';
import { classBooksImporter } from '@/lib/importers';
import { formatDate, money, nullIfEmpty, toNumber } from '@/lib/format';
import {
  BOOK_SUPPLIER_COLUMNS,
  CLASS_COLUMNS,
  fetchBooks,
  fetchSuppliers,
  INSTITUTION_YEAR_COLUMNS,
  type Book,
  type BookSupplier,
  type ClassRow,
  type InstitutionYear,
  type Supplier,
} from '@/lib/entities';

export default function ClassesPage() {
  return (
    <PageGuard permId="classes_view">
      <Suspense fallback={<Spinner />}>
        <ClassesScreen />
      </Suspense>
    </PageGuard>
  );
}

type IyOption = InstitutionYear & { instName: string; instNumber: number };
type ClassWithCount = ClassRow & { bookCount: number };
type ClassBook = {
  id: string;
  class_id: string;
  book_id: string;
  qty_per_student: number;
  sale_price: number;
  supplier_id: string | null;
  is_required: boolean;
  order_deadline: string | null;
  cancel_deadline: string | null;
  notes: string | null;
  sort_order: number;
};
const CLASS_BOOK_COLUMNS =
  'id, class_id, book_id, qty_per_student, sale_price, supplier_id, is_required, order_deadline, cancel_deadline, notes, sort_order';

async function fetchIys(yearId: string): Promise<IyOption[]> {
  const { data } = await supabase
    .from('institution_years')
    .select(`${INSTITUTION_YEAR_COLUMNS}, institutions(name, number)`)
    .eq('year_id', yearId);
  return (data ?? [])
    .map((r) => {
      const inst = r.institutions as unknown as { name: string; number: number } | null;
      return { ...r, instName: inst?.name ?? '', instNumber: inst?.number ?? 0 };
    })
    .sort((a, b) => a.instName.localeCompare(b.instName, 'he'));
}

async function fetchClasses(iyId: string): Promise<ClassWithCount[]> {
  const { data } = await supabase
    .from('classes')
    .select(`${CLASS_COLUMNS}, class_books(count)`)
    .eq('institution_year_id', iyId)
    .order('sort_order')
    .order('name');
  return (data ?? []).map((c) => ({
    ...c,
    bookCount: (c.class_books as unknown as { count: number }[])?.[0]?.count ?? 0,
  }));
}

async function fetchClassBooks(classId: string): Promise<ClassBook[]> {
  const { data } = await supabase
    .from('class_books')
    .select(CLASS_BOOK_COLUMNS)
    .eq('class_id', classId)
    .order('sort_order')
    .order('created_at');
  return data ?? [];
}

function ClassesScreen() {
  const { year, readOnly } = useYear();
  const { hasPermission } = useAuth();
  const router = useRouter();
  const params = useSearchParams();
  const canSeeCost = hasPermission('books_view_cost');
  const canEdit = hasPermission('classes_manage') && !readOnly;

  const [iys, setIys] = useState<IyOption[] | null>(null);
  const [classes, setClasses] = useState<ClassWithCount[]>([]);
  const [selectedClassId, setSelectedClassId] = useState<string | null>(null);
  const [books, setBooks] = useState<Book[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [links, setLinks] = useState<BookSupplier[]>([]);
  const [classModal, setClassModal] = useState<ClassRow | 'new' | null>(null);
  const [copyClass, setCopyClass] = useState<ClassRow | null>(null);
  const [copyListTo, setCopyListTo] = useState<ClassRow | null>(null);

  const yearId = year?.id ?? null;
  const requestedIy = params.get('iy');
  const iy = useMemo(
    () => iys?.find((x) => x.id === requestedIy) ?? iys?.[0] ?? null,
    [iys, requestedIy]
  );

  // קטלוג, ספקים ומחירי קנייה – פעם אחת
  useEffect(() => {
    let cancelled = false;
    void Promise.all([
      fetchBooks(),
      fetchSuppliers(),
      canSeeCost ? supabase.from('book_suppliers').select(BOOK_SUPPLIER_COLUMNS) : Promise.resolve({ data: [] }),
    ]).then(([b, s, l]) => {
      if (cancelled) return;
      setBooks(b);
      setSuppliers(s);
      setLinks((l.data ?? []) as BookSupplier[]);
    });
    return () => {
      cancelled = true;
    };
  }, [canSeeCost]);

  // המוסדות בשנה
  useEffect(() => {
    if (!yearId) return;
    let cancelled = false;
    void fetchIys(yearId).then((list) => !cancelled && setIys(list));
    return () => {
      cancelled = true;
    };
  }, [yearId]);

  // הכיתות של המוסד הנבחר
  const iyId = iy?.id ?? null;
  const reloadClasses = useCallback(async () => {
    if (!iyId) return;
    setClasses(await fetchClasses(iyId));
  }, [iyId]);
  useEffect(() => {
    if (!iyId) return;
    let cancelled = false;
    void fetchClasses(iyId).then((list) => {
      if (cancelled) return;
      setClasses(list);
      setSelectedClassId((cur) => (cur && list.some((c) => c.id === cur) ? cur : list[0]?.id ?? null));
    });
    return () => {
      cancelled = true;
    };
  }, [iyId]);

  const selectInstitution = (id: string) => {
    setSelectedClassId(null);
    router.replace(`/classes?iy=${id}`);
  };

  const selectedClass = classes.find((c) => c.id === selectedClassId) ?? null;

  const deleteClass = async (c: ClassRow) => {
    if (!window.confirm(`למחוק את כיתה "${c.name}" ואת רשימת הספרים שלה?`)) return;
    const { error } = await supabase.from('classes').delete().eq('id', c.id);
    if (error) return toast.error(dbErrorMessage(error.message));
    toast.success('הכיתה נמחקה');
    setSelectedClassId(null);
    await reloadClasses();
  };

  const exportInstitution = async () => {
    if (!iy) return;
    const { data } = await supabase
      .from('class_books')
      .select(`${CLASS_BOOK_COLUMNS}, classes!inner(name, institution_year_id, sort_order)`)
      .eq('classes.institution_year_id', iy.id);
    const bookById = new Map(books.map((b) => [b.id, b]));
    const supplierName = new Map(suppliers.map((s) => [s.id, s.name]));
    const byClass = new Map<string, ClassBook[]>();
    for (const r of data ?? []) {
      const list = byClass.get(r.class_id) ?? [];
      list.push(r);
      byClass.set(r.class_id, list);
    }
    const sheets = classes.map((c) => ({
      name: c.name,
      rows: (byClass.get(c.id) ?? [])
        .sort((a, b) => a.sort_order - b.sort_order)
        .map((cb) => classBookExcelRow(cb, bookById, supplierName, links, canSeeCost, iy)),
    }));
    await exportToExcel(`רשימות ספרים – ${iy.instName} – ${year?.name ?? ''}`, sheets.length ? sheets : [{ name: 'ריק', rows: [] }]);
  };

  if (!year) return <EmptyState>יש לפתוח שנת לימודים במסך &quot;שנות לימודים&quot;.</EmptyState>;
  if (!iys) return <Spinner />;

  return (
    <div>
      <PageHeader title="כיתות ורשימות ספרים">
        {iy && (
          <Protect permId="export_excel">
            <Button variant="secondary" onClick={exportInstitution} disabled={!classes.length}>
              <FileSpreadsheet className="h-4 w-4" /> אקסל לכל המוסד
            </Button>
          </Protect>
        )}
      </PageHeader>
      {readOnly && <ClosedYearNotice />}

      {iys.length === 0 ? (
        <EmptyState>אין מוסדות בשנת {year.name}. יש להוסיף מוסד במסך &quot;מוסדות&quot;.</EmptyState>
      ) : (
        <>
          <div className="mb-4 flex flex-wrap items-center gap-2 print:hidden">
            <label className="text-sm font-medium">מוסד:</label>
            <select
              className={`${inputClass} max-w-sm`}
              value={iy?.id ?? ''}
              onChange={(e) => selectInstitution(e.target.value)}
            >
              {iys.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.instNumber} – {x.instName}
                </option>
              ))}
            </select>
            {iy?.cancel_deadline && (
              <span className="text-xs text-slate-500">ביטול עד {formatDate(iy.cancel_deadline)} (ברירת מחדל)</span>
            )}
          </div>

          <div className="flex flex-col gap-4 lg:flex-row">
            {/* רשימת כיתות */}
            <div className="shrink-0 space-y-2 lg:w-56 print:hidden">
              {canEdit && (
                <Button className="w-full" onClick={() => setClassModal('new')}>
                  <Plus className="h-4 w-4" /> כיתה חדשה
                </Button>
              )}
              {classes.length === 0 ? (
                <p className="rounded-lg border border-dashed border-slate-300 p-4 text-center text-sm text-slate-400">אין כיתות</p>
              ) : (
                <ul className="space-y-1">
                  {classes.map((c) => (
                    <li key={c.id}>
                      <button
                        type="button"
                        onClick={() => setSelectedClassId(c.id)}
                        className={`flex w-full items-center gap-2 rounded-lg border px-3 py-2 text-right ${
                          c.id === selectedClassId ? 'border-blue-500 bg-blue-50' : 'border-slate-200 bg-white hover:bg-slate-50'
                        }`}
                      >
                        <span className="flex-1 font-medium">{c.name}</span>
                        <span className="text-xs text-slate-400">{c.bookCount} ספרים</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* רשימת הספרים של הכיתה */}
            <div className="min-w-0 flex-1">
              {selectedClass && iy ? (
                <ClassBooksPanel
                  key={selectedClass.id}
                  cls={selectedClass}
                  iy={iy}
                  yearName={year.name}
                  books={books}
                  suppliers={suppliers}
                  links={links}
                  canEdit={canEdit}
                  canSeeCost={canSeeCost}
                  onCountChanged={reloadClasses}
                  onEditClass={() => setClassModal(selectedClass)}
                  onDeleteClass={() => deleteClass(selectedClass)}
                  onCopyClass={() => setCopyClass(selectedClass)}
                  onCopyListInto={() => setCopyListTo(selectedClass)}
                />
              ) : (
                <EmptyState>בחרו כיתה מהרשימה{canEdit ? ' או צרו כיתה חדשה' : ''}</EmptyState>
              )}
            </div>
          </div>
        </>
      )}

      {classModal && iy && (
        <ClassModal
          key={classModal === 'new' ? 'new' : classModal.id}
          cls={classModal === 'new' ? null : classModal}
          iyId={iy.id}
          nextOrder={classes.length}
          onClose={() => setClassModal(null)}
          onSaved={async (id) => {
            setClassModal(null);
            await reloadClasses();
            setSelectedClassId(id);
          }}
        />
      )}
      {copyClass && (
        <CopyClassModal
          cls={copyClass}
          iys={iys}
          currentIyId={iy?.id ?? ''}
          onClose={() => setCopyClass(null)}
          onCopied={async (targetIy, newId) => {
            setCopyClass(null);
            if (targetIy === iy?.id) {
              await reloadClasses();
              setSelectedClassId(newId);
            } else {
              selectInstitution(targetIy);
            }
          }}
        />
      )}
      {copyListTo && (
        <CopyListModal
          target={copyListTo}
          currentYearId={year.id}
          onClose={() => setCopyListTo(null)}
          onCopied={async () => {
            const id = copyListTo.id;
            setCopyListTo(null);
            setSelectedClassId(null);
            await reloadClasses();
            setSelectedClassId(id);
          }}
        />
      )}
    </div>
  );
}

function classBookExcelRow(
  cb: ClassBook,
  bookById: Map<string, Book>,
  supplierName: Map<string, string>,
  links: BookSupplier[],
  canSeeCost: boolean,
  iy: InstitutionYear
) {
  const b = bookById.get(cb.book_id);
  const cost = links.find((l) => l.book_id === cb.book_id && l.supplier_id === cb.supplier_id)?.purchase_price;
  return {
    'קוד ספר': b?.code,
    'שם הספר': b?.name,
    'כמות לתלמיד': cb.qty_per_student,
    'מחיר מכירה': cb.sale_price,
    ...(canSeeCost ? { 'מחיר קנייה': cost ?? '' } : {}),
    ספק: cb.supplier_id ? supplierName.get(cb.supplier_id) : '',
    'חובה/רשות': cb.is_required ? 'חובה' : 'רשות',
    'אחרון להזמנה': formatDate(cb.order_deadline ?? iy.order_deadline),
    'אחרון לביטול': formatDate(cb.cancel_deadline ?? iy.cancel_deadline),
    הערות: cb.notes,
  };
}

// ---------------------------------------------------------------------

function ClassBooksPanel({
  cls,
  iy,
  yearName,
  books,
  suppliers,
  links,
  canEdit,
  canSeeCost,
  onCountChanged,
  onEditClass,
  onDeleteClass,
  onCopyClass,
  onCopyListInto,
}: {
  cls: ClassRow;
  iy: IyOption;
  yearName: string;
  books: Book[];
  suppliers: Supplier[];
  links: BookSupplier[];
  canEdit: boolean;
  canSeeCost: boolean;
  onCountChanged: () => void;
  onEditClass: () => void;
  onDeleteClass: () => void;
  onCopyClass: () => void;
  onCopyListInto: () => void;
}) {
  const { hasPermission } = useAuth();
  const [rows, setRows] = useState<ClassBook[] | null>(null);
  const [importing, setImporting] = useState(false);
  const bookById = useMemo(() => new Map(books.map((b) => [b.id, b])), [books]);
  const supplierName = useMemo(() => new Map(suppliers.map((s) => [s.id, s.name])), [suppliers]);
  const canCopy = hasPermission('classes_copy') && !!canEdit;

  useEffect(() => {
    let cancelled = false;
    void fetchClassBooks(cls.id).then((r) => !cancelled && setRows(r));
    return () => {
      cancelled = true;
    };
  }, [cls.id]);

  const suppliersForBook = (bookId: string) => {
    const linked = links.filter((l) => l.book_id === bookId).map((l) => l.supplier_id);
    // בלי הרשאת מחירי קנייה לא רואים את השיוך – מציגים את כל הספקים הפעילים
    return canSeeCost && linked.length ? suppliers.filter((s) => linked.includes(s.id)) : suppliers.filter((s) => s.is_active);
  };

  const add = async (book: Book) => {
    const preferred = links.find((l) => l.book_id === book.id && l.is_preferred) ?? links.find((l) => l.book_id === book.id);
    const { data, error } = await supabase
      .from('class_books')
      .insert({
        class_id: cls.id,
        book_id: book.id,
        sale_price: book.sale_price,
        supplier_id: preferred?.supplier_id ?? null,
        sort_order: (rows?.length ?? 0) + 1,
      })
      .select(CLASS_BOOK_COLUMNS)
      .single();
    if (error) return toast.error(dbErrorMessage(error.message));
    setRows((r) => [...(r ?? []), data]);
    onCountChanged();
  };

  const update = async (row: ClassBook, patch: Partial<ClassBook>) => {
    setRows((r) => r?.map((x) => (x.id === row.id ? { ...x, ...patch } : x)) ?? null);
    const { error } = await supabase.from('class_books').update(patch).eq('id', row.id);
    if (error) {
      toast.error(dbErrorMessage(error.message));
      setRows((r) => r?.map((x) => (x.id === row.id ? row : x)) ?? null);
    }
  };

  const remove = async (row: ClassBook) => {
    const { error } = await supabase.from('class_books').delete().eq('id', row.id);
    if (error) return toast.error(dbErrorMessage(error.message));
    setRows((r) => r?.filter((x) => x.id !== row.id) ?? null);
    onCountChanged();
  };

  const totals = useMemo(() => {
    let required = 0;
    let all = 0;
    for (const r of rows ?? []) {
      const t = r.sale_price * r.qty_per_student;
      all += t;
      if (r.is_required) required += t;
    }
    return { required, all };
  }, [rows]);

  const exportClass = () =>
    exportToExcel(`${iy.instName} – כיתה ${cls.name} – ${yearName}`, [
      {
        name: cls.name,
        rows: (rows ?? []).map((cb) => classBookExcelRow(cb, bookById, supplierName, links, canSeeCost, iy)),
      },
    ]);

  if (!rows) return <Spinner />;
  const existing = new Set(rows.map((r) => r.book_id));
  const cell = 'px-2 py-1.5';

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 print:hidden">
        <h2 className="flex-1 text-xl font-bold">
          כיתה {cls.name}
          {cls.student_count != null && <span className="mr-2 text-sm font-normal text-slate-500">({cls.student_count} תלמידים)</span>}
        </h2>
        {canEdit && (
          <Button variant="ghost" onClick={onEditClass} title="עריכת פרטי הכיתה">
            <Pencil className="h-4 w-4" />
          </Button>
        )}
        {canCopy && (
          <>
            <Button variant="secondary" onClick={onCopyListInto}>
              <ClipboardCopy className="h-4 w-4" /> העתקת רשימה מכיתה אחרת
            </Button>
            <Button variant="secondary" onClick={onCopyClass}>
              <Copy className="h-4 w-4" /> שכפול הכיתה
            </Button>
          </>
        )}
        <Protect permId="export_excel">
          <Button variant="secondary" onClick={exportClass} disabled={!rows.length} title="ייצוא לאקסל">
            <FileSpreadsheet className="h-4 w-4" />
          </Button>
        </Protect>
        {canEdit && <ImportButton editPerm="classes_manage" onClick={() => setImporting(true)} />}
        {importing && (
          <ImportExcelModal
            title={`ייבוא רשימת ספרים לכיתה ${cls.name}`}
            templateName={`תבנית ייבוא רשימה – כיתה ${cls.name}`}
            {...classBooksImporter(cls.id, books, suppliers)}
            onClose={() => setImporting(false)}
            onDone={async () => {
              setRows(await fetchClassBooks(cls.id));
              onCountChanged();
            }}
          />
        )}
        <Protect permId="reports_view">
          <Button variant="secondary" onClick={() => window.print()} disabled={!rows.length} title="הדפסה">
            <Printer className="h-4 w-4" />
          </Button>
        </Protect>
        {canEdit && (
          <Button variant="ghost" onClick={onDeleteClass} title="מחיקת הכיתה">
            <Trash2 className="h-4 w-4 text-red-500" />
          </Button>
        )}
      </div>

      {canEdit && (
        <div className="print:hidden">
          <BookPicker books={books} excludeIds={existing} onPick={add} />
        </div>
      )}

      {/* טבלת עריכה */}
      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white print:hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-600">
            <tr>
              <th className={`${cell} text-right`}>ספר</th>
              <th className={`${cell} text-right`}>כמות</th>
              <th className={`${cell} text-right`}>מחיר מכירה</th>
              <th className={`${cell} text-right`}>ספק</th>
              {canSeeCost && <th className={`${cell} text-right`}>מחיר קנייה</th>}
              <th className={`${cell} text-right`}>חובה</th>
              <th className={`${cell} text-right`}>אחרון להזמנה</th>
              <th className={`${cell} text-right`}>אחרון לביטול</th>
              <th className={`${cell} text-right`}>הערות</th>
              {canEdit && <th />}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((r) => {
              const b = bookById.get(r.book_id);
              const cost = links.find((l) => l.book_id === r.book_id && l.supplier_id === r.supplier_id)?.purchase_price;
              return (
                <tr key={r.id} className="align-top">
                  <td className={cell}>
                    <div className="font-medium">{b?.name}</div>
                    <div className="text-xs text-slate-400">{b?.code}</div>
                  </td>
                  <td className={cell}>
                    <input
                      disabled={!canEdit}
                      inputMode="numeric"
                      className={`${inputClass} w-16`}
                      defaultValue={r.qty_per_student}
                      onBlur={(e) => {
                        const v = Math.max(1, toNumber(e.target.value) ?? 1);
                        if (v !== r.qty_per_student) void update(r, { qty_per_student: v });
                      }}
                    />
                  </td>
                  <td className={cell}>
                    <input
                      disabled={!canEdit}
                      inputMode="decimal"
                      className={`${inputClass} w-24`}
                      defaultValue={r.sale_price}
                      onBlur={(e) => {
                        const v = toNumber(e.target.value) ?? 0;
                        if (v !== r.sale_price) void update(r, { sale_price: v });
                      }}
                    />
                  </td>
                  <td className={cell}>
                    <select
                      disabled={!canEdit}
                      className={`${inputClass} min-w-32`}
                      value={r.supplier_id ?? ''}
                      onChange={(e) => void update(r, { supplier_id: e.target.value || null })}
                    >
                      <option value="">—</option>
                      {suppliersForBook(r.book_id).map((s) => (
                        <option key={s.id} value={s.id}>{s.name}</option>
                      ))}
                      {r.supplier_id && !suppliersForBook(r.book_id).some((s) => s.id === r.supplier_id) && (
                        <option value={r.supplier_id}>{supplierName.get(r.supplier_id)}</option>
                      )}
                    </select>
                  </td>
                  {canSeeCost && <td className={`${cell} pt-3 text-slate-600`}>{cost != null ? money(cost) : '—'}</td>}
                  <td className={`${cell} pt-3`}>
                    <input
                      type="checkbox"
                      disabled={!canEdit}
                      checked={r.is_required}
                      onChange={(e) => void update(r, { is_required: e.target.checked })}
                      title={r.is_required ? 'חובה' : 'רשות'}
                    />
                  </td>
                  <td className={`${cell} w-40`}>
                    <DateInput
                      disabled={!canEdit}
                      value={r.order_deadline ?? ''}
                      onChange={(v) => void update(r, { order_deadline: v || null })}
                    />
                    {!r.order_deadline && iy.order_deadline && (
                      <div className="mt-0.5 text-[10px] text-slate-400">מוסד: {formatDate(iy.order_deadline)}</div>
                    )}
                  </td>
                  <td className={`${cell} w-40`}>
                    <DateInput
                      disabled={!canEdit}
                      value={r.cancel_deadline ?? ''}
                      onChange={(v) => void update(r, { cancel_deadline: v || null })}
                    />
                    {!r.cancel_deadline && iy.cancel_deadline && (
                      <div className="mt-0.5 text-[10px] text-slate-400">מוסד: {formatDate(iy.cancel_deadline)}</div>
                    )}
                  </td>
                  <td className={cell}>
                    <input
                      disabled={!canEdit}
                      className={`${inputClass} min-w-28`}
                      defaultValue={r.notes ?? ''}
                      onBlur={(e) => {
                        const v = nullIfEmpty(e.target.value);
                        if (v !== r.notes) void update(r, { notes: v });
                      }}
                    />
                  </td>
                  {canEdit && (
                    <td className={`${cell} pt-2.5`}>
                      <button type="button" onClick={() => remove(r)} className="p-1 text-red-500" title="הסרה מהרשימה">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </td>
                  )}
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr>
                <td colSpan={10} className="px-3 py-8 text-center text-slate-400">
                  הרשימה ריקה. {canEdit ? 'הוסיפו ספרים מהקטלוג, או העתיקו רשימה מכיתה אחרת.' : ''}
                </td>
              </tr>
            )}
          </tbody>
          {rows.length > 0 && (
            <tfoot className="bg-slate-50 text-sm">
              <tr>
                <td colSpan={10} className="px-3 py-2">
                  <span className="font-semibold">סה״כ לתלמיד:</span> חובה {money(totals.required)}
                  {totals.all !== totals.required && <> · כולל רשות {money(totals.all)}</>}
                  <span className="mr-3 text-slate-500">({rows.length} ספרים)</span>
                </td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {/* גרסת הדפסה */}
      <div className="hidden print:block">
        <h1 className="text-xl font-bold">
          {iy.instName} – כיתה {cls.name} – שנת {yearName}
        </h1>
        <table className="mt-3 w-full border-collapse text-sm">
          <thead>
            <tr>
              {['#', 'קוד', 'שם הספר', 'כמות', 'מחיר', 'חובה/רשות', 'ביטול עד'].map((h) => (
                <th key={h} className="border border-slate-400 px-2 py-1 text-right">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              const b = bookById.get(r.book_id);
              return (
                <tr key={r.id}>
                  <td className="border border-slate-400 px-2 py-1">{i + 1}</td>
                  <td className="border border-slate-400 px-2 py-1">{b?.code}</td>
                  <td className="border border-slate-400 px-2 py-1">{b?.name}</td>
                  <td className="border border-slate-400 px-2 py-1">{r.qty_per_student}</td>
                  <td className="border border-slate-400 px-2 py-1">{money(r.sale_price)}</td>
                  <td className="border border-slate-400 px-2 py-1">{r.is_required ? 'חובה' : 'רשות'}</td>
                  <td className="border border-slate-400 px-2 py-1">{formatDate(r.cancel_deadline ?? iy.cancel_deadline)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <p className="mt-2 text-sm">
          סה״כ חובה: {money(totals.required)}
          {totals.all !== totals.required && <> · כולל רשות: {money(totals.all)}</>}
        </p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------

function ClassModal({
  cls,
  iyId,
  nextOrder,
  onClose,
  onSaved,
}: {
  cls: ClassRow | null;
  iyId: string;
  nextOrder: number;
  onClose: () => void;
  onSaved: (id: string) => void;
}) {
  const [form, setForm] = useState({
    name: cls?.name ?? '',
    student_count: cls?.student_count?.toString() ?? '',
    sort_order: (cls?.sort_order ?? nextOrder + 1).toString(),
    notes: cls?.notes ?? '',
  });
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!form.name.trim()) return toast.error('יש להזין שם כיתה');
    setSaving(true);
    const payload = {
      name: form.name.trim(),
      student_count: toNumber(form.student_count),
      sort_order: toNumber(form.sort_order) ?? 0,
      notes: nullIfEmpty(form.notes),
    };
    const { data, error } = cls
      ? await supabase.from('classes').update(payload).eq('id', cls.id).select('id').single()
      : await supabase.from('classes').insert({ ...payload, institution_year_id: iyId }).select('id').single();
    setSaving(false);
    if (error) return toast.error(dbErrorMessage(error.message));
    toast.success('הכיתה נשמרה');
    onSaved(data.id);
  };

  return (
    <Modal
      title={cls ? `עריכת כיתה ${cls.name}` : 'כיתה חדשה'}
      onClose={onClose}
      size="md"
      footer={
        <>
          <Button variant="success" onClick={save} loading={saving}>שמירה</Button>
          <Button variant="secondary" onClick={onClose}>ביטול</Button>
        </>
      }
    >
      <div className="grid gap-3 rounded-xl bg-white p-4 sm:grid-cols-3">
        <Field label="שם הכיתה" hint="למשל: א׳, ב׳1">
          <input className={inputClass} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </Field>
        <Field label="מספר תלמידים" hint="לא חובה">
          <input className={inputClass} inputMode="numeric" value={form.student_count} onChange={(e) => setForm({ ...form, student_count: e.target.value })} />
        </Field>
        <Field label="סדר תצוגה">
          <input className={inputClass} inputMode="numeric" value={form.sort_order} onChange={(e) => setForm({ ...form, sort_order: e.target.value })} />
        </Field>
        <Field label="הערות" className="sm:col-span-3">
          <textarea className={inputClass} rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
        </Field>
      </div>
    </Modal>
  );
}

function CopyClassModal({
  cls,
  iys,
  currentIyId,
  onClose,
  onCopied,
}: {
  cls: ClassRow;
  iys: IyOption[];
  currentIyId: string;
  onClose: () => void;
  onCopied: (targetIy: string, newId: string) => void;
}) {
  const [targetIy, setTargetIy] = useState(currentIyId);
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);

  const run = async () => {
    if (!name.trim()) return toast.error('יש להזין שם לכיתה החדשה');
    setSaving(true);
    const { data, error } = await supabase.rpc('copy_class', {
      p_source_class: cls.id,
      p_target_institution_year: targetIy,
      p_name: name.trim(),
    });
    setSaving(false);
    if (error) return toast.error(dbErrorMessage(error.message));
    toast.success(`נוצרה כיתה ${name.trim()} עם רשימת הספרים של ${cls.name}`);
    onCopied(targetIy, data);
  };

  return (
    <Modal
      title={`שכפול כיתה ${cls.name}`}
      onClose={onClose}
      size="md"
      footer={
        <>
          <Button variant="success" onClick={run} loading={saving}>
            <Copy className="h-4 w-4" /> שכפול
          </Button>
          <Button variant="secondary" onClick={onClose}>ביטול</Button>
        </>
      }
    >
      <p className="rounded-lg bg-blue-50 px-3 py-2 text-sm text-blue-800">
        תיווצר כיתה חדשה עם אותה רשימת ספרים. אחרי השכפול אפשר לערוך אותה – המקור לא משתנה.
      </p>
      <div className="grid gap-3 rounded-xl bg-white p-4 sm:grid-cols-2">
        <Field label="למוסד">
          <select className={inputClass} value={targetIy} onChange={(e) => setTargetIy(e.target.value)}>
            {iys.map((x) => (
              <option key={x.id} value={x.id}>
                {x.instNumber} – {x.instName}
              </option>
            ))}
          </select>
        </Field>
        <Field label="שם הכיתה החדשה">
          <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        </Field>
      </div>
    </Modal>
  );
}

function CopyListModal({
  target,
  currentYearId,
  onClose,
  onCopied,
}: {
  target: ClassRow;
  currentYearId: string;
  onClose: () => void;
  onCopied: () => void;
}) {
  const { years } = useYear();
  const [yearId, setYearId] = useState(currentYearId);
  const [iys, setIys] = useState<IyOption[]>([]);
  const [iyId, setIyId] = useState('');
  const [classes, setClasses] = useState<ClassWithCount[]>([]);
  const [sourceId, setSourceId] = useState('');
  const [replace, setReplace] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void fetchIys(yearId).then((list) => {
      if (cancelled) return;
      setIys(list);
      setIyId((cur) => (list.some((x) => x.id === cur) ? cur : target.institution_year_id && list.some((x) => x.id === target.institution_year_id) ? target.institution_year_id : list[0]?.id ?? ''));
    });
    return () => {
      cancelled = true;
    };
  }, [yearId, target.institution_year_id]);

  useEffect(() => {
    if (!iyId) return;
    let cancelled = false;
    void fetchClasses(iyId).then((list) => {
      if (cancelled) return;
      const others = list.filter((c) => c.id !== target.id);
      setClasses(others);
      setSourceId(others[0]?.id ?? '');
    });
    return () => {
      cancelled = true;
    };
  }, [iyId, target.id]);

  const run = async () => {
    if (!sourceId) return toast.error('יש לבחור כיתת מקור');
    setSaving(true);
    const { data, error } = await supabase.rpc('copy_class_books', {
      p_source_class: sourceId,
      p_target_class: target.id,
      p_replace: replace,
    });
    setSaving(false);
    if (error) return toast.error(dbErrorMessage(error.message));
    toast.success(data ? `הועתקו ${data} ספרים` : 'לא נוספו ספרים (כולם כבר ברשימה)');
    onCopied();
  };

  return (
    <Modal
      title={`העתקת רשימת ספרים לכיתה ${target.name}`}
      onClose={onClose}
      size="md"
      footer={
        <>
          <Button variant="success" onClick={run} loading={saving}>
            <ClipboardCopy className="h-4 w-4" /> העתקה
          </Button>
          <Button variant="secondary" onClick={onClose}>ביטול</Button>
        </>
      }
    >
      <div className="grid gap-3 rounded-xl bg-white p-4">
        <Field label="משנה">
          <select className={inputClass} value={yearId} onChange={(e) => setYearId(e.target.value)}>
            {years.map((y: AcademicYear) => (
              <option key={y.id} value={y.id}>{y.name}</option>
            ))}
          </select>
        </Field>
        <Field label="ממוסד">
          <select className={inputClass} value={iyId} onChange={(e) => setIyId(e.target.value)}>
            {iys.map((x) => (
              <option key={x.id} value={x.id}>
                {x.instNumber} – {x.instName}
              </option>
            ))}
          </select>
        </Field>
        <Field label="מכיתה">
          <select className={inputClass} value={sourceId} onChange={(e) => setSourceId(e.target.value)}>
            {classes.length === 0 && <option value="">אין כיתות</option>}
            {classes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} ({c.bookCount} ספרים)
              </option>
            ))}
          </select>
        </Field>
        <div className="space-y-1 text-sm">
          <label className="flex items-center gap-2">
            <input type="radio" checked={!replace} onChange={() => setReplace(false)} /> להוסיף לרשימה הקיימת (ספרים שכבר קיימים לא יוכפלו)
          </label>
          <label className="flex items-center gap-2">
            <input type="radio" checked={replace} onChange={() => setReplace(true)} /> להחליף את הרשימה הקיימת
          </label>
        </div>
      </div>
    </Modal>
  );
}
