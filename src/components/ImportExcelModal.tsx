'use client';

import { useRef, useState } from 'react';
import { CheckCircle2, Download, FileUp, Loader2, XCircle } from 'lucide-react';
import { Button, Modal } from '@/components/ui';
import { useAuth } from '@/components/AuthContext';
import { Protect } from '@/components/Protect';
import { toast } from '@/components/Toaster';
import { exportTemplate, normalizeHeader, readExcel } from '@/lib/excel';

// =====================================================================
// ייבוא מאקסל – חלון אחד לכל מסך:
// 1. הורדת תבנית (אותן כותרות כמו בייצוא)  2. בחירת קובץ  3. תצוגה מקדימה ובדיקה  4. ייבוא שורה-שורה + דוח תוצאות
// כל מסך מגדיר את העמודות ואת פעולת השמירה (importRow) – עם אותן הרשאות ובדיקות של המסך.
// =====================================================================

/** כפתור "ייבוא מאקסל": מוצג רק למי שיש לו הרשאת עריכה במסך; הרשאת הייבוא עצמה – מותר/חסום/מוסתר */
export function ImportButton({ editPerm, onClick }: { editPerm: string; onClick: () => void }) {
  const { hasPermission } = useAuth();
  if (!hasPermission(editPerm)) return null;
  return (
    <Protect permId="import_excel">
      <Button variant="secondary" onClick={onClick}>
        <FileUp className="h-4 w-4" /> ייבוא מאקסל
      </Button>
    </Protect>
  );
}

export type ImportColumn = {
  header: string;
  /** שמות נוספים שמתקבלים לאותה עמודה */
  aliases?: string[];
  required?: boolean;
  /** לתבנית – ערך לדוגמה */
  example?: string | number;
};

export type ImportRowResult = { status: 'created' | 'updated' | 'skipped' | 'error'; message?: string };

type Props = {
  title: string;
  columns: ImportColumn[];
  /** הסבר קצר: איך מזהים רשומה קיימת (מה מתעדכן ומה נוצר) */
  matchHint: string;
  templateName: string;
  /** שמירת שורה אחת. row – לפי כותרת העמודה הראשית */
  importRow: (row: Record<string, unknown>, index: number) => Promise<ImportRowResult>;
  onClose: () => void;
  onDone: () => void;
};

type Parsed = { rows: Record<string, unknown>[]; missingRequired: string[]; unknownHeaders: string[] };

