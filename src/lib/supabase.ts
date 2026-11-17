import { createBrowserClient } from '@supabase/ssr';
import type { Database } from '@/types/database';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('חסרים מפתחות התחברות ל-Supabase בקובץ .env.local');
}

// הלקוח שומר את ההתחברות ב-cookies (ולא ב-localStorage),
// כך שגם השרת (src/proxy.ts) יכול לזהות את המשתמש המחובר.
export const supabase = createBrowserClient<Database>(supabaseUrl, supabaseAnonKey);
