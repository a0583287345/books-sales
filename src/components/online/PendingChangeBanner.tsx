'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { MessageSquareDiff } from 'lucide-react';
import { supabase } from '@/lib/supabase';

/** במסך ההזמנה: יש בקשת שינוי מהקישור שממתינה לאישור */
export function PendingChangeBanner({ orderId }: { orderId: string }) {
  const [pending, setPending] = useState(false);
  useEffect(() => {
    let cancelled = false;
    void supabase
      .from('online_change_requests')
      .select('id', { count: 'exact', head: true })
      .eq('order_id', orderId)
      .eq('status', 'pending')
      .then(({ count }) => !cancelled && setPending((count ?? 0) > 0));
    return () => {
      cancelled = true;
    };
  }, [orderId]);
  if (!pending) return null;
  return (
    <Link
      href="/orders/requests"
      className="mt-2 flex items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-900 hover:bg-amber-100 print:hidden"
    >
      <MessageSquareDiff className="h-4 w-4" /> ההורה ביקש שינוי בהזמנה דרך הקישור – ממתין לאישור (לחצו למסך בקשות השינוי)
    </Link>
  );
}
