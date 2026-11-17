'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Copy, Crown, Loader2, Plus, Save, Trash2, Users } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/components/AuthContext';
import { toast } from '@/components/Toaster';
import { logActivity } from '@/lib/logger';
import { normalizeStates, type PermissionStateMap } from '@/lib/permissions';
import { PermissionEditor } from './PermissionEditor';
import { friendlyDbError } from './dbErrors';

export type RoleRow = {
  id: string;
  name: string;
  description: string | null;
  is_super: boolean;
  permissions: PermissionStateMap;
};

export async function loadRoles(): Promise<RoleRow[]> {
  const { data, error } = await supabase
    .from('roles')
    .select('id, name, description, is_super, permissions')
    .order('is_super', { ascending: false })
    .order('name');
  if (error) {
    toast.error(friendlyDbError(error.message));
    return [];
  }
  return (data ?? []).map((r) => ({ ...r, permissions: normalizeStates(r.permissions) }));
}

/** תפקידים + כמה משתמשים בכל תפקיד */
async function fetchRolesData() {
  const list = await loadRoles();
  const { data } = await supabase.from('user_profiles').select('role_id');
  const counts: Record<string, number> = {};
  for (const u of data ?? []) counts[u.role_id] = (counts[u.role_id] ?? 0) + 1;
  return { list, counts };
}

type Draft ={ id: string | null; name: string; description: string; permissions: PermissionStateMap };

