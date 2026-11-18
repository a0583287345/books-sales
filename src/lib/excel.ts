// ייצוא וייבוא אקסל. הספרייה נטענת רק בלחיצה – לא מכבידה על המסכים.

export type Sheet = { name: string; rows: Record<string, string | number | null | undefined>[] };

export async function exportToExcel(fileName: string, sheets: Sheet[]) {
  const XLSX = await import('xlsx');
  const wb = XLSX.utils.book_new();
  wb.Workbook = { Views: [{ RTL: true }] };
  for (const s of sheets) {
    const ws = XLSX.utils.json_to_sheet(s.rows);
    const headers = Object.keys(s.rows[0] ?? {});
    ws['!cols'] = headers.map((h) => ({
      wch: Math.min(50, Math.max(h.length, ...s.rows.map((r) => String(r[h] ?? '').length)) + 2),
    }));
    XLSX.utils.book_append_sheet(wb, ws, safeSheetName(s.name));
  }
  XLSX.writeFile(wb, `${safeFileName(fileName)}.xlsx`);
}

/** קובץ תבנית לייבוא: שורת כותרות + שורות דוגמה (לא חובה) */
export async function exportTemplate(fileName: string, headers: string[], examples: (string | number)[][] = []) {
  const XLSX = await import('xlsx');
  const wb = XLSX.utils.book_new();
  wb.Workbook = { Views: [{ RTL: true }] };
  const ws = XLSX.utils.aoa_to_sheet([headers, ...examples]);
  ws['!cols'] = headers.map((h) => ({ wch: Math.max(h.length + 4, 14) }));
  XLSX.utils.book_append_sheet(wb, ws, 'ייבוא');
  XLSX.writeFile(wb, `${safeFileName(fileName)}.xlsx`);
}

/** קריאת הגיליון הראשון: מערך שורות לפי שם העמודה (הכותרות מנורמלות) */
export async function readExcel(file: File): Promise<{ headers: string[]; rows: Record<string, unknown>[] }> {
  const XLSX = await import('xlsx');
  const wb = XLSX.read(await file.arrayBuffer(), { cellDates: true });
  const ws = wb.Sheets[wb.SheetNames[0]];
  if (!ws) return { headers: [], rows: [] };
  const matrix = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: null, blankrows: false });
  const [headerRow, ...body] = matrix;
  const headers = (headerRow ?? []).map((h) => normalizeHeader(String(h ?? '')));
  const rows = body
    .filter((r) => r.some((c) => c !== null && String(c).trim() !== ''))
    .map((r) => Object.fromEntries(headers.map((h, i) => [h, r[i] ?? null])));
  return { headers, rows };
}

/** השוואת כותרות: בלי רווחים כפולים, גרש/גרשיים אחידים */
export function normalizeHeader(h: string): string {
  return h.replace(/[״"]/g, '"').replace(/[׳']/g, "'").replace(/\s+/g, ' ').trim();
}

function safeSheetName(s: string) {
  return s.replace(/[\\/?*[\]:]/g, ' ').slice(0, 31) || 'גיליון';
}
function safeFileName(s: string) {
  return s.replace(/[\\/:*?"<>|]/g, ' ');
}

// ---------- המרת ערכים מתאים באקסל ----------

export function cellText(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  if (v instanceof Date) return isoFromDate(v);
  const t = String(v).trim();
  return t ? t : null;
}

export function cellNumber(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  const n = Number(String(v).replace(/[₪,\s]/g, ''));
  return Number.isFinite(n) ? n : null;
}

function isoFromDate(d: Date): string {
  // אקסל שומר תאריכים בחצות מקומית – לוקחים את הרכיבים המקומיים
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** תאריך: אובייקט תאריך מאקסל, DD/MM/YYYY, או YYYY-MM-DD. מחזיר undefined אם לא תקין */
export function cellDate(v: unknown): string | null | undefined {
  if (v === null || v === undefined || v === '') return null;
  if (v instanceof Date) return isoFromDate(v);
  const t = String(v).trim();
  let m = t.match(/^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{2,4})$/);
  if (m) {
    const y = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
    const d = new Date(y, Number(m[2]) - 1, Number(m[1]));
    return d.getDate() === Number(m[1]) ? isoFromDate(d) : undefined;
  }
  m = t.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  return undefined;
}

/** כן/לא: "כן", "לא", "חובה", "רשות", 1/0, true/false, "פעיל" */
export function cellBool(v: unknown): boolean | null {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'boolean') return v;
  if (typeof v === 'number') return v !== 0;
  const t = String(v).trim().toLowerCase();
  if (['כן', 'חובה', 'פעיל', 'v', 'true', 'yes', '1', 'x'].includes(t)) return true;
  if (['לא', 'רשות', 'לא פעיל', 'false', 'no', '0'].includes(t)) return false;
  return null;
}
