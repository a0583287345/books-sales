import { NextResponse } from 'next/server';
import { buildAttachments } from '@/lib/email/attachments';
import { processQueue } from '@/lib/email/server';

// =====================================================================
// הרצה יומית (Vercel Cron, vercel.json): שולחת את כל מה שנשאר בתור –
// למשל מה שנדחה בגלל המגבלה היומית, או שליחה מרוכזת שהמסך שלה נסגר באמצע.
// מוגן ב-CRON_SECRET (Vercel שולח אותו אוטומטית כ-Authorization: Bearer ...).
// =====================================================================

export const maxDuration = 300;

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get('Authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const started = Date.now();
  let sent = 0;
  let failed = 0;
  // עד ~4 דקות, בחלקים של 20
  while (Date.now() - started < 240_000) {
    const r = await processQueue({ max: 20, attachments: buildAttachments });
    sent += r.sent;
    failed += r.failed;
    if (r.problem || r.disabled || r.limitReached || r.remaining === 0 || r.sent + r.failed === 0) break;
  }
  return NextResponse.json({ sent, failed });
}
