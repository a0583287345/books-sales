'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowDownUp, Check, ChevronDown, FilterX, Search, X } from 'lucide-react';
import { normalizeSearch } from '@/lib/format';

// =====================================================================
// סינון ומיון משותפים לרשימות: בחירה מרובה עם הקלדה, מיון, שמירת הסינון במכשיר
// ופס "סינון פעיל" שמראה שהרשימה מסוננת ומאפשר לנקות.
// =====================================================================

const PREFIX = 'filters:';

/**
 * מצב (אובייקט) שנשמר במכשיר לפי מפתח – למשל `orders:<שנה>`.
 * שדות שנוספו מאוחר יותר מקבלים את ברירת המחדל.
 */
export function useStoredState<T extends object>(key: string | null, initial: T) {
  const initialRef = useRef(initial);
  const [state, setState] = useState<T>(initial);

  useEffect(() => {
    if (!key) return;
    let next = initialRef.current;
    try {
      const raw = localStorage.getItem(PREFIX + key);
      if (raw) next = { ...initialRef.current, ...(JSON.parse(raw) as Partial<T>) };
    } catch {
      /* אין גישה לאחסון – ברירת מחדל */
    }
    setState(next);
  }, [key]);

  const update = useCallback(
    (patch: Partial<T> | ((prev: T) => T)) =>
      setState((prev) => {
        const next = typeof patch === 'function' ? patch(prev) : { ...prev, ...patch };
        if (key) {
          try {
            localStorage.setItem(PREFIX + key, JSON.stringify(next));
          } catch {
            /* לא נשמר – לא נורא */
          }
        }
        return next;
      }),
    [key]
  );

  const reset = useCallback(() => update(() => initialRef.current), [update]);
  return [state, update, reset] as const;
}

export type Option = { value: string; label: string; sub?: string };

