@AGENTS.md
@docs/ROADMAP.md

# מכירת ספרי לימוד (books-sales)

מערכת לניהול מכירת ספרי לימוד למוסדות: מוסדות, כיתות ורשימות ספרים, קטלוג, ספקים, לקוחות, הזמנות (טלפון + ידני),
רכש וקליטת סחורה בטאבלט, מלאי וחוסרים, שקיות ומדבקות, משלוחים ואיסופים, כספים ודוחות.
ממשק בעברית (RTL), משתמשים מרובים עם הרשאות לפי תפקיד ויומן פעולות.
- האפיון המלא: `docs/SPEC.md` (לא לשנות). החלטות, סטטוס ושלבים: `docs/ROADMAP.md` – לעדכן בסוף כל שלב.
- המוסכמות והכלים זהים לפרויקט `../ateret-zvi-donors` – כשמקימים רכיב משותף (AuthContext, Protect, Toaster,
  DateInput, PhoneLink, logger, permissions) לבנות אותו באותה צורה.

## מבנה
- `src/app/(app)/` – כל המסכים הפנימיים בתוך `AppShell` (תפריט צד לפי הרשאות, `src/lib/navigation.ts`)
- `src/app/login/` – התחברות; `src/proxy.ts` – משתמש לא מחובר מועבר ל-`/login` (בצד השרת)
- `src/lib/permissions.ts` – **רשימת כל ההרשאות (מקור יחיד)** + `effectiveState` (זהה ל-`permission_state` במסד)
- `src/components/AuthContext.tsx` – `useAuth()`: `access` (מ-`rpc('my_access')`), `stateOf`, `hasPermission`, `requirePermission`
- `src/components/Protect.tsx` – `<Protect permId>` (מותר/חסום/מוסתר), `LockedText`, `LockedPage`
- `src/components/settings/` – `UsersTab`, `RolesTab`, `AuditLogTab`, `PermissionEditor` (עורך 3 מצבים / חריגות)
- `src/app/api/admin/users/route.ts` – יצירה/איפוס סיסמה/השבתה/מחיקה. service_role **רק** ל-auth;
  כתיבה לטבלאות דרך `userClient(token)` כדי שהטריגרים במסד יאכפו
- `src/lib/logger.ts` – `logActivity(action, entity, description)`; שם המשתמש נקבע בטריגר במסד
- `src/types/database.ts` – טיפוסים שנוצרו מהמסד (לייצר מחדש אחרי שינוי סכמה)
- `src/components/YearContext.tsx` – `useYear()`: השנה הנבחרת (נשמרת במכשיר), `readOnly` לשנה סגורה
- `src/components/ui.tsx` – `Modal`, `Field`, `Button`, `PageHeader`, `inputClass`... ; `BookPicker`, `DateInput`, `PhoneLink`
- `src/lib/entities.ts` – טיפוסים, רשימות עמודות ושליפות משותפות (ספקים, ספרים, מוסדות, כיתות)
- `src/lib/format.ts` (₪, תאריכים, חיפוש), `src/lib/excel.ts` (`exportToExcel`), `src/lib/dbErrors.ts` (`dbErrorMessage`)
- **אסור לייצא מ-`page.tsx` משהו חוץ מהקומפוננטה** – דברים משותפים ב-`src/lib` / `src/components`
- מסכי שלב א׳: `src/app/(app)/{years,institutions,classes,books,suppliers,customers}/page.tsx` – כל מסך עטוף ב-`<PageGuard>`

## נתונים (שלב א׳)
- קבוע: `institutions`, `books`, `suppliers`, `book_suppliers` (מחיר קנייה – רק כאן), `customers` + `customer_private`
- לפי שנה: `academic_years` → `institution_years` (המכירה במוסד) → `classes` → `class_books`
- העתקות = פונקציות במסד (`copy_year`, `copy_institution`, `copy_institution_to_year`, `copy_class`, `copy_class_books`),
  פעולה אחת שלמה, שורת סיכום אחת ביומן (`app.skip_row_audit`)
- כל טבלה חדשה: טריגר `audit_row('<שם בעברית>')` + `set_updated_at` + RLS

## הזמנות (שלב ב׳)
- `src/lib/orders.ts` – סטטוסים, תוויות, טיפוסים, `fetchClassBookOptions`, `isPast` (תאריך ישראל)
- מסכים: `src/app/(app)/orders/{page,new/page,[id]/page}.tsx`; `src/components/orders/` (CustomerPicker, OrderStatusBadge);
  `src/components/customers/CustomerHistory.tsx` (ילדים + הזמנות בכרטיס הלקוח)
- יצירה: `rpc('create_order')` בלבד. שינויים: update רגיל – הטריגרים `guard_orders` / `guard_order_items` אוכפים
  הרשאות, מועדי ביטול, מחירים מרשימת הכיתה ואי-שינוי סכומים; `order_history` כותב ל-`order_events`
- `subtotal` משתנה רק עם `app.order_recalc`, `paid_amount` רק עם `app.payment_sync` (בתוך פונקציות במסד)

## הרשאות (במסד)
- `roles.permissions` / `user_profiles.permission_overrides` = `{perm: 'allowed'|'locked'|'hidden'}`; חסר = מוסתר.
  אפקטיבי = חריגה ?? תפקיד. תפקיד `is_super` – הכול מותר, לא נמחק, תמיד יש לפחות משתמש פעיל אחד בו.
- מי שאינו is_super: לא משנה את עצמו/את התפקיד שלו/מנהלת ראשית, ולא מעניק הרשאה שאין לו (`assert_can_grant`).
- כל טבלה חדשה: RLS עם `(select public.has_permission('<perm>'))`.

## Stack
- Next.js 16.4 (App Router) + React 19.2 + TypeScript 5
- Tailwind CSS 4 (דרך `@tailwindcss/postcss`), אייקונים: `lucide-react`, פונט Heebo
- Supabase (פרויקט `books-sales`, id `euiqpqdfowbpipqlwzgi`): Auth, Postgres + RLS, Storage פרטי
- `xlsx` לייצוא לאקסל
- פריסה: Vercel – https://books-sales.vercel.app, כל push ל-main עולה לפרודקשן. פיתוח: VS Code, Windows

## פקודות
- `npm run dev` – שרת פיתוח (http://localhost:3000)
- `npm run build` – חייב לעבור לפני push ל-main
- `npm run lint` – ESLint (לשמור על 0 שגיאות/אזהרות)

## כללי עבודה
- הודעות למשתמש דרך Toaster – **לא משתמשים ב-`alert()`**. תאריכים: שדה DD/MM/YYYY – **לא `type="date"`**.
- כל טלפון מוצג – רכיב לחיץ (שיחה / וואטסאפ / העתקה).
- מסכי העובדים (קליטה, ליקוט, שקיות, איסוף) – מותאמים לטאבלט: כפתורים גדולים, מעט טקסט.
- כל שינוי במסד: קובץ חדש ב-`supabase/migrations/<timestamp>_<name>.sql`, מופעל עם `apply_migration`,
  ואחר כך בדיקה עם `get_advisors`. **RLS על כל טבלה.**
- נתונים לפי שנה תלויים ב-`academic_years`; העתקה (מוסד/כיתה/שנה/הזמנה) תמיד יוצרת רשומות חדשות ולא משנה את המקור.
- תשלומים: צ'ק / מזומן / ביט / העברה בלבד – אין אשראי.
