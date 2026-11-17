import { supabase } from '@/lib/supabase';

/** קריאה ל-API בצד השרת עם הטוקן של המשתמש המחובר. זורק שגיאה עם ההודעה מהשרת */
export async function callServerApi<T = Record<string, unknown>>(
  url: string,
  body: Record<string, unknown>
): Promise<T> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token ?? ''}` },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error || 'שגיאה');
  return data as T;
}
