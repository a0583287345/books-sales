'use client';

import { useRef, useState } from 'react';
import { CalendarDays } from 'lucide-react';

type Props = {
  /** 'YYYY-MM-DD' או ריק */
  value: string;
  onChange: (iso: string) => void;
  disabled?: boolean;
  required?: boolean;
  min?: string;
  max?: string;
  className?: string;
  'aria-label'?: string;
};

/** 'YYYY-MM-DD' → 'DD/MM/YYYY' */
function isoToText(iso: string): string {
  if (!/^\d{4}-\d{2}-\d{2}/.test(iso)) return '';
  const [y, m, d] = iso.slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
}

/** 'DD/MM/YYYY' (או D/M/YYYY) → 'YYYY-MM-DD', או null אם לא תקין */
function textToIso(text: string): string | null {
  const match = text.trim().match(/^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{4})$/);
  if (!match) return null;
  const d = Number(match[1]);
  const m = Number(match[2]);
  const y = Number(match[3]);
  const date = new Date(y, m - 1, d);
  if (date.getFullYear() !== y || date.getMonth() !== m - 1 || date.getDate() !== d) return null;
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/** הוספת "/" אוטומטית תוך כדי הקלדה: 15112026 → 15/11/2026 */
function autoFormat(raw: string): string {
  if (/[/.\-]/.test(raw)) return raw.slice(0, 10);
  const digits = raw.replace(/\D/g, '').slice(0, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
}

/**
 * שדה תאריך בפורמט ישראלי – יום/חודש/שנה (DD/MM/YYYY), ללא תלות בשפת הדפדפן.
 * אפשר להקליד, או לבחור מלוח שנה בכפתור.
 */
export default function DateInput({
  value,
  onChange,
  disabled,
  required,
  min,
  max,
  className = '',
  ...rest
}: Props) {
  const pickerRef = useRef<HTMLInputElement>(null);
  const [text, setText] = useState(isoToText(value));
  const [prevValue, setPrevValue] = useState(value);
  const [invalid, setInvalid] = useState(false);

  // הערך השתנה מבחוץ – מעדכנים את הטקסט המוצג
  if (value !== prevValue) {
    setPrevValue(value);
    setText(isoToText(value));
    setInvalid(false);
  }

  const commit = (t: string) => {
    if (!t.trim()) {
      setInvalid(false);
      if (value) onChange('');
      return;
    }
    const iso = textToIso(t);
    const outOfRange = !!iso && ((min && iso < min) || (max && iso > max));
    if (!iso || outOfRange) {
      setInvalid(true);
      return;
    }
    setInvalid(false);
    setText(isoToText(iso));
    if (iso !== value) onChange(iso);
  };

  return (
    <div className={`relative inline-flex items-center w-full ${className}`}>
      <input
        type="text"
        inputMode="numeric"
        dir="ltr"
        placeholder="DD/MM/YYYY"
        value={text}
        required={required}
        disabled={disabled}
        aria-label={rest['aria-label']}
        aria-invalid={invalid}
        onChange={(e) => {
          const t = autoFormat(e.target.value);
          setText(t);
          // תאריך מלא ותקין – מעדכנים מיד
          const iso = textToIso(t);
          if (iso && t.length >= 8) commit(t);
          else setInvalid(false);
        }}
        onBlur={() => commit(text)}
        className={`w-full pl-9 pr-3 py-2.5 bg-white border rounded-xl text-sm text-right focus:outline-none focus:ring-2 focus:ring-blue-500/30 disabled:bg-slate-100 ${
          invalid ? 'border-red-400 focus:ring-red-300' : 'border-slate-300'
        }`}
      />
      <button
        type="button"
        disabled={disabled}
        onClick={() => {
          const el = pickerRef.current;
          if (!el) return;
          if (typeof el.showPicker === 'function') el.showPicker();
          else el.click();
        }}
        className="absolute left-2 p-1 text-slate-400 hover:text-blue-600 disabled:opacity-50"
        title="בחירה מלוח שנה"
        tabIndex={-1}
      >
        <CalendarDays className="w-4 h-4" />
      </button>
      {/* בורר התאריכים של הדפדפן – מוסתר, נפתח מהכפתור */}
      <input
        ref={pickerRef}
        type="date"
        value={value}
        min={min}
        max={max}
        onChange={(e) => onChange(e.target.value)}
        className="absolute left-0 bottom-0 w-0 h-0 opacity-0 pointer-events-none"
        tabIndex={-1}
        aria-hidden="true"
      />
      {invalid && <span className="absolute -bottom-4 right-1 text-[10px] text-red-500">תאריך לא תקין</span>}
    </div>
  );
}
