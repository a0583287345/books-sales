import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';

// דפים שפתוחים גם בלי התחברות
const PUBLIC_PATHS = ['/login'];

// רץ בשרת לפני כל טעינת דף:
// 1. מרענן את ה-session של Supabase (cookies)
// 2. משתמש לא מחובר שמנסה להיכנס לדף מוגן – מועבר ל-/login
// 3. משתמש מחובר שנכנס ל-/login – מועבר לדף הראשי
// בדיקת ההרשאות האמיתית נשארת ב-RLS במסד הנתונים.
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet, headers) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
          Object.entries(headers).forEach(([key, value]) => response.headers.set(key, value));
        },
      },
    }
  );

  // getClaims מאמת את החתימה של הטוקן (לא סומך על ה-cookie בעיניים עצומות)
  const { data } = await supabase.auth.getClaims();
  const isLoggedIn = !!data?.claims?.sub;

  const { pathname } = request.nextUrl;
  const isPublic = PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));

  if (!isLoggedIn && !isPublic) {
    return redirectWithCookies(request, response, '/login');
  }

  if (isLoggedIn && pathname === '/login') {
    return redirectWithCookies(request, response, '/');
  }

  return response;
}

// הפניה שמעבירה הלאה גם cookies מרועננים, כדי שה-session לא יתנתק
function redirectWithCookies(request: NextRequest, from: NextResponse, path: string) {
  const redirect = NextResponse.redirect(new URL(path, request.url));
  from.cookies.getAll().forEach((cookie) => redirect.cookies.set(cookie));
  return redirect;
}

export const config = {
  // לא מריצים על API (שם יש בדיקה משלו), קבצים סטטיים ותמונות
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico|icon.png|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)'],
};
