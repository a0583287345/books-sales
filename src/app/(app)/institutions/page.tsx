'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ClipboardList, Copy, FileSpreadsheet, Link2, Plus, Search, Undo2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/components/AuthContext';
import { useYear } from '@/components/YearContext';
import { PageGuard, Protect } from '@/components/Protect';
import PhoneLink from '@/components/PhoneLink';
import DateInput from '@/components/DateInput';
import { Button, ClosedYearNotice, EmptyState, Field, inputClass, Modal, PageHeader, Spinner } from '@/components/ui';
import { toast } from '@/components/Toaster';
import { dbErrorMessage } from '@/lib/dbErrors';
import { exportToExcel } from '@/lib/excel';
import { ImportButton, ImportExcelModal } from '@/components/ImportExcelModal';
import { OrderLinksModal } from '@/components/online/OrderLinksModal';
import { institutionsImporter } from '@/lib/importers';
import { formatDate, normalizeSearch, nullIfEmpty, toNumber } from '@/lib/format';
import {
  INSTITUTION_COLUMNS,
  INSTITUTION_YEAR_COLUMNS,
  type Institution,
  type InstitutionYear,
} from '@/lib/entities';

export default function InstitutionsPage() {
  return (
    <PageGuard permId="institutions_view">
      <InstitutionsScreen />
    </PageGuard>
  );
}

type Row = { inst: Institution; iy: InstitutionYear | null; classCount: number };

async function fetchData(yearId: string | null) {
  const [{ data: insts, error }, { data: iys }, { data: classes }] = await Promise.all([
    supabase.from('institutions').select(INSTITUTION_COLUMNS).order('name'),
    yearId
      ? supabase.from('institution_years').select(INSTITUTION_YEAR_COLUMNS).eq('year_id', yearId)
      : Promise.resolve({ data: [] as InstitutionYear[] }),
    yearId
      ? supabase.from('classes').select('institution_year_id, institution_years!inner(year_id)').eq('institution_years.year_id', yearId)
      : Promise.resolve({ data: [] as { institution_year_id: string }[] }),
  ]);
  if (error) toast.error(dbErrorMessage(error.message));
  const counts = new Map<string, number>();
  for (const c of classes ?? []) counts.set(c.institution_year_id, (counts.get(c.institution_year_id) ?? 0) + 1);
  const byInst = new Map((iys ?? []).map((iy) => [iy.institution_id, iy]));
  return (insts ?? []).map<Row>((inst) => {
    const iy = byInst.get(inst.id) ?? null;
    return { inst, iy, classCount: iy ? counts.get(iy.id) ?? 0 : 0 };
  });
}

