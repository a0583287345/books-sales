'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { EmptyState, Spinner } from '@/components/ui';

// קישור ה-QR שעל המדבקה: /b/<קוד שקית> → מסך האריזה/המסירה של ההזמנה, עם השקית מסומנת
export default function BagLinkPage() {
  const { code } = useParams<{ code: string }>();
  const router = useRouter();
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    const c = decodeURIComponent(code);
    let cancelled = false;
    void supabase
      .from('bags')
      .select('order_id')
      .eq('code', c)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled) return;
        if (data) router.replace(`/bags/order/${data.order_id}?bag=${encodeURIComponent(c)}`);
        else setNotFound(true);
      });
    return () => {
      cancelled = true;
    };
  }, [code, router]);

  return notFound ? <EmptyState>השקית לא נמצאה, או שאין לך הרשאה למסכי המחסן.</EmptyState> : <Spinner />;
}
