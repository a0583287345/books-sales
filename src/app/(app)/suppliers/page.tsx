'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { FileSpreadsheet, Plus, Search } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/components/AuthContext';
import { PageGuard, Protect } from '@/components/Protect';
import PhoneLink from '@/components/PhoneLink';
import { Button, EmptyState, Field, inputClass, Modal, PageHeader, Spinner } from '@/components/ui';
import { toast } from '@/components/Toaster';
import { dbErrorMessage } from '@/lib/dbErrors';
import { exportToExcel } from '@/lib/excel';
import { money, normalizeSearch, nullIfEmpty, toNumber } from '@/lib/format';
import { fetchSuppliers, type Supplier } from '@/lib/entities';

export default function SuppliersPage() {
  return (
    <PageGuard permId="suppliers_view">
      <SuppliersScreen />
    </PageGuard>
  );
}

function SuppliersScreen() {
  const [suppliers, setSuppliers] = useState<Supplier[] | null>(null);
  const [search, setSearch] = useState('');
  const [showInactive, setShowInactive] = useState(false);
  const [editing, setEditing] = useState<Supplier | 'new' | null>(null);

  const reload = useCallback(async () => setSuppliers(await fetchSuppliers()), []);
  useEffect(() => {
    let cancelled = false;
    void fetchSuppliers().then((s) => !cancelled && setSuppliers(s));
    return () => {
      cancelled = true;
    };
  }, []);

  const filtered = useMemo(() => {
    const q = normalizeSearch(search);
    return (suppliers ?? []).filter(
      (s) =>
        (showInactive || s.is_active) &&
        (!q ||
          normalizeSearch(`${s.number} ${s.name} ${s.contact_name ?? ''} ${s.phone ?? ''} ${s.phone2 ?? ''}`).includes(q))
    );
  }, [suppliers, search, showInactive]);

  const exportExcel = () =>
    exportToExcel('ספקים', [
      {
        name: 'ספקים',
        rows: filtered.map((s) => ({
          'מספר ספק': s.number,
          שם: s.name,
          'איש קשר': s.contact_name,
          טלפון: s.phone,
          'טלפון נוסף': s.phone2,
          אימייל: s.email,
          כתובת: s.address,
          'תנאי תשלום': s.payment_terms,
          'זמן אספקה (ימים)': s.lead_time_days,
          הערות: s.notes,
          פעיל: s.is_active ? 'כן' : 'לא',
        })),
      },
    ]);

  if (!suppliers) return <Spinner />;

  return (
    <div>
      <PageHeader title="ספקים">
        <Protect permId="export_excel">
          <Button variant="secondary" onClick={exportExcel} disabled={!filtered.length}>
            <FileSpreadsheet className="h-4 w-4" /> אקסל
          </Button>
        </Protect>
        <Protect permId="suppliers_manage">
          <Button onClick={() => setEditing('new')}>
            <Plus className="h-4 w-4" /> ספק חדש
          </Button>
        </Protect>
      </PageHeader>

      <div className="mb-3 flex flex-wrap items-center gap-3">
        <div className="relative">
          <Search className="absolute right-2.5 top-2.5 h-4 w-4 text-slate-400" />
          <input
            className="rounded-lg border border-slate-300 py-2 pl-3 pr-8 text-sm"
            placeholder="חיפוש לפי שם, מספר, טלפון..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <label className="flex items-center gap-2 text-sm text-slate-600">
          <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} />
          להציג גם לא פעילים
        </label>
      </div>

      {filtered.length === 0 ? (
        <EmptyState>{suppliers.length ? 'אין ספקים שמתאימים לחיפוש' : 'עדיין אין ספקים'}</EmptyState>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-600">
              <tr>
                <th className="px-3 py-2 text-right">מס׳</th>
                <th className="px-3 py-2 text-right">שם</th>
                <th className="px-3 py-2 text-right">איש קשר</th>
                <th className="px-3 py-2 text-right">טלפון</th>
                <th className="px-3 py-2 text-right">תנאי תשלום</th>
                <th className="px-3 py-2 text-right">זמן אספקה</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map((s) => (
                <tr
                  key={s.id}
                  onClick={() => setEditing(s)}
                  className={`cursor-pointer hover:bg-blue-50 ${s.is_active ? '' : 'text-slate-400'}`}
                >
                  <td className="px-3 py-2.5 text-slate-500">{s.number}</td>
                  <td className="px-3 py-2.5 font-medium">{s.name}</td>
                  <td className="px-3 py-2.5">{s.contact_name}</td>
                  <td className="px-3 py-2.5">{s.phone && <PhoneLink phone={s.phone} />}</td>
                  <td className="px-3 py-2.5">{s.payment_terms}</td>
                  <td className="px-3 py-2.5">{s.lead_time_days != null ? `${s.lead_time_days} ימים` : ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editing && (
        <SupplierModal
          key={editing === 'new' ? 'new' : editing.id}
          supplier={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={async () => {
            setEditing(null);
            await reload();
          }}
        />
      )}
    </div>
  );
}

type SuppliedBook = { book_id: string; supplier_sku: string | null; purchase_price: number | null; books: { name: string; code: string } | null };

function SupplierModal({
  supplier,
  onClose,
  onSaved,
}: {
  supplier: Supplier | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { hasPermission } = useAuth();
  const canEdit = hasPermission('suppliers_manage');
  const [form, setForm] = useState({
    number: supplier?.number?.toString() ?? '',
    name: supplier?.name ?? '',
    contact_name: supplier?.contact_name ?? '',
    phone: supplier?.phone ?? '',
    phone2: supplier?.phone2 ?? '',
    email: supplier?.email ?? '',
    address: supplier?.address ?? '',
    payment_terms: supplier?.payment_terms ?? '',
    lead_time_days: supplier?.lead_time_days?.toString() ?? '',
    notes: supplier?.notes ?? '',
    is_active: supplier?.is_active ?? true,
  });
  const [books, setBooks] = useState<SuppliedBook[]>([]);
  const [saving, setSaving] = useState(false);
  const set = (k: keyof typeof form, v: string | boolean) => setForm((f) => ({ ...f, [k]: v }));

  useEffect(() => {
    if (!supplier || !hasPermission('books_view_cost')) return;
    let cancelled = false;
    void supabase
      .from('book_suppliers')
      .select('book_id, supplier_sku, purchase_price, books(name, code)')
      .eq('supplier_id', supplier.id)
      .then(({ data }) => !cancelled && setBooks((data ?? []) as unknown as SuppliedBook[]));
    return () => {
      cancelled = true;
    };
  }, [supplier, hasPermission]);

  const save = async () => {
    if (!form.name.trim()) return toast.error('יש להזין שם ספק');
    setSaving(true);
    const payload = {
      name: form.name.trim(),
      contact_name: nullIfEmpty(form.contact_name),
      phone: nullIfEmpty(form.phone),
      phone2: nullIfEmpty(form.phone2),
      email: nullIfEmpty(form.email),
      address: nullIfEmpty(form.address),
      payment_terms: nullIfEmpty(form.payment_terms),
      lead_time_days: toNumber(form.lead_time_days),
      notes: nullIfEmpty(form.notes),
      is_active: form.is_active,
      ...(toNumber(form.number) ? { number: toNumber(form.number)! } : {}),
    };
    const { error } = supplier
      ? await supabase.from('suppliers').update(payload).eq('id', supplier.id)
      : await supabase.from('suppliers').insert(payload);
    setSaving(false);
    if (error) return toast.error(dbErrorMessage(error.message));
    toast.success('הספק נשמר');
    onSaved();
  };

  const remove = async () => {
    if (!supplier) return;
    if (!window.confirm(`למחוק את הספק "${supplier.name}"? המחירים שלו בקטלוג יימחקו. עדיף לסמן "לא פעיל".`)) return;
    const { error } = await supabase.from('suppliers').delete().eq('id', supplier.id);
    if (error) return toast.error(dbErrorMessage(error.message));
    toast.success('הספק נמחק');
    onSaved();
  };

  return (
    <Modal
      title={supplier ? `ספק: ${supplier.name}` : 'ספק חדש'}
      onClose={onClose}
      footer={
        canEdit ? (
          <>
            <Button variant="success" onClick={save} loading={saving}>שמירה</Button>
            <Button variant="secondary" onClick={onClose}>ביטול</Button>
            <div className="flex-1" />
            {supplier && <Button variant="danger" onClick={remove}>מחיקה</Button>}
          </>
        ) : undefined
      }
    >
      <fieldset disabled={!canEdit} className="grid gap-3 rounded-xl bg-white p-4 sm:grid-cols-3">
        <Field label="מספר ספק" hint={supplier ? undefined : 'ריק = מספר אוטומטי'}>
          <input className={inputClass} inputMode="numeric" value={form.number} onChange={(e) => set('number', e.target.value)} />
        </Field>
        <Field label="שם הספק" className="sm:col-span-2">
          <input className={inputClass} value={form.name} onChange={(e) => set('name', e.target.value)} />
        </Field>
        <Field label="איש קשר">
          <input className={inputClass} value={form.contact_name} onChange={(e) => set('contact_name', e.target.value)} />
        </Field>
        <Field label="טלפון">
          <input className={inputClass} dir="ltr" value={form.phone} onChange={(e) => set('phone', e.target.value)} />
        </Field>
        <Field label="טלפון נוסף">
          <input className={inputClass} dir="ltr" value={form.phone2} onChange={(e) => set('phone2', e.target.value)} />
        </Field>
        <Field label="אימייל">
          <input className={inputClass} dir="ltr" value={form.email} onChange={(e) => set('email', e.target.value)} />
        </Field>
        <Field label="כתובת" className="sm:col-span-2">
          <input className={inputClass} value={form.address} onChange={(e) => set('address', e.target.value)} />
        </Field>
        <Field label="תנאי תשלום" hint="למשל: שוטף + 30">
          <input className={inputClass} value={form.payment_terms} onChange={(e) => set('payment_terms', e.target.value)} />
        </Field>
        <Field label="זמן אספקה משוער (ימים)">
          <input className={inputClass} inputMode="numeric" value={form.lead_time_days} onChange={(e) => set('lead_time_days', e.target.value)} />
        </Field>
        <label className="flex items-center gap-2 self-end pb-2 text-sm">
          <input type="checkbox" checked={form.is_active} onChange={(e) => set('is_active', e.target.checked)} /> ספק פעיל
        </label>
        <Field label="הערות" className="sm:col-span-3">
          <textarea className={inputClass} rows={2} value={form.notes} onChange={(e) => set('notes', e.target.value)} />
        </Field>
      </fieldset>

      {supplier && (
        <Protect permId="books_view_cost" lockedFallback={null}>
          <div className="rounded-xl bg-white p-4">
            <h3 className="mb-2 font-semibold">ספרים שהספק מספק ({books.length})</h3>
            {books.length === 0 ? (
              <p className="text-sm text-slate-400">אין ספרים משויכים. משייכים ספק לספר מתוך כרטיס הספר בקטלוג.</p>
            ) : (
              <table className="w-full text-sm">
                <thead className="text-slate-500">
                  <tr>
                    <th className="py-1 text-right">קוד</th>
                    <th className="py-1 text-right">ספר</th>
                    <th className="py-1 text-right">מק״ט ספק</th>
                    <th className="py-1 text-right">מחיר קנייה</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {books.map((b) => (
                    <tr key={b.book_id}>
                      <td className="py-1.5 text-slate-500">{b.books?.code}</td>
                      <td className="py-1.5">{b.books?.name}</td>
                      <td className="py-1.5">{b.supplier_sku}</td>
                      <td className="py-1.5">{money(b.purchase_price)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </Protect>
      )}
    </Modal>
  );
}
