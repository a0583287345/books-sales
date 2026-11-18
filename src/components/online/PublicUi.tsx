'use client';

import { BookOpen, Lock, Phone } from 'lucide-react';
import { formatDate } from '@/lib/format';
import { STATE_MESSAGES, type LinkState } from '@/lib/online';

// =====================================================================
// רכיבים משותפים לדפים הציבוריים של ההזמנה בקישור (/o/<קוד>) – מותאמים לטלפון
// =====================================================================

export const publicInput =
  'w-full rounded-xl border border-slate-300 bg-white px-3 py-3 text-base focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200';

export function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <div className={`rounded-2xl bg-white p-4 shadow-sm ${className}`}>{children}</div>;
}

export function PublicHeader({
  institution,
  year,
  subtitle,
}: {
  institution?: string;
  year?: string;
  subtitle?: React.ReactNode;
}) {
  return (
    <div className="mb-4 text-center">
      <BookOpen className="mx-auto mb-2 h-9 w-9 text-blue-600" />
      <h1 className="text-2xl font-bold">הזמנת ספרי לימוד</h1>
      {institution && (
        <p className="mt-1 text-lg text-slate-700">
          {institution}
          {year && ` · ${year}`}
        </p>
      )}
      {subtitle}
    </div>
  );
}

export function Contact({ contact }: { contact: string | null | undefined }) {
  if (!contact) return null;
  return (
    <div className="mt-4 flex gap-2 rounded-xl bg-slate-50 p-3 text-right text-sm text-slate-700">
      <Phone className="mt-0.5 h-4 w-4 shrink-0 text-slate-500" />
      <span className="whitespace-pre-line">{contact}</span>
    </div>
  );
}

export function ClosedNotice({
  state,
  institution,
  year,
  openDate,
  contact,
}: {
  state: Exclude<LinkState, 'ok'>;
  institution?: string;
  year?: string;
  openDate?: string | null;
  contact?: string | null;
}) {
  return (
    <>
      <PublicHeader institution={institution} year={year} />
      <Card className="text-center">
        <Lock className="mx-auto mb-2 h-8 w-8 text-slate-400" />
        <p className="text-lg">{STATE_MESSAGES[state]}</p>
        {state === 'not_open' && openDate && <p className="mt-1 text-slate-600">ההזמנה תיפתח ב-{formatDate(openDate)}</p>}
        <p className="mt-2 text-sm text-slate-500">לשאלות ולהזמנה – אפשר לפנות למשרד.</p>
        <Contact contact={contact} />
      </Card>
    </>
  );
}

export function TextBlock({ title, text }: { title: string; text: string | null | undefined }) {
  if (!text?.trim()) return null;
  return (
    <div className="mt-3 rounded-xl bg-blue-50 p-3 text-right text-sm">
      <div className="font-bold text-blue-900">{title}</div>
      <div className="mt-1 whitespace-pre-line text-blue-950">{text}</div>
    </div>
  );
}

export function SumRow({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className={`flex justify-between ${bold ? 'text-lg font-bold' : 'text-slate-600'}`}>
      <span>{label}</span>
      <span>{value}</span>
    </div>
  );
}

export function Choice({ checked, onClick, children }: { checked: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-xl border px-3 py-3 text-right ${checked ? 'border-blue-600 bg-blue-50 ring-2 ring-blue-200' : 'border-slate-300 bg-white'}`}
    >
      {children}
    </button>
  );
}

export function PublicInput({
  label,
  value,
  onChange,
  error,
  ...rest
}: { label: string; value: string; onChange: (v: string) => void; error?: string } & Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  'value' | 'onChange'
>) {
  return (
    <label className="block">
      <span className="mb-1 block font-medium">{label}</span>
      <input {...rest} className={`${publicInput} ${error ? 'border-red-400' : ''}`} value={value} onChange={(e) => onChange(e.target.value)} />
      {error && <span className="mt-1 block text-sm text-red-600">{error}</span>}
    </label>
  );
}

/** כפתור ראשי קבוע בתחתית המסך */
export function BottomBar({ children, error }: { children: React.ReactNode; error?: string | null }) {
  return (
    <div className="fixed inset-x-0 bottom-0 border-t bg-white/95 px-4 py-3 shadow-lg backdrop-blur">
      <div className="mx-auto max-w-xl">
        {error && <p className="mb-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        {children}
      </div>
    </div>
  );
}

export const bigButton =
  'flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 py-3.5 text-lg font-bold text-white hover:bg-blue-700 disabled:opacity-60';
