'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Camera, CameraOff, Search } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useYear } from '@/components/YearContext';
import { PageGuard } from '@/components/Protect';
import { Button, PageHeader } from '@/components/ui';
import { toast } from '@/components/Toaster';

// =====================================================================
// סריקת QR של שקית במצלמת הטאבלט (qr-scanner, עובד גם באייפד), או הקלדת מס' הזמנה / קוד שקית
// =====================================================================

export default function ScanPage() {
  return (
    <PageGuard permId={['picking_do', 'bags_check', 'pickups_do', 'labels_print']}>
      <ScanScreen />
    </PageGuard>
  );
}

/** מה שנסרק → קוד שקית או מס' הזמנה */
function parseScan(text: string): { code?: string; order?: string } {
  const t = text.trim();
  const m = t.match(/\/b\/([^/?#]+)/);
  if (m) return { code: decodeURIComponent(m[1]) };
  if (/^\d+-\d+$/.test(t)) return { code: t };
  if (/^\d+$/.test(t)) return { order: t };
  return { code: t };
}

function ScanScreen() {
  const router = useRouter();
  const { year } = useYear();
  const videoRef = useRef<HTMLVideoElement>(null);
  const scannerRef = useRef<{ stop: () => void; destroy: () => void } | null>(null);
  const busyRef = useRef(false);
  const [on, setOn] = useState(false);
  const [manual, setManual] = useState('');

  const go = useCallback(
    async (text: string) => {
      if (busyRef.current) return;
      busyRef.current = true;
      const { code, order } = parseScan(text);
      if (code) {
        const { data } = await supabase.from('bags').select('order_id').eq('code', code).maybeSingle();
        if (data) return router.push(`/bags/order/${data.order_id}?bag=${encodeURIComponent(code)}`);
      }
      if (order && year) {
        const { data } = await supabase.rpc('find_orders_for_pickup', { p_year: year.id, p_query: order });
        const hit = data?.find((o) => String(o.order_number) === order);
        if (hit) return router.push(`/bags/order/${hit.order_id}`);
      }
      toast.error(`לא נמצא: ${text}`);
      setTimeout(() => (busyRef.current = false), 1500);
    },
    [router, year]
  );

  const stop = useCallback(() => {
    scannerRef.current?.stop();
    scannerRef.current?.destroy();
    scannerRef.current = null;
    setOn(false);
  }, []);

  const start = async () => {
    if (!videoRef.current) return;
    try {
      const { default: QrScanner } = await import('qr-scanner');
      const scanner = new QrScanner(videoRef.current, (r) => void go(r.data), {
        preferredCamera: 'environment',
        highlightScanRegion: true,
        highlightCodeOutline: true,
        returnDetailedScanResult: true,
      });
      scannerRef.current = scanner;
      await scanner.start();
      setOn(true);
    } catch {
      toast.error('לא ניתן לפתוח את המצלמה. יש לאשר גישה למצלמה בדפדפן.');
      stop();
    }
  };

  useEffect(() => stop, [stop]);

  return (
    <div className="mx-auto max-w-xl space-y-4">
      <PageHeader title="סריקת שקית" />
      <div className="relative overflow-hidden rounded-2xl bg-black" style={{ aspectRatio: '4 / 3' }}>
        <video ref={videoRef} className="h-full w-full object-cover" muted playsInline />
        {!on && (
          <div className="absolute inset-0 flex items-center justify-center">
            <Button onClick={start} className="px-6 py-3 text-base">
              <Camera className="h-5 w-5" /> הפעלת המצלמה
            </Button>
          </div>
        )}
      </div>
      {on && (
        <Button variant="secondary" onClick={stop} className="w-full">
          <CameraOff className="h-4 w-4" /> כיבוי המצלמה
        </Button>
      )}
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (manual.trim()) void go(manual.trim());
        }}
      >
        <input
          className="flex-1 rounded-lg border border-slate-300 px-3 py-2.5 text-base"
          placeholder="או הקלדה: מס׳ הזמנה / קוד שקית (10001-1)"
          dir="ltr"
          value={manual}
          onChange={(e) => {
            busyRef.current = false;
            setManual(e.target.value);
          }}
        />
        <Button type="submit">
          <Search className="h-4 w-4" />
        </Button>
      </form>
      <p className="text-sm text-slate-500">אפשר גם לסרוק את המדבקה במצלמה הרגילה של הטאבלט – הקישור יפתח את מסך השקית.</p>
    </div>
  );
}
