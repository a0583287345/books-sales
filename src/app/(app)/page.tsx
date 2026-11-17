'use client';

import { BookOpen } from 'lucide-react';
import { useAuth } from '@/components/AuthContext';
import { LockedPage } from '@/components/Protect';

// מסך ראשי זמני – הדשבורד ייבנה בשלב ה׳ (ראו docs/ROADMAP.md)
export default function Home() {
  const { access, stateOf } = useAuth();
  const state = stateOf('dashboard_view');

  if (state !== 'allowed') {
    // בלי הרשאה לדשבורד: ברכה בלבד (חסום → עם הודעה)
    return state === 'locked' ? <LockedPage permId="dashboard_view" /> : <Welcome name={access?.fullName} />;
  }

  return <Welcome name={access?.fullName} note="תמונת המצב (הזמנות, חוסרים, משלוחים, כספים) תיבנה בהמשך." />;
}

function Welcome({ name, note }: { name?: string; note?: string }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
      <BookOpen className="h-12 w-12 text-blue-600" aria-hidden />
      <h1 className="text-2xl font-bold">שלום{name ? `, ${name}` : ''}</h1>
      <p className="text-slate-500">ברוכים הבאים למערכת מכירת ספרי לימוד.</p>
      {note && <p className="text-sm text-slate-400">{note}</p>}
    </div>
  );
}