export function RolesTab() {
  const { access, hasPermission, refresh } = useAuth();
  const [roles, setRoles] = useState<RoleRow[]>([]);
  const [userCounts, setUserCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);

  const apply = useCallback(({ list, counts }: Awaited<ReturnType<typeof fetchRolesData>>) => {
    setRoles(list);
    setUserCounts(counts);
    setLoading(false);
    return list;
  }, []);

  const reload = useCallback(async () => apply(await fetchRolesData()), [apply]);

  useEffect(() => {
    let cancelled = false;
    void fetchRolesData().then((d) => {
      if (!cancelled) apply(d);
    });
    return () => {
      cancelled = true;
    };
  }, [apply]);

  const selected = useMemo(() => roles.find((r) => r.id === selectedId) ?? null, [roles, selectedId]);
  const isOwnRole = !!selected && selected.id === access?.roleId && !access?.isSuper;

  const select = (role: RoleRow) => {
    setSelectedId(role.id);
    setDraft({ id: role.id, name: role.name, description: role.description ?? '', permissions: { ...role.permissions } });
  };

  const startNew = (copyFrom?: RoleRow) => {
    setSelectedId(null);
    setDraft({
      id: null,
      name: copyFrom ? `${copyFrom.name} (עותק)` : '',
      description: copyFrom?.description ?? '',
      // העתקה מתפקיד-על = הכול מותר (רק מה שמותר למבצע להעניק)
      permissions: copyFrom && !copyFrom.is_super ? { ...copyFrom.permissions } : {},
    });
  };

  const save = async () => {
    if (!draft) return;
    const name = draft.name.trim();
    if (!name) return toast.error('יש להזין שם לתפקיד');
    setSaving(true);
    const payload = { name, description: draft.description.trim() || null, permissions: draft.permissions };
    const { data, error } = draft.id
      ? await supabase.from('roles').update(payload).eq('id', draft.id).select('id').single()
      : await supabase.from('roles').insert(payload).select('id').single();
    setSaving(false);
    if (error) return toast.error(friendlyDbError(error.message));

    await logActivity(draft.id ? 'update' : 'create', 'roles', `${draft.id ? 'עודכן' : 'נוצר'} תפקיד: ${name}`, {
      entityId: data.id,
    });
    toast.success('התפקיד נשמר');
    const list = await reload();
    const saved = list.find((r) => r.id === data.id);
    if (saved) select(saved);
    await refresh();
  };

  const remove = async () => {
    if (!selected) return;
    if (userCounts[selected.id]) {
      return toast.warning('יש משתמשים בתפקיד הזה. יש להעביר אותם לתפקיד אחר לפני המחיקה.');
    }
    if (!window.confirm(`למחוק את התפקיד "${selected.name}"?`)) return;
    const { error } = await supabase.from('roles').delete().eq('id', selected.id);
    if (error) return toast.error(friendlyDbError(error.message));
    await logActivity('delete', 'roles', `נמחק תפקיד: ${selected.name}`, { entityId: selected.id });
    toast.success('התפקיד נמחק');
    setSelectedId(null);
    setDraft(null);
    await reload();
  };

  if (loading) return <Loader2 className="mx-auto mt-10 w-6 h-6 animate-spin text-slate-400" />;

  return (
    <div className="flex flex-col gap-4 lg:flex-row">
      {/* רשימת תפקידים */}
      <div className="lg:w-64 shrink-0 space-y-2">
        <button
          type="button"
          onClick={() => startNew()}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 py-2 text-white hover:bg-blue-700"
        >
          <Plus className="w-4 h-4" /> תפקיד חדש
        </button>
        <ul className="space-y-1">
          {roles.map((r) => (
            <li key={r.id}>
              <button
                type="button"
                onClick={() => select(r)}
                className={`flex w-full items-center gap-2 rounded-lg border px-3 py-2 text-right ${
                  selectedId === r.id ? 'border-blue-500 bg-blue-50' : 'border-slate-200 bg-white hover:bg-slate-50'
                }`}
              >
                {r.is_super && <Crown className="w-4 h-4 text-amber-500" />}
                <span className="flex-1 font-medium">{r.name}</span>
                <span className="flex items-center gap-1 text-xs text-slate-400">
                  <Users className="w-3 h-3" />
                  {userCounts[r.id] ?? 0}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </div>

      {/* עריכה */}
      <div className="flex-1 min-w-0">
        {!draft ? (
          <p className="rounded-xl border border-dashed border-slate-300 p-10 text-center text-slate-400">
            בחרו תפקיד מהרשימה או צרו תפקיד חדש
          </p>
        ) : selected?.is_super ? (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-6">
            <div className="flex items-center gap-2 text-lg font-bold">
              <Crown className="w-5 h-5 text-amber-500" /> {selected.name}
            </div>
            <p className="mt-2 text-sm text-slate-700">
              לתפקיד הזה מותר הכול, תמיד. אי אפשר להגביל או למחוק אותו, ותמיד נשאר בו לפחות משתמש פעיל אחד – כדי
              שאף פעם לא תינעלו מחוץ למערכת.
            </p>
            <button
              type="button"
              onClick={() => startNew(selected)}
              className="mt-4 flex items-center gap-2 rounded-lg border bg-white px-3 py-2 text-sm hover:bg-slate-50"
            >
              <Copy className="w-4 h-4" /> תפקיד חדש על בסיס תפקיד זה
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            {isOwnRole && (
              <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
                זה התפקיד שלך – אי אפשר לשנות אותו בעצמך.
              </p>
            )}
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="mb-1 block text-sm font-medium">שם התפקיד</span>
                <input
                  value={draft.name}
                  onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                  disabled={isOwnRole}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-sm font-medium">תיאור</span>
                <input
                  value={draft.description}
                  onChange={(e) => setDraft({ ...draft, description: e.target.value })}
                  disabled={isOwnRole}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2"
                />
              </label>
            </div>

            <div className="sticky top-0 z-10 flex flex-wrap gap-2 bg-slate-50 py-2">
              <button
                type="button"
                onClick={save}
                disabled={saving || isOwnRole}
                className="flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-white hover:bg-emerald-700 disabled:opacity-50"
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                שמירה
              </button>
              {draft.id && selected && (
                <>
                  <button
                    type="button"
                    onClick={() => startNew(selected)}
                    className="flex items-center gap-2 rounded-lg border bg-white px-3 py-2 text-sm hover:bg-slate-50"
                  >
                    <Copy className="w-4 h-4" /> שכפול
                  </button>
                  <button
                    type="button"
                    onClick={remove}
                    disabled={isOwnRole}
                    className="flex items-center gap-2 rounded-lg border border-red-200 bg-white px-3 py-2 text-sm text-red-600 hover:bg-red-50 disabled:opacity-50"
                  >
                    <Trash2 className="w-4 h-4" /> מחיקה
                  </button>
                </>
              )}
            </div>

            <PermissionEditor
              mode="role"
              value={draft.permissions}
              onChange={(permissions) => setDraft({ ...draft, permissions })}
              canGrant={hasPermission}
              readOnly={isOwnRole}
            />
          </div>
        )}
      </div>
    </div>
  );
}
