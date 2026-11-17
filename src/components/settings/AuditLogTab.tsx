'use client';

import { useEffect, useMemo, useState } from 'react';
import { Loader2, Search } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { toast } from '@/components/Toaster';
import { dbErrorMessage } from '@/lib/dbErrors';

type LogRow = {
  id: number;
  created_at: string;
  user_name: string | null;
  action: string;
  entity: string | null;
  description: string | null;
};

const ACTION_LABELS: Record<string, string> = {
  login: 'התחברות',
  create: 'יצירה',
  update: 'עדכון',
  delete: 'מחיקה',
  copy: 'העתקה',
  cancel: 'ביטול',
  reset_password: 'איפוס סיסמה',
  activate: 'הפעלה',
  deactivate: 'השבתה',
};

const LIMIT = 500;

function formatDateTime(iso: string) {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function AuditLogTab() {
  const [rows, setRows] = useState<LogRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [user, setUser] = useState('');
  const [action, setAction] = useState('');

  useEffect(() => {
    let cancelled = false;
    void supabase
      .from('audit_logs')
      .select('id, created_at, user_name, action, entity, description')
      .order('created_at', { ascending: false })
      .limit(LIMIT)
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) toast.error(dbErrorMessage(error.message));
        setRows(data ?? []);
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const users = useMemo(() => [...new Set(rows.map((r) => r.user_name ?? ''))].filter(Boolean).sort(), [rows]);
  const actions = useMemo(() => [...new Set(rows.map((r) => r.action))].sort(), [rows]);

  const filtered = useMemo(() => {
    const q = search.trim();
    return rows.filter(
      (r) =>
        (!user || r.user_name === user) &&
        (!action || r.action === action) &&
        (!q || `${r.description ?? ''} ${r.entity ?? ''}`.includes(q))
    );
  }, [rows, search, user, action]);

  if (loading) return <Loader2 className="mx-auto mt-10 w-6 h-6 animate-spin text-slate-400" />;

  const select = 'rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm';

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <div className="relative">
          <Search className="absolute right-2.5 top-2.5 w-4 h-4 text-slate-400" />
          <input
            placeholder="חיפוש בתיאור..."
            className="rounded-lg border border-slate-300 py-2 pl-3 pr-8 text-sm"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <select className={select} value={user} onChange={(e) => setUser(e.target.value)}>
          <option value="">כל המשתמשים</option>
          {users.map((u) => (
            <option key={u} value={u}>{u}</option>
          ))}
        </select>
        <select className={select} value={action} onChange={(e) => setAction(e.target.value)}>
          <option value="">כל הפעולות</option>
          {actions.map((a) => (
            <option key={a} value={a}>{ACTION_LABELS[a] ?? a}</option>
          ))}
        </select>
        <span className="self-center text-xs text-slate-400">
          {filtered.length} רשומות{rows.length === LIMIT ? ` (מוצגות ${LIMIT} האחרונות)` : ''}
        </span>
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-600">
            <tr>
              <th className="px-3 py-2 text-right whitespace-nowrap">תאריך ושעה</th>
              <th className="px-3 py-2 text-right">משתמש</th>
              <th className="px-3 py-2 text-right">פעולה</th>
              <th className="px-3 py-2 text-right">תיאור</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filtered.map((r) => (
              <tr key={r.id}>
                <td className="px-3 py-2 whitespace-nowrap text-slate-500" dir="ltr" style={{ textAlign: 'right' }}>
                  {formatDateTime(r.created_at)}
                </td>
                <td className="px-3 py-2">{r.user_name ?? 'מערכת'}</td>
                <td className="px-3 py-2">{ACTION_LABELS[r.action] ?? r.action}</td>
                <td className="px-3 py-2">{r.description}</td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={4} className="px-3 py-8 text-center text-slate-400">אין רשומות</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
