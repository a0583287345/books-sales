'use client';

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { User } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { toast } from '@/components/Toaster';
import {
  deniedMessage,
  normalizeStates,
  type PermissionState,
  type PermissionStateMap,
} from '@/lib/permissions';

// =====================================================================
// מקור אחד למשתמש המחובר ולהרשאות שלו (rpc my_access = תפקיד + חריגות משתמש).
// כל הקומפוננטות קוראות מכאן – ישירות או דרך <Protect>.
// =====================================================================

export type Access = {
  userId: string;
  fullName: string;
  roleId: string;
  roleName: string;
  isSuper: boolean;
  permissions: PermissionStateMap;
};

type AuthContextType = {
  user: User | null;
  access: Access | null;
  loading: boolean;
  /** מחובר אבל אין פרופיל פעיל (משתמש מושבת / לא שויך) */
  inactive: boolean;
  hasPermission: (permId: string) => boolean;
  /** allowed / locked / hidden */
  stateOf: (permId: string) => PermissionState;
  /** בתוך פעולה: true אם מותר; אחרת מציג "אין לך הרשאה" ומחזיר false */
  requirePermission: (permId: string) => boolean;
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

async function loadAccess(): Promise<Access | null> {
  const { data, error } = await supabase.rpc('my_access');
  if (error || !data || typeof data !== 'object' || Array.isArray(data)) return null;
  const d = data as Record<string, unknown>;
  return {
    userId: String(d.user_id),
    fullName: String(d.full_name ?? ''),
    roleId: String(d.role_id),
    roleName: String(d.role_name ?? ''),
    isSuper: d.is_super === true,
    permissions: normalizeStates(d.permissions),
  };
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [access, setAccess] = useState<Access | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    let currentUserId: string | null = null;

    const apply = async (nextUser: User | null) => {
      setUser(nextUser);
      if (!nextUser) {
        currentUserId = null;
        setAccess(null);
        setLoading(false);
        return;
      }
      // רענון טוקן שולח אירוע עם אותו משתמש – אין צורך לטעון שוב
      if (nextUser.id === currentUserId) return;
      currentUserId = nextUser.id;
      setLoading(true);
      const a = await loadAccess();
      if (active && currentUserId === nextUser.id) {
        setAccess(a);
        setLoading(false);
      }
    };

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      // לא מחכים בתוך ה-callback (המלצת Supabase למניעת תקיעות)
      setTimeout(() => {
        if (active) void apply(session?.user ?? null);
      }, 0);
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  const refresh = useCallback(async () => {
    setAccess(await loadAccess());
  }, []);

  const router = useRouter();
  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    router.replace('/login');
    router.refresh();
  }, [router]);

  const value = useMemo<AuthContextType>(() => {
    const stateOf = (permId: string): PermissionState => {
      if (!access) return 'hidden';
      if (access.isSuper) return 'allowed';
      return access.permissions[permId] ?? 'hidden';
    };
    const hasPermission = (permId: string) => stateOf(permId) === 'allowed';
    return {
      user,
      access,
      loading,
      inactive: !loading && !!user && !access,
      hasPermission,
      stateOf,
      requirePermission: (permId) => {
        if (hasPermission(permId)) return true;
        toast.denied(deniedMessage(permId));
        return false;
      },
      refresh,
      signOut,
    };
  }, [user, access, loading, refresh, signOut]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) throw new Error('useAuth must be used within an AuthProvider');
  return context;
}
