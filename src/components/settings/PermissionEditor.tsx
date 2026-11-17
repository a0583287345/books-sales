'use client';

import { useState } from 'react';
import { ChevronDown, Eye, EyeOff, Lock, Check, RotateCcw } from 'lucide-react';
import {
  PERMISSION_GROUPS,
  STATE_LABELS,
  type PermissionState,
  type PermissionStateMap,
} from '@/lib/permissions';

// =====================================================================
// עורך הרשאות: לכל פעולה – מותר / חסום / מוסתר.
// mode='role'     – הגדרת תפקיד (חסר = מוסתר).
// mode='override' – חריגות למשתמש: אפשרות רביעית "לפי התפקיד" (ירושה), ומוצג מה התפקיד קובע.
// canGrant(perm) – false = אין למבצע את ההרשאה, ולכן אסור לו להעניק "מותר" (כך גם נאכף במסד).
// =====================================================================

type Props = {
  mode: 'role' | 'override';
  value: PermissionStateMap;
  onChange: (next: PermissionStateMap) => void;
  /** במצב override: הגדרות התפקיד של המשתמש (להצגת "לפי התפקיד: ...") */
  roleValue?: PermissionStateMap;
  canGrant: (permId: string) => boolean;
  readOnly?: boolean;
};

const STATE_STYLE: Record<PermissionState, { on: string; icon: React.ReactNode }> = {
  allowed: { on: 'bg-emerald-600 text-white border-emerald-600', icon: <Check className="w-3.5 h-3.5" /> },
  locked: { on: 'bg-amber-500 text-white border-amber-500', icon: <Lock className="w-3.5 h-3.5" /> },
  hidden: { on: 'bg-slate-600 text-white border-slate-600', icon: <EyeOff className="w-3.5 h-3.5" /> },
};

const STATES: PermissionState[] = ['allowed', 'locked', 'hidden'];

export function PermissionEditor({ mode, value, onChange, roleValue = {}, canGrant, readOnly }: Props) {
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  const set = (permId: string, state: PermissionState | null) => {
    const next = { ...value };
    if (state === null) delete next[permId];
    else next[permId] = state;
    onChange(next);
  };

  const setGroup = (permIds: string[], state: PermissionState | null) => {
    const next = { ...value };
    for (const id of permIds) {
      if (state === 'allowed' && !canGrant(id)) continue;
      if (state === null) delete next[id];
      else next[id] = state;
    }
    onChange(next);
  };

  return (
    <div className="space-y-3">
      <Legend mode={mode} />
      {PERMISSION_GROUPS.map((group) => {
        const ids = group.permissions.map((p) => p.id);
        const isCollapsed = collapsed[group.title];
        const overrideCount = mode === 'override' ? ids.filter((id) => value[id]).length : 0;
        return (
          <section key={group.title} className="rounded-xl border border-slate-200 bg-white">
            <header className="flex flex-wrap items-center gap-2 border-b border-slate-100 px-3 py-2">
              <button
                type="button"
                onClick={() => setCollapsed((c) => ({ ...c, [group.title]: !isCollapsed }))}
                className="flex flex-1 items-center gap-2 text-right font-semibold"
              >
                <ChevronDown className={`w-4 h-4 transition ${isCollapsed ? '-rotate-90' : ''}`} />
                {group.title}
                {overrideCount > 0 && (
                  <span className="rounded-full bg-purple-100 px-2 text-xs text-purple-700">{overrideCount} חריגות</span>
                )}
              </button>
              {!readOnly && (
                <div className="flex items-center gap-1 text-xs">
                  <span className="text-slate-400">לכל הקבוצה:</span>
                  {mode === 'override' && (
                    <button type="button" onClick={() => setGroup(ids, null)} className="rounded border px-2 py-1 hover:bg-slate-50">
                      לפי התפקיד
                    </button>
                  )}
                  {STATES.map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setGroup(ids, s)}
                      className="rounded border px-2 py-1 hover:bg-slate-50"
                    >
                      {STATE_LABELS[s]}
                    </button>
                  ))}
                </div>
              )}
            </header>

            {!isCollapsed && (
              <ul className="divide-y divide-slate-100">
                {group.permissions.map((perm) => {
                  const own = value[perm.id];
                  const inherited = roleValue[perm.id] ?? 'hidden';
                  const current: PermissionState = own ?? (mode === 'override' ? inherited : 'hidden');
                  const grantBlocked = !canGrant(perm.id);
                  return (
                    <li key={perm.id} className="flex flex-col gap-2 px-3 py-2.5 sm:flex-row sm:items-center">
                      <div className="flex-1 text-sm">
                        <span>{perm.label}</span>
                        <span className="mr-2 inline-flex items-center gap-0.5 text-[11px] text-slate-400">
                          {perm.kind === 'view' ? <Eye className="w-3 h-3" /> : null}
                          {perm.kind === 'view' ? 'צפייה' : 'פעולה'}
                        </span>
                        {mode === 'override' && own && (
                          <span className="mr-2 text-[11px] text-purple-600">
                            (בתפקיד: {STATE_LABELS[inherited]})
                          </span>
                        )}
                      </div>
                      <div className="flex shrink-0 gap-1">
                        {mode === 'override' && (
                          <button
                            type="button"
                            disabled={readOnly}
                            onClick={() => set(perm.id, null)}
                            title="לפי הגדרת התפקיד"
                            className={`flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-xs ${
                              !own ? 'border-purple-600 bg-purple-600 text-white' : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                            }`}
                          >
                            <RotateCcw className="w-3.5 h-3.5" />
                            לפי התפקיד{!own ? ` (${STATE_LABELS[inherited]})` : ''}
                          </button>
                        )}
                        {STATES.map((s) => {
                          const selected = mode === 'override' ? own === s : current === s;
                          const disabled = readOnly || (s === 'allowed' && grantBlocked && !selected);
                          return (
                            <button
                              key={s}
                              type="button"
                              disabled={disabled}
                              onClick={() => set(perm.id, s === 'hidden' && mode === 'role' ? null : s)}
                              title={disabled && !readOnly ? 'אין לך את ההרשאה הזו, ולכן אי אפשר להעניק אותה' : undefined}
                              className={`flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-xs transition ${
                                selected ? STATE_STYLE[s].on : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                              } ${disabled ? 'cursor-not-allowed opacity-40' : ''}`}
                            >
                              {STATE_STYLE[s].icon}
                              {STATE_LABELS[s]}
                            </button>
                          );
                        })}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        );
      })}
    </div>
  );
}

function Legend({ mode }: { mode: 'role' | 'override' }) {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 rounded-lg bg-slate-100 px-3 py-2 text-xs text-slate-600">
      <span className="flex items-center gap-1"><Check className="w-3.5 h-3.5 text-emerald-600" /> מותר – עובד כרגיל</span>
      <span className="flex items-center gap-1"><Lock className="w-3.5 h-3.5 text-amber-500" /> חסום – מוצג אפור עם מנעול</span>
      <span className="flex items-center gap-1"><EyeOff className="w-3.5 h-3.5 text-slate-600" /> מוסתר – לא מופיע בכלל</span>
      {mode === 'override' && (
        <span className="flex items-center gap-1"><RotateCcw className="w-3.5 h-3.5 text-purple-600" /> לפי התפקיד – בלי חריגה</span>
      )}
    </div>
  );
}
