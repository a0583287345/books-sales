'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Ban, FileSpreadsheet, Pencil, Plus, Printer, Trash2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/components/AuthContext';
import { useYear } from '@/components/YearContext';
import { PageGuard, Protect } from '@/components/Protect';
import DateInput from '@/components/DateInput';
import { Button, EmptyState, Field, inputClass, Modal, PageHeader, Spinner } from '@/components/ui';
import { toast } from '@/components/Toaster';
import { dbErrorMessage } from '@/lib/dbErrors';
import { exportToExcel } from '@/lib/excel';
import { ImportButton, ImportExcelModal } from '@/components/ImportExcelModal';
import { expensesImporter } from '@/lib/importers';
import { formatDate, money, nullIfEmpty, toNumber } from '@/lib/format';
import { fetchSuppliers, type Supplier } from '@/lib/entities';
import {
  EXPENSE_CATEGORIES,
  METHOD_LABELS,
  PAY_METHODS,
  PAYMENT_KIND_LABELS,
  type FinanceSummary,
  type PayMethod,
} from '@/lib/finance';

export default function FinancePage() {
  return (
    <PageGuard permId={['finance_view', 'expenses_manage', 'supplier_payments_manage']}>
      <FinanceScreen />
    </PageGuard>
  );
}

type Tab = 'summary' | 'debts' | 'payments' | 'suppliers' | 'expenses';

function FinanceScreen() {
  const { year } = useYear();
  const { hasPermission } = useAuth();
  const canView = hasPermission('finance_view');
  const tabs: [Tab, string, boolean][] = [
    ['summary', 'סיכום', canView],
    ['debts', 'חובות', canView],
    ['payments', 'תשלומים מלקוחות', canView],
    ['suppliers', 'ספקים', canView || hasPermission('supplier_payments_manage')],
    ['expenses', 'הוצאות', canView || hasPermission('expenses_manage')],
  ];
  const visible = tabs.filter((t) => t[2]);
  const [tab, setTab] = useState<Tab>(visible[0]?.[0] ?? 'summary');

  if (!year) return <EmptyState>יש לפתוח שנת לימודים.</EmptyState>;

  return (
    <div>
      <PageHeader title={`כספים והוצאות – ${year.name}`} />
      <div className="mb-4 flex gap-1 overflow-x-auto border-b border-slate-200 print:hidden">
        {visible.map(([t, label]) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`whitespace-nowrap border-b-2 px-4 py-2.5 text-sm ${tab === t ? 'border-blue-600 font-semibold text-blue-700' : 'border-transparent text-slate-600'}`}
          >
            {label}
          </button>
        ))}
      </div>
      {tab === 'summary' && <SummaryTab yearId={year.id} yearName={year.name} />}
      {tab === 'debts' && <DebtsTab yearId={year.id} yearName={year.name} />}
      {tab === 'payments' && <PaymentsTab yearId={year.id} yearName={year.name} />}
      {tab === 'suppliers' && <SuppliersTab yearId={year.id} yearName={year.name} />}
      {tab === 'expenses' && <ExpensesTab yearId={year.id} yearName={year.name} />}
    </div>
  );
}

// ---------------------------------------------------------------------

function Card({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: 'good' | 'bad' | 'warn' }) {
  const color = tone === 'good' ? 'text-emerald-700' : tone === 'bad' ? 'text-red-600' : tone === 'warn' ? 'text-amber-700' : 'text-slate-900';
  return (
    <div className="rounded-xl bg-white p-4 shadow-sm">
      <div className="text-sm text-slate-500">{label}</div>
      <div className={`mt-1 text-2xl font-bold ${color}`}>{value}</div>
      {sub && <div className="mt-0.5 text-xs text-slate-400">{sub}</div>}
    </div>
  );
}

