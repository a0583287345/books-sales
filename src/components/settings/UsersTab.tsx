'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Crown, KeyRound, Loader2, Plus, Save, ShieldCheck, Trash2, UserCheck, UserX, X } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { callServerApi } from '@/lib/apiClient';
import { useAuth } from '@/components/AuthContext';
import { toast } from '@/components/Toaster';
import { logActivity } from '@/lib/logger';
import { normalizeStates, type PermissionStateMap } from '@/lib/permissions';
import { PermissionEditor } from './PermissionEditor';
import { loadRoles, type RoleRow } from './RolesTab';
import { dbErrorMessage } from '@/lib/dbErrors';

type UserRow = {
  id: string;
  full_name: string;
  email: string | null;
  role_id: string;
  is_active: boolean;
  permission_overrides: PermissionStateMap;
};

const input = 'w-full rounded-lg border border-slate-300 px-3 py-2';

async function fetchUsersData() {
  const [roleList, { data, error }] = await Promise.all([
    loadRoles(),
    supabase
      .from('user_profiles')
      .select('id, full_name, email, role_id, is_active, permission_overrides')
      .order('is_active', { ascending: false })
      .order('full_name'),
  ]);
  if (error) toast.error(dbErrorMessage(error.message));
  const userList: UserRow[] = (data ?? []).map((u) => ({
    ...u,
    permission_overrides: normalizeStates(u.permission_overrides),
  }));
  return { roleList, userList };
}

