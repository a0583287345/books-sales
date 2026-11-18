'use client';

import { useState } from 'react';
import { History, Inbox, Lock, Mail, ShieldCheck, Users } from 'lucide-react';
import { useAuth } from '@/components/AuthContext';
import { LockedPage } from '@/components/Protect';
import { toast } from '@/components/Toaster';
import { deniedMessage, type PermissionState } from '@/lib/permissions';
import { RolesTab } from '@/components/settings/RolesTab';
import { UsersTab } from '@/components/settings/UsersTab';
import { AuditLogTab } from '@/components/settings/AuditLogTab';
import { EmailSettingsTab } from '@/components/settings/EmailSettingsTab';
import { EmailLogTab } from '@/components/settings/EmailLogTab';

const TABS = [
  { id: 'users', label: 'משתמשים', icon: Users, perm: 'users_manage', Component: UsersTab },
  { id: 'roles', label: 'תפקידים והרשאות', icon: ShieldCheck, perm: 'roles_manage', Component: RolesTab },
  { id: 'audit', label: 'יומן פעולות', icon: History, perm: 'audit_view', Component: AuditLogTab },
  { id: 'email', label: 'מיילים', icon: Mail, perm: 'email_settings', Component: EmailSettingsTab },
  { id: 'email_log', label: 'יומן מיילים', icon: Inbox, perm: 'emails_view', Component: EmailLogTab },
] as const;

type TabId = (typeof TABS)[number]['id'];

export default function SettingsPage() {
  const { stateOf } = useAuth();
  const visible = TABS.map((t) => ({ ...t, state: stateOf(t.perm) as PermissionState })).filter((t) => t.state !== 'hidden');
  const firstAllowed = visible.find((t) => t.state === 'allowed')?.id;
  const [chosen, setChosen] = useState<TabId | null>(null);
  const tabId = chosen ?? firstAllowed;

  if (!firstAllowed) return <LockedPage permId="users_manage" />;
  const tab = TABS.find((t) => t.id === tabId)!;
  const Active = tab.Component;

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">הגדרות והרשאות</h1>
      <div className="flex gap-1 overflow-x-auto border-b border-slate-200">
        {visible.map((t) => {
          const Icon = t.icon;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => (t.state === 'locked' ? toast.denied(deniedMessage(t.perm)) : setChosen(t.id))}
              className={`flex items-center gap-2 whitespace-nowrap border-b-2 px-4 py-2.5 text-sm ${
                t.id === tabId
                  ? 'border-blue-600 font-semibold text-blue-700'
                  : t.state === 'locked'
                    ? 'border-transparent text-slate-400'
                    : 'border-transparent text-slate-600 hover:text-slate-900'
              }`}
            >
              <Icon className="w-4 h-4" />
              {t.label}
              {t.state === 'locked' && <Lock className="w-3 h-3" />}
            </button>
          );
        })}
      </div>
      <Active />
    </div>
  );
}
