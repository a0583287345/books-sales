'use client';

import { useEffect, useState } from 'react';
import { Send } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/components/AuthContext';
import { Button, Field, inputClass, Modal, Spinner } from '@/components/ui';
import { toast } from '@/components/Toaster';
import { formatDate } from '@/lib/format';
import { fetchEmailSettings, progressSummary, sendEmails } from '@/lib/email/client';
import { isValidEmail, renderTemplate } from '@/lib/email/templates';

// =====================================================================
// הזמנת רכש → מייל לספק: טבלת ספרים בגוף המייל + קובץ אקסל מצורף (מחירים – רק אם מורשה ומסומן).
// אחרי שליחה מוצלחת של טיוטה – הצעה לסמן "נשלחה לספק".
// =====================================================================

export type PoMailItem = { name: string; code: string | null; sku: string | null; qty: number };

export function SupplierPoEmailModal({
  po,
  supplier,
  items,
  onClose,
  onSent,
}: {
  po: { id: string; number: number; status: string; supplier_id: string; expected_date: string | null; notes: string | null };
  supplier: { name: string; email: string | null };
  items: PoMailItem[];
  onClose: () => void;
  /** markSent – המשתמש אישר לסמן "נשלחה לספק" */
  onSent: (markSent: boolean) => void;
}) {
  const { hasPermission } = useAuth();
  const canPrices = hasPermission('books_view_cost');
  const [to, setTo] = useState(supplier.email ?? '');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [attach, setAttach] = useState(true);
  const [prices, setPrices] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [sending, setSending] = useState(false);
  const [previous, setPrevious] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void Promise.all([
      fetchEmailSettings(),
      supabase.from('email_outbox').select('sent_at').eq('po_id', po.id).eq('status', 'sent').order('sent_at', { ascending: false }).limit(1),
    ]).then(([s, prev]) => {
      if (cancelled) return;
      const list = items
        .filter((i) => i.qty > 0)
        .map((i) => `• ${i.name}${i.code ? ` (${i.code})` : ''}${i.sku ? ` – מק״ט ${i.sku}` : ''} – ${i.qty} יח׳`)
        .join('\n');
      const values = {
        ספק: supplier.name,
        מספר_הזמנת_רכש: String(po.number),
        רשימת_ספרים: list,
        צפי_אספקה: po.expected_date ? formatDate(po.expected_date) : 'בהקדם',
        הערות: po.notes ? `הערות: ${po.notes}` : '',
      };
      if (s) {
        setSubject(renderTemplate(s.templates.supplier_po.subject, values));
        setBody(renderTemplate(s.templates.supplier_po.body, values));
      }
      setPrevious(prev.data?.[0]?.sent_at ?? null);
      setLoaded(true);
    });
    return () => {
      cancelled = true;
    };
  }, [po, supplier.name, items]);

  // כמה כתובות – מופרדות בפסיק
  const addresses = to
    .split(/[,;\s]+/)
    .map((a) => a.trim())
    .filter(Boolean);
  const valid = addresses.length > 0 && addresses.every(isValidEmail);

  const send = async () => {
    if (!valid) return toast.error('כתובת מייל לא תקינה');
    if (!subject.trim()) return toast.error('יש לכתוב נושא');
    setSending(true);
    try {
      const p = await sendEmails(
        addresses.map((a) => ({
          kind: 'supplier_po' as const,
          to: a,
          to_name: supplier.name,
          subject,
          body,
          supplier_id: po.supplier_id,
          po_id: po.id,
          attach_po: attach,
          attach_po_prices: attach && prices && canPrices,
        })),
        { title: `הזמנת רכש ${po.number} – ${supplier.name}` }
      );
      if (!p.sent) {
        toast.error(p.failed ? p.errors[0] ?? 'השליחה נכשלה' : progressSummary(p));
        if (p.failed) return;
      } else toast.success('הזמנת הרכש נשלחה לספק');
      const markSent =
        p.sent > 0 && po.status === 'draft' && hasPermission('po_manage') && window.confirm('לסמן את ההזמנה "נשלחה לספק"?');
      onSent(markSent);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSending(false);
    }
  };

  return (
    <Modal
      title={`שליחת הזמנת רכש ${po.number} – ${supplier.name}`}
      onClose={onClose}
      size="md"
      footer={
        <>
          <Button onClick={send} loading={sending} disabled={!loaded || !valid} className="px-6">
            <Send className="h-4 w-4" /> שליחה לספק
          </Button>
          <Button variant="secondary" onClick={onClose}>
            ביטול
          </Button>
        </>
      }
    >
      {!loaded ? (
        <Spinner />
      ) : (
        <div className="space-y-3 rounded-xl bg-white p-4">
          {previous && (
            <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
              ההזמנה כבר נשלחה במייל ב-{new Date(previous).toLocaleString('he-IL', { dateStyle: 'short', timeStyle: 'short' })}.
            </p>
          )}
          <Field label="אל" hint="אפשר כמה כתובות, מופרדות בפסיק">
            <input className={inputClass} dir="ltr" value={to} onChange={(e) => setTo(e.target.value)} />
          </Field>
          {!supplier.email && <p className="text-xs text-amber-700">אין מייל בכרטיס הספק – כדאי להוסיף אותו שם לפעם הבאה.</p>}
          <Field label="נושא">
            <input className={inputClass} value={subject} onChange={(e) => setSubject(e.target.value)} />
          </Field>
          <Field label="תוכן">
            <textarea className={`${inputClass} min-h-56 text-sm leading-relaxed`} value={body} onChange={(e) => setBody(e.target.value)} />
          </Field>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={attach} onChange={(e) => setAttach(e.target.checked)} /> לצרף קובץ אקסל של ההזמנה
          </label>
          {canPrices && attach && (
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={prices} onChange={(e) => setPrices(e.target.checked)} /> לכלול מחירי קנייה בקובץ
            </label>
          )}
        </div>
      )}
    </Modal>
  );
}