function InstitutionsScreen() {
  const { year, readOnly } = useYear();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [search, setSearch] = useState('');
  const [showOther, setShowOther] = useState(false);
  const [editing, setEditing] = useState<Row | 'new' | null>(null);
  const [copying, setCopying] = useState<Row | null>(null);
  const [adding, setAdding] = useState<Row | null>(null);
  const [linksFor, setLinksFor] = useState<Row | null>(null);
  const [importing, setImporting] = useState(false);

  const yearId = year?.id ?? null;
  const reload = useCallback(async () => setRows(await fetchData(yearId)), [yearId]);
  useEffect(() => {
    let cancelled = false;
    void fetchData(yearId).then((r) => !cancelled && setRows(r));
    return () => {
      cancelled = true;
    };
  }, [yearId]);

  const filtered = useMemo(() => {
    const q = normalizeSearch(search);
    return (rows ?? []).filter(
      (r) =>
        (showOther ? !r.iy : !!r.iy) &&
        (!q ||
          normalizeSearch(`${r.inst.number} ${r.inst.name} ${r.inst.city ?? ''} ${r.inst.contact_name ?? ''} ${r.inst.phone ?? ''}`).includes(q))
    );
  }, [rows, search, showOther]);

  const inYearCount = (rows ?? []).filter((r) => r.iy).length;

  const exportExcel = () =>
    exportToExcel(`מוסדות ${year?.name ?? ''}`, [
      {
        name: 'מוסדות',
        rows: filtered.map((r) => ({
          'מספר מוסד': r.inst.number,
          שם: r.inst.name,
          עיר: r.inst.city,
          כתובת: r.inst.address,
          'איש קשר': r.inst.contact_name,
          טלפון: r.inst.phone,
          'טלפון נוסף': r.inst.phone2,
          אימייל: r.inst.email,
          'פתיחת מכירה': formatDate(r.iy?.sale_open_date),
          'סגירת מכירה': formatDate(r.iy?.sale_close_date),
          'מועד אחרון להזמנה': formatDate(r.iy?.order_deadline),
          'מועד אחרון לביטול': formatDate(r.iy?.cancel_deadline),
          כיתות: r.classCount,
        })),
      },
    ]);

  if (!rows) return <Spinner />;

  return (
    <div>
      <PageHeader title={`מוסדות${year ? ` – ${year.name}` : ''}`}>
        <Protect permId="export_excel">
          <Button variant="secondary" onClick={exportExcel} disabled={!filtered.length}>
            <FileSpreadsheet className="h-4 w-4" /> אקסל
          </Button>
        </Protect>
        {!readOnly && year && <ImportButton editPerm="institutions_create" onClick={() => setImporting(true)} />}
        {!readOnly && year && (
          <Protect permId="institutions_create">
            <Button onClick={() => setEditing('new')}>
              <Plus className="h-4 w-4" /> מוסד חדש
            </Button>
          </Protect>
        )}
      </PageHeader>
      {readOnly && <ClosedYearNotice />}
      {!year && <EmptyState>יש לפתוח שנת לימודים במסך &quot;שנות לימודים&quot; לפני הוספת מוסדות.</EmptyState>}

      {year && (
        <>
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <div className="flex rounded-lg border border-slate-300 bg-white p-0.5 text-sm">
              <button
                type="button"
                onClick={() => setShowOther(false)}
                className={`rounded-md px-3 py-1.5 ${!showOther ? 'bg-blue-600 text-white' : ''}`}
              >
                בשנה הזו ({inYearCount})
              </button>
              <button
                type="button"
                onClick={() => setShowOther(true)}
                className={`rounded-md px-3 py-1.5 ${showOther ? 'bg-blue-600 text-white' : ''}`}
              >
                מוסדות שלא בשנה הזו ({rows.length - inYearCount})
              </button>
            </div>
            <div className="relative">
              <Search className="absolute right-2.5 top-2.5 h-4 w-4 text-slate-400" />
              <input
                className="rounded-lg border border-slate-300 py-2 pl-3 pr-8 text-sm"
                placeholder="חיפוש לפי שם, מספר, עיר..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>

          {filtered.length === 0 ? (
            <EmptyState>
              {showOther
                ? 'כל המוסדות כבר נמצאים בשנה הזו'
                : 'אין עדיין מוסדות בשנה הזו. אפשר להוסיף מוסד חדש, או להעביר מוסד קיים מהלשונית "מוסדות שלא בשנה הזו".'}
            </EmptyState>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-slate-600">
                  <tr>
                    <th className="px-3 py-2 text-right">מס׳</th>
                    <th className="px-3 py-2 text-right">שם המוסד</th>
                    <th className="px-3 py-2 text-right">עיר</th>
                    <th className="px-3 py-2 text-right">איש קשר</th>
                    <th className="px-3 py-2 text-right">טלפון</th>
                    {!showOther && <th className="px-3 py-2 text-right">מכירה</th>}
                    {!showOther && <th className="px-3 py-2 text-right">ביטול עד</th>}
                    {!showOther && <th className="px-3 py-2 text-right">כיתות</th>}
                    <th className="px-3 py-2" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filtered.map((r) => (
                    <tr key={r.inst.id} className="hover:bg-blue-50">
                      <td className="px-3 py-2.5 text-slate-500">{r.inst.number}</td>
                      <td className="px-3 py-2.5 font-medium">
                        <button type="button" onClick={() => setEditing(r)} className="text-right hover:underline">
                          {r.inst.name}
                        </button>
                      </td>
                      <td className="px-3 py-2.5">{r.inst.city}</td>
                      <td className="px-3 py-2.5">{r.inst.contact_name}</td>
                      <td className="px-3 py-2.5">{r.inst.phone && <PhoneLink phone={r.inst.phone} />}</td>
                      {!showOther && (
                        <td className="px-3 py-2.5 whitespace-nowrap text-slate-600">
                          {r.iy?.sale_open_date || r.iy?.sale_close_date
                            ? `${formatDate(r.iy?.sale_open_date)} – ${formatDate(r.iy?.sale_close_date)}`
                            : '—'}
                        </td>
                      )}
                      {!showOther && <td className="px-3 py-2.5">{formatDate(r.iy?.cancel_deadline) || '—'}</td>}
                      {!showOther && <td className="px-3 py-2.5">{r.classCount}</td>}
                      <td className="px-3 py-2.5">
                        <div className="flex justify-end gap-1">
                          {r.iy ? (
                            <>
                              <Link
                                href={`/classes?iy=${r.iy.id}`}
                                className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs text-blue-700 hover:bg-blue-100"
                              >
                                <ClipboardList className="h-4 w-4" /> כיתות
                              </Link>
                              <Protect permId="online_links_manage" lockedFallback={null}>
                                <Button variant="ghost" onClick={() => setLinksFor(r)} title="הזמנה בקישור להורים">
                                  <Link2 className="h-4 w-4" />
                                </Button>
                              </Protect>
                              {!readOnly && (
                                <Protect permId="institutions_copy">
                                  <Button variant="ghost" onClick={() => setCopying(r)} title="העתקת מוסד">
                                    <Copy className="h-4 w-4" />
                                  </Button>
                                </Protect>
                              )}
                            </>
                          ) : (
                            !readOnly && (
                              <Protect permId="institutions_edit">
                                <Button variant="secondary" onClick={() => setAdding(r)}>
                                  <Undo2 className="h-4 w-4" /> הוספה לשנה {year.name}
                                </Button>
                              </Protect>
                            )
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {importing && year && (
        <ImportExcelModal
          title={`ייבוא מוסדות מאקסל – לשנת ${year.name}`}
          templateName="תבנית ייבוא מוסדות"
          {...institutionsImporter(
            rows.map((r) => r.inst),
            year.id,
            new Set(rows.filter((r) => r.iy).map((r) => r.inst.id))
          )}
          onClose={() => setImporting(false)}
          onDone={reload}
        />
      )}
      {editing && year && (
        <InstitutionModal
          key={editing === 'new' ? 'new' : editing.inst.id}
          row={editing === 'new' ? null : editing}
          yearId={year.id}
          yearName={year.name}
          readOnly={readOnly}
          onClose={() => setEditing(null)}
          onSaved={async () => {
            setEditing(null);
            await reload();
          }}
        />
      )}
      {linksFor?.iy && year && (
        <OrderLinksModal
          institutionYearId={linksFor.iy.id}
          institutionId={linksFor.inst.id}
          instName={linksFor.inst.name}
          yearName={year.name}
          deadline={linksFor.iy.order_deadline}
          openDate={linksFor.iy.sale_open_date}
          readOnly={readOnly}
          onClose={() => setLinksFor(null)}
        />
      )}
      {copying?.iy && (
        <CopyInstitutionModal
          row={copying}
          onClose={() => setCopying(null)}
          onCopied={async () => {
            setCopying(null);
            await reload();
          }}
        />
      )}
      {adding && year && (
        <AddToYearModal
          row={adding}
          yearId={year.id}
          yearName={year.name}
          onClose={() => setAdding(null)}
          onAdded={async () => {
            setAdding(null);
            await reload();
          }}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------

function InstitutionModal({
  row,
  yearId,
  yearName,
  readOnly,
  onClose,
  onSaved,
}: {
  row: Row | null;
  yearId: string;
  yearName: string;
  readOnly: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { hasPermission } = useAuth();
  const isNew = !row;
  const canEditInst = isNew ? hasPermission('institutions_create') : hasPermission('institutions_edit');
  const canEditSale = !readOnly && (hasPermission('institutions_edit') || hasPermission('years_manage') || isNew);
  const inst = row?.inst;
  const iy = row?.iy;
  const [form, setForm] = useState({
    number: inst?.number?.toString() ?? '',
    name: inst?.name ?? '',
    city: inst?.city ?? '',
    address: inst?.address ?? '',
    contact_name: inst?.contact_name ?? '',
    phone: inst?.phone ?? '',
    phone2: inst?.phone2 ?? '',
    email: inst?.email ?? '',
    notes: inst?.notes ?? '',
    is_active: inst?.is_active ?? true,
  });
  const [sale, setSale] = useState({
    sale_open_date: iy?.sale_open_date ?? '',
    sale_close_date: iy?.sale_close_date ?? '',
    order_deadline: iy?.order_deadline ?? '',
    cancel_deadline: iy?.cancel_deadline ?? '',
    sale_day_date: iy?.sale_day_date ?? '',
    sale_day_notes: iy?.sale_day_notes ?? '',
    notes: iy?.notes ?? '',
    payment_instructions: iy?.payment_instructions ?? '',
    pickup_info: iy?.pickup_info ?? '',
  });
  const [saving, setSaving] = useState(false);
  const set = (k: keyof typeof form, v: string | boolean) => setForm((f) => ({ ...f, [k]: v }));
  const setS = (k: keyof typeof sale, v: string) => setSale((f) => ({ ...f, [k]: v }));

  const save = async () => {
    if (!form.name.trim()) return toast.error('יש להזין שם מוסד');
    setSaving(true);
    const instPayload = {
      name: form.name.trim(),
      city: nullIfEmpty(form.city),
      address: nullIfEmpty(form.address),
      contact_name: nullIfEmpty(form.contact_name),
      phone: nullIfEmpty(form.phone),
      phone2: nullIfEmpty(form.phone2),
      email: nullIfEmpty(form.email),
      notes: nullIfEmpty(form.notes),
      is_active: form.is_active,
      ...(toNumber(form.number) ? { number: toNumber(form.number)! } : {}),
    };
    const salePayload = {
      sale_open_date: nullIfEmpty(sale.sale_open_date),
      sale_close_date: nullIfEmpty(sale.sale_close_date),
      order_deadline: nullIfEmpty(sale.order_deadline),
      cancel_deadline: nullIfEmpty(sale.cancel_deadline),
      sale_day_date: nullIfEmpty(sale.sale_day_date),
      sale_day_notes: nullIfEmpty(sale.sale_day_notes),
      notes: nullIfEmpty(sale.notes),
      payment_instructions: nullIfEmpty(sale.payment_instructions),
      pickup_info: nullIfEmpty(sale.pickup_info),
    };

    let instId = inst?.id;
    if (canEditInst) {
      const { data, error } = inst
        ? await supabase.from('institutions').update(instPayload).eq('id', inst.id).select('id').single()
        : await supabase.from('institutions').insert(instPayload).select('id').single();
      if (error) {
        setSaving(false);
        return toast.error(dbErrorMessage(error.message));
      }
      instId = data.id;
    }
    if (canEditSale && instId) {
      const { error } = iy
        ? await supabase.from('institution_years').update(salePayload).eq('id', iy.id)
        : await supabase.from('institution_years').insert({ ...salePayload, institution_id: instId, year_id: yearId });
      if (error) {
        setSaving(false);
        return toast.error(dbErrorMessage(error.message));
      }
    }
    setSaving(false);
    toast.success('המוסד נשמר');
    onSaved();
  };

  const removeFromYear = async () => {
    if (!iy) return;
    if (
      !window.confirm(
        `להוציא את "${inst?.name}" משנת ${yearName}? כל הכיתות ורשימות הספרים שלו בשנה הזו יימחקו (פרטי המוסד נשמרים).`
      )
    )
      return;
    const { error } = await supabase.from('institution_years').delete().eq('id', iy.id);
    if (error) return toast.error(dbErrorMessage(error.message));
    toast.success('המוסד הוצא מהשנה');
    onSaved();
  };

  const deleteInstitution = async () => {
    if (!inst) return;
    if (!window.confirm(`למחוק לצמיתות את המוסד "${inst.name}" מכל השנים, כולל כל הכיתות והרשימות?`)) return;
    const { error } = await supabase.from('institutions').delete().eq('id', inst.id);
    if (error) return toast.error(dbErrorMessage(error.message));
    toast.success('המוסד נמחק');
    onSaved();
  };

  return (
    <Modal
      title={inst ? `מוסד ${inst.number}: ${inst.name}` : 'מוסד חדש'}
      onClose={onClose}
      footer={
        canEditInst || canEditSale ? (
          <>
            <Button variant="success" onClick={save} loading={saving}>שמירה</Button>
            <Button variant="secondary" onClick={onClose}>ביטול</Button>
            <div className="flex-1" />
            {iy && !readOnly && (
              <Protect permId="institutions_delete">
                <Button variant="danger" onClick={removeFromYear}>הוצאה מהשנה</Button>
              </Protect>
            )}
            {inst && (
              <Protect permId="institutions_delete">
                <Button variant="danger" onClick={deleteInstitution}>מחיקת המוסד</Button>
              </Protect>
            )}
          </>
        ) : undefined
      }
    >
      <fieldset disabled={!canEditInst} className="rounded-xl bg-white p-4">
        <h3 className="mb-3 font-semibold">פרטי המוסד (קבועים לכל השנים)</h3>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="מספר מוסד" hint={inst ? undefined : 'ריק = מספר אוטומטי'}>
            <input className={inputClass} inputMode="numeric" value={form.number} onChange={(e) => set('number', e.target.value)} />
          </Field>
          <Field label="שם המוסד" className="sm:col-span-2">
            <input className={inputClass} value={form.name} onChange={(e) => set('name', e.target.value)} />
          </Field>
          <Field label="עיר">
            <input className={inputClass} value={form.city} onChange={(e) => set('city', e.target.value)} />
          </Field>
          <Field label="כתובת" className="sm:col-span-2">
            <input className={inputClass} value={form.address} onChange={(e) => set('address', e.target.value)} />
          </Field>
          <Field label="מנהל / איש קשר">
            <input className={inputClass} value={form.contact_name} onChange={(e) => set('contact_name', e.target.value)} />
          </Field>
          <Field label="טלפון">
            <input className={inputClass} dir="ltr" value={form.phone} onChange={(e) => set('phone', e.target.value)} />
          </Field>
          <Field label="טלפון נוסף">
            <input className={inputClass} dir="ltr" value={form.phone2} onChange={(e) => set('phone2', e.target.value)} />
          </Field>
          <Field label="אימייל" className="sm:col-span-2">
            <input className={inputClass} dir="ltr" value={form.email} onChange={(e) => set('email', e.target.value)} />
          </Field>
          <label className="flex items-center gap-2 self-end pb-2 text-sm">
            <input type="checkbox" checked={form.is_active} onChange={(e) => set('is_active', e.target.checked)} /> מוסד פעיל
          </label>
          <Field label="הערות והגדרות מיוחדות" className="sm:col-span-3">
            <textarea className={inputClass} rows={2} value={form.notes} onChange={(e) => set('notes', e.target.value)} />
          </Field>
        </div>
      </fieldset>

      <fieldset disabled={!canEditSale} className="rounded-xl bg-white p-4">
        <h3 className="mb-3 font-semibold">המכירה בשנת {yearName}</h3>
        <div className="grid gap-3 sm:grid-cols-4">
          <Field label="פתיחת המכירה">
            <DateInput value={sale.sale_open_date} onChange={(v) => setS('sale_open_date', v)} disabled={!canEditSale} />
          </Field>
          <Field label="סגירת המכירה">
            <DateInput value={sale.sale_close_date} onChange={(v) => setS('sale_close_date', v)} disabled={!canEditSale} />
          </Field>
          <Field label="מועד אחרון להזמנה" hint="ברירת מחדל לכל הספרים">
            <DateInput value={sale.order_deadline} onChange={(v) => setS('order_deadline', v)} disabled={!canEditSale} />
          </Field>
          <Field label="מועד אחרון לביטול" hint="ברירת מחדל לכל הספרים">
            <DateInput value={sale.cancel_deadline} onChange={(v) => setS('cancel_deadline', v)} disabled={!canEditSale} />
          </Field>
          <Field label="יום מכירה מרוכז במוסד">
            <DateInput value={sale.sale_day_date} onChange={(v) => setS('sale_day_date', v)} disabled={!canEditSale} />
          </Field>
          <Field label="פרטי יום המכירה (שעות, מקום)" className="sm:col-span-3">
            <input className={inputClass} value={sale.sale_day_notes} onChange={(e) => setS('sale_day_notes', e.target.value)} />
          </Field>
          <Field label="הערות למכירה השנה" className="sm:col-span-4">
            <textarea className={inputClass} rows={2} value={sale.notes} onChange={(e) => setS('notes', e.target.value)} />
          </Field>
          <Field label="הוראות תשלום (במיילים ובהזמנה בקישור)" hint="ריק = ברירת המחדל בהגדרות המייל. אפשר לקבוע אחרת לכיתה" className="sm:col-span-2">
            <textarea className={inputClass} rows={3} value={sale.payment_instructions} onChange={(e) => setS('payment_instructions', e.target.value)} placeholder={'תשלום בביט למספר ...\nאו במזומן/צ׳ק באיסוף'} />
          </Field>
          <Field label="פרטי איסוף (במיילים)" hint="כתובת, ימים ושעות. ריק = ברירת המחדל" className="sm:col-span-2">
            <textarea className={inputClass} rows={3} value={sale.pickup_info} onChange={(e) => setS('pickup_info', e.target.value)} />
          </Field>
        </div>
      </fieldset>
    </Modal>
  );
}

function CopyInstitutionModal({ row, onClose, onCopied }: { row: Row; onClose: () => void; onCopied: () => void }) {
  const [name, setName] = useState(`${row.inst.name} (עותק)`);
  const [number, setNumber] = useState('');
  const [saving, setSaving] = useState(false);

  const run = async () => {
    if (!name.trim()) return toast.error('יש להזין שם למוסד החדש');
    setSaving(true);
    const { error } = await supabase.rpc('copy_institution', {
      p_source_iy: row.iy!.id,
      p_new_name: name.trim(),
      p_new_number: toNumber(number) ?? undefined,
    });
    setSaving(false);
    if (error) return toast.error(dbErrorMessage(error.message));
    toast.success(`נוצר מוסד חדש: ${name.trim()}`);
    onCopied();
  };

  return (
    <Modal
      title={`העתקת מוסד: ${row.inst.name}`}
      onClose={onClose}
      size="md"
      footer={
        <>
          <Button variant="success" onClick={run} loading={saving}>
            <Copy className="h-4 w-4" /> יצירת העותק
          </Button>
          <Button variant="secondary" onClick={onClose}>ביטול</Button>
        </>
      }
    >
      <p className="rounded-lg bg-blue-50 px-3 py-2 text-sm text-blue-800">
        ייווצר מוסד חדש עם מספר חדש, עם אותם פרטים, {row.classCount} הכיתות ורשימות הספרים. המוסד המקורי לא משתנה.
      </p>
      <div className="grid gap-3 rounded-xl bg-white p-4 sm:grid-cols-3">
        <Field label="שם המוסד החדש" className="sm:col-span-2">
          <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="מספר מוסד" hint="ריק = אוטומטי">
          <input className={inputClass} inputMode="numeric" value={number} onChange={(e) => setNumber(e.target.value)} />
        </Field>
      </div>
    </Modal>
  );
}

type PastSale = { id: string; year_id: string; yearName: string; classCount: number };

function AddToYearModal({
  row,
  yearId,
  yearName,
  onClose,
  onAdded,
}: {
  row: Row;
  yearId: string;
  yearName: string;
  onClose: () => void;
  onAdded: () => void;
}) {
  const { hasPermission } = useAuth();
  const [past, setPast] = useState<PastSale[]>([]);
  const [sourceId, setSourceId] = useState('');
  const [refreshPrices, setRefreshPrices] = useState(true);
  const [saving, setSaving] = useState(false);
  const canCopy = hasPermission('years_copy');

  useEffect(() => {
    let cancelled = false;
    void supabase
      .from('institution_years')
      .select('id, year_id, academic_years(name, start_date), classes(count)')
      .eq('institution_id', row.inst.id)
      .then(({ data }) => {
        if (cancelled) return;
        const list = (data ?? []).map((r) => {
          const y = r.academic_years as unknown as { name: string; start_date: string | null } | null;
          const c = r.classes as unknown as { count: number }[];
          return { id: r.id, year_id: r.year_id, yearName: y?.name ?? '', classCount: c?.[0]?.count ?? 0, start: y?.start_date ?? '' };
        });
        list.sort((a, b) => (b.start ?? '').localeCompare(a.start ?? ''));
        setPast(list);
        if (list[0] && canCopy) setSourceId(list[0].id);
      });
    return () => {
      cancelled = true;
    };
  }, [row.inst.id, canCopy]);

  const run = async () => {
    setSaving(true);
    const { error } = sourceId
      ? await supabase.rpc('copy_institution_to_year', {
          p_source_iy: sourceId,
          p_target_year: yearId,
          p_refresh_prices: refreshPrices,
        })
      : await supabase.from('institution_years').insert({ institution_id: row.inst.id, year_id: yearId });
    setSaving(false);
    if (error) return toast.error(dbErrorMessage(error.message));
    toast.success(`"${row.inst.name}" נוסף לשנת ${yearName}`);
    onAdded();
  };

  return (
    <Modal
      title={`הוספת "${row.inst.name}" לשנת ${yearName}`}
      onClose={onClose}
      size="md"
      footer={
        <>
          <Button variant="success" onClick={run} loading={saving}>הוספה</Button>
          <Button variant="secondary" onClick={onClose}>ביטול</Button>
        </>
      }
    >
      <div className="space-y-2 rounded-xl bg-white p-4 text-sm">
        <label className="flex items-center gap-2">
          <input type="radio" checked={!sourceId} onChange={() => setSourceId('')} /> בלי כיתות (להתחיל מחדש)
        </label>
        {past.map((p) => (
          <label key={p.id} className={`flex items-center gap-2 ${canCopy ? '' : 'text-slate-400'}`}>
            <input type="radio" disabled={!canCopy} checked={sourceId === p.id} onChange={() => setSourceId(p.id)} />
            להעתיק את הכיתות והרשימות משנת {p.yearName} ({p.classCount} כיתות)
          </label>
        ))}
        {!canCopy && past.length > 0 && <p className="text-xs text-slate-400">העתקה משנה קודמת דורשת הרשאת &quot;העתקת שנה&quot;.</p>}
        {sourceId && (
          <label className="flex items-center gap-2 border-t border-slate-100 pt-2">
            <input type="checkbox" checked={refreshPrices} onChange={(e) => setRefreshPrices(e.target.checked)} />
            לעדכן מחירי מכירה לפי הקטלוג
          </label>
        )}
      </div>
    </Modal>
  );
}