export function UsersTab() {
  const { access } = useAuth();
  const [users, setUsers] = useState<UserRow[]>([]);
  const [roles, setRoles] = useState<RoleRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<UserRow | null>(null);
  const [creating, setCreating] = useState(false);

  const apply = useCallback(({ roleList, userList }: Awaited<ReturnType<typeof fetchUsersData>>) => {
    setRoles(roleList);
    setUsers(userList);
    setLoading(false);
  }, []);

  const reload = useCallback(async () => apply(await fetchUsersData()), [apply]);

  useEffect(() => {
    let cancelled = false;
    void fetchUsersData().then((d) => {
      if (!cancelled) apply(d);
    });
    return () => {
      cancelled = true;
    };
  }, [apply]);

  const roleById = useMemo(() => new Map(roles.map((r) => [r.id, r])), [roles]);

  if (loading) return <Loader2 className="mx-auto mt-10 w-6 h-6 animate-spin text-slate-400" />;

  return (
    <div className="space-y-3">
      <button
        type="button"
        onClick={() => setCreating(true)}
        className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-white hover:bg-blue-700"
      >
        <Plus className="w-4 h-4" /> משתמש חדש
      </button>

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-600">
            <tr>
              <th className="px-3 py-2 text-right">שם</th>
              <th className="px-3 py-2 text-right">אימייל</th>
              <th className="px-3 py-2 text-right">תפקיד</th>
              <th className="px-3 py-2 text-right">חריגות</th>
              <th className="px-3 py-2 text-right">מצב</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {users.map((u) => {
              const role = roleById.get(u.role_id);
              const overrides = Object.keys(u.permission_overrides).length;
              return (
                <tr
                  key={u.id}
                  onClick={() => setEditing(u)}
                  className={`cursor-pointer hover:bg-blue-50 ${u.is_active ? '' : 'text-slate-400'}`}
                >
                  <td className="px-3 py-2.5 font-medium">
                    {u.full_name}
                    {u.id === access?.userId && <span className="mr-2 text-xs text-blue-600">(את/ה)</span>}
                  </td>
                  <td className="px-3 py-2.5" dir="ltr">{u.email}</td>
                  <td className="px-3 py-2.5">
                    <span className="inline-flex items-center gap-1">
                      {role?.is_super && <Crown className="w-3.5 h-3.5 text-amber-500" />}
                      {role?.name ?? '—'}
                    </span>
                  </td>
                  <td className="px-3 py-2.5">
                    {overrides > 0 ? (
                      <span className="rounded-full bg-purple-100 px-2 text-xs text-purple-700">{overrides}</span>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td className="px-3 py-2.5">{u.is_active ? 'פעיל' : 'מושבת'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {creating && (
        <CreateUserModal
          roles={roles}
          onClose={() => setCreating(false)}
          onCreated={async () => {
            setCreating(false);
            await reload();
          }}
        />
      )}
      {editing && (
        <EditUserModal
          key={editing.id}
          user={editing}
          roles={roles}
          onClose={() => setEditing(null)}
          onChanged={async () => {
            setEditing(null);
            await reload();
          }}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-2 sm:p-6">
      <div className="w-full max-w-4xl rounded-2xl bg-slate-50 shadow-xl">
        <div className="flex items-center justify-between rounded-t-2xl border-b bg-white px-4 py-3">
          <h2 className="text-lg font-bold">{title}</h2>
          <button onClick={onClose} className="rounded p-1 hover:bg-slate-100" aria-label="סגירה">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="space-y-4 p-4">{children}</div>
      </div>
    </div>
  );
}

function assignableRoles(roles: RoleRow[], isSuper: boolean) {
  // רק המנהל הראשי יכולה לשייך לתפקיד המנהל הראשי
  return roles.filter((r) => isSuper || !r.is_super);
}

function CreateUserModal({
  roles,
  onClose,
  onCreated,
}: {
  roles: RoleRow[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const { access } = useAuth();
  const options = assignableRoles(roles, !!access?.isSuper);
  const [form, setForm] = useState({ full_name: '', email: '', password: '', role_id: options.find((r) => !r.is_super)?.id ?? '' });
  const [saving, setSaving] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await callServerApi('/api/admin/users', { action: 'create', ...form });
      toast.success(`המשתמש ${form.full_name} נוצר`);
      onCreated();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal title="משתמש חדש" onClose={onClose}>
      <form onSubmit={submit} className="grid gap-3 rounded-xl bg-white p-4 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1 block text-sm font-medium">שם מלא</span>
          <input required className={input} value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-medium">תפקיד</span>
          <select required className={input} value={form.role_id} onChange={(e) => setForm({ ...form, role_id: e.target.value })}>
            {options.map((r) => (
              <option key={r.id} value={r.id}>{r.name}</option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-medium">אימייל (שם המשתמש להתחברות)</span>
          <input required type="email" dir="ltr" className={input} value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-medium">סיסמה ראשונית (8 תווים לפחות)</span>
          <input required minLength={8} type="text" dir="ltr" autoComplete="new-password" className={input} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
        </label>
        <p className="text-xs text-slate-500 sm:col-span-2">
          אחרי היצירה אפשר לפתוח את המשתמש ולהגדיר לו חריגות בהרשאות.
        </p>
        <div className="sm:col-span-2">
          <button type="submit" disabled={saving} className="flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-white disabled:opacity-50">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            יצירת משתמש
          </button>
        </div>
      </form>
    </Modal>
  );
}

function EditUserModal({
  user,
  roles,
  onClose,
  onChanged,
}: {
  user: UserRow;
  roles: RoleRow[];
  onClose: () => void;
  onChanged: () => void;
}) {
  const { access, hasPermission, refresh } = useAuth();
  const isSelf = user.id === access?.userId;
  const userRole = roles.find((r) => r.id === user.role_id);
  // מי שאינו מנהל ראשי: לא עורך את עצמו ולא מנהל ראשי (כך גם נאכף במסד)
  const locked = !access?.isSuper && (isSelf || !!userRole?.is_super);

  const [fullName, setFullName] = useState(user.full_name);
  const [roleId, setRoleId] = useState(user.role_id);
  const [overrides, setOverrides] = useState<PermissionStateMap>(user.permission_overrides);
  const [newPassword, setNewPassword] = useState('');
  const [busy, setBusy] = useState<string | null>(null);

  const selectedRole = roles.find((r) => r.id === roleId);
  const options = assignableRoles(roles, !!access?.isSuper);

  const save = async () => {
    if (!fullName.trim()) return toast.error('יש להזין שם');
    setBusy('save');
    const { error } = await supabase
      .from('user_profiles')
      .update({ full_name: fullName.trim(), role_id: roleId, permission_overrides: overrides })
      .eq('id', user.id);
    setBusy(null);
    if (error) return toast.error(dbErrorMessage(error.message));
    await logActivity('update', 'user_profiles', `עודכן משתמש: ${fullName.trim()} (תפקיד והרשאות)`, { entityId: user.id });
    toast.success('השינויים נשמרו');
    if (isSelf) await refresh();
    onChanged();
  };

  const serverAction = async (action: string, extra: Record<string, unknown>, success: string) => {
    setBusy(action);
    try {
      await callServerApi('/api/admin/users', { action, user_id: user.id, ...extra });
      toast.success(success);
      return true;
    } catch (err) {
      toast.error((err as Error).message);
      return false;
    } finally {
      setBusy(null);
    }
  };

  return (
    <Modal title={`עריכת משתמש: ${user.full_name}`} onClose={onClose}>
      {locked && (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
          {isSelf ? 'אי אפשר לשנות את המשתמש שלך עצמך.' : 'רק המנהל הראשי יכולה לשנות משתמש בתפקיד הזה.'}
        </p>
      )}

      <div className="grid gap-3 rounded-xl bg-white p-4 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1 block text-sm font-medium">שם מלא</span>
          <input disabled={locked} className={input} value={fullName} onChange={(e) => setFullName(e.target.value)} />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-medium">תפקיד</span>
          <select disabled={locked} className={input} value={roleId} onChange={(e) => setRoleId(e.target.value)}>
            {(options.some((r) => r.id === roleId) ? options : [...options, ...roles.filter((r) => r.id === roleId)]).map((r) => (
              <option key={r.id} value={r.id}>{r.name}</option>
            ))}
          </select>
        </label>
        <div className="text-sm text-slate-500 sm:col-span-2" dir="ltr" style={{ textAlign: 'right' }}>
          {user.email}
        </div>
      </div>

      {/* פעולות חשבון */}
      <div className="flex flex-wrap items-end gap-2 rounded-xl bg-white p-4">
        <label className="block">
          <span className="mb-1 block text-sm font-medium">סיסמה חדשה</span>
          <input
            disabled={locked}
            type="text"
            dir="ltr"
            autoComplete="new-password"
            minLength={8}
            placeholder="8 תווים לפחות"
            className={input}
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
          />
        </label>
        <button
          type="button"
          disabled={locked || newPassword.length < 8 || !!busy}
          onClick={async () => {
            if (await serverAction('reset_password', { password: newPassword }, 'הסיסמה עודכנה')) setNewPassword('');
          }}
          className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm hover:bg-slate-50 disabled:opacity-50"
        >
          <KeyRound className="w-4 h-4" /> איפוס סיסמה
        </button>
        <div className="flex-1" />
        <button
          type="button"
          disabled={locked || !!busy}
          onClick={async () => {
            const ok = await serverAction(
              'set_active',
              { active: !user.is_active },
              user.is_active ? 'המשתמש הושבת – לא יוכל להתחבר' : 'המשתמש הופעל'
            );
            if (ok) onChanged();
          }}
          className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm hover:bg-slate-50 disabled:opacity-50"
        >
          {user.is_active ? <UserX className="w-4 h-4" /> : <UserCheck className="w-4 h-4" />}
          {user.is_active ? 'השבתה' : 'הפעלה'}
        </button>
        <button
          type="button"
          disabled={locked || isSelf || !!busy}
          onClick={async () => {
            if (!window.confirm(`למחוק לצמיתות את המשתמש "${user.full_name}"? (עדיף להשבית – ההיסטוריה נשמרת בכל מקרה)`)) return;
            if (await serverAction('delete', {}, 'המשתמש נמחק')) onChanged();
          }}
          className="flex items-center gap-2 rounded-lg border border-red-200 px-3 py-2 text-sm text-red-600 hover:bg-red-50 disabled:opacity-50"
        >
          <Trash2 className="w-4 h-4" /> מחיקה
        </button>
      </div>

      {/* חריגות */}
      <div className="space-y-2">
        <h3 className="flex items-center gap-2 font-bold">
          <ShieldCheck className="w-5 h-5 text-purple-600" /> חריגות בהרשאות למשתמש הזה
        </h3>
        {selectedRole?.is_super ? (
          <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
            למנהל הראשי מותר הכול – אין צורך בחריגות.
          </p>
        ) : (
          <>
            <p className="text-sm text-slate-500">
              ברירת המחדל היא &quot;לפי התפקיד&quot;. כל בחירה אחרת גוברת על התפקיד – רק למשתמש הזה.
            </p>
            <PermissionEditor
              mode="override"
              value={overrides}
              onChange={setOverrides}
              roleValue={selectedRole?.permissions ?? {}}
              canGrant={hasPermission}
              readOnly={locked}
            />
          </>
        )}
      </div>

      <div className="sticky bottom-0 -mx-4 -mb-4 flex gap-2 rounded-b-2xl border-t bg-white px-4 py-3">
        <button
          type="button"
          onClick={save}
          disabled={locked || !!busy}
          className="flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-white hover:bg-emerald-700 disabled:opacity-50"
        >
          {busy === 'save' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          שמירת שינויים
        </button>
        <button type="button" onClick={onClose} className="rounded-lg border px-4 py-2 hover:bg-slate-50">
          ביטול
        </button>
      </div>
    </Modal>
  );
}
