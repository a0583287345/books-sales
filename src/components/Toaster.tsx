'use client';

import { useEffect, useState } from 'react';
import { CheckCircle2, AlertTriangle, Info, Lock, X, XCircle } from 'lucide-react';

// =====================================================================
// הודעות קופצות קטנות בפינת המסך (במקום alert של הדפדפן)
// שימוש מכל מקום בקוד:  toast.success('נשמר')  /  toast.error('שגיאה')
// =====================================================================

type ToastType = 'success' | 'error' | 'info' | 'warning' | 'denied';

type ToastItem = {
  id: number;
  type: ToastType;
  message: string;
};

type Listener = (items: ToastItem[]) => void;

let items: ToastItem[] = [];
let nextId = 1;
const listeners = new Set<Listener>();

function emit() {
  listeners.forEach((l) => l(items));
}

function remove(id: number) {
  items = items.filter((t) => t.id !== id);
  emit();
}

function push(type: ToastType, message: string) {
  // לא מציגים פעמיים את אותה הודעה בדיוק אם היא עדיין על המסך
  if (items.some((t) => t.type === type && t.message === message)) return;

  const id = nextId++;
  items = [...items.slice(-4), { id, type, message }];
  emit();

  const duration = type === 'error' ? 6000 : 3500;
  setTimeout(() => remove(id), duration);
}

export const toast = {
  success: (message: string) => push('success', message),
  error: (message: string) => push('error', message),
  info: (message: string) => push('info', message),
  warning: (message: string) => push('warning', message),
  denied: (message: string) => push('denied', message),
};

const STYLES: Record<ToastType, { box: string; icon: React.ReactNode }> = {
  success: {
    box: 'bg-emerald-50 border-emerald-200 text-emerald-800',
    icon: <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />,
  },
  error: {
    box: 'bg-red-50 border-red-200 text-red-800',
    icon: <XCircle className="w-5 h-5 text-red-600 shrink-0" />,
  },
  info: {
    box: 'bg-blue-50 border-blue-200 text-blue-800',
    icon: <Info className="w-5 h-5 text-blue-600 shrink-0" />,
  },
  warning: {
    box: 'bg-amber-50 border-amber-200 text-amber-800',
    icon: <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0" />,
  },
  denied: {
    box: 'bg-slate-800 border-slate-700 text-white',
    icon: <Lock className="w-5 h-5 text-amber-300 shrink-0" />,
  },
};

export function Toaster() {
  const [list, setList] = useState<ToastItem[]>(items);

  useEffect(() => {
    listeners.add(setList);
    return () => {
      listeners.delete(setList);
    };
  }, []);

  if (list.length === 0) return null;

  return (
    <div
      dir="rtl"
      aria-live="polite"
      className="fixed bottom-4 left-4 right-4 sm:right-auto sm:w-96 z-[100] flex flex-col gap-2 pointer-events-none"
    >
      {list.map((t) => (
        <div
          key={t.id}
          role={t.type === 'error' ? 'alert' : 'status'}
          className={`pointer-events-auto flex items-start gap-3 border rounded-xl shadow-lg px-4 py-3 text-sm font-medium animate-in fade-in slide-in-from-bottom-2 ${STYLES[t.type].box}`}
        >
          {STYLES[t.type].icon}
          <span className="flex-1 leading-snug whitespace-pre-line">{t.message}</span>
          <button
            type="button"
            onClick={() => remove(t.id)}
            className="opacity-60 hover:opacity-100 transition"
            aria-label="סגירה"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      ))}
    </div>
  );
}
