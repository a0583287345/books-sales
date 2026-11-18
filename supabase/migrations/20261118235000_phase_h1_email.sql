-- =====================================================================
-- שלב ח1: תשתית מיילים (Gmail + סיסמת אפליקציה). האפיון: docs/SPEC_EMAIL.md
--
-- email_settings – שורה אחת: חשבון, שם שולח, חתימה, מגבלה יומית, תבניות, ברירות מחדל
--                  להוראות תשלום / פרטי איסוף. קריאה: מי שמגדיר או שולח; עדכון: email_settings
-- email_secrets  – סיסמת האפליקציה. RLS בלי שום מדיניות = אין גישה מהדפדפן בכלל (רק השרת)
-- email_batches  – שליחה מרוכזת (כותרת + כמה נמענים)
-- email_outbox   – כל מייל: ממתין → נשלח / נכשל / בוטל. הוספה בשם המשתמש (RLS לפי סוג המייל);
--                  עדכון הסטטוס – רק השרת, אחרי השליחה
-- customers.email_opt_out – ביקש לא לקבל מיילים פרסומיים
-- =====================================================================

create table public.email_settings (
  id smallint primary key default 1 check (id = 1),
  enabled boolean not null default false,
  gmail_user text,
  from_name text not null default 'מכירת ספרי לימוד',
  reply_to text,
  signature text,
  daily_limit integer not null default 450 check (daily_limit between 1 and 2000),
  templates jsonb not null default '{}'::jsonb check (jsonb_typeof(templates) = 'object'),
  default_payment_instructions text,
  default_pickup_info text,
  updated_at timestamptz not null default now()
);
insert into public.email_settings (id) values (1);

create trigger email_settings_updated_at before update on public.email_settings
  for each row execute function public.set_updated_at();
create trigger email_settings_audit after update on public.email_settings
  for each row execute function public.audit_row('הגדרות מייל');

alter table public.email_settings enable row level security;
create policy email_settings_select on public.email_settings for select to authenticated
  using ((select public.has_permission('email_settings')) or (select public.has_permission('emails_send'))
         or (select public.has_permission('emails_suppliers')));
create policy email_settings_update on public.email_settings for update to authenticated
  using ((select public.has_permission('email_settings')))
  with check ((select public.has_permission('email_settings')));

-- ---------------------------------------------------------------------

create table public.email_secrets (
  id smallint primary key default 1 check (id = 1),
  gmail_app_password text,
  updated_at timestamptz not null default now()
);
insert into public.email_secrets (id) values (1);
alter table public.email_secrets enable row level security;
revoke all on public.email_secrets from anon, authenticated;

-- ---------------------------------------------------------------------

create table public.email_batches (
  id uuid primary key default gen_random_uuid(),
  kind text not null,
  title text not null,
  total integer not null default 0 check (total >= 0),
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_by_name text,
  created_at timestamptz not null default now()
);
create trigger email_batches_created_by before insert on public.email_batches
  for each row execute function public.fill_created_by_name();

create table public.email_outbox (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  batch_id uuid references public.email_batches (id) on delete set null,
  -- free = חופשי, test = בדיקה, ready / ready_partial = ההזמנה מוכנה, payment_reminder = תזכורת תשלום,
  -- supplier_po / supplier_free = לספק, invite = הזמנה להזמין, order_confirm = אישור הזמנה מהקישור,
  -- change_request = בקשת שינוי
  kind text not null check (kind in ('free', 'test', 'ready', 'ready_partial', 'payment_reminder', 'supplier_po',
                                     'supplier_free', 'invite', 'order_confirm', 'change_request')),
  to_email text not null check (to_email ~ '^[^\s@]+@[^\s@]+\.[^\s@]+$'),
  to_name text,
  subject text not null check (length(trim(subject)) > 0),
  body text not null,
  status text not null default 'queued' check (status in ('queued', 'sent', 'failed', 'cancelled')),
  error text,
  attempts integer not null default 0,
  customer_id uuid references public.customers (id) on delete set null,
  order_id uuid references public.orders (id) on delete set null,
  supplier_id uuid references public.suppliers (id) on delete set null,
  po_id uuid references public.purchase_orders (id) on delete set null,
  -- לצרף קובץ אקסל של הזמנת הרכש (ח3); עם מחירים – רק למי שמורשה
  attach_po boolean not null default false,
  attach_po_prices boolean not null default false,
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_by_name text,
  sent_at timestamptz
);
create index email_outbox_queue_idx on public.email_outbox (status, created_at);
create index email_outbox_sent_idx on public.email_outbox (sent_at) where status = 'sent';
create index email_outbox_batch_idx on public.email_outbox (batch_id);
create index email_outbox_customer_idx on public.email_outbox (customer_id);
create index email_outbox_order_idx on public.email_outbox (order_id);
create index email_outbox_supplier_idx on public.email_outbox (supplier_id);
create index email_outbox_po_idx on public.email_outbox (po_id);
create trigger email_outbox_created_by before insert on public.email_outbox
  for each row execute function public.fill_created_by_name();

alter table public.email_batches enable row level security;
alter table public.email_outbox enable row level security;

-- צפייה: יומן המיילים, או מי ששולח (רואה בכרטיס הלקוח/הספק מה נשלח)
create policy email_batches_select on public.email_batches for select to authenticated
  using ((select public.has_permission('emails_view')) or (select public.has_permission('emails_send'))
         or (select public.has_permission('emails_suppliers')));
create policy email_batches_insert on public.email_batches for insert to authenticated
  with check (created_by = (select auth.uid())
              and ((select public.has_permission('emails_send')) or (select public.has_permission('emails_suppliers'))
                   or (select public.has_permission('email_settings'))));

create policy email_outbox_select on public.email_outbox for select to authenticated
  using ((select public.has_permission('emails_view'))
         or (kind like 'supplier%' and (select public.has_permission('emails_suppliers')))
         or (kind not like 'supplier%' and kind <> 'test' and (select public.has_permission('emails_send')))
         or (kind = 'test' and (select public.has_permission('email_settings'))));
-- הוספה: רק כממתין, בשם עצמך, ולפי סוג המייל; מחיר קנייה בקובץ – רק עם books_view_cost
create policy email_outbox_insert on public.email_outbox for insert to authenticated
  with check (status = 'queued' and attempts = 0 and sent_at is null and error is null
              and created_by = (select auth.uid())
              and (not attach_po_prices or (select public.has_permission('books_view_cost')))
              and case
                    when kind = 'test' then (select public.has_permission('email_settings'))
                    when kind like 'supplier%' then (select public.has_permission('emails_suppliers'))
                    else (select public.has_permission('emails_send'))
                  end);
-- אין מדיניות update/delete: את הסטטוס מעדכן רק השרת אחרי השליחה

-- ---------------------------------------------------------------------

alter table public.customers add column email_opt_out boolean not null default false;
