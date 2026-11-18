'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { FileSpreadsheet, Plus, Search, ShieldAlert } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/components/AuthContext';
import { LockedText, PageGuard, Protect } from '@/components/Protect';
import PhoneLink from '@/components/PhoneLink';
import { CustomerChildren, CustomerOrders } from '@/components/customers/CustomerHistory';
import { Button, EmptyState, Field, inputClass, Modal, PageHeader, Spinner } from '@/components/ui';
import { toast } from '@/components/Toaster';
import { dbErrorMessage } from '@/lib/dbErrors';
import { exportToExcel } from '@/lib/excel';
import { ImportButton, ImportExcelModal } from '@/components/ImportExcelModal';
import { customersImporter } from '@/lib/importers';
import { normalizeSearch, nullIfEmpty, toNumber } from '@/lib/format';

export default function CustomersPage() {
  return (
    <PageGuard permId="customers_view">
      <CustomersScreen />
    </PageGuard>
  );
}

type Customer = {
  id: string;
  number: number;
  first_name: string;
  last_name: string;
  phone: string | null;
  phone2: string | null;
  email: string | null;
  notes: string | null;
  phone_digits: string | null;
};
const CUSTOMER_COLUMNS = 'id, number, first_name, last_name, phone, phone2, email, notes, phone_digits';
const SHOW_LIMIT = 300;

async function fetchCustomers(): Promise<Customer[]> {
  const { data, error } = await supabase.from('customers').select(CUSTOMER_COLUMNS).order('last_name').order('first_name');
  if (error) toast.error(dbErrorMessage(error.message));
  return data ?? [];
}

const digits = (s: string) => s.replace(/\D/g, '');

