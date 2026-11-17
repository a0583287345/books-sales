'use client';

import { Loader2, X } from 'lucide-react';

// =====================================================================
// רכיבי ממשק משותפים: חלון, שדה, כפתורים, כותרת מסך, טבלה ריקה
// =====================================================================

export const inputClass =
  'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200 disabled:bg-slate-100 disabled:text-slate-500';

export function Modal({
  title,
  onClose,
  children,
  footer,
  size = 'lg',
}: {
  title: React.ReactNode;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
  size?: 'md' | 'lg' | 'xl';
}) {
  const width = { md: 'max-w-xl', lg: 'max-w-3xl', xl: 'max-w-6xl' }[size];
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-2 sm:p-6">
      <div className={`w-full ${width} rounded-2xl bg-slate-50 shadow-xl`}>
        <div className="flex items-center justify-between rounded-t-2xl border-b bg-white px-4 py-3">
          <h2 className="text-lg font-bold">{title}</h2>
          <button type="button" onClick={onClose} className="rounded p-1 hover:bg-slate-100" aria-label="סגירה">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="space-y-4 p-4">{children}</div>
        {footer && (
          <div className="sticky bottom-0 flex flex-wrap gap-2 rounded-b-2xl border-t bg-white px-4 py-3">{footer}</div>
        )}
      </div>
    </div>
  );
}

export function Field({
  label,
  children,
  className = '',
  hint,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
  hint?: string;
}) {
  return (
    <label className={`block ${className}`}>
      <span className="mb-1 block text-sm font-medium text-slate-700">{label}</span>
      {children}
      {hint && <span className="mt-0.5 block text-xs text-slate-400">{hint}</span>}
    </label>
  );
}

export function Button({
  children,
  variant = 'primary',
  loading,
  className = '',
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'success' | 'secondary' | 'danger' | 'ghost';
  loading?: boolean;
}) {
  const styles = {
    primary: 'bg-blue-600 text-white hover:bg-blue-700',
    success: 'bg-emerald-600 text-white hover:bg-emerald-700',
    secondary: 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-50',
    danger: 'border border-red-200 bg-white text-red-600 hover:bg-red-50',
    ghost: 'text-slate-600 hover:bg-slate-100',
  }[variant];
  return (
    <button
      type="button"
      {...props}
      disabled={props.disabled || loading}
      className={`inline-flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50 ${styles} ${className}`}
    >
      {loading && <Loader2 className="h-4 w-4 animate-spin" />}
      {children}
    </button>
  );
}

export function PageHeader({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-center gap-2">
      <h1 className="flex-1 text-2xl font-bold">{title}</h1>
      {children}
    </div>
  );
}

export function Spinner() {
  return <Loader2 className="mx-auto mt-10 h-6 w-6 animate-spin text-slate-400" />;
}

export function EmptyState({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-slate-300 p-10 text-center text-slate-400">{children}</div>
  );
}

/** הודעה כשהשנה הנבחרת סגורה */
export function ClosedYearNotice() {
  return (
    <p className="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
      שנת הלימודים הזו סגורה – הנתונים לקריאה בלבד. אפשר לפתוח אותה מחדש במסך &quot;שנות לימודים&quot;.
    </p>
  );
}
