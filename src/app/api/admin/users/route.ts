import { NextResponse } from 'next/server';
import { supabaseAdmin, userClient } from '@/lib/supabase-admin';
import { normalizeStates } from '@/lib/permissions';

// =====================================================================
// ניהול משתמשים בצד השרת: יצירה, איפוס סיסמה, השבתה/הפעלה, מחיקה.
// service_role משמש רק לפעולות על auth.users. כל כתיבה ל-user_profiles נעשית
// בשם המבצע (userClient) – כך ה-RLS והטריגרים במסד אוכפים את כל הכללים
// (מנהל ראשי מוגנת, אין שינוי של עצמך, אין הענקת הרשאה שאין לך).
// =====================================================================

type Body =
  | { action: 'create'; email: string; password: string; full_name: string; role_id: string; overrides?: unknown }
  | { action: 'reset_password'; user_id: string; password: string }
  | { action: 'set_active'; user_id: string; active: boolean }
  | { action: 'delete'; user_id: string };

const fail = (error: string, status = 400) => NextResponse.json({ error }, { status });

/** הודעת שגיאה מהמסד בעברית (טריגרי ההגנה כבר מחזירים עברית) */
function dbError(message: string) {
  if (/row-level security/i.test(message)) return 'אין לך הרשאה לפעולה זו.';
  if (/duplicate key/i.test(message)) return 'הרשומה כבר קיימת.';
  return message;
}

export async function POST(request: Request) {
  const token = request.headers.get('Authorization')?.replace('Bearer ', '') ?? '';
  if (!token) return fail('חסר טוקן התחברות', 401);

  const {
    data: { user: actor },
  } = await supabaseAdmin.auth.getUser(token);
  if (!actor) return fail('משתמש לא מזוהה', 401);

  const db = userClient(token);
  const { data: allowed } = await db.rpc('has_permission', { p: 'users_manage' });
  if (!allowed) return fail('אין לך הרשאה לנהל משתמשים.', 403);

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return fail('בקשה לא תקינה');
  }

  /** בודק שהמבצע רשאי לשנות את משתמש היעד – עדכון "ריק" שעובר דרך ה-RLS והטריגר */
  async function assertCanTouch(userId: string): Promise<string | null> {
    const { data, error } = await db
      .from('user_profiles')
      .update({ updated_at: new Date().toISOString() })
      .eq('id', userId)
      .select('id, full_name, email');
    if (error) return dbError(error.message);
    if (!data?.length) return 'המשתמש לא נמצא או שאין לך הרשאה אליו.';
    return null;
  }

  async function audit(action: string, entityId: string, description: string) {
    await db.from('audit_logs').insert({ action, entity: 'user_profiles', entity_id: entityId, description });
  }

  switch (body.action) {
    case 'create': {
      const email = String(body.email ?? '').trim().toLowerCase();
      const fullName = String(body.full_name ?? '').trim();
      const password = String(body.password ?? '');
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return fail('כתובת אימייל לא תקינה');
      if (!fullName) return fail('חסר שם מלא');
      if (password.length < 8) return fail('הסיסמה חייבת להכיל לפחות 8 תווים');
      if (!body.role_id) return fail('יש לבחור תפקיד');

      const { data: created, error: authError } = await supabaseAdmin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      });
      if (authError || !created.user) {
        const msg = authError?.message ?? '';
        return fail(/already|registered|exists/i.test(msg) ? 'כבר קיים משתמש עם האימייל הזה' : `שגיאה ביצירת המשתמש: ${msg}`);
      }

      const { error: profileError } = await db.from('user_profiles').insert({
        id: created.user.id,
        full_name: fullName,
        email,
        role_id: body.role_id,
        permission_overrides: normalizeStates(body.overrides),
      });
      if (profileError) {
        // ההגנות במסד סירבו – מבטלים גם את המשתמש ב-auth
        await supabaseAdmin.auth.admin.deleteUser(created.user.id);
        return fail(dbError(profileError.message), 403);
      }

      await audit('create', created.user.id, `נוצר משתמש: ${fullName} (${email})`);
      return NextResponse.json({ ok: true, id: created.user.id });
    }

    case 'reset_password': {
      if (String(body.password ?? '').length < 8) return fail('הסיסמה חייבת להכיל לפחות 8 תווים');
      const denied = await assertCanTouch(body.user_id);
      if (denied) return fail(denied, 403);
      const { error } = await supabaseAdmin.auth.admin.updateUserById(body.user_id, { password: body.password });
      if (error) return fail(`שגיאה באיפוס הסיסמה: ${error.message}`);
      await audit('reset_password', body.user_id, 'אופסה סיסמה למשתמש');
      return NextResponse.json({ ok: true });
    }

    case 'set_active': {
      const { data, error } = await db
        .from('user_profiles')
        .update({ is_active: !!body.active })
        .eq('id', body.user_id)
        .select('full_name');
      if (error) return fail(dbError(error.message), 403);
      if (!data?.length) return fail('המשתמש לא נמצא או שאין לך הרשאה אליו.', 403);
      // משתמש מושבת לא יכול גם להתחבר
      const { error: banError } = await supabaseAdmin.auth.admin.updateUserById(body.user_id, {
        ban_duration: body.active ? 'none' : '876000h',
      });
      if (banError) return fail(`הפרופיל עודכן, אך חסימת ההתחברות נכשלה: ${banError.message}`);
      await audit(body.active ? 'activate' : 'deactivate', body.user_id,
        `${body.active ? 'הופעל' : 'הושבת'} משתמש: ${data[0].full_name}`);
      return NextResponse.json({ ok: true });
    }

    case 'delete': {
      if (body.user_id === actor.id) return fail('לא ניתן למחוק את המשתמש שלך עצמך');
      const { data, error } = await db.from('user_profiles').delete().eq('id', body.user_id).select('full_name, email');
      if (error) return fail(dbError(error.message), 403);
      if (!data?.length) return fail('המשתמש לא נמצא או שאין לך הרשאה אליו.', 403);
      const { error: authError } = await supabaseAdmin.auth.admin.deleteUser(body.user_id);
      if (authError) return fail(`הפרופיל נמחק, אך מחיקת ההתחברות נכשלה: ${authError.message}`);
      await audit('delete', body.user_id, `נמחק משתמש: ${data[0].full_name} (${data[0].email ?? ''})`);
      return NextResponse.json({ ok: true });
    }

    default:
      return fail('פעולה לא מוכרת');
  }
}
