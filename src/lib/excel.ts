// ייצוא לאקסל (גיליון אחד או כמה), מימין לשמאל. נטען רק בלחיצה – לא מכביד על המסכים.

export type Sheet = { name: string; rows: Record<string, string | number | null | undefined>[] };

export async function exportToExcel(fileName: string, sheets: Sheet[]) {
  const XLSX = await import('xlsx');
  const wb = XLSX.utils.book_new();
  wb.Workbook = { Views: [{ RTL: true }] };
  for (const s of sheets) {
    const ws = XLSX.utils.json_to_sheet(s.rows);
    // רוחב עמודות לפי התוכן
    const headers = Object.keys(s.rows[0] ?? {});
    ws['!cols'] = headers.map((h) => ({
      wch: Math.min(50, Math.max(h.length, ...s.rows.map((r) => String(r[h] ?? '').length)) + 2),
    }));
    // שם גיליון: עד 31 תווים, בלי תווים אסורים
    XLSX.utils.book_append_sheet(wb, ws, s.name.replace(/[\\/?*[\]:]/g, ' ').slice(0, 31) || 'גיליון');
  }
  XLSX.writeFile(wb, `${fileName.replace(/[\\/:*?"<>|]/g, ' ')}.xlsx`);
}
