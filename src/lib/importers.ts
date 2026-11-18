import { supabase } from '@/lib/supabase';
import { dbErrorMessage } from '@/lib/dbErrors';
import { cellBool, cellDate, cellNumber, cellText } from '@/lib/excel';
import { normalizeSearch } from '@/lib/format';
import type { ImportColumn, ImportRowResult } from '@/components/ImportExcelModal';
import type { Book, Supplier } from '@/lib/entities';

// =====================================================================
// הגדרות ייבוא לכל מסך: עמודות (זהות לכותרות הייצוא), זיהוי רשומה קיימת ושמירה.
// השמירה עוברת דרך אותן טבלאות/פונקציות של המסך – אותן הרשאות ואותן בדיקות במסד.
// =====================================================================

export type Importer = {
  columns: ImportColumn[];
  matchHint: string;
  importRow: (row: Record<string, unknown>) => Promise<ImportRowResult>;
};

const fail = (message: string): ImportRowResult => ({ status: 'error', message });
const digits = (s: string | null) => (s ?? '').replace(/\D/g, '');
const norm = (s: string | null) => normalizeSearch(s ?? '');

function dateOrFail(v: unknown, label: string): string | null {
  const d = cellDate(v);
  if (d === undefined) throw new Error(`${label}: תאריך לא תקין (צריך DD/MM/YYYY)`);
  return d;
}

// ---------------------------------------------------------------------
// ספקים – מזהים לפי מספר ספק, ואם אין – לפי שם
// ---------------------------------------------------------------------
export function suppliersImporter(existing: Supplier[]): Importer {
  const byNumber = new Map(existing.map((s) => [s.number, s]));
  const byName = new Map(existing.map((s) => [norm(s.name), s]));
  return {
    columns: [
      { header: 'מספר ספק', example: '' },
      { header: 'שם', aliases: ['שם הספק'], required: true, example: 'ספרי אור' },
      { header: 'איש קשר', example: 'דוד' },
      { header: 'טלפון', example: '02-6512345' },
      { header: 'טלפון נוסף' },
      { header: 'אימייל' },
      { header: 'כתובת' },
      { header: 'תנאי תשלום', example: 'שוטף + 30' },
      { header: 'זמן אספקה (ימים)', example: 7 },
      { header: 'הערות' },
      { header: 'פעיל', example: 'כן' },
    ],
    matchHint: 'ספק קיים מזוהה לפי "מספר ספק" (ואם ריק – לפי השם) ומתעדכן; אחרת נוצר ספק חדש.',
    importRow: async (r) => {
      const name = cellText(r['שם'])!;
      const num = cellNumber(r['מספר ספק']);
      const found = (num && byNumber.get(num)) || byName.get(norm(name));
      const payload = {
        name,
        contact_name: cellText(r['איש קשר']),
        phone: cellText(r['טלפון']),
        phone2: cellText(r['טלפון נוסף']),
        email: cellText(r['אימייל']),
        address: cellText(r['כתובת']),
        payment_terms: cellText(r['תנאי תשלום']),
        lead_time_days: cellNumber(r['זמן אספקה (ימים)']),
        notes: cellText(r['הערות']),
        is_active: cellBool(r['פעיל']) ?? true,
        ...(num && !found ? { number: num } : {}),
      };
      if (found) {
        const { error } = await supabase.from('suppliers').update(payload).eq('id', found.id);
        return error ? fail(dbErrorMessage(error.message)) : { status: 'updated' };
      }
      const { data, error } = await supabase.from('suppliers').insert(payload).select('id, number, name').single();
      if (error) return fail(dbErrorMessage(error.message));
      byName.set(norm(data.name), { ...(payload as unknown as Supplier), id: data.id, number: data.number });
      return { status: 'created' };
    },
  };
}

