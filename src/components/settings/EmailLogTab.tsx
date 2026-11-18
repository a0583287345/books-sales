'use client';

import { useEffect, useMemo, useState } from 'react';
import { Ban, RefreshCw, RotateCcw } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { callServerApi } from '@/lib/apiClient';
import { useAuth } from '@/components/AuthContext';
import { FilterStatus, matches, MultiSelect, SearchBox } from '@/components/filters';
import { Button, EmptyState, Modal, Spinner } from '@/components/ui';
import { toast } from '@/components/Toaster';
import { normalizeSearch } from '@/lib/format';
import { KIND_LABELS, STATUS_LABELS, type EmailKind } from '@/lib/email/templates';

// =====================================================================
// הגדרות → יומן מיילים: כל מה שנשלח / ממתין / נכשל, עם שליחה חוזרת וביטול
// =====================================================================

export type OutboxRow = {
  id: string;
  created_at: string;
  sent_at: string | null;
  kind: string;
  to_email: string;
  to_name: string | null;
  subject: string;
  body: string;
  status: string;
  error: string | null;
  created_by_name: string | null;
};

export const OUTBOX_COLUMNS = 'id, created_at, sent_at, kind, to_email, to_name, subject, body, status, error, created_by_name';

const STATUS_STYLES: Record<string, string> = {
  queued: 'bg-amber-100 text-amber-800',
  sent: 'bg-emerald-100 text-emerald-800',
  failed: 'bg-red-100 text-red-700',
  cancelled: 'bg-slate-100 text-slate-500',
};

export function EmailStatusBadge({ status }: { status: string }) {
  return <span className={`rounded-full px-2 py-0.5 text-xs ${STATUS_STYLES[status] ?? ''}`}>{STATUS_LABELS[status] ?? status}</span>;
}

const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleString('he-IL', { dateStyle: 'short', timeStyle: 'short' }) : '');

export function EmailLogTab() {
  const [rows, setRows] = useState<OutboxRow[] | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [search, setSearch] = useState('');
  const [kinds, setKinds] = useState<string[]>([]);
  const [statuses, setStatuses] = useState<string[]>([]);
  const [open, setOpen] = useState<OutboxRow | null>(null);

  useEffect(() => {
    let cancelled = false;
    void supabase
      .from('email_outbox')
      .select(OUTBOX_COLUMNS)
      .order('created_at', { ascending: false })
      .limit(500)
      .then(({ data }) => !cancelled && setRows((data ?? []) as OutboxRow[]));
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);
  const reload = () => setReloadKey((k) => k + 1);

  const filtered = useMemo(() => {
    const q = normalizeSearch(search);
    return (rows ?? []).filter(
      (r) =>
        matches(kinds, r.kind) &&
        matches(statuses, r.status) &&
        (!q || normalizeSearch(`${r.to_email} ${r.to_name ?? ''} ${r.subject}`).includes(q))
    );
  }, [rows, search, kinds, statuses]);

  if (!rows) return <Spinner />;
  const active = !!search || kinds.length + statuses.length > 0;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <SearchBox value={search} onChange={setSearch} placeholder="נמען, כתובת, נושא..." />
        <MultiSelect
          label="סוג"
          options={(Object.keys(KIND_LABELS) as EmailKind[]).map((k) => ({ value: k, label: KIND_LABELS[k] }))}
          value={kinds}
          onChange={setKinds}
        />
        <MultiSelect label="מצב" options={Object.entries(STATUS_LABELS).map(([value, label]) => ({ value, label }))} value={statuses} onChange={setStatuses} />
        <Button variant="ghost" onClick={reload}>
          <RefreshCw className="h-4 w-4" /> רענון
        </Button>
      </div>
      <FilterStatus
        active={active}
        shown={filtered.length}
        total={rows.length}
        noun="מיילים"
        onClear={() => {
          setSearch('');
          setKinds([]);
          setStatuses([]);
        }}
      >
        {rows.length >= 500 && <span>· מוצגים 500 האחרונים</span>}
      </FilterStatus>
      {filtered.length === 0 ? (
        <EmptyState>{rows.length ? 'אין מיילים שמתאימים לסינון' : 'עדיין לא נשלחו מיילים'}</EmptyState>
      ) : (
        <EmailTable rows={filtered} onOpen={setOpen} />
      )}
      {open && <EmailViewModal row={open} onClose={() => setOpen(null)} onChanged={() => { setOpen(null); reload(); }} />}
    </div>
  );
}

