'use client';

import React from 'react';
import { Lock } from 'lucide-react';
import { useAuth } from '@/components/AuthContext';
import { toast } from '@/components/Toaster';
import { deniedMessage, getPermission } from '@/lib/permissions';

interface ProtectProps {
  permId: string;
  children: React.ReactNode;
  /** מה מציגים במצב "חסום" להרשאת צפייה (ברירת מחדל: "🔒 אין הרשאה") */
  lockedFallback?: React.ReactNode;
  /** מחלקות CSS לעטיפה במצב "חסום" */
  className?: string;
  /** לכפות התנהגות: 'action' = כפתור חסום, 'view' = טקסט "אין הרשאה". ברירת מחדל: לפי סוג ההרשאה */
  mode?: 'action' | 'view';
}

/**
 * מציג תוכן לפי הרשאת המשתמש:
 *   מותר  → כרגיל
 *   חסום  → אפור עם מנעול; בלחיצה מופיעה הודעת "אין לך הרשאה"
 *   מוסתר → לא מוצג בכלל
 */
export function Protect({ permId, children, lockedFallback, className, mode }: ProtectProps) {
  const { stateOf, loading } = useAuth();
  if (loading) return null;

  const state = stateOf(permId);
  if (state === 'allowed') return <>{children}</>;
  if (state === 'hidden') return null;

  const isView = (mode ?? getPermission(permId)?.kind) === 'view';
  if (isView) return <>{lockedFallback ?? <LockedText />}</>;

  return (
    <LockedAction permId={permId} className={className}>
      {children}
    </LockedAction>
  );
}

/** טקסט קטן "אין הרשאה" במקום נתון חסוי */
export function LockedText({ text = 'אין הרשאה' }: { text?: string }) {
  return (
    <span className="inline-flex items-center gap-1 text-xs text-slate-400 italic select-none">
      <Lock className="w-3 h-3" />
      {text}
    </span>
  );
}

/** מסך שלם חסום (כשנכנסים לדף בלי הרשאת צפייה) */
export function LockedPage({ permId }: { permId: string }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 p-10 text-center text-slate-500">
      <Lock className="w-10 h-10 text-slate-400" />
      <p className="text-lg font-medium">{deniedMessage(permId)}</p>
      <p className="text-sm">לקבלת גישה יש לפנות למנהלת המערכת.</p>
    </div>
  );
}

/** עוטף כפתור: חוסם את הלחיצה לפני שהיא מגיעה אליו, ומציג הודעה */
function LockedAction({
  permId,
  className,
  children,
}: {
  permId: string;
  className?: string;
  children: React.ReactNode;
}) {
  const block = (e: React.SyntheticEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  return (
    <span
      className={`relative inline-flex cursor-not-allowed ${className ?? ''}`}
      title={deniedMessage(permId)}
      aria-disabled="true"
      onClickCapture={(e) => {
        block(e);
        toast.denied(deniedMessage(permId));
      }}
      onMouseDownCapture={block}
      onKeyDownCapture={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          block(e);
          toast.denied(deniedMessage(permId));
        }
      }}
      onSubmitCapture={block}
    >
      <span className="contents [&>*]:opacity-50 [&>*]:grayscale [&>*]:pointer-events-none">{children}</span>
      <span className="absolute -top-1.5 -left-1.5 bg-slate-700 text-white rounded-full p-0.5 shadow pointer-events-none">
        <Lock className="w-2.5 h-2.5" />
      </span>
    </span>
  );
}
