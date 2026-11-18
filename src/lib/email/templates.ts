// =====================================================================
// תבניות מייל – משותף לדפדפן ולשרת (בלי סודות). האפיון: docs/SPEC_EMAIL.md
// שדות להחלפה בטקסט: {תלמיד} {הורה} {מוסד} {כיתה} {מספר_הזמנה} ...
// =====================================================================

export type TemplateKey =
  | 'ready'
  | 'ready_partial'
  | 'payment_reminder'
  | 'supplier_po'
  | 'invite'
  | 'order_confirm'
  | 'free_customer'
  | 'free_supplier';

export type EmailTemplate = { subject: string; body: string };
export type EmailTemplates = Record<TemplateKey, EmailTemplate>;

/** סוג הרשומה בתור (email_outbox.kind) */
export type EmailKind =
  | 'free'
  | 'test'
  | 'ready'
  | 'ready_partial'
  | 'payment_reminder'
  | 'supplier_po'
  | 'supplier_free'
  | 'invite'
  | 'order_confirm'
  | 'change_request';

export const KIND_LABELS: Record<EmailKind, string> = {
  free: 'מייל חופשי',
  test: 'מייל בדיקה',
  ready: 'ההזמנה מוכנה',
  ready_partial: 'מוכנה חלקית',
  payment_reminder: 'תזכורת תשלום',
  supplier_po: 'הזמנת רכש לספק',
  supplier_free: 'מייל לספק',
  invite: 'הזמנה להזמין',
  order_confirm: 'אישור הזמנה',
  change_request: 'בקשת שינוי',
};

export const STATUS_LABELS: Record<string, string> = {
  queued: 'ממתין',
  sent: 'נשלח',
  failed: 'נכשל',
  cancelled: 'בוטל',
};

export const TEMPLATE_LABELS: Record<TemplateKey, string> = {
  ready: 'ההזמנה מוכנה',
  ready_partial: 'ההזמנה מוכנה חלקית',
  payment_reminder: 'תזכורת תשלום',
  supplier_po: 'הזמנת רכש לספק',
  invite: 'הזמנה להזמין ספרים',
  order_confirm: 'אישור הזמנה מהקישור',
  free_customer: 'פתיח למייל חופשי ללקוח',
  free_supplier: 'פתיח למייל חופשי לספק',
};

type Placeholder = { key: string; label: string };

const CUSTOMER_FIELDS: Placeholder[] = [
  { key: '{תלמיד}', label: 'שם התלמיד' },
  { key: '{הורה}', label: 'שם ההורה' },
  { key: '{מוסד}', label: 'המוסד' },
  { key: '{כיתה}', label: 'הכיתה' },
];
const ORDER_FIELDS: Placeholder[] = [
  { key: '{מספר_הזמנה}', label: 'מספר ההזמנה' },
  { key: '{סכום}', label: 'סכום ההזמנה' },
  { key: '{שולם}', label: 'כמה שולם' },
  { key: '{יתרה}', label: 'יתרה לתשלום' },
  { key: '{מצב_תשלום}', label: '"שולם" / "יתרה לתשלום"' },
  { key: '{רשימת_ספרים}', label: 'רשימת הספרים' },
  { key: '{פרטי_איסוף}', label: 'פרטי איסוף' },
  { key: '{הוראות_תשלום}', label: 'הוראות תשלום' },
];

/** אילו שדות אפשר לשים בכל תבנית */
export const TEMPLATE_FIELDS: Record<TemplateKey, Placeholder[]> = {
  ready: [...CUSTOMER_FIELDS, ...ORDER_FIELDS],
  ready_partial: [...CUSTOMER_FIELDS, ...ORDER_FIELDS],
  payment_reminder: [...CUSTOMER_FIELDS, ...ORDER_FIELDS],
  order_confirm: [...CUSTOMER_FIELDS, ...ORDER_FIELDS, { key: '{קישור_הזמנה}', label: 'קישור לצפייה בהזמנה' }],
  invite: [
    ...CUSTOMER_FIELDS,
    { key: '{קישור_הזמנה}', label: 'קישור להזמנה' },
    { key: '{מועד_אחרון}', label: 'המועד האחרון להזמנה' },
  ],
  supplier_po: [
    { key: '{ספק}', label: 'שם הספק' },
    { key: '{מספר_הזמנת_רכש}', label: 'מספר הזמנת הרכש' },
    { key: '{רשימת_ספרים}', label: 'הספרים והכמויות' },
    { key: '{צפי_אספקה}', label: 'מועד אספקה מבוקש' },
    { key: '{הערות}', label: 'הערות' },
  ],
  free_customer: CUSTOMER_FIELDS.slice(0, 2),
  free_supplier: [{ key: '{ספק}', label: 'שם הספק' }],
};