export function ImportExcelModal({ title, columns, matchHint, templateName, importRow, onClose, onDone }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [parsed, setParsed] = useState<Parsed | null>(null);
  const [fileName, setFileName] = useState('');
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [results, setResults] = useState<ImportRowResult[] | null>(null);

  const load = async (file: File) => {
    setResults(null);
    setFileName(file.name);
    try {
      const { headers, rows } = await readExcel(file);
      // מיפוי כותרות הקובץ לכותרות הראשיות
      const map = new Map<string, string>();
      for (const c of columns) for (const name of [c.header, ...(c.aliases ?? [])]) map.set(normalizeHeader(name), c.header);
      const mapped = rows.map((r) => {
        const out: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(r)) {
          const key = map.get(k);
          if (key) out[key] = v;
        }
        return out;
      });
      const present = new Set(headers.map((h) => map.get(h)).filter(Boolean));
      setParsed({
        rows: mapped,
        missingRequired: columns.filter((c) => c.required && !present.has(c.header)).map((c) => c.header),
        unknownHeaders: headers.filter((h) => h && !map.has(h)),
      });
    } catch {
      toast.error('לא הצלחתי לקרוא את הקובץ. יש לשמור אותו כ-xlsx');
    }
  };

  const run = async () => {
    if (!parsed) return;
    setRunning(true);
    const out: ImportRowResult[] = [];
    for (let i = 0; i < parsed.rows.length; i++) {
      const row = parsed.rows[i];
      const missing = columns.filter((c) => c.required && (row[c.header] === null || row[c.header] === undefined || String(row[c.header]).trim() === ''));
      if (missing.length) {
        out.push({ status: 'error', message: `חסר: ${missing.map((m) => m.header).join(', ')}` });
      } else {
        try {
          out.push(await importRow(row, i));
        } catch (e) {
          out.push({ status: 'error', message: (e as Error).message });
        }
      }
      setProgress(i + 1);
    }
    setResults(out);
    setRunning(false);
    const created = out.filter((r) => r.status === 'created').length;
    const updated = out.filter((r) => r.status === 'updated').length;
    const errors = out.filter((r) => r.status === 'error').length;
    if (errors) toast.warning(`יובאו ${created + updated} שורות, ${errors} שורות עם שגיאה`);
    else toast.success(`הייבוא הסתיים: ${created} חדשות, ${updated} עודכנו`);
    onDone();
  };

  const counts = results && {
    created: results.filter((r) => r.status === 'created').length,
    updated: results.filter((r) => r.status === 'updated').length,
    skipped: results.filter((r) => r.status === 'skipped').length,
    error: results.filter((r) => r.status === 'error').length,
  };
  const preview = parsed?.rows.slice(0, 8) ?? [];

  return (
    <Modal
      title={title}
      onClose={running ? () => undefined : onClose}
      size="xl"
      footer={
        results ? (
          <Button onClick={onClose}>סגירה</Button>
        ) : (
          <>
            <Button variant="success" onClick={run} loading={running} disabled={!parsed || !parsed.rows.length || parsed.missingRequired.length > 0}>
              <FileUp className="h-4 w-4" /> ייבוא {parsed ? `${parsed.rows.length} שורות` : ''}
            </Button>
            <Button variant="secondary" onClick={onClose} disabled={running}>ביטול</Button>
          </>
        )
      }
    >
      <div className="space-y-3 rounded-xl bg-white p-4 text-sm">
        <ol className="list-inside list-decimal space-y-1 text-slate-600">
          <li>
            מורידים תבנית (או משתמשים בקובץ שיוצא מהמסך הזה – אותן כותרות).{' '}
            <button
              type="button"
              className="inline-flex items-center gap-1 text-blue-700 underline"
              onClick={() => exportTemplate(templateName, columns.map((c) => c.header), [columns.map((c) => c.example ?? '')])}
            >
              <Download className="h-3.5 w-3.5" /> הורדת תבנית
            </button>
          </li>
          <li>ממלאים שורה לכל רשומה. עמודות חובה: {columns.filter((c) => c.required).map((c) => c.header).join(', ') || 'אין'}.</li>
          <li>{matchHint}</li>
        </ol>

        <div className="flex flex-wrap items-center gap-3">
          <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={(e) => e.target.files?.[0] && load(e.target.files[0])} />
          <Button variant="secondary" onClick={() => fileRef.current?.click()} disabled={running}>
            <FileUp className="h-4 w-4" /> בחירת קובץ אקסל
          </Button>
          {fileName && <span className="text-slate-600">{fileName}</span>}
        </div>

        {parsed && (
          <>
            {parsed.missingRequired.length > 0 && (
              <p className="rounded-lg bg-red-50 px-3 py-2 text-red-700">חסרות בקובץ עמודות חובה: {parsed.missingRequired.join(', ')}</p>
            )}
            {parsed.unknownHeaders.length > 0 && (
              <p className="rounded-lg bg-amber-50 px-3 py-2 text-amber-800">עמודות שלא מוכרות ולא ייובאו: {parsed.unknownHeaders.join(', ')}</p>
            )}
            <p className="text-slate-600">
              נמצאו <b>{parsed.rows.length}</b> שורות. תצוגה מקדימה ({preview.length} ראשונות):
            </p>
            <div className="max-h-64 overflow-auto rounded-lg border border-slate-200">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-slate-50">
                  <tr>
                    <th className="px-2 py-1 text-right">#</th>
                    {columns.map((c) => (
                      <th key={c.header} className="whitespace-nowrap px-2 py-1 text-right">{c.header}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {preview.map((r, i) => (
                    <tr key={i}>
                      <td className="px-2 py-1 text-slate-400">{i + 2}</td>
                      {columns.map((c) => (
                        <td key={c.header} className="whitespace-nowrap px-2 py-1">
                          {r[c.header] instanceof Date ? (r[c.header] as Date).toLocaleDateString('he-IL') : String(r[c.header] ?? '')}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        {running && parsed && (
          <p className="flex items-center gap-2 text-blue-700">
            <Loader2 className="h-4 w-4 animate-spin" /> מייבא {progress} מתוך {parsed.rows.length}...
          </p>
        )}

        {results && counts && (
          <div className="space-y-2">
            <p className="flex flex-wrap gap-4 font-medium">
              <span className="text-emerald-700"><CheckCircle2 className="ml-1 inline h-4 w-4" />{counts.created} חדשות</span>
              <span className="text-blue-700">{counts.updated} עודכנו</span>
              {counts.skipped > 0 && <span className="text-slate-500">{counts.skipped} דולגו</span>}
              {counts.error > 0 && <span className="text-red-600"><XCircle className="ml-1 inline h-4 w-4" />{counts.error} שגיאות</span>}
            </p>
            {counts.error + counts.skipped > 0 && (
              <ul className="max-h-48 space-y-0.5 overflow-auto rounded-lg bg-slate-50 p-2 text-xs">
                {results.map((r, i) =>
                  r.status === 'error' || r.status === 'skipped' ? (
                    <li key={i} className={r.status === 'error' ? 'text-red-700' : 'text-slate-500'}>
                      שורה {i + 2}: {r.message}
                    </li>
                  ) : null
                )}
              </ul>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}