// ---------------------------------------------------------------------
// קטלוג ספרים – מזהים לפי קוד, ואם אין – לפי שם. אפשר גם ספק מועדף + מחיר קנייה + מק"ט.
// ---------------------------------------------------------------------
export function booksImporter(books: Book[], suppliers: Supplier[], canCost: boolean): Importer {
  const byCode = new Map(books.map((b) => [norm(b.code), b]));
  const byName = new Map(books.map((b) => [norm(b.name), b]));
  const supByName = new Map(suppliers.map((s) => [norm(s.name), s]));
  const columns: ImportColumn[] = [
    { header: 'קוד', aliases: ['קוד ספר'], example: '' },
    { header: 'שם', aliases: ['שם הספר'], required: true, example: 'חומש בראשית' },
    { header: 'הוצאה לאור', example: 'קורן' },
    { header: 'מחיר מכירה', required: true, example: 45 },
    { header: 'פעיל', example: 'כן' },
    { header: 'הערות' },
  ];
  if (canCost) {
    columns.push({ header: 'ספק מועדף', aliases: ['ספק'], example: 'אברמוביץ' }, { header: 'מחיר קנייה', example: 30 }, { header: 'מק״ט ספק', aliases: ['מק"ט ספק'] });
  }
  return {
    columns,
    matchHint: 'ספר קיים מזוהה לפי "קוד" (ואם ריק – לפי השם) ומתעדכן; אחרת נוצר ספר חדש (קוד ריק = קוד אוטומטי). ספק מועדף – לפי שם ספק קיים.',
    importRow: async (r) => {
      const name = cellText(r['שם'])!;
      const code = cellText(r['קוד']);
      const price = cellNumber(r['מחיר מכירה']);
      if (price === null || price < 0) return fail('מחיר מכירה לא תקין');
      const found = (code && byCode.get(norm(code))) || byName.get(norm(name));
      const payload = {
        name,
        publisher: cellText(r['הוצאה לאור']),
        sale_price: price,
        is_active: cellBool(r['פעיל']) ?? true,
        notes: cellText(r['הערות']),
        ...(code && !found ? { code } : {}),
      };
      let bookId: string;
      let status: ImportRowResult['status'];
      if (found) {
        const { error } = await supabase.from('books').update(payload).eq('id', found.id);
        if (error) return fail(dbErrorMessage(error.message));
        bookId = found.id;
        status = 'updated';
      } else {
        const { data, error } = await supabase.from('books').insert(payload).select('id, code, name').single();
        if (error) return fail(dbErrorMessage(error.message));
        bookId = data.id;
        const nb = { ...(payload as unknown as Book), id: data.id, code: data.code };
        byCode.set(norm(data.code), nb);
        byName.set(norm(data.name), nb);
        status = 'created';
      }
      const supName = canCost ? cellText(r['ספק מועדף']) : null;
      if (supName) {
        const sup = supByName.get(norm(supName));
        if (!sup) return { status, message: `הספר נשמר, אבל הספק "${supName}" לא קיים – יש להוסיף אותו במסך ספקים` };
        await supabase.from('book_suppliers').update({ is_preferred: false }).eq('book_id', bookId).neq('supplier_id', sup.id);
        const { error } = await supabase.from('book_suppliers').upsert(
          { book_id: bookId, supplier_id: sup.id, is_preferred: true, purchase_price: cellNumber(r['מחיר קנייה']), supplier_sku: cellText(r['מק״ט ספק']) },
          { onConflict: 'book_id,supplier_id' }
        );
        if (error) return fail(`הספר נשמר, אבל הספק לא: ${dbErrorMessage(error.message)}`);
      }
      return { status };
    },
  };
}

