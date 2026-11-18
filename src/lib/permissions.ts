// =====================================================================
// רשימת ההרשאות של המערכת – מקור אחד (מסך התפקידים, חריגות למשתמש, הודעות, UI).
// הרשאה חדשה = להוסיף כאן + <Protect permId> ב-UI + מדיניות RLS במסד (has_permission).
//
// מצב הרשאה: allowed (מותר) | locked (מוצג חסום עם מנעול) | hidden (מוסתר). חסר = מוסתר.
// ההרשאה האפקטיבית = חריגת המשתמש ?? הגדרת התפקיד ?? hidden. "מנהל ראשי" – הכול מותר.
// אותו חישוב בדיוק נמצא במסד: public.permission_state().
// =====================================================================

/** 'action' = כפתור/פעולה, 'view' = צפייה במסך או בנתון */
export type PermissionKind = 'action' | 'view';

export type PermissionDef = { id: string; label: string; kind: PermissionKind };
export type PermissionGroup = { title: string; permissions: PermissionDef[] };

export const PERMISSION_GROUPS: PermissionGroup[] = [
  {
    title: 'מסך ראשי ודוחות',
    permissions: [
      { id: 'dashboard_view', label: 'צפייה במסך הראשי (תמונת מצב)', kind: 'view' },
      { id: 'reports_view', label: 'צפייה בדוחות והדפסתם', kind: 'view' },
      { id: 'export_excel', label: 'ייצוא לאקסל', kind: 'action' },
    ],
  },
  {
    title: 'שנות לימודים',
    permissions: [
      { id: 'years_view', label: 'צפייה בשנות הלימודים', kind: 'view' },
      { id: 'years_manage', label: 'פתיחה, עריכה וסגירה של שנה', kind: 'action' },
      { id: 'years_copy', label: 'העתקת שנה (פתיחת שנה חדשה על בסיס קודמת)', kind: 'action' },
    ],
  },
  {
    title: 'מוסדות',
    permissions: [
      { id: 'institutions_view', label: 'צפייה במוסדות', kind: 'view' },
      { id: 'institutions_create', label: 'הוספת מוסד', kind: 'action' },
      { id: 'institutions_edit', label: 'עריכת מוסד', kind: 'action' },
      { id: 'institutions_delete', label: 'מחיקת מוסד', kind: 'action' },
      { id: 'institutions_copy', label: 'העתקת מוסד', kind: 'action' },
    ],
  },
  {
    title: 'כיתות ורשימות ספרים',
    permissions: [
      { id: 'classes_view', label: 'צפייה בכיתות וברשימות', kind: 'view' },
      { id: 'classes_manage', label: 'הוספה, עריכה ומחיקה של כיתות ורשימות', kind: 'action' },
      { id: 'classes_copy', label: 'העתקת רשימה מכיתה לכיתה', kind: 'action' },
    ],
  },
  {
    title: 'קטלוג ספרים',
    permissions: [
      { id: 'books_view', label: 'צפייה בקטלוג', kind: 'view' },
      { id: 'books_manage', label: 'הוספה ועריכה של ספרים ומחירים', kind: 'action' },
      { id: 'books_view_cost', label: 'צפייה במחירי קנייה ורווח', kind: 'view' },
    ],
  },
  {
    title: 'ספקים',
    permissions: [
      { id: 'suppliers_view', label: 'צפייה בספקים', kind: 'view' },
      { id: 'suppliers_manage', label: 'הוספה ועריכה של ספקים', kind: 'action' },
    ],
  },
  {
    title: 'לקוחות',
    permissions: [
      { id: 'customers_view', label: 'צפייה בלקוחות', kind: 'view' },
      { id: 'customers_create', label: 'הוספת לקוח', kind: 'action' },
      { id: 'customers_edit', label: 'עריכת לקוח', kind: 'action' },
      { id: 'customers_delete', label: 'מחיקת לקוח', kind: 'action' },
      { id: 'customers_view_contact', label: 'צפייה בטלפונים', kind: 'view' },
      { id: 'customers_view_private', label: 'צפייה בתעודת זהות וכתובת (מידע רגיש)', kind: 'view' },
    ],
  },
  {
    title: 'הזמנות',
    permissions: [
      { id: 'orders_view', label: 'צפייה בהזמנות', kind: 'view' },
      { id: 'orders_create', label: 'יצירת הזמנה', kind: 'action' },
      { id: 'orders_edit', label: 'עריכת הזמנה', kind: 'action' },
      { id: 'orders_copy', label: 'העתקת הזמנה', kind: 'action' },
      { id: 'orders_discount', label: 'מתן הנחה', kind: 'action' },
      { id: 'orders_cancel', label: 'ביטול הזמנה / ספר (לפני המועד האחרון)', kind: 'action' },
      { id: 'orders_cancel_late', label: 'ביטול אחרי המועד האחרון (אישור מנהל)', kind: 'action' },
    ],
  },
  {
    title: 'רכש וקליטת סחורה',
    permissions: [
      { id: 'po_view', label: 'צפייה בהזמנות רכש', kind: 'view' },
      { id: 'po_manage', label: 'יצירה, עריכה ושליחה של הזמנות רכש', kind: 'action' },
      { id: 'po_close', label: 'סגירת הזמנת רכש', kind: 'action' },
      { id: 'receiving_do', label: 'קליטת סחורה', kind: 'action' },
    ],
  },
  {
    title: 'מלאי',
    permissions: [
      { id: 'inventory_view', label: 'צפייה במלאי וחוסרים', kind: 'view' },
      { id: 'inventory_adjust', label: 'מלאי פתיחה ותיקון מלאי ידני', kind: 'action' },
      { id: 'inventory_allocate', label: 'הקצאת מלאי למוסדות', kind: 'action' },
    ],
  },
  {
    title: 'מחסן: ליקוט ושקיות',
    permissions: [
      { id: 'picking_do', label: 'ליקוט והכנת שקיות', kind: 'action' },
      { id: 'bags_check', label: 'בדיקת שקית ואישור שמוכנה', kind: 'action' },
      { id: 'labels_print', label: 'הדפסת מדבקות', kind: 'action' },
    ],
  },
  {
    title: 'משלוחים ואיסופים',
    permissions: [
      { id: 'shipments_view', label: 'צפייה במשלוחים', kind: 'view' },
      { id: 'shipments_manage', label: 'יצירה ועדכון של משלוחים', kind: 'action' },
      { id: 'pickups_do', label: 'מסירה באיסוף עצמי', kind: 'action' },
    ],
  },
  {
    title: 'כספים',
    permissions: [
      { id: 'finance_view', label: 'צפייה בכספים, חובות וסכומים', kind: 'view' },
      { id: 'payments_record', label: 'רישום תשלום מלקוח', kind: 'action' },
      { id: 'payments_refund', label: 'החזר כספי ללקוח', kind: 'action' },
      { id: 'expenses_manage', label: 'רישום ועריכת הוצאות', kind: 'action' },
      { id: 'supplier_payments_manage', label: 'רישום תשלומים לספקים', kind: 'action' },
    ],
  },
  {
    title: 'הגדרות ומערכת',
    permissions: [
      { id: 'users_manage', label: 'ניהול משתמשים (הוספה, עריכה, סיסמאות, חריגות)', kind: 'action' },
      { id: 'roles_manage', label: 'ניהול תפקידים והרשאות', kind: 'action' },
      { id: 'settings_manage', label: 'הגדרות כלליות וכללי עבודה', kind: 'action' },
      { id: 'audit_view', label: 'צפייה ביומן הפעולות', kind: 'view' },
    ],
  },
];