export const DEFAULT_TEMPLATES: EmailTemplates = {
  ready: {
    subject: 'ההזמנה של {תלמיד} מוכנה לאיסוף',
    body:
      'שלום,\n\n' +
      'ספרי הלימוד של {תלמיד} ({מוסד}, כיתה {כיתה}) מוכנים לאיסוף.\n' +
      'מספר הזמנה: {מספר_הזמנה}\n\n' +
      '{פרטי_איסוף}\n\n' +
      '{מצב_תשלום}\n' +
      '{הוראות_תשלום}\n\n' +
      'בברכה',
  },
  ready_partial: {
    subject: 'חלק מהספרים של {תלמיד} מוכנים לאיסוף',
    body:
      'שלום,\n\n' +
      'חלק מספרי הלימוד של {תלמיד} ({מוסד}, כיתה {כיתה}) מוכנים לאיסוף. שאר הספרים יגיעו בהמשך ונעדכן.\n' +
      'מספר הזמנה: {מספר_הזמנה}\n\n' +
      '{פרטי_איסוף}\n\n' +
      '{מצב_תשלום}\n\n' +
      'בברכה',
  },
  payment_reminder: {
    subject: 'תזכורת תשלום – הזמנה {מספר_הזמנה} ({תלמיד})',
    body:
      'שלום,\n\n' +
      'זוהי תזכורת ידידותית: בהזמנת ספרי הלימוד של {תלמיד} ({מוסד}, כיתה {כיתה}) נותרה יתרה לתשלום של {יתרה}.\n\n' +
      '{הוראות_תשלום}\n\n' +
      'אם כבר שילמתם – תודה, ואפשר להתעלם מהמייל.\n\n' +
      'בברכה',
  },
  supplier_po: {
    subject: 'הזמנת רכש {מספר_הזמנת_רכש}',
    body:
      'שלום {ספק},\n\n' +
      'מצורפת הזמנת רכש מספר {מספר_הזמנת_רכש}:\n\n' +
      '{רשימת_ספרים}\n\n' +
      'מועד אספקה מבוקש: {צפי_אספקה}\n' +
      '{הערות}\n\n' +
      'נודה לאישור קבלת ההזמנה.\n\n' +
      'בברכה',
  },
  invite: {
    subject: 'הזמנת ספרי לימוד ל{תלמיד} – {מוסד}',
    body:
      'שלום,\n\n' +
      'נפתחה ההרשמה לרכישת ספרי הלימוד ב{מוסד}.\n' +
      'להזמנה עבור {תלמיד} בקישור האישי:\n{קישור_הזמנה}\n\n' +
      'ניתן להזמין עד {מועד_אחרון}.\n\n' +
      'בברכה',
  },
  order_confirm: {
    subject: 'קיבלנו את ההזמנה של {תלמיד} – מספר {מספר_הזמנה}',
    body:
      'שלום,\n\n' +
      'תודה! ההזמנה של {תלמיד} ({מוסד}, כיתה {כיתה}) התקבלה.\n' +
      'מספר הזמנה: {מספר_הזמנה}\n\n' +
      '{רשימת_ספרים}\n\n' +
      'סה״כ: {סכום}\n' +
      '{הוראות_תשלום}\n\n' +
      'לצפייה בהזמנה ולבקשת שינוי:\n{קישור_הזמנה}\n\n' +
      'בברכה',
  },
  free_customer: { subject: '', body: 'שלום,\n\n\n\nבברכה' },
  free_supplier: { subject: '', body: 'שלום {ספק},\n\n\n\nבברכה' },
};

/** תבניות שמורות + ברירות מחדל לכל מה שחסר */
export function mergeTemplates(saved: unknown): EmailTemplates {
  const s = (saved && typeof saved === 'object' ? saved : {}) as Partial<Record<TemplateKey, Partial<EmailTemplate>>>;
  const out = {} as EmailTemplates;
  for (const key of Object.keys(DEFAULT_TEMPLATES) as TemplateKey[]) {
    out[key] = {
      subject: typeof s[key]?.subject === 'string' ? s[key]!.subject! : DEFAULT_TEMPLATES[key].subject,
      body: typeof s[key]?.body === 'string' ? s[key]!.body! : DEFAULT_TEMPLATES[key].body,
    };
  }
  return out;
}

/**
 * החלפת השדות בטקסט. שדה בלי ערך נמחק; שורות שנשארו ריקות בגלל זה מצטמצמות
 * (כדי שלא יהיו "חורים" כשאין למשל הוראות תשלום).
 */
export function renderTemplate(text: string, values: Record<string, string | number | null | undefined>): string {
  const out = text.replace(/\{([^{}\s]+)\}/g, (m, key: string) => {
    if (!(key in values)) return m;
    const v = values[key];
    return v === null || v === undefined ? '' : String(v);
  });
  return out
    .split('\n')
    .map((l) => l.replace(/[ \t]+$/, ''))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function isValidEmail(email: string | null | undefined): boolean {
  return !!email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

/** הודעה אחת לשליחה (מה שהדפדפן שולח לשרת) */
export type OutgoingEmail = {
  kind: EmailKind;
  to: string;
  to_name?: string | null;
  subject: string;
  body: string;
  customer_id?: string | null;
  order_id?: string | null;
  supplier_id?: string | null;
  po_id?: string | null;
  attach_po?: boolean;
  attach_po_prices?: boolean;
};
