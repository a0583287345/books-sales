'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { BookOpen, Boxes, ClipboardList, PackageOpen, School, ShoppingBag, ShoppingCart, Truck, Wallet } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/components/AuthContext';
import { useYear } from '@/components/YearContext';
import { LockedPage } from '@/components/Protect';
import { Spinner } from '@/components/ui';
import { money } from '@/lib/format';
import { ORDER_STATUS_LABELS, ORDER_STATUSES } from '@/lib/orders';

// =====================================================================
// מסך ראשי – תמונת מצב לשנה הנבחרת (סעיף 17 באפיון)
// =====================================================================

type Stats = {
  institutions: number;
  orders: number;
  orders_by_status: Record<string, number>;
  orders_unhandled: number;
  books_missing: number;
  books_to_order: number;
  po_open: number;
  orders_to_pack: number;
  bags_in_progress: number;
  bags_ready: number;
  deliveries_open: number;
  money: { sales_total: number; received: number; open_debt: number; expenses: number; supplier_owed: number } | null;
};

export default function Home() {
  const { access, stateOf } = useAuth();
  const state = stateOf('dashboard_view');
  if (state === 'locked') return <LockedPage permId="dashboard_view" />;
  if (state !== 'allowed') return <Welcome name={access?.fullName} />;
  return <Dashboard name={access?.fullName} />;
}

function Welcome({ name }: { name?: string }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
      <BookOpen className="h-12 w-12 text-blue-600" aria-hidden />
      <h1 className="text-2xl font-bold">שלום{name ? `, ${name}` : ''}</h1>
      <p className="text-slate-500">בחרו מסך מהתפריט.</p>
    </div>
  );
}

function Dashboard({ name }: { name?: string }) {
  const { year } = useYear();
  const [s, setS] = useState<Stats | null>(null);
  const yearId = year?.id ?? null;

  useEffect(() => {
    if (!yearId) return;
    let cancelled = false;
    void supabase.rpc('dashboard_stats', { p_year: yearId }).then(({ data }) => !cancelled && setS((data as unknown as Stats) ?? null));
    return () => {
      cancelled = true;
    };
  }, [yearId]);

  if (!year) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
        <h1 className="text-2xl font-bold">שלום{name ? `, ${name}` : ''}</h1>
        <Link href="/years" className="text-blue-700 underline">לפתיחת שנת הלימודים הראשונה</Link>
      </div>
    );
  }
  if (!s) return <Spinner />;

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-bold">
        שלום{name ? `, ${name}` : ''} <span className="text-base font-normal text-slate-500">· {year.name}</span>
      </h1>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Tile href="/institutions" icon={<School />} label="מוסדות פעילים" value={s.institutions} />
        <Tile href="/orders" icon={<ShoppingCart />} label="הזמנות" value={s.orders} sub={s.orders_unhandled ? `${s.orders_unhandled} ממתינות לטיפול` : 'הכול בטיפול'} alert={s.orders_unhandled > 0} />
        <Tile href="/inventory" icon={<Boxes />} label="ספרים חסרים למוסדות" value={s.books_missing} sub={s.books_to_order ? `${s.books_to_order} עוד לא הוזמנו מספקים` : 'הכול הוזמן'} alert={s.books_to_order > 0} />
        <Tile href="/purchase-orders" icon={<PackageOpen />} label="הזמנות רכש פתוחות" value={s.po_open} />
        <Tile href="/bags" icon={<ShoppingBag />} label="הזמנות שממתינות לאריזה" value={s.orders_to_pack} sub={s.bags_in_progress ? `${s.bags_in_progress} שקיות בליקוט / לבדיקה` : undefined} />
        <Tile href="/shipments" icon={<Truck />} label="שקיות מוכנות שלא נמסרו" value={s.bags_ready} sub={s.deliveries_open ? `${s.deliveries_open} משלוחים למוסדות פתוחים` : undefined} />
        {s.money && (
          <>
            <Tile href="/finance" icon={<Wallet />} label="חובות פתוחים" value={money(s.money.open_debt)} alert={s.money.open_debt > 0} />
            <Tile
              href="/finance"
              icon={<Wallet />}
              label="הכנסות / הוצאות"
              value={money(s.money.received)}
              sub={`מכירות ${money(s.money.sales_total)} · הוצאות ${money(s.money.expenses)} · לספקים ${money(s.money.supplier_owed)}`}
            />
          </>
        )}
      </div>

      <div className="rounded-xl bg-white p-4 shadow-sm">
        <h2 className="mb-3 flex items-center gap-2 font-semibold">
          <ClipboardList className="h-4 w-4 text-slate-500" /> הזמנות לפי סטטוס
        </h2>
        <div className="flex flex-wrap gap-2">
          {ORDER_STATUSES.filter((st) => s.orders_by_status[st]).map((st) => (
            <span key={st} className="rounded-lg bg-slate-100 px-3 py-1.5 text-sm">
              {ORDER_STATUS_LABELS[st]}: <b>{s.orders_by_status[st]}</b>
            </span>
          ))}
          {Object.keys(s.orders_by_status).length === 0 && <span className="text-sm text-slate-400">אין עדיין הזמנות</span>}
        </div>
      </div>
    </div>
  );
}

function Tile({ href, icon, label, value, sub, alert }: { href: string; icon: React.ReactNode; label: string; value: number | string; sub?: string; alert?: boolean }) {
  return (
    <Link href={href} className="flex gap-3 rounded-xl bg-white p-4 shadow-sm transition hover:shadow-md">
      <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg [&>svg]:h-5 [&>svg]:w-5 ${alert ? 'bg-red-50 text-red-600' : 'bg-blue-50 text-blue-600'}`}>{icon}</span>
      <span className="min-w-0">
        <span className="block text-sm text-slate-500">{label}</span>
        <span className={`block text-2xl font-bold ${alert ? 'text-red-600' : ''}`}>{value}</span>
        {sub && <span className="block truncate text-xs text-slate-400">{sub}</span>}
      </span>
    </Link>
  );
}
