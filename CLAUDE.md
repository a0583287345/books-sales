@AGENTS.md
@docs/ROADMAP.md

# מכירת ספרי לימוד (books-sales)

מערכת לניהול מכירת ספרי לימוד למוסדות: מוסדות, כיתות ורשימות ספרים, קטלוג, ספקים, לקוחות, הזמנות (טלפון + ידני),
רכש וקליטת סחורה בטאבלט, מלאי וחוסרים, שקיות ומדבקות, משלוחים ואיסופים, כספים ודוחות.
ממשק בעברית (RTL), משתמשים מרובים עם הרשאות לפי תפקיד ויומן פעולות.
- **בקשות המשתמש: `docs/REQUESTS.md`.** כשהמשתמש כותב "תבצע את הבקשות" – לקרוא, לבצע את "לביצוע" בלבד
  (לא "רעיונות"), לשאול תחת "שאלות שלי אליך" כשמשהו לא ברור, ולהעביר ל"בוצע" עם תאריך ותיאור קצר.
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
- `src/components/filters.tsx` – סינון/מיון לרשימות: `useStoredState` (נשמר במכשיר), `MultiSelect`, `SortSelect`,
  `SearchBox`, `FilterStatus` ("סינון פעיל"). כל רשימה חדשה – להשתמש בהם
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
  `src/components/customers/CustomerHistory.tsx` (הזמנות בכרטיס הלקוח)
- **לקוח = תלמיד** (`parent_name` רשות). `student_name` בהזמנה = שם הלקוח (נקבע ב-`create_order`, מסונכרן בטריגר).
- יצירה: `rpc('create_order')` בלבד. שינויים: update רגיל – הטריגרים `guard_orders` / `guard_order_items` אוכפים
  הרשאות, מועדי ביטול, מחירים מרשימת הכיתה ואי-שינוי סכומים; `order_history` כותב ל-`order_events`
- סטטוס הזמנה – אוטומטי (`sync_order_from_bags`, נקרא גם בטריגר על `order_items`); ידנית רק pending → new וביטול
  (נאכף ב-`guard_orders`). אותה חלוקה כמו `stageOf` במסך השקיות – לשנות את שניהם יחד
- `subtotal` משתנה רק עם `app.order_recalc`, `paid_amount` רק עם `app.payment_sync` (בתוך פונקציות במסד)

## רכש ומלאי (שלב ג׳)
- `src/lib/purchasing.ts` – סטטוסים, טיפוסים, `fetchStockLevels`/`fetchDemand`/`fetchIyNames`
- מסכים: `purchase-orders/{page,plan/page,[id]/page}.tsx`, `receiving/page.tsx`, `inventory/page.tsx`
- סטטוס הזמנת רכש רק דרך `rpc('set_po_status')` (`app.po_status`); מונים ב-`po_items` רק מהפונקציות (`app.po_internal`)
- **החזרות לספקים** (`supplier-returns/page.tsx`): מסמך כללי לספק (לא כנגד הזמנת רכש) – `supplier_returns` + `supplier_return_lines`
  (damaged/wrong = פגומים/שגויים מהקליטה, מתחלקים אוטומטית בין הקליטות; surplus = מהמלאי הפנוי → תנועת `supplier_return`).
  רק דרך `create_supplier_return` / `cancel_supplier_return` / `set_supplier_return_credit`; מה אפשר להחזיר – `supplier_return_candidates`.
  **זיכוי מהספק – סימון ידני בלבד**, ורק "זוכה" יורד ב-`supplier_balances`. `return_to_supplier` הישנה – בלי הרשאת הרצה
- חסר למוסד = `missingOf` (נדרש − נמסר − מוקצה); `fetchDemand` מצרף `delivered` מ-`delivered_by_institution`
- מלאי = סכום `stock_movements`; הקצאה = `stock_allocations` (דרך `set_allocation`); מסירה בשלב ד׳ תוסיף תנועת `delivered`
  ותקטין את ההקצאה

## מחסן (שלב ד׳)
- `src/lib/warehouse.ts` – סטטוסי שקית/משלוח, `fetchPackDetails`, `bagUrl` (QR = `/b/<קוד>`)
- מסכים: `bags/{page,order/[id]/page,labels/page}.tsx`, `b/[code]/page.tsx`, `scan/page.tsx` (qr-scanner), `shipments/{page,[id]/page}.tsx`;
  `src/components/warehouse/{PickupTab,DeliverOrderModal}.tsx` (מסירה = חלון אחד: תשלום + שקיות; `openLabels` להדפסה מרובה)
