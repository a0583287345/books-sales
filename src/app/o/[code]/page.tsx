'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { CheckCircle2, Loader2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import type { LinkState, PersonalForm, PublicForm, PublicOrderFull } from '@/lib/online';
import { bigButton, Card, ClosedNotice, PublicHeader } from '@/components/online/PublicUi';
import { PublicOrderForm } from '@/components/online/PublicOrderForm';
import { PublicOrderView } from '@/components/online/PublicOrderView';

// =====================================================================
// הזמנה בקישור – דף ציבורי להורים (מותאם לטלפון). /o/<קוד>
//   קישור למוסד / לכיתה → טופס הזמנה (פרטי תלמיד + ת"ז)
//   קישור אישי (ממייל "הזמנה להזמין") → טופס ממולא; אם כבר הזמין – מעבר לצפייה בהזמנה; ?unsubscribe=1 → הסרה מתפוצה
//   קישור להזמנה (ממייל האישור) → צפייה + בקשת שינוי
// הכול דרך פונקציות במסד – האכיפה בשרת.
// =====================================================================

type Loaded =
  | { type: 'form'; form: PublicForm }
  | { type: 'order'; data: PublicOrderFull }
  | { type: 'personal'; form: PersonalForm }
  | { type: 'unsubscribe' }
  | { type: 'error' };

export default function PublicOrderPage() {
  const params = useParams<{ code: string }>();
  const code = decodeURIComponent(params.code);
  const unsubscribe = useSearchParams().get('unsubscribe') === '1';
  const router = useRouter();
  const [loaded, setLoaded] = useState<Loaded | null>(null);

  const load = useCallback(async (): Promise<Loaded> => {
    const { data, error } = await supabase.rpc('public_order_form', { p_code: code });
    if (error) return { type: 'error' };
    const form = data as unknown as PublicForm;
    if (form.kind === 'order') {
      const { data: v, error: e2 } = await supabase.rpc('public_order_view', { p_code: code });
      return e2 ? { type: 'error' } : { type: 'order', data: v as unknown as PublicOrderFull };
    }
    if (form.kind === 'personal') {
      if (unsubscribe) return { type: 'unsubscribe' };
      const { data: p, error: e3 } = await supabase.rpc('public_personal_form', { p_code: code });
      if (e3) return { type: 'error' };
      return { type: 'personal', form: p as unknown as PersonalForm };
    }
    return { type: 'form', form };
  }, [code, unsubscribe]);

  useEffect(() => {
    let cancelled = false;
    void load().then((l) => {
      if (cancelled) return;
      // קישור אישי של מי שכבר הזמין → לצפייה בהזמנה
      if (l.type === 'personal' && l.form.state === 'ordered' && l.form.view_code) router.replace(`/o/${l.form.view_code}`);
      else setLoaded(l);
    });
    return () => {
      cancelled = true;
    };
  }, [load, router]);

  return (
    <div className="min-h-screen bg-slate-100">
      <div className="mx-auto max-w-xl px-4 py-6">
        <Content loaded={loaded} code={code} reload={async () => setLoaded(await load())} />
      </div>
    </div>
  );
}

function Content({ loaded, code, reload }: { loaded: Loaded | null; code: string; reload: () => void }) {
  if (!loaded) return <Loader2 className="mx-auto mt-16 h-8 w-8 animate-spin text-slate-400" />;
  switch (loaded.type) {
    case 'error':
      return (
        <Card>
          <p className="text-center">אירעה תקלה בטעינת הדף. אפשר לנסות לרענן בעוד רגע.</p>
        </Card>
      );
    case 'unsubscribe':
      return <Unsubscribe code={code} />;
    case 'order': {
      const d = loaded.data;
      if (d.state !== 'ok' || !d.order) return <ClosedNotice state={d.state === 'ok' ? 'not_found' : d.state} contact={d.contact} />;
      return <PublicOrderView data={d} code={code} onReload={reload} />;
    }
    case 'personal': {
      const f = loaded.form;
      if (f.state !== 'ok') {
        const st: Exclude<LinkState, 'ok'> = f.state === 'ordered' ? 'not_found' : f.state;
        return <ClosedNotice state={st} institution={f.institution} year={f.year} openDate={f.open_date} contact={f.contact} />;
      }
      return <PublicOrderForm form={f} code={code} personal={f.student} />;
    }
    case 'form': {
      const f = loaded.form;
      if (f.state !== 'ok') return <ClosedNotice state={f.state} institution={f.institution} year={f.year} openDate={f.open_date} contact={f.contact} />;
      return <PublicOrderForm form={f} code={code} />;
    }
  }
}

function Unsubscribe({ code }: { code: string }) {
  const [state, setState] = useState<'ask' | 'sending' | 'done' | 'error'>('ask');
  const go = async () => {
    setState('sending');
    const { data, error } = await supabase.rpc('public_unsubscribe', { p_code: code });
    setState(!error && (data as unknown as { ok: boolean })?.ok ? 'done' : 'error');
  };
  return (
    <>
      <PublicHeader />
      <Card className="text-center">
        {state === 'done' ? (
          <>
            <CheckCircle2 className="mx-auto mb-2 h-10 w-10 text-emerald-600" />
            <p className="text-lg">הוסרתם מרשימת התפוצה.</p>
            <p className="mt-1 text-sm text-slate-500">לא נשלח אליכם עוד מיילים של &quot;הזמנה להזמין&quot;. מיילים על הזמנה שלכם (אישור, מוכנה לאיסוף) ימשיכו להגיע.</p>
          </>
        ) : (
          <>
            <p className="text-lg">להסיר אתכם מרשימת התפוצה?</p>
            <p className="mt-1 text-sm text-slate-500">לא תקבלו עוד מיילים על פתיחת הזמנות ספרים.</p>
            {state === 'error' && <p className="mt-2 text-sm text-red-600">ההסרה לא הצליחה. אפשר לנסות שוב או לפנות למשרד.</p>}
            <button type="button" className={`${bigButton} mt-4`} onClick={go} disabled={state === 'sending'}>
              {state === 'sending' && <Loader2 className="h-5 w-5 animate-spin" />}
              כן, להסיר
            </button>
          </>
        )}
      </Card>
    </>
  );
}
