'use client';

import { useEffect, useMemo, useState } from 'react';
import { Plus, Search, UserRound } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/components/AuthContext';
import { Button, Field, inputClass } from '@/components/ui';
import { toast } from '@/components/Toaster';
import { dbErrorMessage } from '@/lib/dbErrors';
import { normalizeSearch, nullIfEmpty } from '@/lib/format';
import { isValidEmail } from '@/lib/email/templates';

export type PickedCustomer = {
  id: string;
  number: number;
  first_name: string;
  last_name: string;
  phone: string | null;
  phone_digits: string | null;
  parent_name: string | null;
  email: string | null;
};

export const PICKED_CUSTOMER_COLUMNS = 'id, number, first_name, last_name, phone, phone_digits, parent_name, email';
const COLUMNS = PICKED_CUSTOMER_COLUMNS;

/** חיפוש תלמיד (לקוח) לפי שם / שם ההורה / מספר / טלפון, או יצירת תלמיד חדש במקום */
export function CustomerPicker({ onPick }: { onPick: (c: PickedCustomer) => void }) {
  const { hasPermission } = useAuth();
  const [all, setAll] = useState<PickedCustomer[] | null>(null);
  const [query, setQuery] = useState('');
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ first_name: '', last_name: '', phone: '', parent_name: '', email: '' });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void supabase
      .from('customers')
      .select(COLUMNS)
      .order('last_name')
      .then(({ data }) => !cancelled && setAll(data ?? []));
    return () => {
      cancelled = true;
    };
  }, []);

  const results = useMemo(() => {
    const q = normalizeSearch(query);
    const d = query.replace(/\D/g, '');
    if (!q) return [];
    return (all ?? [])
      .filter(
        (c) =>
          normalizeSearch(`${c.first_name} ${c.last_name} ${c.last_name} ${c.first_name} ${c.parent_name ?? ''}`).includes(q) ||
          String(c.number) === q ||
          (d.length >= 3 && (c.phone_digits ?? '').includes(d))
      )
      .slice(0, 15);
  }, [all, query]);

  const startCreate = () => {
    // מה שהוקלד בחיפוש עובר לטופס: ספרות → טלפון, טקסט → שם
    const d = query.replace(/\D/g, '');
    const words = query.trim().split(/\s+/).filter((w) => !/\d/.test(w));
    setForm({
      first_name: words.length > 1 ? words.slice(1).join(' ') : '',
      last_name: words[0] ?? '',
      phone: d.length >= 7 ? query.trim() : '',
      parent_name: '',
      email: '',
    });
    setCreating(true);
  };

  const create = async () => {
    if (!form.first_name.trim() || !form.last_name.trim()) return toast.error('יש להזין שם פרטי ושם משפחה');
    if (form.email.trim() && !isValidEmail(form.email)) return toast.error('כתובת מייל לא תקינה');
    const d = form.phone.replace(/\D/g, '');
    const dup = d.length >= 7 ? all?.find((c) => (c.phone_digits ?? '').split(' ').includes(d)) : undefined;
    if (dup && !window.confirm(`הטלפון הזה כבר קיים אצל ${dup.first_name} ${dup.last_name} (מס׳ ${dup.number}). ליצור תלמיד חדש (למשל אח/אחות)?`)) return;
    setSaving(true);
    const { data, error } = await supabase
      .from('customers')
      .insert({
        first_name: form.first_name.trim(),
        last_name: form.last_name.trim(),
        phone: nullIfEmpty(form.phone),
        parent_name: nullIfEmpty(form.parent_name),
        email: nullIfEmpty(form.email),
      })
      .select(COLUMNS)
      .single();
    setSaving(false);
    if (error) return toast.error(dbErrorMessage(error.message));
    toast.success(`נוצר תלמיד (לקוח מס׳ ${data.number})`);
    onPick(data);
  };

  if (creating) {
    return (
      <div className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-5">
          <Field label="שם משפחה">
            <input className={inputClass} value={form.last_name} onChange={(e) => setForm({ ...form, last_name: e.target.value })} autoFocus />
          </Field>
          <Field label="שם פרטי (התלמיד)">
            <input className={inputClass} value={form.first_name} onChange={(e) => setForm({ ...form, first_name: e.target.value })} />
          </Field>
          <Field label="טלפון נייד">
            <input className={inputClass} dir="ltr" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          </Field>
          <Field label="שם ההורה (רשות)">
            <input className={inputClass} value={form.parent_name} onChange={(e) => setForm({ ...form, parent_name: e.target.value })} />
          </Field>
          <Field label="מייל" hint="מומלץ – לעדכון כשההזמנה מוכנה">
            <input className={inputClass} dir="ltr" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </Field>
        </div>
        <div className="flex gap-2">
          <Button variant="success" onClick={create} loading={saving}>
            <Plus className="h-4 w-4" /> יצירת תלמיד
          </Button>
          <Button variant="secondary" onClick={() => setCreating(false)}>חזרה לחיפוש</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <div className="relative min-w-64 flex-1">
          <Search className="absolute right-3 top-3 h-5 w-5 text-slate-400" />
          <input
            className="w-full rounded-lg border border-slate-300 py-2.5 pl-3 pr-10 text-base focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
            placeholder="שם התלמיד/ההורה, טלפון או מספר לקוח..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoFocus
          />
        </div>
        {hasPermission('customers_create') && (
          <Button variant="secondary" onClick={startCreate}>
            <Plus className="h-4 w-4" /> תלמיד חדש
          </Button>
        )}
      </div>
      {all === null && <p className="text-sm text-slate-400">טוען לקוחות...</p>}
      {query && all && results.length === 0 && <p className="text-sm text-slate-500">לא נמצא. אפשר ליצור תלמיד חדש.</p>}
      {results.length > 0 && (
        <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200 bg-white">
          {results.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                onClick={() => onPick(c)}
                className="flex w-full items-center gap-3 px-3 py-3 text-right hover:bg-blue-50"
              >
                <UserRound className="h-5 w-5 text-slate-400" />
                <span className="flex-1 font-medium">
                  {c.last_name} {c.first_name}
                  {c.parent_name && <span className="text-sm font-normal text-slate-500"> · הורה: {c.parent_name}</span>}
                </span>
                <span className="text-sm text-slate-500" dir="ltr">{c.phone}</span>
                <span className="text-xs text-slate-400">מס׳ {c.number}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** לתלמיד שנבחר אין מייל – תזכורת עדינה + הוספה במקום (לעדכון כשההזמנה מוכנה) */
export function CustomerEmailPrompt({ customer, onSaved }: { customer: PickedCustomer; onSaved: (email: string) => void }) {
  const { hasPermission } = useAuth();
  const [email, setEmail] = useState('');
  const [saving, setSaving] = useState(false);
  if (!hasPermission('customers_edit')) return null;
  const save = async () => {
    if (!isValidEmail(email)) return toast.error('כתובת מייל לא תקינה');
    setSaving(true);
    const { error } = await supabase.from('customers').update({ email: email.trim() }).eq('id', customer.id);
    setSaving(false);
    if (error) return toast.error(dbErrorMessage(error.message));
    toast.success('המייל נשמר בכרטיס');
    onSaved(email.trim());
  };
  return (
    <div className="mt-2 flex flex-wrap items-center gap-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
      <span>אין מייל בכרטיס – כדאי לבקש (לעדכון כשההזמנה מוכנה):</span>
      <input className={`${inputClass} w-64`} dir="ltr" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@example.com" />
      <Button variant="secondary" onClick={save} loading={saving} disabled={!email.trim()}>
        שמירה
      </Button>
    </div>
  );
}
