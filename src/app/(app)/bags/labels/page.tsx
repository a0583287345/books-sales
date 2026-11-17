'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import QRCode from 'qrcode';
import { ArrowRight, CheckCircle2, Printer } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { PageGuard } from '@/components/Protect';
import { Button, EmptyState, Spinner } from '@/components/ui';
import { toast } from '@/components/Toaster';
import { dbErrorMessage } from '@/lib/dbErrors';
import { money } from '@/lib/format';
import { DELIVERY_LABELS } from '@/lib/orders';
import { bagUrl, type LabelData } from '@/lib/warehouse';

// =====================================================================
// מדבקות לשקיות: דף A4, ‏3 עמודות × 8 שורות (70×37 מ"מ). אפשר להתחיל ממיקום מסוים בדף.
// =====================================================================

const COLS = 3;
const ROWS = 8;
const PER_SHEET = COLS * ROWS;

export default function LabelsPage() {
  return (
    <PageGuard permId={['labels_print', 'picking_do']}>
      <Suspense fallback={<Spinner />}>
        <LabelsScreen />
      </Suspense>
    </PageGuard>
  );
}

type Label = LabelData & { qr: string };

function LabelsScreen() {
  const params = useSearchParams();
  const router = useRouter();
  const ids = (params.get('ids') ?? '').split(',').filter(Boolean);
  const idsKey = ids.join(',');
  const [labels, setLabels] = useState<Label[] | null>(null);
  const [start, setStart] = useState(1);

  useEffect(() => {
    const list = idsKey.split(',').filter(Boolean);
    if (!list.length) return;
    let cancelled = false;
    void (async () => {
      const { data, error } = await supabase.rpc('bag_labels', { p_bags: list });
      if (error) {
        toast.error(dbErrorMessage(error.message));
        if (!cancelled) setLabels([]);
        return;
      }
      const rows = (data as unknown as LabelData[]) ?? [];
      const withQr = await Promise.all(
        rows.map(async (r) => ({ ...r, qr: await QRCode.toDataURL(bagUrl(r.code), { margin: 0, width: 160, errorCorrectionLevel: 'M' }) }))
      );
      if (!cancelled) setLabels(withQr);
    })();
    return () => {
      cancelled = true;
    };
  }, [idsKey]);

  const markPrinted = async () => {
    const { error } = await supabase.rpc('mark_labels_printed', { p_bags: ids });
    if (error) return toast.error(dbErrorMessage(error.message));
    toast.success('סומן שהמדבקות הודפסו');
  };

  if (!ids.length) return <EmptyState>לא נבחרו שקיות</EmptyState>;
  if (!labels) return <Spinner />;
  if (!labels.length) return <EmptyState>לא נמצאו שקיות להדפסה</EmptyState>;

  // תאים ריקים בתחילת הדף הראשון (מדבקות שכבר נוצלו)
  const cells: (Label | null)[] = [...Array(start - 1).fill(null), ...labels];
  const sheets: (Label | null)[][] = [];
  for (let i = 0; i < cells.length; i += PER_SHEET) sheets.push(cells.slice(i, i + PER_SHEET));

  return (
    <div>
      <style>{`
        @media print {
          @page { size: A4; margin: 0; }
          body * { visibility: hidden !important; }
          .label-sheets, .label-sheets * { visibility: visible !important; }
          .label-sheets { position: absolute; inset: 0; }
          .label-sheet { box-shadow: none !important; margin: 0 !important; break-after: page; }
        }
      `}</style>

      <div className="mb-4 flex flex-wrap items-center gap-3 print:hidden">
        <Button variant="ghost" onClick={() => router.back()}>
          <ArrowRight className="h-4 w-4" /> חזרה
        </Button>
        <span className="text-sm text-slate-600">
          {labels.length} מדבקות · {sheets.length} דפים
        </span>
        <label className="flex items-center gap-2 text-sm">
          להתחיל ממדבקה מס׳
          <select className="rounded-lg border border-slate-300 px-2 py-1.5" value={start} onChange={(e) => setStart(Number(e.target.value))}>
            {Array.from({ length: PER_SHEET }, (_, i) => i + 1).map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
          <span className="text-xs text-slate-400">(לדף שחלק ממנו כבר נוצל; הספירה מימין לשמאל, שורה אחרי שורה)</span>
        </label>
        <div className="flex-1" />
        <Button onClick={() => window.print()}>
          <Printer className="h-4 w-4" /> הדפסה
        </Button>
        <Button variant="secondary" onClick={markPrinted}>
          <CheckCircle2 className="h-4 w-4" /> סימון שהודפסו
        </Button>
      </div>
      <p className="mb-3 text-xs text-slate-500 print:hidden">
        בחלון ההדפסה: גודל נייר A4, שוליים &quot;ללא&quot;, קנה מידה 100% (לא &quot;התאמה לדף&quot;).
      </p>

      <div className="label-sheets space-y-6">
        {sheets.map((sheet, si) => (
          <div
            key={si}
            className="label-sheet mx-auto grid bg-white shadow"
            style={{ width: '210mm', height: '297mm', gridTemplateColumns: `repeat(${COLS}, 70mm)`, gridTemplateRows: `repeat(${ROWS}, 37.125mm)` }}
          >
            {Array.from({ length: PER_SHEET }, (_, i) => sheet[i] ?? null).map((l, i) => (
              <div key={i} className="overflow-hidden" style={{ padding: '2.5mm 3mm', outline: '1px dashed #e2e8f0' }}>
                {l && <LabelCell l={l} />}
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

function LabelCell({ l }: { l: Label }) {
  const paid = l.balance <= 0;
  const books = l.items.reduce((s, i) => s + i.qty, 0);
  return (
    <div className="flex h-full gap-1.5" style={{ fontSize: '7.5pt', lineHeight: 1.2 }}>
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="truncate text-slate-600">
          {l.inst_name} · כיתה {l.class_name}
        </div>
        <div className="truncate font-bold" style={{ fontSize: '11pt', lineHeight: 1.15 }}>{l.student_name}</div>
        <div className="truncate">{l.customer_name}</div>
        <div className="truncate">
          הזמנה <b>{l.order_number}</b> · שקית {l.bag_no}/{l.bag_count}
          {l.is_partial && <b> · חסר</b>}
        </div>
        <div className="truncate">{DELIVERY_LABELS[l.delivery_method]}</div>
        <div className="truncate text-slate-600" style={{ fontSize: '6.5pt' }}>
          {books} ספרים: {l.items.map((i) => (i.qty > 1 ? `${i.name}×${i.qty}` : i.name)).join(', ')}
        </div>
        <div className="mt-auto truncate font-bold" style={{ fontSize: '9pt' }}>
          {paid ? 'שולם ✓' : `לתשלום: ${money(l.balance)}`}
        </div>
      </div>
      <div className="flex shrink-0 flex-col items-center justify-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={l.qr} alt={l.code} style={{ width: '19mm', height: '19mm' }} />
        <div dir="ltr" style={{ fontSize: '6.5pt' }}>{l.code}</div>
      </div>
    </div>
  );
}
