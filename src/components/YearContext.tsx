'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';

// =====================================================================
// שנת הלימודים שנבחרה – משותפת לכל המסכים. נשמרת במכשיר (localStorage).
// ברירת מחדל: השנה המסומנת "נוכחית", אחרת האחרונה שנפתחה.
// =====================================================================

export type AcademicYear = {
  id: string;
  name: string;
  start_date: string | null;
  end_date: string | null;
  status: 'planning' | 'active' | 'closed';
  is_current: boolean;
  notes: string | null;
};

type YearContextType = {
  years: AcademicYear[];
  year: AcademicYear | null;
  setYearId: (id: string) => void;
  reloadYears: () => Promise<void>;
  loading: boolean;
  /** השנה הנבחרת סגורה – לקריאה בלבד */
  readOnly: boolean;
};

const YearContext = createContext<YearContextType | undefined>(undefined);
const STORAGE_KEY = 'books-sales:year';

function readStored(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

async function fetchYears(): Promise<AcademicYear[]> {
  const { data } = await supabase
    .from('academic_years')
    .select('id, name, start_date, end_date, status, is_current, notes')
    .order('start_date', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false });
  return (data ?? []) as AcademicYear[];
}

export function YearProvider({ children }: { children: React.ReactNode }) {
  const [years, setYears] = useState<AcademicYear[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const apply = useCallback((list: AcademicYear[]) => {
    setYears(list);
    setSelectedId((cur) => {
      const wanted = cur ?? readStored();
      if (wanted && list.some((y) => y.id === wanted)) return wanted;
      return (list.find((y) => y.is_current) ?? list[0])?.id ?? null;
    });
    setLoading(false);
  }, []);

  const reloadYears = useCallback(async () => apply(await fetchYears()), [apply]);

  useEffect(() => {
    let cancelled = false;
    void fetchYears().then((list) => {
      if (!cancelled) apply(list);
    });
    return () => {
      cancelled = true;
    };
  }, [apply]);

  const setYearId = useCallback((id: string) => {
    setSelectedId(id);
    try {
      localStorage.setItem(STORAGE_KEY, id);
    } catch {
      /* מצב פרטי – לא נורא */
    }
  }, []);

  const value = useMemo(() => {
    const year = years.find((y) => y.id === selectedId) ?? null;
    return { years, year, setYearId, reloadYears, loading, readOnly: year?.status === 'closed' };
  }, [years, selectedId, setYearId, reloadYears, loading]);

  return <YearContext.Provider value={value}>{children}</YearContext.Provider>;
}

export function useYear() {
  const ctx = useContext(YearContext);
  if (!ctx) throw new Error('useYear must be used within a YearProvider');
  return ctx;
}

export const YEAR_STATUS_LABELS: Record<AcademicYear['status'], string> = {
  planning: 'בהכנה',
  active: 'פעילה',
  closed: 'סגורה',
};