function CustomersScreen() {
  const [customers, setCustomers] = useState<Customer[] | null>(null);
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<Customer | 'new' | null>(null);
  const [importing, setImporting] = useState(false);

  const reload = useCallback(async () => setCustomers(await fetchCustomers()), []);
  useEffect(() => {
    let cancelled = false;
    void fetchCustomers().then((c) => !cancelled && setCustomers(c));
    return () => {
      cancelled = true;
    };
  }, []);

  const filtered = useMemo(() => {
    const q = normalizeSearch(search);
    const qDigits = digits(search);
    if (!q) return customers ?? [];
    return (customers ?? []).filter(
      (c) =>
        normalizeSearch(`${c.first_name} ${c.last_name} ${c.last_name} ${c.first_name}`).includes(q) ||
        String(c.number) === q ||
        (qDigits.length >= 3 && (c.phone_digits ?? '').includes(qDigits))
    );
  }, [customers, search]);

  const exportExcel = () =>
    exportToExcel('לקוחות', [
      {
        name: 'לקוחות',
        rows: filtered.map((c) => ({
          'מספר לקוח': c.number,
          'שם משפחה': c.last_name,
          'שם פרטי': c.first_name,
          טלפון: c.phone,
          'טלפון נוסף': c.phone2,
          אימייל: c.email,
          הערות: c.notes,
        })),
      },
    ]);

  if (!customers) return <Spinner />;

  return (
    <div>
      <PageHeader title="לקוחות">
        <Protect permId="export_excel">
          <Button variant="secondary" onClick={exportExcel} disabled={!filtered.length}>
            <FileSpreadsheet className="h-4 w-4" /> אקסל
          </Button>
        </Protect>
        <ImportButton editPerm="customers_create" onClick={() => setImporting(true)} />
        <Protect permId="customers_create">
          <Button onClick={() => setEditing('new')}>
            <Plus className="h-4 w-4" /> לקוח חדש
          </Button>
        </Protect>
      </PageHeader>

      <div className="mb-3 flex flex-wrap items-center gap-3">
        <div className="relative w-full max-w-sm">
          <Search className="absolute right-2.5 top-2.5 h-4 w-4 text-slate-400" />
          <input
            className="w-full rounded-lg border border-slate-300 py-2 pl-3 pr-8 text-sm"
            placeholder="חיפוש לפי שם, מספר לקוח או טלפון..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            autoFocus
          />
        </div>
        <span className="text-xs text-slate-400">
          {filtered.length} לקוחות{filtered.length > SHOW_LIMIT ? ` (מוצגים ${SHOW_LIMIT} – צמצמו בחיפוש)` : ''}
        </span>
      </div>

      {filtered.length === 0 ? (
        <EmptyState>{customers.length ? 'לא נמצא לקוח מתאים' : 'עדיין אין לקוחות'}</EmptyState>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-600">
              <tr>
                <th className="px-3 py-2 text-right">מס׳ לקוח</th>
                <th className="px-3 py-2 text-right">שם</th>
                <th className="px-3 py-2 text-right">טלפון</th>
                <th className="px-3 py-2 text-right">טלפון נוסף</th>
                <th className="px-3 py-2 text-right">הערות</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.slice(0, SHOW_LIMIT).map((c) => (
                <tr key={c.id} className="cursor-pointer hover:bg-blue-50" onClick={() => setEditing(c)}>
                  <td className="px-3 py-2.5 text-slate-500">{c.number}</td>
                  <td className="px-3 py-2.5 font-medium">
                    {c.last_name} {c.first_name}
                  </td>
                  <td className="px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
                    <Protect permId="customers_view_contact">{c.phone && <PhoneLink phone={c.phone} />}</Protect>
                  </td>
                  <td className="px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
                    <Protect permId="customers_view_contact">{c.phone2 && <PhoneLink phone={c.phone2} />}</Protect>
                  </td>
                  <td className="max-w-xs truncate px-3 py-2.5 text-slate-500">{c.notes}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {importing && (
        <ImportExcelModal
          title="ייבוא לקוחות מאקסל"
          templateName="תבנית ייבוא לקוחות"
          {...customersImporter(customers)}
          onClose={() => setImporting(false)}
          onDone={reload}
        />
      )}
      {editing && (
        <CustomerModal
          key={editing === 'new' ? 'new' : editing.id}
          customer={editing === 'new' ? null : editing}
          all={customers}
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

type PrivateInfo = { id_number: string; address: string; city: string };

function CustomerModal({
  customer,
  all,
  onClose,
  onSaved,
}: {
  customer: Customer | null;
  all: Customer[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const { hasPermission } = useAuth();
  const canEdit = customer ? hasPermission('customers_edit') : hasPermission('customers_create');
  const canSeeContact = hasPermission('customers_view_contact');
  const canSeePrivate = hasPermission('customers_view_private');
  const [form, setForm] = useState({
    number: customer?.number?.toString() ?? '',
    first_name: customer?.first_name ?? '',
    last_name: customer?.last_name ?? '',
    phone: customer?.phone ?? '',
    phone2: customer?.phone2 ?? '',
    email: customer?.email ?? '',
    notes: customer?.notes ?? '',
  });
  const [priv, setPriv] = useState<PrivateInfo>({ id_number: '', address: '', city: '' });
  const [privLoaded, setPrivLoaded] = useState(!customer);
  const [saving, setSaving] = useState(false);
  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }));

  useEffect(() => {
    if (!customer || !canSeePrivate) return;
    let cancelled = false;
    void supabase
      .from('customer_private')
      .select('id_number, address, city')
      .eq('customer_id', customer.id)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled) return;
        setPriv({ id_number: data?.id_number ?? '', address: data?.address ?? '', city: data?.city ?? '' });
        setPrivLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [customer, canSeePrivate]);

  // אזהרת כפילות: לקוח אחר עם אותו טלפון
  const duplicates = useMemo(() => {
    const ds = [digits(form.phone), digits(form.phone2)].filter((d) => d.length >= 7);
    if (!ds.length) return [];
    return all.filter((c) => c.id !== customer?.id && ds.some((d) => (c.phone_digits ?? '').split(' ').includes(d)));
  }, [form.phone, form.phone2, all, customer?.id]);

  const save = async () => {
    if (!form.first_name.trim() || !form.last_name.trim()) return toast.error('יש להזין שם פרטי ושם משפחה');
    if (!customer && duplicates.length && !window.confirm(`כבר קיים לקוח עם הטלפון הזה (${duplicates[0].first_name} ${duplicates[0].last_name}, מס׳ ${duplicates[0].number}). ליצור בכל זאת לקוח חדש?`)) return;
    setSaving(true);
    const payload = {
      first_name: form.first_name.trim(),
      last_name: form.last_name.trim(),
      email: nullIfEmpty(form.email),
      notes: nullIfEmpty(form.notes),
      // בלי הרשאת צפייה בטלפונים – לא נוגעים בהם בעריכה
      ...(canSeeContact || !customer ? { phone: nullIfEmpty(form.phone), phone2: nullIfEmpty(form.phone2) } : {}),
      ...(toNumber(form.number) ? { number: toNumber(form.number)! } : {}),
    };
    const { data, error } = customer
      ? await supabase.from('customers').update(payload).eq('id', customer.id).select('id').single()
      : await supabase.from('customers').insert(payload).select('id').single();
    if (error) {
      setSaving(false);
      return toast.error(dbErrorMessage(error.message));
    }
    if (canSeePrivate && privLoaded) {
      const p = { id_number: nullIfEmpty(priv.id_number), address: nullIfEmpty(priv.address), city: nullIfEmpty(priv.city) };
      const { error: pErr } = await supabase.from('customer_private').upsert({ customer_id: data.id, ...p });
      if (pErr) toast.error(`הפרטים הרגישים לא נשמרו: ${dbErrorMessage(pErr.message)}`);
    }
    setSaving(false);
    toast.success('הלקוח נשמר');
    onSaved();
  };

  const remove = async () => {
    if (!customer) return;
    if (!window.confirm(`למחוק את הלקוח ${customer.first_name} ${customer.last_name}?`)) return;
    const { error } = await supabase.from('customers').delete().eq('id', customer.id);
    if (error) return toast.error(dbErrorMessage(error.message));
    toast.success('הלקוח נמחק');
    onSaved();
  };

  return (
    <Modal
      title={customer ? `לקוח ${customer.number}: ${customer.first_name} ${customer.last_name}` : 'לקוח חדש'}
      onClose={onClose}
      footer={
        canEdit ? (
          <>
            <Button variant="success" onClick={save} loading={saving}>שמירה</Button>
            <Button variant="secondary" onClick={onClose}>ביטול</Button>
            <div className="flex-1" />
            {customer && (
              <Protect permId="customers_delete">
                <Button variant="danger" onClick={remove}>מחיקה</Button>
              </Protect>
            )}
          </>
        ) : undefined
      }
    >
      <fieldset disabled={!canEdit} className="grid gap-3 rounded-xl bg-white p-4 sm:grid-cols-3">
        <Field label="מספר לקוח" hint={customer ? undefined : 'ריק = מספר אוטומטי'}>
          <input className={inputClass} inputMode="numeric" value={form.number} onChange={(e) => set('number', e.target.value)} />
        </Field>
        <Field label="שם פרטי">
          <input className={inputClass} value={form.first_name} onChange={(e) => set('first_name', e.target.value)} />
        </Field>
        <Field label="שם משפחה">
          <input className={inputClass} value={form.last_name} onChange={(e) => set('last_name', e.target.value)} />
        </Field>
        {canSeeContact || !customer ? (
          <>
            <Field label="טלפון נייד">
              <input className={inputClass} dir="ltr" value={form.phone} onChange={(e) => set('phone', e.target.value)} />
            </Field>
            <Field label="טלפון נוסף">
              <input className={inputClass} dir="ltr" value={form.phone2} onChange={(e) => set('phone2', e.target.value)} />
            </Field>
          </>
        ) : (
          <div className="flex items-end pb-2 sm:col-span-2">
            <LockedText text="אין הרשאה לצפייה בטלפונים" />
          </div>
        )}
        <Field label="אימייל">
          <input className={inputClass} dir="ltr" value={form.email} onChange={(e) => set('email', e.target.value)} />
        </Field>
        {duplicates.length > 0 && (
          <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800 sm:col-span-3">
            שימו לב: הטלפון הזה כבר קיים אצל{' '}
            {duplicates.map((d) => `${d.first_name} ${d.last_name} (מס׳ ${d.number})`).join(', ')}. כדי לא ליצור כרטיס כפול –
            אפשר להשתמש בלקוח הקיים.
          </p>
        )}
        <Field label="הערות" className="sm:col-span-3">
          <textarea className={inputClass} rows={2} value={form.notes} onChange={(e) => set('notes', e.target.value)} />
        </Field>
      </fieldset>

      <Protect permId="customers_view_private" lockedFallback={null}>
        <fieldset disabled={!canEdit} className="rounded-xl border border-amber-200 bg-white p-4">
          <h3 className="mb-1 flex items-center gap-2 font-semibold">
            <ShieldAlert className="h-4 w-4 text-amber-600" /> פרטים רגישים
          </h3>
          <p className="mb-3 text-xs text-slate-500">
            למלא רק כשיש צורך (למשל כתובת למשלוח). תעודת זהות לבדה אינה אמצעי אימות מספיק להזמנה טלפונית.
          </p>
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="תעודת זהות">
              <input className={inputClass} dir="ltr" inputMode="numeric" value={priv.id_number} onChange={(e) => setPriv({ ...priv, id_number: e.target.value })} />
            </Field>
            <Field label="כתובת למשלוח">
              <input className={inputClass} value={priv.address} onChange={(e) => setPriv({ ...priv, address: e.target.value })} />
            </Field>
            <Field label="עיר">
              <input className={inputClass} value={priv.city} onChange={(e) => setPriv({ ...priv, city: e.target.value })} />
            </Field>
          </div>
        </fieldset>
      </Protect>

      {customer && <CustomerChildren customerId={customer.id} />}
      {customer && <CustomerOrders customerId={customer.id} />}
    </Modal>
  );
}
