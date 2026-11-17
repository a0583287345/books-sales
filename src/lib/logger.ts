import { supabase } from '@/lib/supabase';
import type { Json } from '@/types/database';

// רישום פעולה ליומן (audit_logs). שם המשתמש, המזהה והשעה נקבעים במסד (טריגר) – אי אפשר לזייף.
// שגיאה ברישום לא עוצרת את הפעולה עצמה.
export async function logActivity(
  action: string,
  entity: string,
  description: string,
  extra?: { entityId?: string; details?: Json }
) {
  const { error } = await supabase.from('audit_logs').insert({
    action,
    entity,
    description,
    entity_id: extra?.entityId ?? null,
    details: extra?.details ?? null,
  });
  if (error) console.error('שגיאה ברישום ליומן:', error.message);
}
