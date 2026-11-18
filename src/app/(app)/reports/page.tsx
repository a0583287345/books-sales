'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { BarChart3, Boxes, ClipboardList, FileSpreadsheet, Printer, School, ShoppingCart, Truck, Wallet } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/components/AuthContext';
import { useYear } from '@/components/YearContext';
import { PageGuard, Protect } from '@/components/Protect';
import { Button, EmptyState, PageHeader, Spinner } from '@/components/ui';
import { exportToExcel } from '@/lib/excel';
import { money } from '@/lib/format';

// =====================================================================
// דוחות: ריכוז כל הדוחות במערכת + דוח כללי לכל המוסדות (סעיף 2: "דוח כללי המרכז את כל המוסדות")
// =====================================================================

export default function ReportsPage() {
  return (
    <PageGuard permId="reports_view">
      <ReportsScreen />
    </PageGuard>
  );
}

const LINKS = [
  { href: '/inventory', icon: Boxes, title: 'חוסרים לפי ספק / דוח למוסד', desc: 'מלאי וחוסרים – לשוניות הדוחות', perm: 'inventory_view' },
  { href: '/purchase-orders/plan', icon: ClipboardList, title: 'מה עוד צריך להזמין מכל ספק', desc: 'תכנון רכש', perm: 'po_manage' },
  { href: '/orders', icon: ShoppingCart, title: 'הזמנות לפי מוסד / כיתה / סטטוס', desc: 'סינון + אקסל', perm: 'orders_view' },
  { href: '/classes', icon: School, title: 'רשימות ספרים לכיתה / למוסד', desc: 'הדפסה + אקסל', perm: 'classes_view' },
  { href: '/shipments', icon: Truck, title: 'דוחות אספקה למוסדות', desc: 'בתוך כל משלוח – הדפסה עם חתימה', perm: 'shipments_view' },
  { href: '/finance', icon: Wallet, title: 'כספים: סיכום, חובות, תשלומים, ספקים, הוצאות', desc: 'לפי שנה, מוסד, ספק וסוג הוצאה', perm: 'finance_view' },
];

type InstRow = { inst_name: string; orders_count: number; sales_total: number; paid: number; open_debt: number; delivered_orders: number };

function ReportsScreen() {
  const { year } = useYear();
  const { hasPermission } = useAuth();
  const [rows, setRows] = useState<InstRow[] | null>(null);
  const canMoney = hasPermission('finance_view');
  const yearId = year?.id ?? null;

  useEffect(() => {
    if (!yearId || !canMoney) return;
    let cancelled = false;
    void supabase.rpc('institution_finance', { p_year: yearId }).then(({ data }) => {
      if (!cancelled) setRows(((data ?? []) as InstRow[]).sort((a, b) => a.inst_name.localeCompare(b.inst_name, 'he')));
    });
    return () => {
      cancelled = true;
    };
  }, [yearId, canMoney]);

  if (!year) return <EmptyState>יש לפתוח שנת לימודים.</EmptyState>;
  const totals = (rows ?? []).reduce(
    (a, r) => ({ o: a.o + r.orders_count, s: a.s + r.sales_total, p: a.p + r.paid, d: a.d + r.open_debt, del: a.del + r.delivered_orders }),
    { o: 0, s: 0, p: 0, d: 0, del: 0 }
  );

  return (
    <div className="space-y-5">
      <PageHeader title={`דוחות – ${year.name}`} />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 print:hidden">
        {LINKS.filter((l) => hasPermission(l.perm)).map((l) => {
          const Icon = l.icon;
          return (
            <Link key={l.href} href={l.href} className="flex gap-3 rounded-xl bg-white p-4 shadow-sm hover:shadow-md">
              <Icon className="h-6 w-6 shrink-0 text-blue-600" />
              <span>
                <span className="block font-semibold">{l.title}</span>
                <span className="block text-sm text-slate-500">{l.desc}</span>
              </span>
            </Link>
          );
        })}
      </div>

      {canMoney && (
        <div className="rounded-xl bg-white p-4 shadow-sm">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <h2 className="flex flex-1 items-center gap-2 text-lg font-bold">
              <BarChart3 className="h-5 w-5 text-slate-500" /> דוח כללי – כל המוסדות
            </h2>
            <Protect permId="export_excel">
              <Button
                variant="secondary"
                onClick={() =>
                  exportToExcel(`דוח כללי – ${year.name}`, [
                    {
                      name: 'מוסדות',
                      rows: (rows ?? []).map((r) => ({ מוסד: r.inst_name, הזמנות: r.orders_count, 'נמסרו במלואן': r.delivered_orders, מכירות: r.sales_total, שולם: r.paid, 'חוב פתוח': r.open_debt })),
                    },
                  ])
                }
              >
                <FileSpreadsheet className="h-4 w-4" /> אקסל
              </Button>
            </Protect>
            <Button variant="secondary" onClick={() => window.print()} className="print:hidden">
              <Printer className="h-4 w-4" />
            </Button>
          </div>
          {!rows ? (
            <Spinner />
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-slate-600">
                <tr>
                  <th className="px-3 py-2 text-right">מוסד</th>
                  <th className="px-3 py-2 text-right">הזמנות</th>
                  <th className="px-3 py-2 text-right">נמסרו</th>
                  <th className="px-3 py-2 text-right">מכירות</th>
                  <th className="px-3 py-2 text-right">שולם</th>
                  <th className="px-3 py-2 text-right">חוב</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((r) => (
                  <tr key={r.inst_name}>
                    <td className="px-3 py-2 font-medium">{r.inst_name}</td>
                    <td className="px-3 py-2">{r.orders_count}</td>
                    <td className="px-3 py-2">{r.delivered_orders}</td>
                    <td className="px-3 py-2">{money(r.sales_total)}</td>
                    <td className="px-3 py-2">{money(r.paid)}</td>
                    <td className={`px-3 py-2 ${r.open_debt ? 'text-red-600' : 'text-slate-400'}`}>{money(r.open_debt)}</td>
                  </tr>
                ))}
                <tr className="bg-slate-50 font-bold">
                  <td className="px-3 py-2">סה״כ</td>
                  <td className="px-3 py-2">{totals.o}</td>
                  <td className="px-3 py-2">{totals.del}</td>
                  <td className="px-3 py-2">{money(totals.s)}</td>
                  <td className="px-3 py-2">{money(totals.p)}</td>
                  <td className="px-3 py-2">{money(totals.d)}</td>
                </tr>
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}
