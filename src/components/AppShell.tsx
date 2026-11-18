'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { BookOpen, CalendarRange, ChevronDown, ChevronUp, Loader2, Lock, LogOut, Menu, UserX, X } from 'lucide-react';
import { useAuth } from '@/components/AuthContext';
import { useYear, YEAR_STATUS_LABELS } from '@/components/YearContext';
import { toast } from '@/components/Toaster';
import { supabase } from '@/lib/supabase';
import { isNavGroup, NAV_ITEMS, type NavGroup, type NavItem } from '@/lib/navigation';
import type { PermissionState } from '@/lib/permissions';

/** מצב הפריט בתפריט: מותר אם אחת ההרשאות מותרת; חסום אם אחת חסומה; אחרת מוסתר */
export function navState(item: NavItem, stateOf: (p: string) => PermissionState): PermissionState {
  const states = (Array.isArray(item.perm) ? item.perm : [item.perm]).map(stateOf);
  if (states.includes('allowed')) return 'allowed';
  if (states.includes('locked')) return 'locked';
  return 'hidden';
}

const NAV_GROUPS_KEY = 'nav-open-groups';

export function AppShell({ children }: { children: React.ReactNode }) {
  const { access, loading, inactive, stateOf, signOut } = useAuth();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});
  const [pendingChanges, setPendingChanges] = useState(0);
  const canSeeOrders = stateOf('orders_view') === 'allowed';

  // כמה בקשות שינוי מהקישור ממתינות (מספר ליד "הזמנות" בתפריט) – מתרענן במעבר בין מסכים
  useEffect(() => {
    if (!canSeeOrders) return;
    let cancelled = false;
    void supabase
      .from('online_change_requests')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'pending')
      .then(({ count }) => !cancelled && setPendingChanges(count ?? 0));
    return () => {
      cancelled = true;
    };
  }, [canSeeOrders, pathname]);

  // אילו קבוצות פתוחות – נשמר במכשיר
  useEffect(() => {
    try {
      const saved = localStorage.getItem(NAV_GROUPS_KEY);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- קריאה חד-פעמית מהמכשיר
      if (saved) setOpenGroups(JSON.parse(saved));
    } catch {
      /* אין גישה לאחסון – מתחילים סגור */
    }
  }, []);

  const toggleGroup = (key: string) =>
    setOpenGroups((prev) => {
      const next = { ...prev, [key]: !prev[key] };
      try {
        localStorage.setItem(NAV_GROUPS_KEY, JSON.stringify(next));
      } catch {
        /* לא נשמר – לא נורא */
      }
      return next;
    });

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center text-slate-400">
        <Loader2 className="w-8 h-8 animate-spin" />
      </div>
    );
  }

  if (inactive || !access) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
        <UserX className="w-12 h-12 text-slate-400" />
        <p className="text-lg font-medium">המשתמש שלך לא פעיל או שלא שויך לתפקיד.</p>
        <p className="text-sm text-slate-500">יש לפנות למנהל המערכת.</p>
        <button onClick={signOut} className="rounded-lg bg-slate-800 px-4 py-2 text-white">
          יציאה
        </button>
      </div>
    );
  }

  const isActive = (href: string) => (href === '/' ? pathname === '/' : pathname.startsWith(href));

  const renderItem = (item: NavItem, nested = false) => {
    const state = navState(item, stateOf);
    if (state === 'hidden') return null;
    const Icon = item.icon;
    const base = `flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm ${nested ? 'pr-6' : ''}`;

    if (state === 'locked' || !item.ready) {
      return (
        <button
          key={item.href}
          type="button"
          onClick={() =>
            state === 'locked'
              ? toast.denied(`אין לך הרשאה למסך: ${item.label}`)
              : toast.info(`המסך "${item.label}" ייבנה בהמשך`)
          }
          className={`${base} text-slate-400 hover:bg-slate-50 text-right`}
        >
          <Icon className="w-5 h-5 shrink-0" />
          <span className="flex-1">{item.label}</span>
          {state === 'locked' ? (
            <Lock className="w-3.5 h-3.5" />
          ) : (
            <span className="text-[10px] rounded bg-slate-100 px-1.5 py-0.5">בקרוב</span>
          )}
        </button>
      );
    }

    return (
      <Link
        key={item.href}
        href={item.href}
        onClick={() => setOpen(false)}
        className={`${base} ${
          isActive(item.href) ? 'bg-blue-50 text-blue-700 font-semibold' : 'text-slate-700 hover:bg-slate-50'
        }`}
      >
        <Icon className="w-5 h-5 shrink-0" />
        <span className="flex-1">{item.label}</span>
        {item.href === '/orders' && pendingChanges > 0 && (
          <span className="rounded-full bg-amber-500 px-1.5 text-xs font-bold text-white" title="בקשות שינוי מהקישור שממתינות לאישור">
            {pendingChanges}
          </span>
        )}
      </Link>
    );
  };

  const renderGroup = (g: NavGroup) => {
    const visible = g.items.filter((i) => navState(i, stateOf) !== 'hidden');
    if (visible.length === 0) return null;
    const hasActive = visible.some((i) => isActive(i.href));
    // קבוצה שיש בה המסך הנוכחי – תמיד פתוחה
    const expanded = hasActive || !!openGroups[g.group];
    const Icon = g.icon;
    const Chevron = expanded ? ChevronUp : ChevronDown;
    return (
      <div key={g.group} className="flex flex-col gap-0.5">
        <button
          type="button"
          onClick={() => !hasActive && toggleGroup(g.group)}
          aria-expanded={expanded}
          className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-right ${
            hasActive ? 'text-blue-700 font-semibold' : 'text-slate-700 hover:bg-slate-50'
          }`}
        >
          <Icon className="w-5 h-5 shrink-0" />
          <span className="flex-1">{g.label}</span>
          <Chevron className={`w-4 h-4 ${hasActive ? 'opacity-30' : 'text-slate-400'}`} />
        </button>
        {expanded && visible.map((i) => renderItem(i, true))}
      </div>
    );
  };

  const nav = (
    <nav className="flex flex-col gap-0.5 p-2">
      {NAV_ITEMS.map((e) => (isNavGroup(e) ? renderGroup(e) : renderItem(e)))}
    </nav>
  );

  return (
    <div className="flex flex-1 min-h-screen bg-slate-50">
      {/* תפריט צד – מחשב */}
      <aside className="hidden lg:flex w-60 shrink-0 flex-col border-l border-slate-200 bg-white print:hidden">
        <Brand />
        <div className="flex-1 overflow-y-auto">{nav}</div>
        <UserBox name={access.fullName} role={access.roleName} onSignOut={signOut} />
      </aside>

      {/* תפריט נפתח – טאבלט/טלפון */}
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-black/30" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 right-0 flex w-72 flex-col bg-white shadow-xl">
            <div className="flex items-center justify-between">
              <Brand />
              <button onClick={() => setOpen(false)} className="p-3" aria-label="סגירת התפריט">
                <X className="w-6 h-6" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto">{nav}</div>
            <UserBox name={access.fullName} role={access.roleName} onSignOut={signOut} />
          </aside>
        </div>
      )}

      <div className="flex flex-1 flex-col min-w-0">
        <header className="flex items-center gap-3 border-b border-slate-200 bg-white px-3 py-2 print:hidden">
          <button onClick={() => setOpen(true)} className="p-2 lg:hidden" aria-label="פתיחת התפריט">
            <Menu className="w-6 h-6" />
          </button>
          <span className="font-bold lg:hidden">מכירת ספרי לימוד</span>
          <div className="flex-1" />
          <YearSelect />
        </header>
        <main className="flex flex-1 flex-col p-4 lg:p-6">{children}</main>
      </div>
    </div>
  );
}

function YearSelect() {
  const { years, year, setYearId } = useYear();
  if (years.length === 0) {
    return (
      <Link href="/years" className="text-sm text-blue-600 hover:underline">
        עדיין אין שנת לימודים – לפתיחת שנה
      </Link>
    );
  }
  return (
    <label className="flex items-center gap-2 text-sm">
      <CalendarRange className="h-4 w-4 text-slate-500" />
      <span className="hidden sm:inline text-slate-500">שנת לימודים:</span>
      <select
        value={year?.id ?? ''}
        onChange={(e) => setYearId(e.target.value)}
        className={`rounded-lg border px-2 py-1.5 font-medium ${
          year?.status === 'closed' ? 'border-amber-300 bg-amber-50' : 'border-slate-300 bg-white'
        }`}
      >
        {years.map((y) => (
          <option key={y.id} value={y.id}>
            {y.name}
            {y.status !== 'active' ? ` (${YEAR_STATUS_LABELS[y.status]})` : ''}
          </option>
        ))}
      </select>
    </label>
  );
}

function Brand() {
  return (
    <div className="flex items-center gap-2 px-4 py-4 font-bold text-slate-800">
      <BookOpen className="w-6 h-6 text-blue-600" />
      מכירת ספרי לימוד
    </div>
  );
}

function UserBox({ name, role, onSignOut }: { name: string; role: string; onSignOut: () => void }) {
  return (
    <div className="flex items-center gap-2 border-t border-slate-200 p-3">
      <div className="flex-1 min-w-0">
        <div className="truncate text-sm font-medium">{name}</div>
        <div className="truncate text-xs text-slate-500">{role}</div>
      </div>
      <button onClick={onSignOut} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100" title="יציאה">
        <LogOut className="w-5 h-5" />
      </button>
    </div>
  );
}
