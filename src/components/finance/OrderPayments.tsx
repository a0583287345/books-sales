'use client';

import { useCallback, useEffect, useState } from 'react';
import { ArrowLeftRight, Ban, Plus, Undo2, Wallet } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/components/AuthContext';
import DateInput from '@/components/DateInput';
import { Button, Field, inputClass, Modal } from '@/components/ui';
import { toast } from '@/components/Toaster';
import { dbErrorMessage } from '@/lib/dbErrors';
import { formatDate, money, toNumber } from '@/lib/format';
import { METHOD_LABELS, PAY_METHODS, PAYMENT_COLUMNS, PAYMENT_KIND_LABELS, type PayMethod, type Payment } from '@/lib/finance';

type OrderInfo = { id: string; number: number; customer_id: string; balance: number; status: string };

/** תשלומים, החזרים וזיכויים של הזמנה */
export function OrderPayments({ order, onChanged }: { order: OrderInfo; onChanged: () => void }) {
  const { hasPermission } = useAuth();
  const [rows, setRows] = useState<Payment[]>([]);
  const [modal, setModal] = useState<'pay' | 'refund' | 'credit' | null>(null);
  const canSee = hasPermission('finance_view') || hasPermission('payments_record');

  const load = useCallback(async () => {
    const { data } = await supabase.from('payments').select(PAYMENT_COLUMNS).eq('order_id', order.id).order('created_at');
    return (data ?? []) as Payment[];
  }, [order.id]);
  const reload = async () => {
    setRows(await load());
    onChanged();
  };
  useEffect(() => {
    if (!canSee) return;
    let cancelled = false;
    void load().then((r) => !cancelled && setRows(r));
    return () => {
      cancelled = true;
    };
  }, [load, canSee]);

  if (!canSee) return null;

  const voidRow = async (p: Payment) => {
    const reason = window.prompt('סיבת הביטול (למשל: נרשם בטעות):');
    if (!reason?.trim()) return;
    const { error } = await supabase.rpc('void_payment', { p_payment: p.id, p_reason: reason.trim() });
    if (error) return toast.error(dbErrorMessage(error.message));
    toast.success('הרשומה בוטלה');
    await reload();
  };

  return (
    <div className="mt-4 border-t border-slate-200 pt-3 print:hidden">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <h3 className="flex flex-1 items-center gap-2 font-semibold">
          <Wallet className="h-4 w-4 text-slate-500" /> תשלומים
        </h3>
        {order.balance > 0 && hasPermission('payments_record') && (
          <Button onClick={() => setModal('pay')}>
            <Plus className="h-4 w-4" /> רישום תשלום
          </Button>
        )}
        {order.balance < 0 && (
          <>
            <span className="rounded-lg bg-amber-50 px-2 py-1 text-sm text-amber-800">יתרת זכות {money(-order.balance)}</span>
            {hasPermission('payments_refund') && (
              <Button variant="secondary" onClick={() => setModal('refund')}>
                <Undo2 className="h-4 w-4" /> החזר כספי
              </Button>
            )}
            {hasPermission('payments_record') && (
              <Button variant="secondary" onClick={() => setModal('credit')}>
                <ArrowLeftRight className="h-4 w-4" /> העברה כזיכוי להזמנה אחרת
              </Button>
            )}
          </>
        )}
      </div>
      {rows.length === 0 ? (
        <p className="text-sm text-slate-400">עדיין לא נרשמו תשלומים.</p>
      ) : (
        <table className="w-full text-sm">
          <tbody className="divide-y divide-slate-100">
            {rows.map((p) => (
              <tr key={p.id} className={p.voided ? 'text-slate-400 line-through' : ''}>
                <td className="py-1.5">{formatDate(p.paid_at)}</td>
                <td className="py-1.5">{PAYMENT_KIND_LABELS[p.kind]}</td>
                <td className="py-1.5">{METHOD_LABELS[p.method] ?? p.method}</td>
                <td className={`py-1.5 font-medium ${p.amount < 0 ? 'text-red-600' : 'text-emerald-700'}`} dir="ltr" style={{ textAlign: 'right' }}>
                  {money(p.amount)}
                </td>
                <td className="py-1.5 text-xs text-slate-500">
                  {[p.reference, p.notes, p.created_by_name].filter(Boolean).join(' · ')}
                  {p.voided && <span className="no-underline"> · בוטל: {p.void_reason}</span>}
                </td>
                <td className="py-1.5 text-left">
                  {!p.voided && hasPermission('payments_refund') && (
                    <button type="button" onClick={() => voidRow(p)} className="p-1 text-slate-400 hover:text-red-600" title="ביטול רשומה (טעות)">
                      <Ban className="h-4 w-4" />
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {(modal === 'pay' || modal === 'refund') && (
        <PaymentModal
          order={order}
          mode={modal}
          onClose={() => setModal(null)}
          onDone={async () => {
            setModal(null);
            await reload();
          }}
        />
      )}
      {modal === 'credit' && (
        <CreditModal
          order={order}
          onClose={() => setModal(null)}
          onDone={async () => {
            setModal(null);
            await reload();
          }}
        />
      )}
    </div>
  );
}

/** רישום תשלום / החזר – משמש גם במסך המסירה */
export function PaymentModal({
  order,
  mode,
  onClose,
  onDone,
  title,
}: {
  order: { id: string; number: number; balance: number };
  mode: 'pay' | 'refund';
  onClose: () => void;
  onDone: () => void;
  title?: string;
}) {
  const max = mode === 'pay' ? order.balance : -order.balance;
  const [amount, setAmount] = useState(String(max));
  const [method, setMethod] = useState<PayMethod | ''>('');
  const [date, setDate] = useState('');
  const [reference, setReference] = useState('');
  const [saving, setSaving] = useState(false);

  const run = async () => {
    const a = toNumber(amount) ?? 0;
    if (!method) return toast.error('יש לבחור אמצעי תשלום');
    if (a <= 0) return toast.error('יש להזין סכום');
    setSaving(true);
    const args = { p_order: order.id, p_amount: a, p_method: method, p_date: date || undefined, p_reference: reference || undefined };
    const { error } = mode === 'pay' ? await supabase.rpc('record_payment', args) : await supabase.rpc('refund_payment', args);
    setSaving(false);
    if (error) return toast.error(dbErrorMessage(error.message));
    toast.success(mode === 'pay' ? 'התשלום נרשם' : 'ההחזר נרשם');
    onDone();
  };

  return (
    <Modal
      title={title ?? (mode === 'pay' ? `רישום תשלום – הזמנה ${order.number}` : `החזר כספי – הזמנה ${order.number}`)}
      onClose={onClose}
      size="md"
      footer={
        <>
          <Button variant="success" onClick={run} loading={saving} className="px-6 py-2.5 text-base">
            {mode === 'pay' ? 'רישום התשלום' : 'רישום ההחזר'}
          </Button>
          <Button variant="secondary" onClick={onClose}>ביטול</Button>
        </>
      }
    >
      <div className="space-y-3 rounded-xl bg-white p-4">
        <p className="text-sm text-slate-600">
          {mode === 'pay' ? `יתרה לתשלום: ${money(order.balance)}` : `יתרת זכות: ${money(-order.balance)}`}
        </p>
        <div>
          <div className="mb-1 text-sm font-medium text-slate-700">אמצעי תשלום</div>
          <div className="flex flex-wrap gap-2">
            {PAY_METHODS.map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMethod(m)}
                className={`rounded-lg border px-4 py-2.5 ${method === m ? 'border-blue-600 bg-blue-600 text-white' : 'border-slate-300 hover:bg-slate-50'}`}
              >
                {METHOD_LABELS[m]}
              </button>
            ))}
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="סכום (₪)">
            <input className={`${inputClass} text-base`} inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </Field>
          <Field label="תאריך" hint="ריק = היום">
            <DateInput value={date} onChange={setDate} />
          </Field>
          <Field label="אסמכתה (לא חובה)">
            <input className={inputClass} value={reference} onChange={(e) => setReference(e.target.value)} />
          </Field>
        </div>
      </div>
    </Modal>
  );
}

function CreditModal({ order, onClose, onDone }: { order: OrderInfo; onClose: () => void; onDone: () => void }) {
  const [targets, setTargets] = useState<{ id: string; number: number; student_name: string; balance: number }[] | null>(null);
  const [target, setTarget] = useState('');
  const [amount, setAmount] = useState('');
  const [saving, setSaving] = useState(false);
  const credit = -order.balance;

  useEffect(() => {
    let cancelled = false;
    void supabase
      .from('orders')
      .select('id, number, student_name, balance')
      .eq('customer_id', order.customer_id)
      .neq('id', order.id)
      .gt('balance', 0)
      .neq('status', 'cancelled')
      .then(({ data }) => {
        if (cancelled) return;
        setTargets(data ?? []);
        if (data?.[0]) {
          setTarget(data[0].id);
          setAmount(String(Math.min(credit, data[0].balance)));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [order.customer_id, order.id, credit]);

  const run = async () => {
    setSaving(true);
    const { error } = await supabase.rpc('transfer_credit', { p_from_order: order.id, p_to_order: target, p_amount: toNumber(amount) ?? 0 });
    setSaving(false);
    if (error) return toast.error(dbErrorMessage(error.message));
    toast.success('הזיכוי הועבר');
    onDone();
  };

  return (
    <Modal
      title={`העברת זיכוי מהזמנה ${order.number}`}
      onClose={onClose}
      size="md"
      footer={
        <>
          <Button variant="success" onClick={run} loading={saving} disabled={!target}>העברה</Button>
          <Button variant="secondary" onClick={onClose}>ביטול</Button>
        </>
      }
    >
      <div className="space-y-3 rounded-xl bg-white p-4">
        <p className="text-sm">יתרת זכות: {money(credit)}</p>
        {targets === null ? null : targets.length === 0 ? (
          <p className="text-sm text-slate-500">אין ללקוח הזמנות אחרות עם יתרה לתשלום. אפשר לבצע החזר כספי.</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="להזמנה">
              <select className={inputClass} value={target} onChange={(e) => setTarget(e.target.value)}>
                {targets.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.number} – {t.student_name} (יתרה {money(t.balance)})
                  </option>
                ))}
              </select>
            </Field>
            <Field label="סכום (₪)">
              <input className={inputClass} inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
            </Field>
          </div>
        )}
      </div>
    </Modal>
  );
}
