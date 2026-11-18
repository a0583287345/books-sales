'use client';

import { useCallback, useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { Copy, ExternalLink, Mail, MessageCircle, Printer, QrCode, RefreshCw } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/components/AuthContext';
import { Button, EmptyState, Modal, Spinner } from '@/components/ui';
import { toast } from '@/components/Toaster';
import { dbErrorMessage } from '@/lib/dbErrors';
import { formatDate } from '@/lib/format';
import { orderLinkUrl } from '@/lib/online';
import { Protect } from '@/components/Protect';
import { InviteEmailModal } from './InviteEmailModal';

// =====================================================================
// "הזמנה בקישור" למכירה במוסד: קישור למוסד ולכל כיתה – העתקה, וואטסאפ, QR להדפסה,
// הפעלה/כיבוי וקוד חדש (הקודם מפסיק לעבוד). הקישורים נוצרים אוטומטית (order_links_ensure).
// =====================================================================

type LinkRow = { id: string; code: string; kind: 'institution' | 'class'; class_id: string | null; is_active: boolean; title: string; sort: number };

export function OrderLinksModal({
  institutionYearId,
  institutionId,
  instName,
  yearName,
  deadline,
  openDate,
  readOnly,
  onClose,
}: {
  institutionYearId: string;
  institutionId: string;
  instName: string;
  yearName: string;
  deadline: string | null;
  openDate: string | null;
  readOnly: boolean;
  onClose: () => void;
}) {
  const { hasPermission } = useAuth();
  const canManage = hasPermission('online_links_manage') && !readOnly;
  const [links, setLinks] = useState<LinkRow[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [qr, setQr] = useState<{ title: string; url: string; img: string } | null>(null);
  const [inviting, setInviting] = useState(false);

  const load = useCallback(async () => {
    if (canManage) {
      const { error } = await supabase.rpc('order_links_ensure', { p_institution_year: institutionYearId });
      if (error) toast.error(dbErrorMessage(error.message));
    }
    const [{ data, error }, { data: classes }] = await Promise.all([
      supabase
        .from('order_links')
        .select('id, code, kind, class_id, is_active')
        .eq('institution_year_id', institutionYearId)
        .in('kind', ['institution', 'class']),
      supabase.from('classes').select('id, name, sort_order').eq('institution_year_id', institutionYearId),
    ]);
    if (error) toast.error(dbErrorMessage(error.message));
    const byClass = new Map((classes ?? []).map((c) => [c.id, c]));
    const rows = (data ?? []).map<LinkRow>((l) => {
      const c = l.class_id ? byClass.get(l.class_id) : null;
      return {
        id: l.id,
        code: l.code,
        kind: l.kind as LinkRow['kind'],
        class_id: l.class_id,
        is_active: l.is_active,
        title: l.kind === 'institution' ? `כל המוסד (בחירת כיתה)` : `כיתה ${c?.name ?? ''}`,
        sort: l.kind === 'institution' ? -1 : c?.sort_order ?? 0,
      };
    });
    rows.sort((a, b) => a.sort - b.sort || a.title.localeCompare(b.title, 'he'));
    return rows;
  }, [canManage, institutionYearId]);

  useEffect(() => {
    let cancelled = false;
    void load().then((r) => !cancelled && setLinks(r));
    return () => {
      cancelled = true;
    };
  }, [load]);

  const reload = async () => setLinks(await load());

  const message = (l: LinkRow) =>
    [
      `שלום, נפתחה הזמנת ספרי הלימוד ב${instName}${l.kind === 'class' ? ` – ${l.title}` : ''} לשנת ${yearName}.`,
      `להזמנה: ${orderLinkUrl(l.code)}`,
      deadline ? `ניתן להזמין עד ${formatDate(deadline)}.` : '',
    ]
      .filter(Boolean)
      .join('\n');

  const copy = async (text: string, what: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(`${what} הועתק`);
    } catch {
      toast.error('ההעתקה לא הצליחה');
    }
  };

  const setActive = async (l: LinkRow, active: boolean) => {
    setBusy(l.id);
    const { error } = await supabase.from('order_links').update({ is_active: active }).eq('id', l.id);
    setBusy(null);
    if (error) return toast.error(dbErrorMessage(error.message));
    await reload();
  };

  const regenerate = async (l: LinkRow) => {
    if (!window.confirm(`ליצור קישור חדש ל"${l.title}"? הקישור הקודם יפסיק לעבוד מיד.`)) return;
    setBusy(l.id);
    const { error } = await supabase.rpc('order_link_regenerate', { p_link: l.id });
    setBusy(null);
    if (error) return toast.error(dbErrorMessage(error.message));
    toast.success('נוצר קישור חדש');
    await reload();
  };

  const showQr = async (l: LinkRow) => {
    const url = orderLinkUrl(l.code);
    const img = await QRCode.toDataURL(url, { margin: 1, width: 600, errorCorrectionLevel: 'M' });
    setQr({ title: l.title, url, img });
  };

  const printQr = () => {
    if (!qr) return;
    const w = window.open('', '_blank', 'width=800,height=900');
    if (!w) return toast.error('הדפדפן חסם את חלון ההדפסה');
    const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
    w.document.write(`<!doctype html><html dir="rtl" lang="he"><head><meta charset="utf-8"><title>הזמנת ספרים</title>
      <style>body{font-family:Arial,sans-serif;text-align:center;padding:40px}h1{font-size:34px;margin:0}h2{font-size:26px;font-weight:normal;margin:8px 0 24px}
      img{width:360px;height:360px}p{font-size:20px}.u{font-size:14px;direction:ltr;color:#444;word-break:break-all}</style></head><body>
      <h1>הזמנת ספרי לימוד</h1><h2>${esc(instName)} · ${esc(qr.title)} · ${esc(yearName)}</h2>
      <img src="${qr.img}" alt=""><p>סרקו את הקוד במצלמת הטלפון כדי להזמין</p>
      ${deadline ? `<p>ניתן להזמין עד ${formatDate(deadline)}</p>` : ''}<p class="u">${esc(qr.url)}</p>
      <script>window.onload=()=>{window.print()}</script></body></html>`);
    w.document.close();
  };

  return (
    <Modal title={`הזמנה בקישור – ${instName}`} onClose={onClose} size="lg">
      <p className="text-sm text-slate-600">
        ההורים ממלאים את פרטי התלמיד ובוחרים ספרים, וההזמנה נוצרת מיד (מקור &quot;בקישור&quot;). הקישור פעיל
        {openDate ? ` מ-${formatDate(openDate)}` : ''}
        {deadline ? ` עד המועד האחרון להזמנה (${formatDate(deadline)})` : ' – לא הוגדר מועד אחרון להזמנה'}.
        מספר ת״ז שכבר קיים – ההזמנה נרשמת על הלקוח הקיים; פרטים שונים מהכרטיס מסומנים &quot;לבדיקה&quot;.
      </p>
      {!links ? (
        <Spinner />
      ) : links.length === 0 ? (
        <EmptyState>אין עדיין קישורים{canManage ? '' : ' (נדרשת הרשאת ניהול קישורי הזמנה)'}</EmptyState>
      ) : (
        <div className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white">
          {links.map((l) => (
            <div key={l.id} className={`flex flex-wrap items-center gap-2 px-3 py-2.5 ${l.is_active ? '' : 'bg-slate-50'}`}>
              <div className="min-w-40 flex-1">
                <div className="font-medium">
                  {l.title}
                  {!l.is_active && <span className="mr-2 rounded bg-slate-200 px-1.5 py-0.5 text-xs text-slate-600">כבוי</span>}
                </div>
                <div className="truncate text-xs text-slate-400" dir="ltr">
                  {orderLinkUrl(l.code)}
                </div>
              </div>
              <Button variant="ghost" title="העתקת הקישור" onClick={() => copy(orderLinkUrl(l.code), 'הקישור')}>
                <Copy className="h-4 w-4" />
              </Button>
              <Button variant="ghost" title="העתקת הודעה מוכנה" onClick={() => copy(message(l), 'הנוסח')}>
                <MessageCircle className="h-4 w-4" />
              </Button>
              <a
                href={`https://wa.me/?text=${encodeURIComponent(message(l))}`}
                target="_blank"
                rel="noreferrer"
                className="rounded-lg px-2 py-1.5 text-xs font-medium text-emerald-700 hover:bg-emerald-50"
              >
                וואטסאפ
              </a>
              <Button variant="ghost" title="QR להדפסה" onClick={() => showQr(l)}>
                <QrCode className="h-4 w-4" />
              </Button>
              <a href={`/o/${l.code}`} target="_blank" rel="noreferrer" title="פתיחת הדף" className="rounded-lg p-2 text-slate-600 hover:bg-slate-100">
                <ExternalLink className="h-4 w-4" />
              </a>
              {canManage && (
                <>
                  <Button variant="secondary" loading={busy === l.id} onClick={() => setActive(l, !l.is_active)}>
                    {l.is_active ? 'כיבוי' : 'הפעלה'}
                  </Button>
                  <Button variant="ghost" title="קוד חדש (הקישור הקודם יפסיק לעבוד)" onClick={() => regenerate(l)} disabled={busy === l.id}>
                    <RefreshCw className="h-4 w-4" />
                  </Button>
                </>
              )}
            </div>
          ))}
        </div>
      )}
      {!readOnly && (
        <Protect permId="emails_send" lockedFallback={null}>
          <div className="flex flex-wrap items-center gap-2 rounded-xl bg-white p-3">
            <span className="flex-1 text-sm text-slate-600">
              מייל &quot;הזמנה להזמין&quot; עם קישור אישי (הטופס ממולא) ללקוחות שהזמינו כאן בשנים קודמות
            </span>
            <Button variant="secondary" onClick={() => setInviting(true)}>
              <Mail className="h-4 w-4" /> הזמנה להזמין במייל
            </Button>
          </div>
        </Protect>
      )}
      <p className="text-xs text-slate-500">
        כיבוי הקישור של כיתה מסתיר אותה גם מהקישור של המוסד. כיתה בלי ספרים ברשימה לא מוצגת להורים.
      </p>

      {qr && (
        <div className="rounded-xl border border-slate-200 bg-white p-4 text-center">
          <div className="font-medium">{qr.title}</div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={qr.img} alt="QR" className="mx-auto my-2 h-48 w-48" />
          <div className="flex justify-center gap-2">
            <Button onClick={printQr}>
              <Printer className="h-4 w-4" /> הדפסה
            </Button>
            <Button variant="secondary" onClick={() => setQr(null)}>
              סגירה
            </Button>
          </div>
        </div>
      )}
      {inviting && (
        <InviteEmailModal
          institutionYearId={institutionYearId}
          institutionId={institutionId}
          instName={instName}
          deadline={deadline}
          onClose={() => setInviting(false)}
        />
      )}
    </Modal>
  );
}
