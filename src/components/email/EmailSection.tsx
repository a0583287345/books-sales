'use client';

import { useEffect, useState } from 'react';
import { Mail, Send } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/components/AuthContext';
import { EmailTable, EmailViewModal, OUTBOX_COLUMNS, type OutboxRow } from '@/components/settings/EmailLogTab';
import { Button, Field, inputClass, Modal, Spinner } from '@/components/ui';
import { toast } from '@/components/Toaster';
import { fetchEmailSettings, progressSummary, sendEmails, type SendProgress } from '@/lib/email/client';
import { isValidEmail, renderTemplate, type EmailKind, type TemplateKey } from '@/lib/email/templates';

// =====================================================================
// בכרטיס לקוח / ספק / הזמנה: "שליחת מייל" (חופשי) + המיילים שנשלחו
// =====================================================================

type Target =
  | { type: 'customer'; id: string; email: string | null; name: string; values?: Record<string, string> }
  | { type: 'supplier'; id: string; email: string | null; name: string; values?: Record<string, string> };

export function EmailSection({ target }: { target: Target }) {
  const { hasPermission } = useAuth();
  const sendPerm = target.type === 'supplier' ? 'emails_suppliers' : 'emails_send';
  const canSend = hasPermission(sendPerm);
  const canSee = canSend || hasPermission('emails_view');
  const [rows, setRows] = useState<OutboxRow[] | null>(null);
  const [composing, setComposing] = useState(false);
  const [open, setOpen] = useState<OutboxRow | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (!canSee) return;
    let cancelled = false;
    void supabase
      .from('email_outbox')
      .select(OUTBOX_COLUMNS)
      .eq(target.type === 'supplier' ? 'supplier_id' : 'customer_id', target.id)
      .order('created_at', { ascending: false })
      .limit(50)
      .then(({ data }) => !cancelled && setRows((data ?? []) as OutboxRow[]));
    return () => {
      cancelled = true;
    };
  }, [canSee, target.type, target.id, reloadKey]);

  if (!canSee) return null;
  const valid = isValidEmail(target.email);

  return (
    <div className="rounded-xl bg-white p-4">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <h3 className="flex flex-1 items-center gap-2 font-semibold">
          <Mail className="h-4 w-4 text-slate-500" /> מיילים
        </h3>
        {canSend && (
          <Button variant="secondary" onClick={() => setComposing(true)} disabled={!valid} title={valid ? undefined : 'אין כתובת מייל תקינה בכרטיס'}>
            <Send className="h-4 w-4" /> שליחת מייל
          </Button>
        )}
      </div>
      {!valid && canSend && <p className="mb-2 text-xs text-slate-400">כדי לשלוח – יש להזין ולשמור כתובת מייל בכרטיס.</p>}
      {rows === null ? (
        <Spinner />
      ) : rows.length === 0 ? (
        <p className="text-sm text-slate-400">עדיין לא נשלחו מיילים.</p>
      ) : (
        <EmailTable rows={rows} onOpen={setOpen} compact />
      )}
      {composing && (
        <ComposeModal
          kind={target.type === 'supplier' ? 'supplier_free' : 'free'}
          templateKey={target.type === 'supplier' ? 'free_supplier' : 'free_customer'}
          to={target.email ?? ''}
          toName={target.name}
          values={target.values ?? {}}
          ids={target.type === 'supplier' ? { supplier_id: target.id } : { customer_id: target.id }}
          onClose={() => setComposing(false)}
          onSent={() => {
            setComposing(false);
            setReloadKey((k) => k + 1);
          }}
        />
      )}
      {open && (
        <EmailViewModal
          row={open}
          onClose={() => setOpen(null)}
          onChanged={() => {
            setOpen(null);
            setReloadKey((k) => k + 1);
          }}
        />
      )}
    </div>
  );
}

/** כתיבת מייל לנמען אחד (נוסח פתיחה מהתבנית, עריכה חופשית) */
export function ComposeModal({
  kind,
  templateKey,
  to,
  toName,
  values,
  ids,
  onClose,
  onSent,
}: {
  kind: EmailKind;
  templateKey: TemplateKey;
  to: string;
  toName: string;
  values: Record<string, string>;
  ids: { customer_id?: string; supplier_id?: string; order_id?: string; po_id?: string };
  onClose: () => void;
  onSent: () => void;
}) {
  const [address, setAddress] = useState(to);
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [signature, setSignature] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [progress, setProgress] = useState<SendProgress | null>(null);
  const [sending, setSending] = useState(false);

  // לפי התוכן ולא לפי האובייקט – אחרת כל רינדור של ההורה היה מאפס את הטיוטה
  const valuesKey = JSON.stringify(values);
  useEffect(() => {
    let cancelled = false;
    const vals = JSON.parse(valuesKey) as Record<string, string>;
    void fetchEmailSettings().then((s) => {
      if (cancelled) return;
      if (s) {
        const t = s.templates[templateKey];
        setSubject(renderTemplate(t.subject, vals));
        setBody(renderTemplate(t.body, vals));
        setSignature(s.signature);
      }
      setLoaded(true);
    });
    return () => {
      cancelled = true;
    };
  }, [templateKey, valuesKey]);

  const send = async () => {
    if (!isValidEmail(address)) return toast.error('כתובת מייל לא תקינה');
    if (!subject.trim()) return toast.error('יש לכתוב נושא');
    setSending(true);
    try {
      const p = await sendEmails([{ kind, to: address.trim(), to_name: toName, subject, body, ...ids }], { onProgress: setProgress });
      if (p.sent) {
        toast.success('המייל נשלח');
        onSent();
      } else if (p.failed) {
        toast.error(p.errors[0] ?? 'השליחה נכשלה');
      } else {
        toast.info(progressSummary(p));
        onSent();
      }
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSending(false);
    }
  };

  return (
    <Modal
      title={`מייל אל ${toName}`}
      onClose={onClose}
      size="md"
      footer={
        <>
          <Button onClick={send} loading={sending} disabled={!loaded} className="px-6">
            <Send className="h-4 w-4" /> שליחה
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
          <Field label="אל">
            <input className={inputClass} dir="ltr" value={address} onChange={(e) => setAddress(e.target.value)} />
          </Field>
          <Field label="נושא">
            <input className={inputClass} value={subject} onChange={(e) => setSubject(e.target.value)} autoFocus />
          </Field>
          <Field label="תוכן">
            <textarea className={`${inputClass} min-h-48 leading-relaxed`} value={body} onChange={(e) => setBody(e.target.value)} />
          </Field>
          {signature && <p className="whitespace-pre-wrap border-t border-dashed border-slate-200 pt-2 text-xs text-slate-400">{signature}</p>}
          {progress && progress.done && !progress.sent && <p className="text-sm text-amber-700">{progressSummary(progress)}</p>}
        </div>
      )}
    </Modal>
  );
}
