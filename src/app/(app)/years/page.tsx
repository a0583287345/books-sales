'use client';

import { useEffect, useState } from 'react';
import { CalendarPlus, Copy, Lock, LockOpen, Pencil, Star, Trash2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { PageGuard, Protect } from '@/components/Protect';
import { useYear, YEAR_STATUS_LABELS, type AcademicYear } from '@/components/YearContext';
import { Button, EmptyState, Field, inputClass, Modal, PageHeader } from '@/components/ui';
import DateInput from '@/components/DateInput';
import { toast } from '@/components/Toaster';
import { formatDate, nullIfEmpty } from '@/lib/format';
import { dbErrorMessage } from '@/lib/dbErrors';

export default function YearsPage() {
  return (
    <PageGuard permId="years_view">
      <YearsScreen />
    </PageGuard>
  );
}

function YearsScreen() {
  const { years, year: selected, setYearId, reloadYears } = useYear();
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [editing, setEditing] = useState<AcademicYear | 'new' | null>(null);
  const [copying, setCopying] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void supabase
      .from('institution_years')
      .select('year_id')
      .then(({ data }) => {
        if (cancelled) return;
        const c: Record<string, number> = {};
        for (const r of data ?? []) c[r.year_id] = (c[r.year_id] ?? 0) + 1;
        setCounts(c);
      });
    return () => {
      cancelled = true;
    };
  }, [years]);

  const setCurrent = async (y: AcademicYear) => {
    // קודם מורידים את הסימון מהשנה הקודמת (אינדקס ייחודי – רק שנה נוכחית אחת)
    const prev = years.find((x) => x.is_current);
    if (prev) {
      const { error } = await supabase.from('academic_years').update({ is_current: false }).eq('id', prev.id);
      if (error) return toast.error(dbErrorMessage(error.message));
    }
    const { error } = await supabase.from('academic_years').update({ is_current: true }).eq('id', y.id);
    if (error) return toast.error(dbErrorMessage(error.message));
    toast.success(`${y.name} סומנה כשנה הנוכחית`);
    await reloadYears();
  };

  const setStatus = async (y: AcademicYear, status: AcademicYear['status']) => {
    if (status === 'closed' && !window.confirm(`לסגור את ${y.name}? אחרי הסגירה לא יהיה אפשר לשנות את המוסדות, הכיתות והרשימות של השנה הזו.`)) return;
    const { error } = await supabase.from('academic_years').update({ status }).eq('id', y.id);
    if (error) return toast.error(dbErrorMessage(error.message));
    toast.success(status === 'closed' ? 'השנה נסגרה' : 'השנה נפתחה מחדש');
    await reloadYears();
  };

  const remove = async (y: AcademicYear) => {
    if (counts[y.id]) return toast.warning('יש מוסדות בשנה הזו – אי אפשר למחוק אותה. אפשר לסגור אותה.');
    if (!window.confirm(`למחוק את ${y.name}?`)) return;
    const { error } = await supabase.from('academic_years').delete().eq('id', y.id);
    if (error) return toast.error(dbErrorMessage(error.message));
    toast.success('השנה נמחקה');
    await reloadYears();
  };

  return (
    <div>
      <PageHeader title="שנות לימודים">
        <Protect permId="years_copy">
          <Button variant="secondary" onClick={() => setCopying(true)} disabled={years.length === 0}>
            <Copy className="h-4 w-4" /> פתיחת שנה על בסיס שנה קודמת
          </Button>
        </Protect>
        <Protect permId="years_manage">
          <Button onClick={() => setEditing('new')}>
            <CalendarPlus className="h-4 w-4" /> שנה חדשה (ריקה)
          </Button>
        </Protect>
      </PageHeader>

      {years.length === 0 ? (
        <EmptyState>עדיין אין שנות לימודים. פתחו את השנה הראשונה כדי להתחיל.</EmptyState>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-600">
              <tr>
                <th className="px-3 py-2 text-right">שנה</th>
                <th className="px-3 py-2 text-right">תאריכים</th>
                <th className="px-3 py-2 text-right">מצב</th>
                <th className="px-3 py-2 text-right">מוסדות</th>
                <th className="px-3 py-2 text-right">פעולות</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {years.map((y) => (
                <tr key={y.id} className={selected?.id === y.id ? 'bg-blue-50/50' : ''}>
                  <td className="px-3 py-2.5 font-medium">
                    <button type="button" onClick={() => setYearId(y.id)} className="hover:underline">
                      {y.name}
                    </button>
                    {y.is_current && (
                      <span className="mr-2 inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 text-xs text-amber-800">
                        <Star className="h-3 w-3" /> נוכחית
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-slate-600">
                    {y.start_date || y.end_date ? `${formatDate(y.start_date)} – ${formatDate(y.end_date)}` : '—'}
                  </td>
                  <td className="px-3 py-2.5">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs ${
                        y.status === 'closed'
                          ? 'bg-slate-200 text-slate-700'
                          : y.status === 'planning'
                            ? 'bg-blue-100 text-blue-700'
                            : 'bg-emerald-100 text-emerald-700'
                      }`}
                    >
                      {YEAR_STATUS_LABELS[y.status]}
                    </span>
                  </td>
                  <td className="px-3 py-2.5">{counts[y.id] ?? 0}</td>
                  <td className="px-3 py-2.5">
                    <Protect permId="years_manage">
                      <div className="flex flex-wrap gap-1">
                        <Button variant="ghost" onClick={() => setEditing(y)} title="עריכה">
                          <Pencil className="h-4 w-4" />
                        </Button>
                        {!y.is_current && (
                          <Button variant="ghost" onClick={() => setCurrent(y)} title="סימון כשנה נוכחית">
                            <Star className="h-4 w-4" />
                          </Button>
                        )}
                        {y.status === 'closed' ? (
                          <Button variant="ghost" onClick={() => setStatus(y, 'active')} title="פתיחה מחדש">
                            <LockOpen className="h-4 w-4" />
                          </Button>
                        ) : (
                          <Button variant="ghost" onClick={() => setStatus(y, 'closed')} title="סגירת השנה">
                            <Lock className="h-4 w-4" />
                          </Button>
                        )}
                        <Button variant="ghost" onClick={() => remove(y)} title="מחיקה">
                          <Trash2 className="h-4 w-4 text-red-500" />
                        </Button>
                      </div>
                    </Protect>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editing && (
        <YearFormModal
          key={editing === 'new' ? 'new' : editing.id}
          year={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={async (id) => {
            setEditing(null);
            await reloadYears();
            setYearId(id);
          }}
        />
      )}
      {copying && (
        <CopyYearModal
          years={years}
          defaultSourceId={selected?.id ?? years[0]?.id}
          onClose={() => setCopying(false)}
          onCopied={async (id) => {
            setCopying(false);
            await reloadYears();
            setYearId(id);
          }}
        />
      )}
    </div>
  );
}

function YearFormModal({
  year,
  onClose,
  onSaved,
}: {
  year: AcademicYear | null;
  onClose: () => void;
  onSaved: (id: string) => void;
}) {
  const [form, setForm] = useState({
    name: year?.name ?? '',
    start_date: year?.start_date ?? '',
    end_date: year?.end_date ?? '',
    status: year?.status ?? 'active',
    notes: year?.notes ?? '',
  });
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!form.name.trim()) return toast.error('יש להזין שם לשנה (למשל תשפ"ז)');
    setSaving(true);
    const payload = {
      name: form.name.trim(),
      start_date: nullIfEmpty(form.start_date),
      end_date: nullIfEmpty(form.end_date),
      status: form.status,
      notes: nullIfEmpty(form.notes),
    };
    const { data, error } = year
      ? await supabase.from('academic_years').update(payload).eq('id', year.id).select('id').single()
      : await supabase.from('academic_years').insert(payload).select('id').single();
    setSaving(false);
    if (error) return toast.error(dbErrorMessage(error.message));
    toast.success('השנה נשמרה');
    onSaved(data.id);
  };

  return (
    <Modal
      title={year ? `עריכת שנה: ${year.name}` : 'שנת לימודים חדשה'}
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
        <Field label="שם השנה" hint='למשל: תשפ"ז'>
          <input className={inputClass} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </Field>
        <Field label="מצב">
          <select
            className={inputClass}
            value={form.status}
            onChange={(e) => setForm({ ...form, status: e.target.value as AcademicYear['status'] })}
          >
            {(Object.keys(YEAR_STATUS_LABELS) as AcademicYear['status'][]).map((s) => (
              <option key={s} value={s}>{YEAR_STATUS_LABELS[s]}</option>
            ))}
          </select>
        </Field>
        <Field label="תאריך התחלה">
          <DateInput value={form.start_date} onChange={(v) => setForm({ ...form, start_date: v })} />
        </Field>
        <Field label="תאריך סיום">
          <DateInput value={form.end_date} onChange={(v) => setForm({ ...form, end_date: v })} />
        </Field>
        <Field label="הערות" className="sm:col-span-2">
          <textarea className={inputClass} rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
        </Field>
      </div>
    </Modal>
  );
}

type InstOption = { institution_id: string; name: string; number: number };

function CopyYearModal({
  years,
  defaultSourceId,
  onClose,
  onCopied,
}: {
  years: AcademicYear[];
  defaultSourceId?: string;
  onClose: () => void;
  onCopied: (id: string) => void;
}) {
  const [sourceId, setSourceId] = useState(defaultSourceId ?? '');
  const [name, setName] = useState('');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [refreshPrices, setRefreshPrices] = useState(true);
  const [institutions, setInstitutions] = useState<InstOption[]>([]);
  const [excluded, setExcluded] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!sourceId) return;
    let cancelled = false;
    void supabase
      .from('institution_years')
      .select('institution_id, institutions(name, number)')
      .eq('year_id', sourceId)
      .then(({ data }) => {
        if (cancelled) return;
        const list = (data ?? []).map((r) => {
          const inst = r.institutions as unknown as { name: string; number: number } | null;
          return { institution_id: r.institution_id, name: inst?.name ?? '', number: inst?.number ?? 0 };
        });
        setInstitutions(list.sort((a, b) => a.name.localeCompare(b.name, 'he')));
        setExcluded(new Set());
      });
    return () => {
      cancelled = true;
    };
  }, [sourceId]);

  const toggle = (id: string) =>
    setExcluded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const run = async () => {
    if (!sourceId) return toast.error('יש לבחור שנת מקור');
    if (!name.trim()) return toast.error('יש להזין שם לשנה החדשה');
    setSaving(true);
    const chosen = institutions.filter((i) => !excluded.has(i.institution_id)).map((i) => i.institution_id);
    const { data, error } = await supabase.rpc('copy_year', {
      p_source_year: sourceId,
      p_name: name.trim(),
      p_start: start || undefined,
      p_end: end || undefined,
      p_refresh_prices: refreshPrices,
      p_institution_ids: excluded.size ? chosen : undefined,
    });
    setSaving(false);
    if (error) return toast.error(dbErrorMessage(error.message));
    toast.success(`השנה ${name.trim()} נפתחה עם ${chosen.length} מוסדות`);
    onCopied(data);
  };

  return (
    <Modal
      title="פתיחת שנה חדשה על בסיס שנה קודמת"
      onClose={onClose}
      footer={
        <>
          <Button variant="success" onClick={run} loading={saving}>
            <Copy className="h-4 w-4" /> פתיחת השנה
          </Button>
          <Button variant="secondary" onClick={onClose}>ביטול</Button>
        </>
      }
    >
      <p className="rounded-lg bg-blue-50 px-3 py-2 text-sm text-blue-800">
        יועתקו המוסדות, הכיתות ורשימות הספרים. השנה הקודמת לא משתנה. התאריכים יוזזו לפי ההפרש בין תחילת השנים
        (אפשר לעדכן אחר כך), והשנה החדשה תיפתח במצב &quot;בהכנה&quot;.
      </p>
      <div className="grid gap-3 rounded-xl bg-white p-4 sm:grid-cols-2">
        <Field label="שנת מקור">
          <select className={inputClass} value={sourceId} onChange={(e) => setSourceId(e.target.value)}>
            {years.map((y) => (
              <option key={y.id} value={y.id}>{y.name}</option>
            ))}
          </select>
        </Field>
        <Field label="שם השנה החדשה" hint='למשל: תשפ"ח'>
          <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="תאריך התחלה">
          <DateInput value={start} onChange={setStart} />
        </Field>
        <Field label="תאריך סיום">
          <DateInput value={end} onChange={setEnd} />
        </Field>
        <label className="flex items-center gap-2 text-sm sm:col-span-2">
          <input type="checkbox" checked={refreshPrices} onChange={(e) => setRefreshPrices(e.target.checked)} />
          לעדכן את מחירי המכירה לפי המחיר הנוכחי בקטלוג (אחרת – המחירים מהשנה הקודמת)
        </label>
      </div>

      <div className="rounded-xl bg-white p-4">
        <div className="mb-2 flex items-center gap-2">
          <h3 className="flex-1 font-semibold">
            מוסדות להעתקה ({institutions.length - excluded.size} מתוך {institutions.length})
          </h3>
          <Button variant="ghost" onClick={() => setExcluded(new Set())}>הכול</Button>
          <Button variant="ghost" onClick={() => setExcluded(new Set(institutions.map((i) => i.institution_id)))}>
            אף אחד
          </Button>
        </div>
        {institutions.length === 0 ? (
          <p className="text-sm text-slate-400">אין מוסדות בשנת המקור – תיפתח שנה ריקה.</p>
        ) : (
          <div className="grid max-h-64 gap-1 overflow-y-auto sm:grid-cols-2">
            {institutions.map((i) => (
              <label key={i.institution_id} className="flex items-center gap-2 rounded px-2 py-1 text-sm hover:bg-slate-50">
                <input type="checkbox" checked={!excluded.has(i.institution_id)} onChange={() => toggle(i.institution_id)} />
                <span className="text-slate-400">{i.number}</span> {i.name}
              </label>
            ))}
          </div>
        )}
      </div>
    </Modal>
  );
}