// ---------------------------------------------------------------------
// לקוחות (תלמידים) – מזהים לפי מספר לקוח, ואם אין – לפי טלפון + שם (אחים חולקים טלפון)
// ---------------------------------------------------------------------
type CustomerLite = { id: string; number: number; phone_digits: string | null; first_name: string; last_name: string };
export function customersImporter(existing: CustomerLite[]): Importer {
  const byNumber = new Map(existing.map((c) => [c.number, c]));
  const key = (d: string, first: string, last: string) => `${d}|${first.trim()}|${last.trim()}`;
  const byPhone = new Map<string, CustomerLite>();
  for (const c of existing)
    for (const d of (c.phone_digits ?? '').split(' ')) if (d.length >= 7) byPhone.set(key(d, c.first_name, c.last_name), c);
  return {
    columns: [
      { header: 'מספר לקוח', example: '' },
      { header: 'שם משפחה', required: true, example: 'כהן' },
      { header: 'שם פרטי', required: true, example: 'אברהם' },
      { header: 'שם ההורה', example: 'יצחק כהן' },
      { header: 'טלפון', aliases: ['טלפון נייד'], example: '050-1234567' },
      { header: 'טלפון נוסף' },
      { header: 'אימייל' },
      { header: 'הערות' },
    ],
    matchHint: 'כל שורה = תלמיד. תלמיד קיים מזוהה לפי "מספר לקוח" (ואם ריק – לפי טלפון + שם) ומתעדכן; אחרת נוצר תלמיד חדש. אחים עם אותו טלפון נשמרים בנפרד.',
    importRow: async (r) => {
      const num = cellNumber(r['מספר לקוח']);
      const phone = cellText(r['טלפון']);
      const first = cellText(r['שם פרטי'])!;
      const last = cellText(r['שם משפחה'])!;
      const found =
        (num && byNumber.get(num)) || (digits(phone).length >= 7 ? byPhone.get(key(digits(phone), first, last)) : undefined);
      const payload = {
        first_name: first,
        last_name: last,
        parent_name: cellText(r['שם ההורה']),
        phone,
        phone2: cellText(r['טלפון נוסף']),
        email: cellText(r['אימייל']),
        notes: cellText(r['הערות']),
        ...(num && !found ? { number: num } : {}),
      };
      if (found) {
        const { error } = await supabase.from('customers').update(payload).eq('id', found.id);
        return error ? fail(dbErrorMessage(error.message)) : { status: 'updated' };
      }
      const { data, error } = await supabase.from('customers').insert(payload).select('id, number, phone_digits, first_name, last_name').single();
      if (error) return fail(dbErrorMessage(error.message));
      byNumber.set(data.number, data);
      if (digits(phone).length >= 7) byPhone.set(key(digits(phone), first, last), data);
      return { status: 'created' };
    },
  };
}

// ---------------------------------------------------------------------
// מוסדות – מזהים לפי מספר מוסד (ואם אין – לפי שם). המוסד נכנס גם לשנה הנבחרת עם מועדי המכירה.
// ---------------------------------------------------------------------
type InstLite = { id: string; number: number; name: string };
export function institutionsImporter(existing: InstLite[], yearId: string, inYear: Set<string>): Importer {
  const byNumber = new Map(existing.map((i) => [i.number, i]));
  const byName = new Map(existing.map((i) => [norm(i.name), i]));
  return {
    columns: [
      { header: 'מספר מוסד', example: '' },
      { header: 'שם', aliases: ['שם המוסד'], required: true, example: 'תלמוד תורה' },
      { header: 'עיר', example: 'אשדוד' },
      { header: 'כתובת' },
      { header: 'איש קשר', aliases: ['מנהל / איש קשר'] },
      { header: 'טלפון' },
      { header: 'טלפון נוסף' },
      { header: 'אימייל' },
      { header: 'פתיחת מכירה', example: '01/06/2027' },
      { header: 'סגירת מכירה' },
      { header: 'מועד אחרון להזמנה' },
      { header: 'מועד אחרון לביטול' },
    ],
    matchHint: 'מוסד קיים מזוהה לפי "מספר מוסד" (ואם ריק – לפי השם) ומתעדכן; אחרת נוצר מוסד חדש. בכל מקרה המוסד נכנס לשנה הנבחרת עם המועדים.',
    importRow: async (r) => {
      const name = cellText(r['שם'])!;
      const num = cellNumber(r['מספר מוסד']);
      const found = (num && byNumber.get(num)) || byName.get(norm(name));
      let sale;
      try {
        sale = {
          sale_open_date: dateOrFail(r['פתיחת מכירה'], 'פתיחת מכירה'),
          sale_close_date: dateOrFail(r['סגירת מכירה'], 'סגירת מכירה'),
          order_deadline: dateOrFail(r['מועד אחרון להזמנה'], 'מועד אחרון להזמנה'),
          cancel_deadline: dateOrFail(r['מועד אחרון לביטול'], 'מועד אחרון לביטול'),
        };
      } catch (e) {
        return fail((e as Error).message);
      }
      const payload = {
        name,
        city: cellText(r['עיר']),
        address: cellText(r['כתובת']),
        contact_name: cellText(r['איש קשר']),
        phone: cellText(r['טלפון']),
        phone2: cellText(r['טלפון נוסף']),
        email: cellText(r['אימייל']),
        ...(num && !found ? { number: num } : {}),
      };
      let instId: string;
      let status: ImportRowResult['status'];
      if (found) {
        const { error } = await supabase.from('institutions').update(payload).eq('id', found.id);
        if (error) return fail(dbErrorMessage(error.message));
        instId = found.id;
        status = 'updated';
      } else {
        const { data, error } = await supabase.from('institutions').insert(payload).select('id, number, name').single();
        if (error) return fail(dbErrorMessage(error.message));
        instId = data.id;
        byName.set(norm(data.name), data);
        byNumber.set(data.number, data);
        status = 'created';
      }
      const { error } = inYear.has(instId)
        ? await supabase.from('institution_years').update(sale).eq('institution_id', instId).eq('year_id', yearId)
        : await supabase.from('institution_years').insert({ ...sale, institution_id: instId, year_id: yearId });
      if (error) return fail(`המוסד נשמר, אבל המכירה בשנה לא: ${dbErrorMessage(error.message)}`);
      inYear.add(instId);
      return { status };
    },
  };
}