function SummaryTab({ yearId, yearName }: { yearId: string; yearName: string }) {
  const [s, setS] = useState<FinanceSummary | null>(null);
  useEffect(() => {
    let cancelled = false;
    void supabase.rpc('finance_summary', { p_year: yearId }).then(({ data, error }) => {
      if (cancelled) return;
      if (error) toast.error(dbErrorMessage(error.message));
      setS((data as unknown as FinanceSummary) ?? null);
    });
    return () => {
      cancelled = true;
    };
  }, [yearId]);

  if (!s) return <Spinner />;
  const netReceived = s.received - s.refunded;
  const costs = s.purchases + s.delivery_costs + s.expenses_total;
  const profit = s.sales_total - costs;

  return (
    <div className="space-y-4">
      <div className="flex justify-end print:hidden">
        <Button variant="secondary" onClick={() => window.print()}>
          <Printer className="h-4 w-4" /> הדפסה
        </Button>
      </div>
      <h2 className="hidden text-xl font-bold print:block">סיכום כספי – {yearName}</h2>

      <h3 className="font-semibold text-slate-600">הכנסות מלקוחות</h3>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card label="מכירות (אחרי הנחות)" value={money(s.sales_total)} sub={`${s.orders_count} הזמנות · הנחות ${money(s.discounts)}`} />
        <Card label="התקבל בפועל" value={money(netReceived)} sub={s.refunded ? `כולל החזרים של ${money(s.refunded)}` : undefined} tone="good" />
        <Card label="חובות פתוחים" value={money(s.open_debt)} sub={`${s.debt_orders} הזמנות`} tone={s.open_debt ? 'bad' : undefined} />
        <Card label="יתרות זכות ללקוחות" value={money(s.open_credit)} sub="להחזר או לזיכוי" tone={s.open_credit ? 'warn' : undefined} />
      </div>
      <div className="rounded-xl bg-white p-4 shadow-sm">
        <div className="mb-2 text-sm font-semibold">לפי אמצעי תשלום</div>
        <div className="flex flex-wrap gap-6 text-sm">
          {Object.keys(s.by_method).length === 0 && <span className="text-slate-400">אין תשלומים</span>}
          {Object.entries(s.by_method).map(([m, v]) => (
            <div key={m}>
              {METHOD_LABELS[m] ?? m}: <b>{money(v)}</b>
            </div>
          ))}
        </div>
      </div>

      <h3 className="font-semibold text-slate-600">ספקים והוצאות</h3>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card label="קניות מספקים (מה שהתקבל)" value={money(s.purchases)} sub={`שולם ${money(s.supplier_paid)}`} />
        <Card
          label={s.supplier_owed >= 0 ? 'חוב לספקים' : 'שולם מראש לספקים'}
          value={money(Math.abs(s.supplier_owed))}
          tone={s.supplier_owed > 0 ? 'bad' : s.supplier_owed < 0 ? 'warn' : undefined}
        />
        <Card label="משלוחים למוסדות" value={money(s.delivery_costs)} />
        <Card label="הוצאות אחרות" value={money(s.expenses_total)} />
      </div>
      {Object.keys(s.expenses_by_category).length > 0 && (
        <div className="rounded-xl bg-white p-4 text-sm shadow-sm">
          {Object.entries(s.expenses_by_category).map(([c, v]) => (
            <span key={c} className="ml-6 inline-block">
              {c}: <b>{money(v)}</b>
            </span>
          ))}
        </div>
      )}

      <div className="rounded-xl bg-slate-800 p-4 text-white">
        <div className="text-sm opacity-80">רווח משוער (מכירות − קניות − משלוחים − הוצאות)</div>
        <div className="text-3xl font-bold">{money(profit)}</div>
        <div className="mt-1 text-xs opacity-70">הערכה בלבד. הנהלת חשבונות, חשבוניות וקבלות – בנפרד.</div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------

type DebtRow = {
  id: string;
  number: number;
  student_name: string;
  total: number;
  paid_amount: number;
  balance: number;
  status: string;
  customers: { first_name: string; last_name: string; phone: string | null } | null;
  classes: { name: string } | null;
  institution_years: { institutions: { name: string } | null } | null;
};

function DebtsTab({ yearId, yearName }: { yearId: string; yearName: string }) {
  const [rows, setRows] = useState<DebtRow[] | null>(null);
  const [inst, setInst] = useState('');
  const [byInst, setByInst] = useState<{ inst_name: string; orders_count: number; sales_total: number; paid: number; open_debt: number }[]>([]);

  useEffect(() => {
    let cancelled = false;
    void Promise.all([
      supabase
        .from('orders')
        .select('id, number, student_name, total, paid_amount, balance, status, customers(first_name, last_name, phone), classes(name), institution_years(institutions(name))')
        .eq('year_id', yearId)
        .gt('balance', 0)
        .neq('status', 'cancelled')
        .order('number'),
      supabase.rpc('institution_finance', { p_year: yearId }),
    ]).then(([o, f]) => {
      if (cancelled) return;
      setRows((o.data ?? []) as unknown as DebtRow[]);
      setByInst((f.data ?? []).sort((a, b) => b.open_debt - a.open_debt));
    });
    return () => {
      cancelled = true;
    };
  }, [yearId]);

  const filtered = useMemo(() => (rows ?? []).filter((r) => !inst || r.institution_years?.institutions?.name === inst), [rows, inst]);
  const total = filtered.reduce((s, r) => s + r.balance, 0);

  const exportExcel = () =>
    exportToExcel(`חובות – ${yearName}`, [
      {
        name: 'חובות',
        rows: filtered.map((r) => ({
          'מס׳ הזמנה': r.number,
          לקוח: r.customers ? `${r.customers.last_name} ${r.customers.first_name}` : '',
          טלפון: r.customers?.phone ?? '',
          תלמיד: r.student_name,
          מוסד: r.institution_years?.institutions?.name ?? '',
          כיתה: r.classes?.name ?? '',
          סכום: r.total,
          שולם: r.paid_amount,
          יתרה: r.balance,
        })),
      },
      { name: 'לפי מוסד', rows: byInst.map((b) => ({ מוסד: b.inst_name, הזמנות: b.orders_count, מכירות: b.sales_total, שולם: b.paid, חוב: b.open_debt })) },
    ]);

  if (!rows) return <Spinner />;

  return (
    <div className="space-y-4">
      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-600">
            <tr>
              <th className="px-3 py-2 text-right">מוסד</th>
              <th className="px-3 py-2 text-right">הזמנות</th>
              <th className="px-3 py-2 text-right">מכירות</th>
              <th className="px-3 py-2 text-right">שולם</th>
              <th className="px-3 py-2 text-right">חוב פתוח</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {byInst.map((b) => (
              <tr key={b.inst_name} className="cursor-pointer hover:bg-blue-50" onClick={() => setInst(inst === b.inst_name ? '' : b.inst_name)}>
                <td className={`px-3 py-2 ${inst === b.inst_name ? 'font-bold text-blue-700' : ''}`}>{b.inst_name}</td>
                <td className="px-3 py-2">{b.orders_count}</td>
                <td className="px-3 py-2">{money(b.sales_total)}</td>
                <td className="px-3 py-2">{money(b.paid)}</td>
                <td className={`px-3 py-2 ${b.open_debt ? 'font-medium text-red-600' : 'text-slate-400'}`}>{money(b.open_debt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center gap-2 print:hidden">
        <h3 className="flex-1 font-semibold">
          הזמנות עם יתרה לתשלום{inst && ` – ${inst}`}: {filtered.length} · {money(total)}
        </h3>
        {inst && <Button variant="ghost" onClick={() => setInst('')}>כל המוסדות</Button>}
        <Protect permId="export_excel">
          <Button variant="secondary" onClick={exportExcel}>
            <FileSpreadsheet className="h-4 w-4" /> אקסל
          </Button>
        </Protect>
        <Button variant="secondary" onClick={() => window.print()}>
          <Printer className="h-4 w-4" />
        </Button>
      </div>
      {filtered.length === 0 ? (
        <EmptyState>אין חובות פתוחים 🎉</EmptyState>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-600">
              <tr>
                <th className="px-3 py-2 text-right">הזמנה</th>
                <th className="px-3 py-2 text-right">לקוח</th>
                <th className="px-3 py-2 text-right">תלמיד</th>
                <th className="px-3 py-2 text-right">מוסד / כיתה</th>
                <th className="px-3 py-2 text-right">סכום</th>
                <th className="px-3 py-2 text-right">שולם</th>
                <th className="px-3 py-2 text-right">יתרה</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map((r) => (
                <tr key={r.id}>
                  <td className="px-3 py-2">
                    <Link href={`/orders/${r.id}`} className="text-blue-700 hover:underline">{r.number}</Link>
                  </td>
                  <td className="px-3 py-2">
                    {r.customers?.last_name} {r.customers?.first_name}
                    <span className="mr-1 text-xs text-slate-400" dir="ltr">{r.customers?.phone}</span>
                  </td>
                  <td className="px-3 py-2">{r.student_name}</td>
                  <td className="px-3 py-2">{r.institution_years?.institutions?.name} / {r.classes?.name}</td>
                  <td className="px-3 py-2">{money(r.total)}</td>
                  <td className="px-3 py-2">{money(r.paid_amount)}</td>
                  <td className="px-3 py-2 font-medium text-red-600">{money(r.balance)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------

type PayRow = {
  id: string;
  kind: string;
  amount: number;
  method: string;
  paid_at: string;
  reference: string | null;
  voided: boolean;
  created_by_name: string | null;
  orders: { id: string; number: number; student_name: string; year_id: string; customers: { first_name: string; last_name: string } | null } | null;
};

function PaymentsTab({ yearId, yearName }: { yearId: string; yearName: string }) {
  const [rows, setRows] = useState<PayRow[] | null>(null);
  const [method, setMethod] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [showVoided, setShowVoided] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void supabase
      .from('payments')
      .select('id, kind, amount, method, paid_at, reference, voided, created_by_name, orders!inner(id, number, student_name, year_id, customers(first_name, last_name))')
      .eq('orders.year_id', yearId)
      .order('paid_at', { ascending: false })
      .order('created_at', { ascending: false })
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) toast.error(dbErrorMessage(error.message));
        setRows((data ?? []) as unknown as PayRow[]);
      });
    return () => {
      cancelled = true;
    };
  }, [yearId]);

  const filtered = (rows ?? []).filter(
    (r) => (showVoided || !r.voided) && (!method || r.method === method) && (!from || r.paid_at >= from) && (!to || r.paid_at <= to)
  );
  const sum = filtered.filter((r) => !r.voided).reduce((s, r) => s + r.amount, 0);

  const exportExcel = () =>
    exportToExcel(`תשלומים – ${yearName}`, [
      {
        name: 'תשלומים',
        rows: filtered.map((r) => ({
          תאריך: formatDate(r.paid_at),
          סוג: PAYMENT_KIND_LABELS[r.kind],
          'אמצעי תשלום': METHOD_LABELS[r.method],
          סכום: r.amount,
          'מס׳ הזמנה': r.orders?.number,
          לקוח: r.orders?.customers ? `${r.orders.customers.last_name} ${r.orders.customers.first_name}` : '',
          תלמיד: r.orders?.student_name,
          אסמכתה: r.reference,
          'נרשם ע״י': r.created_by_name,
          בוטל: r.voided ? 'כן' : '',
        })),
      },
    ]);

  if (!rows) return <Spinner />;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-2">
        <Field label="אמצעי תשלום">
          <select className={`${inputClass} w-auto`} value={method} onChange={(e) => setMethod(e.target.value)}>
            <option value="">הכול</option>
            {[...PAY_METHODS, 'credit'].map((m) => (
              <option key={m} value={m}>{METHOD_LABELS[m]}</option>
            ))}
          </select>
        </Field>
        <Field label="מתאריך">
          <DateInput value={from} onChange={setFrom} />
        </Field>
        <Field label="עד תאריך">
          <DateInput value={to} onChange={setTo} />
        </Field>
        <label className="flex items-center gap-2 pb-2 text-sm">
          <input type="checkbox" checked={showVoided} onChange={(e) => setShowVoided(e.target.checked)} /> כולל מבוטלים
        </label>
        <div className="flex-1" />
        <Protect permId="export_excel">
          <Button variant="secondary" onClick={exportExcel}>
            <FileSpreadsheet className="h-4 w-4" /> אקסל
          </Button>
        </Protect>
      </div>
      <p className="text-sm text-slate-600">
        {filtered.length} רשומות · סה״כ <b>{money(sum)}</b>
      </p>
      {filtered.length === 0 ? (
        <EmptyState>אין תשלומים</EmptyState>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-600">
              <tr>
                <th className="px-3 py-2 text-right">תאריך</th>
                <th className="px-3 py-2 text-right">סוג</th>
                <th className="px-3 py-2 text-right">אמצעי</th>
                <th className="px-3 py-2 text-right">סכום</th>
                <th className="px-3 py-2 text-right">הזמנה</th>
                <th className="px-3 py-2 text-right">לקוח / תלמיד</th>
                <th className="px-3 py-2 text-right">אסמכתה</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map((r) => (
                <tr key={r.id} className={r.voided ? 'text-slate-400 line-through' : ''}>
                  <td className="px-3 py-2">{formatDate(r.paid_at)}</td>
                  <td className="px-3 py-2">{PAYMENT_KIND_LABELS[r.kind]}</td>
                  <td className="px-3 py-2">{METHOD_LABELS[r.method]}</td>
                  <td className={`px-3 py-2 font-medium ${r.amount < 0 ? 'text-red-600' : ''}`} dir="ltr" style={{ textAlign: 'right' }}>{money(r.amount)}</td>
                  <td className="px-3 py-2">
                    {r.orders && <Link href={`/orders/${r.orders.id}`} className="text-blue-700 hover:underline">{r.orders.number}</Link>}
                  </td>
                  <td className="px-3 py-2">
                    {r.orders?.customers?.last_name} {r.orders?.customers?.first_name} · {r.orders?.student_name}
                  </td>
                  <td className="px-3 py-2 text-slate-500">{r.reference}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------

type Balance = { supplier_id: string; received_value: number; paid: number; balance: number; missing_cost_items: number };
type SupPay = { id: string; supplier_id: string; amount: number; method: string; paid_at: string; reference: string | null; notes: string | null; voided: boolean; void_reason: string | null; created_by_name: string | null };

function SuppliersTab({ yearId, yearName }: { yearId: string; yearName: string }) {
  const { hasPermission } = useAuth();
  const [allYears, setAllYears] = useState(false);
  const [balances, setBalances] = useState<Balance[] | null>(null);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [payments, setPayments] = useState<SupPay[]>([]);
  const [paying, setPaying] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [b, s, p] = await Promise.all([
      supabase.rpc('supplier_balances', { p_year: allYears ? undefined : yearId }),
      fetchSuppliers(),
      (() => {
        let q = supabase.from('supplier_payments').select('id, supplier_id, amount, method, paid_at, reference, notes, voided, void_reason, created_by_name').order('paid_at', { ascending: false });
        if (!allYears) q = q.eq('year_id', yearId);
        return q;
      })(),
    ]);
    return { b: (b.data ?? []) as Balance[], s, p: (p.data ?? []) as SupPay[] };
  }, [allYears, yearId]);
  const apply = useCallback(({ b, s, p }: Awaited<ReturnType<typeof load>>) => {
    setBalances(b);
    setSuppliers(s);
    setPayments(p);
  }, []);
  const reload = async () => apply(await load());
  useEffect(() => {
    let cancelled = false;
    void load().then((d) => !cancelled && apply(d));
    return () => {
      cancelled = true;
    };
  }, [load, apply]);

  const name = new Map(suppliers.map((s) => [s.id, s.name]));
  const totals = (balances ?? []).reduce((a, b) => ({ v: a.v + b.received_value, p: a.p + b.paid, o: a.o + b.balance }), { v: 0, p: 0, o: 0 });

  const voidPay = async (p: SupPay) => {
    const reason = window.prompt('סיבת הביטול:');
    if (!reason?.trim()) return;
    const { error } = await supabase.rpc('void_supplier_payment', { p_payment: p.id, p_reason: reason.trim() });
    if (error) return toast.error(dbErrorMessage(error.message));
    toast.success('התשלום בוטל');
    await reload();
  };

  const exportExcel = () =>
    exportToExcel(`יתרות ספקים – ${allYears ? 'כל השנים' : yearName}`, [
      {
        name: 'יתרות',
        rows: (balances ?? []).map((b) => ({ ספק: name.get(b.supplier_id), 'שווי שהתקבל': b.received_value, שולם: b.paid, 'יתרה (חוב / זכות)': b.balance })),
      },
      {
        name: 'תשלומים',
        rows: payments.map((p) => ({ תאריך: formatDate(p.paid_at), ספק: name.get(p.supplier_id), סכום: p.amount, אמצעי: METHOD_LABELS[p.method], אסמכתה: p.reference, הערות: p.notes, בוטל: p.voided ? 'כן' : '' })),
      },
    ]);

  if (!balances) return <Spinner />;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={allYears} onChange={(e) => setAllYears(e.target.checked)} /> כל השנים (ולא רק {yearName})
        </label>
        <div className="flex-1" />
        <Protect permId="export_excel">
          <Button variant="secondary" onClick={exportExcel}>
            <FileSpreadsheet className="h-4 w-4" /> אקסל
          </Button>
        </Protect>
      </div>
      <p className="text-xs text-slate-500">
        שווי שהתקבל = כמות שנקלטה × מחיר הקנייה בהזמנת הרכש (פחות עודפים שהוחזרו). יתרה שלילית = שולם מראש.
      </p>
      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-600">
            <tr>
              <th className="px-3 py-2 text-right">ספק</th>
              <th className="px-3 py-2 text-right">שווי שהתקבל</th>
              <th className="px-3 py-2 text-right">שולם</th>
              <th className="px-3 py-2 text-right">יתרה</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {balances.map((b) => (
              <tr key={b.supplier_id}>
                <td className="px-3 py-2 font-medium">
                  {name.get(b.supplier_id)}
                  {b.missing_cost_items > 0 && <div className="text-xs text-amber-700">{b.missing_cost_items} ספרים בלי מחיר קנייה – השווי חלקי</div>}
                </td>
                <td className="px-3 py-2">{money(b.received_value)}</td>
                <td className="px-3 py-2">{money(b.paid)}</td>
                <td className={`px-3 py-2 font-bold ${b.balance > 0 ? 'text-red-600' : b.balance < 0 ? 'text-amber-700' : 'text-slate-400'}`}>
                  {b.balance < 0 ? `זכות ${money(-b.balance)}` : money(b.balance)}
                </td>
                <td className="px-3 py-2 text-left">
                  {hasPermission('supplier_payments_manage') && (
                    <Button variant="secondary" onClick={() => setPaying(b.supplier_id)}>
                      <Plus className="h-4 w-4" /> תשלום
                    </Button>
                  )}
                </td>
              </tr>
            ))}
            <tr className="bg-slate-50 font-bold">
              <td className="px-3 py-2">סה״כ</td>
              <td className="px-3 py-2">{money(totals.v)}</td>
              <td className="px-3 py-2">{money(totals.p)}</td>
              <td className="px-3 py-2">{money(totals.o)}</td>
              <td />
            </tr>
          </tbody>
        </table>
      </div>
      {hasPermission('supplier_payments_manage') && (
        <Button variant="secondary" onClick={() => setPaying('')}>
          <Plus className="h-4 w-4" /> תשלום לספק אחר (גם מראש)
        </Button>
      )}

      <div className="rounded-xl bg-white p-4 shadow-sm">
        <h3 className="mb-2 font-semibold">תשלומים לספקים</h3>
        {payments.length === 0 ? (
          <p className="text-sm text-slate-400">אין תשלומים</p>
        ) : (
          <table className="w-full text-sm">
            <tbody className="divide-y divide-slate-100">
              {payments.map((p) => (
                <tr key={p.id} className={p.voided ? 'text-slate-400 line-through' : ''}>
                  <td className="py-1.5">{formatDate(p.paid_at)}</td>
                  <td className="py-1.5 font-medium">{name.get(p.supplier_id)}</td>
                  <td className="py-1.5">{money(p.amount)}</td>
                  <td className="py-1.5">{METHOD_LABELS[p.method]}</td>
                  <td className="py-1.5 text-xs text-slate-500">
                    {[p.reference, p.notes, p.created_by_name].filter(Boolean).join(' · ')}
                    {p.voided && ` · בוטל: ${p.void_reason}`}
                  </td>
                  <td className="py-1.5 text-left">
                    {!p.voided && hasPermission('supplier_payments_manage') && (
                      <button type="button" onClick={() => voidPay(p)} className="p-1 text-slate-400 hover:text-red-600" title="ביטול">
                        <Ban className="h-4 w-4" />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {paying !== null && (
        <SupplierPaymentModal
          suppliers={suppliers}
          supplierId={paying}
          yearId={yearId}
          owed={balances.find((b) => b.supplier_id === paying)?.balance}
          onClose={() => setPaying(null)}
          onDone={async () => {
            setPaying(null);
            await reload();
          }}
        />
      )}
    </div>
  );
}

function SupplierPaymentModal({
  suppliers,
  supplierId,
  yearId,
  owed,
  onClose,
  onDone,
}: {
  suppliers: Supplier[];
  supplierId: string;
  yearId: string;
  owed?: number;
  onClose: () => void;
  onDone: () => void;
}) {
  const [sid, setSid] = useState(supplierId);
  const [amount, setAmount] = useState(owed && owed > 0 ? String(owed) : '');
  const [method, setMethod] = useState<PayMethod>('transfer');
  const [date, setDate] = useState('');
  const [reference, setReference] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const run = async () => {
    if (!sid) return toast.error('יש לבחור ספק');
    setSaving(true);
    const { error } = await supabase.rpc('record_supplier_payment', {
      p_supplier: sid,
      p_amount: toNumber(amount) ?? 0,
      p_method: method,
      p_year: yearId,
      p_date: date || undefined,
      p_reference: reference || undefined,
      p_notes: notes || undefined,
    });
    setSaving(false);
    if (error) return toast.error(dbErrorMessage(error.message));
    toast.success('התשלום לספק נרשם');
    onDone();
  };

  return (
    <Modal
      title="תשלום לספק"
      onClose={onClose}
      size="md"
      footer={
        <>
          <Button variant="success" onClick={run} loading={saving}>רישום</Button>
          <Button variant="secondary" onClick={onClose}>ביטול</Button>
        </>
      }
    >
      <div className="grid gap-3 rounded-xl bg-white p-4 sm:grid-cols-2">
        <Field label="ספק" className="sm:col-span-2">
          <select className={inputClass} value={sid} onChange={(e) => setSid(e.target.value)}>
            <option value="">בחירה...</option>
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </Field>
        <Field label="סכום (₪)">
          <input className={inputClass} inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </Field>
        <Field label="אמצעי תשלום">
          <select className={inputClass} value={method} onChange={(e) => setMethod(e.target.value as PayMethod)}>
            {PAY_METHODS.map((m) => (
              <option key={m} value={m}>{METHOD_LABELS[m]}</option>
            ))}
          </select>
        </Field>
        <Field label="תאריך" hint="ריק = היום">
          <DateInput value={date} onChange={setDate} />
        </Field>
        <Field label="אסמכתה">
          <input className={inputClass} value={reference} onChange={(e) => setReference(e.target.value)} />
        </Field>
        <Field label="הערות" className="sm:col-span-2">
          <input className={inputClass} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="למשל: תשלום מראש / סוף תקופה" />
        </Field>
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------------

type Expense = {
  id: string;
  expense_date: string;
  amount: number;
  category: string;
  payee: string | null;
  method: string | null;
  reference: string | null;
  notes: string | null;
  created_by_name: string | null;
};

function ExpensesTab({ yearId, yearName }: { yearId: string; yearName: string }) {
  const { hasPermission } = useAuth();
  const [rows, setRows] = useState<Expense[] | null>(null);
  const [editing, setEditing] = useState<Expense | 'new' | null>(null);
  const [category, setCategory] = useState('');
  const [importing, setImporting] = useState(false);

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('expenses')
      .select('id, expense_date, amount, category, payee, method, reference, notes, created_by_name')
      .eq('year_id', yearId)
      .order('expense_date', { ascending: false });
    return (data ?? []) as Expense[];
  }, [yearId]);
  const reload = async () => setRows(await load());
  useEffect(() => {
    let cancelled = false;
    void load().then((r) => !cancelled && setRows(r));
    return () => {
      cancelled = true;
    };
  }, [load]);

  const remove = async (e: Expense) => {
    if (!window.confirm(`למחוק את ההוצאה (${e.category}, ${money(e.amount)})?`)) return;
    const { error } = await supabase.from('expenses').delete().eq('id', e.id);
    if (error) return toast.error(dbErrorMessage(error.message));
    await reload();
  };

  const cats = [...new Set([...(rows ?? []).map((r) => r.category)])].sort((a, b) => a.localeCompare(b, 'he'));
  const filtered = (rows ?? []).filter((r) => !category || r.category === category);
  const sum = filtered.reduce((s, r) => s + r.amount, 0);

  if (!rows) return <Spinner />;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {hasPermission('expenses_manage') && (
          <Button onClick={() => setEditing('new')}>
            <Plus className="h-4 w-4" /> הוצאה חדשה
          </Button>
        )}
        <ImportButton editPerm="expenses_manage" onClick={() => setImporting(true)} />
        {importing && (
          <ImportExcelModal
            title="ייבוא הוצאות מאקסל"
            templateName="תבנית ייבוא הוצאות"
            {...expensesImporter(yearId)}
            onClose={() => setImporting(false)}
            onDone={reload}
          />
        )}
        <select className={`${inputClass} w-auto`} value={category} onChange={(e) => setCategory(e.target.value)}>
          <option value="">כל הקטגוריות</option>
          {cats.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
        <span className="text-sm text-slate-600">סה״כ <b>{money(sum)}</b></span>
        <div className="flex-1" />
        <Protect permId="export_excel">
          <Button
            variant="secondary"
            onClick={() =>
              exportToExcel(`הוצאות – ${yearName}`, [
                {
                  name: 'הוצאות',
                  rows: filtered.map((r) => ({ תאריך: formatDate(r.expense_date), סוג: r.category, סכום: r.amount, 'שולם ל': r.payee, אמצעי: r.method ? METHOD_LABELS[r.method] : '', אסמכתה: r.reference, הערות: r.notes })),
                },
              ])
            }
          >
            <FileSpreadsheet className="h-4 w-4" /> אקסל
          </Button>
        </Protect>
      </div>
      <p className="text-xs text-slate-500">עלויות המשלוחים למוסדות נרשמות במשלוח עצמו ומופיעות בסיכום בנפרד.</p>
      {filtered.length === 0 ? (
        <EmptyState>אין הוצאות</EmptyState>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-600">
              <tr>
                <th className="px-3 py-2 text-right">תאריך</th>
                <th className="px-3 py-2 text-right">סוג</th>
                <th className="px-3 py-2 text-right">סכום</th>
                <th className="px-3 py-2 text-right">שולם ל</th>
                <th className="px-3 py-2 text-right">אסמכתה</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map((r) => (
                <tr key={r.id}>
                  <td className="px-3 py-2">{formatDate(r.expense_date)}</td>
                  <td className="px-3 py-2">{r.category}</td>
                  <td className="px-3 py-2 font-medium">{money(r.amount)}</td>
                  <td className="px-3 py-2">{r.payee}</td>
                  <td className="px-3 py-2 text-slate-500">{[r.reference, r.notes].filter(Boolean).join(' · ')}</td>
                  <td className="px-3 py-2 text-left">
                    {hasPermission('expenses_manage') && (
                      <span className="flex justify-end gap-1">
                        <button type="button" onClick={() => setEditing(r)} className="p-1 text-slate-400 hover:text-slate-700" title="עריכה">
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button type="button" onClick={() => remove(r)} className="p-1 text-slate-400 hover:text-red-600" title="מחיקה">
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {editing && (
        <ExpenseModal
          key={editing === 'new' ? 'new' : editing.id}
          expense={editing === 'new' ? null : editing}
          yearId={yearId}
          categories={[...new Set([...EXPENSE_CATEGORIES, ...cats])]}
          onClose={() => setEditing(null)}
          onSaved={async () => {
            setEditing(null);
            await reload();
          }}
        />
      )}
    </div>
  );
}

function ExpenseModal({
  expense,
  yearId,
  categories,
  onClose,
  onSaved,
}: {
  expense: Expense | null;
  yearId: string;
  categories: string[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [f, setF] = useState({
    expense_date: expense?.expense_date ?? '',
    amount: expense?.amount?.toString() ?? '',
    category: expense?.category ?? '',
    payee: expense?.payee ?? '',
    method: expense?.method ?? '',
    reference: expense?.reference ?? '',
    notes: expense?.notes ?? '',
  });
  const [saving, setSaving] = useState(false);

  const save = async () => {
    const amount = toNumber(f.amount);
    if (!amount || amount <= 0) return toast.error('יש להזין סכום');
    if (!f.category.trim()) return toast.error('יש לבחור סוג הוצאה');
    setSaving(true);
    const payload = {
      year_id: yearId,
      expense_date: f.expense_date || undefined,
      amount,
      category: f.category.trim(),
      payee: nullIfEmpty(f.payee),
      method: nullIfEmpty(f.method),
      reference: nullIfEmpty(f.reference),
      notes: nullIfEmpty(f.notes),
    };
    const { error } = expense
      ? await supabase.from('expenses').update(payload).eq('id', expense.id)
      : await supabase.from('expenses').insert(payload);
    setSaving(false);
    if (error) return toast.error(dbErrorMessage(error.message));
    toast.success('ההוצאה נשמרה');
    onSaved();
  };

  return (
    <Modal
      title={expense ? 'עריכת הוצאה' : 'הוצאה חדשה'}
      onClose={onClose}
      size="md"
      footer={
        <>
          <Button variant="success" onClick={save} loading={saving}>שמירה</Button>
          <Button variant="secondary" onClick={onClose}>ביטול</Button>
        </>
      }
    >
      <div className="grid gap-3 rounded-xl bg-white p-4 sm:grid-cols-2">
        <Field label="סוג הוצאה">
          <input className={inputClass} list="expense-cats" value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })} />
          <datalist id="expense-cats">
            {categories.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </Field>
        <Field label="סכום (₪)">
          <input className={inputClass} inputMode="decimal" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} />
        </Field>
        <Field label="תאריך" hint="ריק = היום">
          <DateInput value={f.expense_date} onChange={(v) => setF({ ...f, expense_date: v })} />
        </Field>
        <Field label="שולם ל (ספק / גורם)">
          <input className={inputClass} value={f.payee} onChange={(e) => setF({ ...f, payee: e.target.value })} />
        </Field>
        <Field label="אמצעי תשלום">
          <select className={inputClass} value={f.method} onChange={(e) => setF({ ...f, method: e.target.value })}>
            <option value="">—</option>
            {PAY_METHODS.map((m) => (
              <option key={m} value={m}>{METHOD_LABELS[m]}</option>
            ))}
          </select>
        </Field>
        <Field label="אסמכתה">
          <input className={inputClass} value={f.reference} onChange={(e) => setF({ ...f, reference: e.target.value })} />
        </Field>
        <Field label="הערות" className="sm:col-span-2">
          <input className={inputClass} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} />
        </Field>
      </div>
    </Modal>
  );
}
