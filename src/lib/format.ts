// עיצוב תצוגה: סכומים, תאריכים, מספרים

const ils = new Intl.NumberFormat('he-IL', { style: 'currency', currency: 'ILS', maximumFractionDigits: 2 });

export function money(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  return ils.format(value);
}

/** 'YYYY-MM-DD' → 'DD/MM/YYYY' */
export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '';
  const [y, m, d] = iso.slice(0, 10).split('-');
  return d && m && y ? `${d}/${m}/${y}` : '';
}

/** תאריך היום בפורמט 'YYYY-MM-DD' (שעון מקומי) */
export function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** מחרוזת ריקה → null (לשמירה במסד) */
export function nullIfEmpty(v: string | null | undefined): string | null {
  const t = (v ?? '').trim();
  return t ? t : null;
}

/** מספר מטקסט, או null */
export function toNumber(v: string | number | null | undefined): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : Number(String(v).replace(/[^\d.\-]/g, ''));
  return Number.isFinite(n) ? n : null;
}

/** השוואת טקסט לחיפוש: בלי רווחים כפולים, בלי גרשיים */
export function normalizeSearch(s: string): string {
  return s.replace(/["'׳״]/g, '').replace(/\s+/g, ' ').trim().toLowerCase();
}