- כל שינוי בשקיות/משלוחים – רק דרך פונקציות במסד (אין מדיניות כתיבה על הטבלאות); נתונים לעובדים דרך פונקציות
  definer (`packing_queue`, `order_pack_details`...) כדי שלא יצטרכו הרשאת הזמנות/לקוחות
- **`apply_migration` שמעדכן פונקציות קיימות נדחה אוטומטית** – לבקש מהמשתמש להריץ את הקובץ ב-SQL Editor של Supabase

## כספים (שלב ה׳)
- `src/lib/finance.ts` – אמצעי תשלום, סוגי רשומות, קטגוריות הוצאה; `src/components/finance/OrderPayments.tsx`
  (`OrderPayments` במסך ההזמנה, `PaymentModal` גם במסך המסירה)
- מסכים: `finance/page.tsx` (5 לשוניות), `reports/page.tsx`, המסך הראשי `(app)/page.tsx` (`rpc('dashboard_stats')`)
- תשלומים – רק דרך פונקציות (`record_payment`, `refund_payment`, `transfer_credit`, `void_payment`); אין מחיקה
- `apply_migration` עובר כשהקובץ רק יוצר דברים חדשים (`create function` ולא `create or replace` על קיים)

## מיילים (שלב ח׳ – אפיון `docs/SPEC_EMAIL.md`)
- Gmail + סיסמת אפליקציה (nodemailer), כמו בפרויקט התורמים. `src/lib/email/`: `templates.ts` (משותף: תבניות, שדות
  `{תלמיד}`..., `renderTemplate`), `client.ts` (`sendEmails` בחלקים עם התקדמות), `server.ts` (`processQueue`, מגבלה
  יומית לפי שעון ישראל), `attachments.ts` (אקסל להזמנת רכש)
- `/api/email` (status / save_password / test / send / process / retry / cancel), `/api/cron/email` (יומי, `CRON_SECRET`)
- טבלאות: `email_settings` (שורה אחת), `email_secrets` (בלי מדיניות – רק השרת), `email_batches`, `email_outbox`.
  **חריגה מכלל ה-service_role:** השרת משתמש בו לקריאת הסיסמה ולעדכון סטטוס אחרי שליחה. ההוספה לתור – בשם המשתמש (RLS לפי סוג)
- רכיבים: `components/settings/{EmailSettingsTab,EmailLogTab}`, `components/email/EmailSection` (בכרטיס לקוח/ספק)

## הזמנה בקישור (ח4) – **הגישה הציבורית היחידה למסד**
- דף ציבורי `src/app/o/[code]/page.tsx` (מחוץ ל-`(app)`, `/o` ב-`PUBLIC_PATHS` ב-proxy); `src/lib/online.ts` (טיפוסים, בדיקת ת"ז)
- `order_links` (kind: institution / class / order=צפייה בהזמנה). anon ניגש **רק** ל-`public_order_form` ו-`submit_online_order`
  (definer; אוכפים מועדים, ספרים מהרשימה, הגבלת ניסיונות ב-`online_attempts` לפי IP מ-`request.headers` ולפי ת"ז)
- זיהוי לפי ת"ז (`norm_id_number`) – פרטים שונים לא דורסים: `orders.needs_review` + `review_details` (סינון "לבדיקה")
- מייל אישור: `/api/public/order-confirm` (service_role, רק הזמנה מהקישור מהשעה האחרונה, פעם אחת – אינדקס ייחודי);
  `lib/email/orderValues.ts` – ערכי התבנית (בלי תלות בדפדפן)
- ניהול: מוסדות ← כפתור קישור (`components/online/OrderLinksModal`), הרשאה `online_links_manage`
- ח5: `order_links.kind` גם `personal` (customer_id) ו-`order` (צפייה). anon גם: `public_order_view`, `request_order_change`,
  `public_personal_form`, `submit_personal_order`, `public_unsubscribe`. הדף: `components/online/{PublicUi,PublicOrderForm,PublicOrderView}`
- בקשות שינוי: `online_change_requests` (רק פונקציות), אישור `decide_change_request` (`online_changes_approve`; השינוי
  רץ בשם המשתמש → הטריגרים הרגילים), מסך `orders/requests/page.tsx`; מיילים `/api/public/change-notify` (פעם אחת לכל שלב)
- "הזמנה להזמין": `components/online/InviteEmailModal` (`invite_candidates`, `invite_links`), שורת הסרה חובה

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
