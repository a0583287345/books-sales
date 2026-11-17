import 'server-only';
import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database';

// =====================================================================
// לקוח service_role – עוקף RLS וטריגרי ההגנה. צד שרת בלבד!
// להשתמש רק לפעולות שאין להן דרך אחרת (יצירת משתמש ב-auth, איפוס סיסמה, מחיקה מ-auth).
// כל שינוי בטבלאות עצמן – דרך userClient() בשם המשתמש, כדי שההגנות במסד יחולו.
// =====================================================================

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export const supabaseAdmin = createClient<Database>(supabaseUrl, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

/** לקוח שפועל בשם המשתמש (לפי הטוקן שלו) – RLS והטריגרים במסד חלים עליו */
export function userClient(accessToken: string) {
  return createClient<Database>(supabaseUrl, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });
}