export function EmailTable({ rows, onOpen, compact }: { rows: OutboxRow[]; onOpen: (r: OutboxRow) => void; compact?: boolean }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
      <table className="w-full text-sm">
        <thead className="bg-slate-50 text-slate-600">
          <tr>
            <th className="px-3 py-2 text-right">תאריך</th>
            {!compact && <th className="px-3 py-2 text-right">נמען</th>}
            <th className="px-3 py-2 text-right">סוג</th>
            <th className="px-3 py-2 text-right">נושא</th>
            <th className="px-3 py-2 text-right">מצב</th>
            {!compact && <th className="px-3 py-2 text-right">ע״י</th>}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((r) => (
            <tr key={r.id} className="cursor-pointer hover:bg-blue-50" onClick={() => onOpen(r)}>
              <td className="whitespace-nowrap px-3 py-2 text-slate-500">{fmt(r.sent_at ?? r.created_at)}</td>
              {!compact && (
                <td className="px-3 py-2">
                  <div>{r.to_name}</div>
                  <div className="text-xs text-slate-500" dir="ltr" style={{ textAlign: 'right' }}>
                    {r.to_email}
                  </div>
                </td>
              )}
              <td className="px-3 py-2 text-slate-600">{KIND_LABELS[r.kind as EmailKind] ?? r.kind}</td>
              <td className="px-3 py-2">{r.subject}</td>
              <td className="px-3 py-2">
                <EmailStatusBadge status={r.status} />
                {r.error && <div className="mt-0.5 max-w-64 truncate text-xs text-red-600" title={r.error}>{r.error}</div>}
              </td>
              {!compact && <td className="px-3 py-2 text-slate-500">{r.created_by_name}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function EmailViewModal({ row, onClose, onChanged }: { row: OutboxRow; onClose: () => void; onChanged: () => void }) {
  const { hasPermission } = useAuth();
  const [busy, setBusy] = useState(false);
  const canAct = hasPermission('emails_send') || hasPermission('emails_suppliers') || hasPermission('email_settings');
  const act = async (action: 'retry' | 'cancel') => {
    setBusy(true);
    try {
      const r = await callServerApi<{ sent?: number; failed?: number; errors?: string[]; problem?: string | null }>('/api/email', { action, id: row.id });
      if (action === 'cancel') toast.success('המייל בוטל');
      else if (r.sent) toast.success('המייל נשלח');
      else toast.error(r.problem || r.errors?.[0] || 'המייל ממתין בתור');
      onChanged();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      title={row.subject}
      onClose={onClose}
      size="md"
      footer={
        <>
          {canAct && row.status === 'failed' && (
            <Button onClick={() => act('retry')} loading={busy}>
              <RotateCcw className="h-4 w-4" /> שליחה חוזרת
            </Button>
          )}
          {canAct && row.status === 'queued' && (
            <Button variant="danger" onClick={() => act('cancel')} loading={busy}>
              <Ban className="h-4 w-4" /> ביטול המייל
            </Button>
          )}
          <Button variant="secondary" onClick={onClose}>
            סגירה
          </Button>
        </>
      }
    >
      <div className="space-y-2 rounded-xl bg-white p-4 text-sm">
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-slate-600">
          <span>
            אל: {row.to_name} <span dir="ltr">&lt;{row.to_email}&gt;</span>
          </span>
          <span>{KIND_LABELS[row.kind as EmailKind] ?? row.kind}</span>
          <EmailStatusBadge status={row.status} />
          <span>{row.sent_at ? `נשלח ${fmt(row.sent_at)}` : `נוצר ${fmt(row.created_at)}`}</span>
          {row.created_by_name && <span>ע״י {row.created_by_name}</span>}
        </div>
        {row.error && <p className="rounded-lg bg-red-50 px-3 py-2 text-red-700">{row.error}</p>}
        <div className="whitespace-pre-wrap rounded-lg border border-slate-200 bg-slate-50 p-3 leading-relaxed">{row.body}</div>
      </div>
    </Modal>
  );
}
