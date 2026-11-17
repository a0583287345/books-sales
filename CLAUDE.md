@AGENTS.md
@docs/ROADMAP.md

# מכירת ספרי לימוד (books-sales)

מערכת לניהול מכירת ספרי לימוד למוסדות: מוסדות, כיתות ורשימות ספרים, קטלוג, ספקים, לקוחות, הזמנות (טלפון + ידני),
רכש וקליטת סחורה בטאבלט, מלאי וחוסרים, שקיות ומדבקות, משלוחים ואיסופים, כספים ודוחות.
ממשק בעברית (RTL), משתמשים מרובים עם הרשאות לפי תפקיד ויומן פעולות.
- האפיון המלא: `docs/SPEC.md` (לא לשנות). החלטות, סטטוס ושלבים: `docs/ROADMAP.md` – לעדכן בסוף כל שלב.
- המוסכמות והכלים זהים לפרויקט `../ateret-zvi-donors` – כשמקימים רכיב משותף (AuthContext, Protect, Toaster,
  DateInput, PhoneLink, logger, permissions) לבנות אותו באותה צורה.

## Stack
- Next.js 16.4 (App Router) + React 19.2 + TypeScript 5
- Tailwind CSS 4 (דרך `@tailwindcss/postcss`), אייקונים: `lucide-react`, פונט Heebo
- Supabase (פרויקט נפרד – עדיין לא הוקם): Auth, Postgres + RLS, Storage פרטי
- `xlsx` לייצוא לאקסל
- פריסה: Vercel (פרויקט נפרד). פיתוח: VS Code, Windows

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