// ---------------------------------------------------------------------
// רשימת ספרים של כיתה – הספר מזוהה לפי קוד (ואם אין – לפי שם) מתוך הקטלוג
// ---------------------------------------------------------------------
export function classBooksImporter(classId: string, books: Book[], suppliers: Supplier[]): Importer {
  const byCode = new Map(books.map((b) => [norm(b.code), b]));
  const byName = new Map(books.map((b) => [norm(b.name), b]));
  const supByName = new Map(suppliers.map((s) => [norm(s.name), s]));
  return {
    columns: [
      { header: 'קוד ספר', example: 'B0002' },
      { header: 'שם הספר', example: 'חומש בראשית' },
      { header: 'כמות לתלמיד', example: 1 },
      { header: 'מחיר מכירה', example: 45 },
      { header: 'ספק' },
      { header: 'חובה/רשות', example: 'חובה' },
      { header: 'אחרון להזמנה' },
      { header: 'אחרון לביטול' },
      { header: 'הערות' },
    ],
    matchHint: 'הספר צריך להיות בקטלוג (לפי קוד ספר, או שם הספר אם אין קוד). ספר שכבר ברשימה מתעדכן; אחרת נוסף. מחיר ריק = המחיר מהקטלוג.',
    importRow: async (r) => {
      const code = cellText(r['קוד ספר']);
      const name = cellText(r['שם הספר']);
      if (!code && !name) return fail('חסר קוד ספר או שם הספר');
      const book = (code && byCode.get(norm(code))) || (name ? byName.get(norm(name)) : undefined);
      if (!book) return fail(`הספר "${code ?? name}" לא נמצא בקטלוג – יש להוסיף אותו קודם במסך קטלוג ספרים`);
      const supName = cellText(r['ספק']);
      const sup = supName ? supByName.get(norm(supName)) : undefined;
      if (supName && !sup) return fail(`הספק "${supName}" לא קיים`);
      let dates;
      try {
        dates = { order_deadline: dateOrFail(r['אחרון להזמנה'], 'אחרון להזמנה'), cancel_deadline: dateOrFail(r['אחרון לביטול'], 'אחרון לביטול') };
      } catch (e) {
        return fail((e as Error).message);
      }
      const { data: existing } = await supabase.from('class_books').select('id').eq('class_id', classId).eq('book_id', book.id).maybeSingle();
      const payload = {
        qty_per_student: Math.max(cellNumber(r['כמות לתלמיד']) ?? 1, 1),
        sale_price: cellNumber(r['מחיר מכירה']) ?? book.sale_price,
        is_required: cellBool(r['חובה/רשות']) ?? true,
        notes: cellText(r['הערות']),
        ...dates,
        ...(sup ? { supplier_id: sup.id } : {}),
      };
      const { error } = existing
        ? await supabase.from('class_books').update(payload).eq('id', existing.id)
        : await supabase.from('class_books').insert({ ...payload, class_id: classId, book_id: book.id });
      if (error) return fail(dbErrorMessage(error.message));
      return { status: existing ? 'updated' : 'created' };
    },
  };
}

