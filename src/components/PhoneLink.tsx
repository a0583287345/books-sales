'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Phone, MessageCircle, Copy } from 'lucide-react';
import { toast } from '@/components/Toaster';

/**
 * מספר לוואטסאפ בפורמט בינלאומי (ספרות בלבד):
 * 050-1234567 → 972501234567 · ‎+1 718… / 001 718… → 1718… · 972… נשאר
 */
export function whatsappNumber(phone: string): string | null {
  const trimmed = phone.trim();
  let d = trimmed.replace(/\D/g, '');
  if (!d) return null;
  if (d.startsWith('00')) d = d.slice(2);
  else if (!trimmed.startsWith('+') && d.startsWith('0')) d = `972${d.slice(1)}`;
  return d.length >= 8 ? d : null;
}

type Props = {
  phone: string;
  className?: string;
  /** אייקון טלפון לפני המספר */
  showIcon?: boolean;
};

/** מספר טלפון לחיץ: תפריט קטן עם שיחה / וואטסאפ / העתקה */
export default function PhoneLink({ phone, className = '', showIcon = false }: Props) {
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const wa = whatsappNumber(phone);

  // סגירה בלחיצה בחוץ, בגלילה או בשינוי גודל החלון
  useEffect(() => {
    if (!pos) return;
    const close = () => setPos(null);
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!menuRef.current?.contains(t) && !buttonRef.current?.contains(t)) close();
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close();
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
    };
  }, [pos]);

  const toggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (pos) return setPos(null);
    const r = buttonRef.current?.getBoundingClientRect();
    if (!r) return;
    const width = 176;
    // מיושר לימין המספר, לא יוצא מהמסך
    const left = Math.max(8, Math.min(r.right - width, window.innerWidth - width - 8));
    const top = r.bottom + 140 > window.innerHeight ? r.top - 136 : r.bottom + 4;
    setPos({ top, left });
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(phone);
      toast.success('המספר הועתק');
    } catch {
      toast.error('ההעתקה נכשלה');
    }
    setPos(null);
  };

  const item = 'w-full flex items-center gap-2 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 text-right';

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={toggle}
        dir="ltr"
        title="שיחה / וואטסאפ"
        className={`inline-flex items-center gap-1 whitespace-nowrap hover:underline ${className}`}
      >
        {showIcon && <Phone className="w-3 h-3" />}
        {phone}
      </button>

      {pos &&
        createPortal(
          <div
            ref={menuRef}
            dir="rtl"
            onClick={(e) => e.stopPropagation()}
            style={{ top: pos.top, left: pos.left, width: 176 }}
            className="fixed z-[120] bg-white border border-slate-200 rounded-xl shadow-lg overflow-hidden py-1"
          >
            <a href={`tel:${phone.replace(/[^\d+]/g, '')}`} onClick={() => setPos(null)} className={item}>
              <Phone className="w-4 h-4 text-blue-600" />
              שיחה
            </a>
            {wa && (
              <a
                href={`https://wa.me/${wa}`}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => setPos(null)}
                className={item}
              >
                <MessageCircle className="w-4 h-4 text-emerald-600" />
                הודעת וואטסאפ
              </a>
            )}
            <button type="button" onClick={() => void copy()} className={item}>
              <Copy className="w-4 h-4 text-slate-400" />
              העתקת המספר
            </button>
          </div>,
          document.body
        )}
    </>
  );
}