/** בחירה מרובה: לחיצה פותחת רשימה עם תיבת הקלדה וסימון; ריק = הכול */
export function MultiSelect({
  label,
  options,
  value,
  onChange,
  emptyText,
}: {
  label: string;
  options: Option[];
  value: string[];
  onChange: (v: string[]) => void;
  /** מה מוצג כשלא נבחר כלום (ברירת מחדל: "הכול") */
  emptyText?: string;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  const shown = useMemo(() => {
    const n = normalizeSearch(q);
    return n ? options.filter((o) => normalizeSearch(`${o.label} ${o.sub ?? ''}`).includes(n)) : options;
  }, [options, q]);

  const selected = new Set(value);
  const active = value.length > 0;
  const toggle = (v: string) => onChange(selected.has(v) ? value.filter((x) => x !== v) : [...value, v]);
  const summary = !active
    ? emptyText ?? 'הכול'
    : value.length === 1
      ? options.find((o) => o.value === value[0])?.label ?? '1 נבחר'
      : `${value.length} נבחרו`;

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={`flex max-w-64 items-center gap-1.5 rounded-lg border px-3 py-2 text-sm ${
          active ? 'border-blue-500 bg-blue-50 text-blue-800 ring-1 ring-blue-300' : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
        }`}
      >
        <span className={active ? 'font-semibold' : 'text-slate-500'}>{label}:</span>
        <span className="truncate">{summary}</span>
        {active ? (
          <span
            role="button"
            tabIndex={0}
            aria-label={`ניקוי ${label}`}
            onClick={(e) => {
              e.stopPropagation();
              onChange([]);
            }}
            className="rounded p-0.5 hover:bg-blue-100"
          >
            <X className="h-3.5 w-3.5" />
          </span>
        ) : (
          <ChevronDown className="h-4 w-4 text-slate-400" />
        )}
      </button>
      {open && (
        <div className="absolute right-0 z-30 mt-1 w-72 rounded-xl border border-slate-200 bg-white p-2 shadow-lg">
          <div className="relative mb-1">
            <Search className="absolute right-2 top-2.5 h-4 w-4 text-slate-400" />
            <input
              autoFocus
              className="w-full rounded-lg border border-slate-300 py-2 pl-2 pr-8 text-sm"
              placeholder="הקלידו לחיפוש..."
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && shown.length === 1) toggle(shown[0].value);
                if (e.key === 'Escape') setOpen(false);
              }}
            />
          </div>
          <div className="flex items-center gap-2 px-1 py-1 text-xs">
            <button type="button" className="text-blue-700 hover:underline" onClick={() => onChange([...new Set([...value, ...shown.map((o) => o.value)])])}>
              סימון {q ? 'המסוננים' : 'הכול'}
            </button>
            <span className="text-slate-300">|</span>
            <button type="button" className="text-blue-700 hover:underline" onClick={() => onChange([])}>
              ניקוי
            </button>
          </div>
          <ul className="max-h-72 overflow-y-auto">
            {shown.map((o) => {
              const on = selected.has(o.value);
              return (
                <li key={o.value}>
                  <button
                    type="button"
                    onClick={() => toggle(o.value)}
                    className={`flex w-full items-center gap-2 rounded-lg px-2 py-2 text-right text-sm hover:bg-slate-50 ${on ? 'font-medium text-blue-800' : ''}`}
                  >
                    <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${on ? 'border-blue-600 bg-blue-600 text-white' : 'border-slate-300'}`}>
                      {on && <Check className="h-3 w-3" />}
                    </span>
                    <span className="flex-1">{o.label}</span>
                    {o.sub && <span className="text-xs text-slate-400">{o.sub}</span>}
                  </button>
                </li>
              );
            })}
            {shown.length === 0 && <li className="px-2 py-3 text-center text-sm text-slate-400">אין תוצאות</li>}
          </ul>
        </div>
      )}
    </div>
  );
}

/** מיון: בחירת שדה + כיוון */
export function SortSelect<K extends string>({
  options,
  value,
  desc,
  onChange,
}: {
  options: readonly (readonly [K, string])[];
  value: K;
  desc: boolean;
  onChange: (key: K, desc: boolean) => void;
}) {
  return (
    <div className="flex items-center rounded-lg border border-slate-300 bg-white text-sm">
      <span className="pr-3 text-slate-500">מיון:</span>
      <select className="bg-transparent px-2 py-2 focus:outline-none" value={value} onChange={(e) => onChange(e.target.value as K, desc)}>
        {options.map(([k, l]) => (
          <option key={k} value={k}>{l}</option>
        ))}
      </select>
      <button
        type="button"
        onClick={() => onChange(value, !desc)}
        className="flex items-center gap-1 border-r border-slate-200 px-2 py-2 text-slate-600 hover:bg-slate-50"
        title="החלפת כיוון המיון"
      >
        <ArrowDownUp className="h-4 w-4" />
        <span className="text-xs">{desc ? 'יורד' : 'עולה'}</span>
      </button>
    </div>
  );
}

/** תיבת חיפוש חופשי */
export function SearchBox({ value, onChange, placeholder, className = 'w-full sm:w-64' }: { value: string; onChange: (v: string) => void; placeholder: string; className?: string }) {
  return (
    <div className={`relative ${className}`}>
      <Search className="absolute right-2.5 top-2.5 h-4 w-4 text-slate-400" />
      <input
        className={`w-full rounded-lg border py-2 pl-7 pr-8 text-sm ${value ? 'border-blue-500 bg-blue-50 ring-1 ring-blue-300' : 'border-slate-300 bg-white'}`}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      {value && (
        <button type="button" onClick={() => onChange('')} className="absolute left-2 top-2.5 text-slate-400 hover:text-slate-700" aria-label="ניקוי החיפוש">
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}

/** פס מעל הרשימה: כמה מוצג, והדגשה כשיש סינון פעיל + ניקוי */
export function FilterStatus({
  active,
  shown,
  total,
  noun,
  onClear,
  children,
}: {
  active: boolean;
  shown: number;
  total: number;
  noun: string;
  onClear: () => void;
  children?: React.ReactNode;
}) {
  return (
    <div
      className={`mb-2 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg px-3 py-2 text-sm ${
        active ? 'bg-amber-50 text-amber-900 ring-1 ring-amber-200' : 'text-slate-500'
      }`}
    >
      {active ? (
        <>
          <span className="font-semibold">סינון פעיל</span>
          <span>
            מוצגות {shown} מתוך {total} {noun}
          </span>
        </>
      ) : (
        <span>
          {shown} {noun}
        </span>
      )}
      {children}
      {active && (
        <button type="button" onClick={onClear} className="mr-auto flex items-center gap-1 rounded-lg bg-white px-2 py-1 text-amber-900 ring-1 ring-amber-300 hover:bg-amber-100">
          <FilterX className="h-4 w-4" /> ניקוי הסינון
        </button>
      )}
    </div>
  );
}

/** ערך נבחר ברשימה (ריק = הכול) */
export const matches = (list: string[], v: string) => list.length === 0 || list.includes(v);

/** השוואה בעברית למיון */
export const heCompare = (a: string, b: string) => a.localeCompare(b, 'he', { numeric: true });