// ---------------------------------------------------------------------
// מלאי פתיחה / תיקון – לפי קוד ספר
// ---------------------------------------------------------------------
export function stockImporter(books: Book[]): Importer {
  const byCode = new Map(books.map((b) => [norm(b.code), b]));
  const byName = new Map(books.map((b) => [norm(b.name), b]));
  return {
    columns: [
      { header: 'קוד', aliases: ['קוד ספר'], example: 'B0001' },
      { header: 'ספר', aliases: ['שם הספר'] },
      { header: 'כמות', required: true, example: 10 },
      { header: 'סוג', example: 'מלאי פתיחה' },
      { header: 'סיבה', example: 'ספירת מלאי' },
    ],
    matchHint: 'כל שורה מוסיפה תנועת מלאי (כמות חיובית מוסיפה, שלילית מורידה). סוג: "מלאי פתיחה" או "תיקון" (ברירת מחדל: מלאי פתיחה).',
    importRow: async (r) => {
      const code = cellText(r['קוד']);
      const name = cellText(r['ספר']);
      const book = (code && byCode.get(norm(code))) || (name ? byName.get(norm(name)) : undefined);
      if (!book) return fail(`הספר "${code ?? name ?? ''}" לא נמצא בקטלוג`);
      const qty = cellNumber(r['כמות']);
      if (!qty) return { status: 'skipped', message: 'כמות 0' };
      const kind = (cellText(r['סוג']) ?? '').includes('תיקון') ? 'adjust' : 'opening';
      const { error } = await supabase.rpc('adjust_stock', {
        p_book: book.id,
        p_qty: Math.trunc(qty),
        p_kind: kind,
        p_reason: cellText(r['סיבה']) ?? (kind === 'opening' ? 'מלאי פתיחה (ייבוא מאקסל)' : 'תיקון (ייבוא מאקסל)'),
      });
      return error ? fail(dbErrorMessage(error.message)) : { status: 'created' };
    },
  };
}

// ---------------------------------------------------------------------
// הוצאות – כל שורה = הוצאה חדשה
// ---------------------------------------------------------------------
const METHOD_BY_LABEL: Record<string, string> = { 'מזומן': 'cash', "צ'ק": 'check', 'צ׳ק': 'check', 'צק': 'check', 'ביט': 'bit', 'העברה': 'transfer', 'העברה בנקאית': 'transfer' };
export function expensesImporter(yearId: string): Importer {
  return {
    columns: [
      { header: 'תאריך', example: '01/11/2026' },
      { header: 'סוג', required: true, example: 'אריזה וציוד' },
      { header: 'סכום', required: true, example: 120 },
      { header: 'שולם ל' },
      { header: 'אמצעי', aliases: ['אמצעי תשלום'], example: 'מזומן' },
      { header: 'אסמכתה' },
      { header: 'הערות' },
    ],
    matchHint: 'כל שורה נוספת כהוצאה חדשה בשנה הנבחרת (אין עדכון של הוצאות קיימות).',
    importRow: async (r) => {
      const amount = cellNumber(r['סכום']);
      if (!amount || amount <= 0) return fail('סכום לא תקין');
      let date;
      try {
        date = dateOrFail(r['תאריך'], 'תאריך');
      } catch (e) {
        return fail((e as Error).message);
      }
      const methodText = cellText(r['אמצעי']);
      const { error } = await supabase.from('expenses').insert({
        year_id: yearId,
        expense_date: date ?? undefined,
        amount,
        category: cellText(r['סוג'])!,
        payee: cellText(r['שולם ל']),
        method: methodText ? METHOD_BY_LABEL[methodText] ?? null : null,
        reference: cellText(r['אסמכתה']),
        notes: cellText(r['הערות']),
      });
      return error ? fail(dbErrorMessage(error.message)) : { status: 'created' };
    },
  };
}
