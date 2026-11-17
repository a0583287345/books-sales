'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { BookOpen, Loader2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { logActivity } from '@/lib/logger';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (error) {
      setError(/banned/i.test(error.message) ? 'המשתמש הושבת. יש לפנות למנהלת המערכת.' : 'האימייל או הסיסמה שגויים.');
      setLoading(false);
      return;
    }

    await logActivity('login', 'auth', 'התחברות למערכת');
    router.replace('/');
    router.refresh();
  };

  const input =
    'block w-full rounded-lg border border-slate-300 px-3 py-2.5 text-base focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200';

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center gap-2">
          <BookOpen className="h-10 w-10 text-blue-600" />
          <h1 className="text-2xl font-bold">מכירת ספרי לימוד</h1>
          <p className="text-sm text-slate-500">התחברות למערכת</p>
        </div>

        <form onSubmit={handleLogin} className="space-y-4 rounded-2xl bg-white p-6 shadow">
          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
          )}
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-slate-700">אימייל</span>
            <input
              type="email"
              required
              autoComplete="username"
              dir="ltr"
              className={input}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-slate-700">סיסמה</span>
            <input
              type="password"
              required
              autoComplete="current-password"
              dir="ltr"
              className={input}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
          <button
            type="submit"
            disabled={loading}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 py-2.5 font-medium text-white hover:bg-blue-700 disabled:bg-blue-400"
          >
            {loading && <Loader2 className="h-4 w-4 animate-spin" />}
            {loading ? 'מתחבר...' : 'כניסה'}
          </button>
        </form>
      </div>
    </div>
  );
}