export const ALL_PERMISSIONS: PermissionDef[] = PERMISSION_GROUPS.flatMap((g) => g.permissions);
const BY_ID = new Map(ALL_PERMISSIONS.map((p) => [p.id, p]));

export function getPermission(id: string): PermissionDef | undefined {
  return BY_ID.get(id);
}

export type PermissionState = 'allowed' | 'locked' | 'hidden';
export type PermissionStateMap = Record<string, PermissionState>;

export const STATE_LABELS: Record<PermissionState, string> = {
  allowed: 'מותר',
  locked: 'חסום',
  hidden: 'מוסתר',
};

function isState(v: unknown): v is PermissionState {
  return v === 'allowed' || v === 'locked' || v === 'hidden';
}

/** ממיר JSON מהמסד למפה תקינה (מתעלם מערכים לא מוכרים) */
export function normalizeStates(raw: unknown): PermissionStateMap {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out: PermissionStateMap = {};
  for (const [k, v] of Object.entries(raw)) if (isState(v)) out[k] = v;
  return out;
}

/** אותו חישוב כמו public.permission_state() במסד */
export function effectiveState(
  permId: string,
  opts: { isSuper: boolean; role: PermissionStateMap; overrides: PermissionStateMap }
): PermissionState {
  if (opts.isSuper) return 'allowed';
  return opts.overrides[permId] ?? opts.role[permId] ?? 'hidden';
}

export function deniedMessage(permId: string): string {
  const label = getPermission(permId)?.label;
  return label ? `אין לך הרשאה: ${label}` : 'אין לך הרשאה לפעולה זו';
}
