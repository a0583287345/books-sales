'use client';

import { useEffect, useState } from 'react';
import { AlertTriangle, Check, HandHeart } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/components/AuthContext';
import { BagStatusBadge } from '@/components/warehouse/BagStatusBadge';
import { emptyPayment, PaymentFields, paymentArgs, type PaymentInput } from '@/components/finance/OrderPayments';
import { Button, EmptyState, Field, inputClass, Modal, Spinner } from '@/components/ui';
import { toast } from '@/components/Toaster';
import { dbErrorMessage } from '@/lib/dbErrors';
import { money, toNumber } from '@/lib/format';
import { fetchPackDetails, type PackDetails } from '@/lib/warehouse';

// =====================================================================
// מסירה ללקוח בחלון אחד: בחירת השקיות + רישום התשלום (אם יש יתרה) + מי אסף.
// לחיצה אחת רושמת את התשלום ואז מוסרת את השקיות.
// =====================================================================

const DELIVERABLE = ['picked', 'checked', 'ready'];

export function DeliverOrderModal({
  orderId,
  bagId,
  onClose,
  onDone,
}: {
  orderId: string;
  /** שקית מסוימת (ממסך ההזמנה) – אחרת כל השקיות הארוזות מסומנות */
  bagId?: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const { hasPermission } = useAuth();
  const [data, setData] = useState<PackDetails | null | undefined>(undefined);
  const [chosen, setChosen] = useState<Set<string>>(new Set());
  const [who, setWho] = useState('');
  const [pay, setPay] = useState<PaymentInput>(emptyPayment(0));
  const [noPay, setNoPay] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void fetchPackDetails(orderId).then((d) => {
      if (cancelled) return;
      setData(d);
      if (!d) return;
      const ready = d.bags.filter((b) => DELIVERABLE.includes(b.status)).map((b) => b.id);
      setChosen(new Set(bagId && ready.includes(bagId) ? [bagId] : ready));
      setWho(d.order.customer_name);
      setPay(emptyPayment(d.order.balance));
    });
    return () => {
      cancelled = true;
    };
  }, [orderId, bagId]);

  if (data === undefined) {
    return (
      <Modal title="מסירה ללקוח" onClose={onClose} size="md">
        <Spinner />
      </Modal>
    );
  }
  if (!data) {
    return (
      <Modal title="מסירה ללקוח" onClose={onClose} size="md">
        <EmptyState>ההזמנה לא נמצאה</EmptyState>
      </Modal>
    );
  }

  const { order, bags } = data;
  const deliverable = bags.filter((b) => DELIVERABLE.includes(b.status));
  const canPay = hasPermission('payments_record');
  const owes = order.balance > 0;
  const payAmount = pay.method ? toNumber(pay.amount) ?? 0 : 0;
  const needsPayChoice = owes && canPay && !pay.method && !noPay;
  const toggle = (id: string) =>
    setChosen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const run = async () => {
    if (chosen.size && !who.trim()) return toast.error('יש לכתוב מי אסף');
    if (pay.method && payAmount <= 0) return toast.error('יש להזין סכום');
    setSaving(true);
    try {
      if (pay.method) {
        const { error } = await supabase.rpc('record_payment', paymentArgs(order.id, pay));
        if (error) return toast.error(dbErrorMessage(error.message));
      }
      let delivered = 0;
      for (const id of chosen) {
        const { error } = await supabase.rpc('set_bag_status', { p_bag: id, p_status: 'delivered', p_received_by: who.trim() });
        if (error) {
          toast.error(`${pay.method ? 'התשלום נרשם, אבל ' : ''}המסירה נכשלה: ${dbErrorMessage(error.message)}`);
          onDone();
          return;
        }
        delivered++;
      }
      toast.success(
        [pay.method && `התשלום (${money(payAmount)}) נרשם`, delivered && (delivered === 1 ? 'השקית נמסרה' : `${delivered} שקיות נמסרו`)]
          .filter(Boolean)
          .join(' · ')
      );
      onDone();
    } finally {
      setSaving(false);
    }
  };

  const actionLabel = chosen.size
    ? `מסירה${pay.method ? ` + תשלום ${money(payAmount)}` : ''}${chosen.size > 1 ? ` (${chosen.size} שקיות)` : ''}`
    : 'רישום התשלום';

  return (
    <Modal
      title={`מסירה – ${order.student_name}`}
      onClose={onClose}
      size="md"
      footer={
        <>
          <Button
            variant="success"
            onClick={run}
            loading={saving}
            disabled={needsPayChoice || (!chosen.size && !pay.method)}
            className="px-6 py-3 text-base"
          >
            <HandHeart className="h-5 w-5" /> {actionLabel}
          </Button>
          <Button variant="secondary" onClick={onClose}>
            ביטול
          </Button>
        </>
      }
    >
      <div className="space-y-4 rounded-xl bg-white p-4">
        <div className="text-sm text-slate-600">
          הזמנה {order.number} · {order.inst_name} / כיתה {order.class_name}
        </div>

        {/* תשלום */}
        {owes ? (
          <div className="space-y-3 rounded-xl border border-red-200 bg-red-50/50 p-3">
            <div className="flex items-center gap-2 text-lg font-bold text-red-700">
              <AlertTriangle className="h-5 w-5" /> יתרה לתשלום: {money(order.balance)}
            </div>
            {canPay ? (
              <PaymentFields
                compact
                value={pay}
                onChange={(v) => {
                  setPay(v);
                  setNoPay(false);
                }}
                extra={
                  <button
                    type="button"
                    onClick={() => {
                      setNoPay(true);
                      setPay(emptyPayment(order.balance));
                    }}
                    className={`rounded-lg border px-4 py-2.5 ${noPay ? 'border-slate-700 bg-slate-700 text-white' : 'border-slate-300 bg-white hover:bg-slate-50'}`}
                  >
                    בלי תשלום עכשיו
                  </button>
                }
              />
            ) : (
              <p className="text-sm text-red-700">אין לך הרשאה לרשום תשלום – יש להפנות למי שגובה.</p>
            )}
          </div>
        ) : (
          <p className="rounded-lg bg-emerald-50 px-3 py-2 font-medium text-emerald-700">ההזמנה שולמה ✓</p>
        )}

        {/* שקיות */}
        <div>
          <div className="mb-1 text-sm font-medium text-slate-700">שקיות למסירה</div>
          {deliverable.length === 0 ? (
            <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">אין שקיות ארוזות שמחכות למסירה.</p>
          ) : (
            <div className="space-y-2">
              {deliverable.map((b) => {
                const on = chosen.has(b.id);
                const count = b.items.reduce((s, x) => s + x.qty, 0);
                return (
                  <button
                    key={b.id}
                    type="button"
                    onClick={() => toggle(b.id)}
                    className={`flex w-full items-center gap-3 rounded-xl border p-3 text-right ${on ? 'border-emerald-500 bg-emerald-50' : 'border-slate-200'}`}
                  >
                    <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded border ${on ? 'border-emerald-600 bg-emerald-600 text-white' : 'border-slate-300'}`}>
                      {on && <Check className="h-4 w-4" />}
                    </span>
                    <span className="flex-1 font-medium">
                      שקית {b.bag_no} · {count} ספרים
                    </span>
                    <BagStatusBadge status={b.status} partial={b.is_partial} />
                  </button>
                );
              })}
            </div>
          )}
          {deliverable.some((b) => chosen.has(b.id) && b.is_partial) && (
            <p className="mt-2 text-sm text-amber-700">שימו לב: יש שקית חלקית – חסרים ספרים שיגיעו בהמשך.</p>
          )}
        </div>

        {chosen.size > 0 && (
          <Field label="מי אסף">
            <input className={`${inputClass} text-base`} value={who} onChange={(e) => setWho(e.target.value)} />
          </Field>
        )}
      </div>
    </Modal>
  );
}
