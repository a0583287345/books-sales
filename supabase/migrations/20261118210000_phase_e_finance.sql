-- =====================================================================
-- שלב ה׳: כספים – תשלומים מלקוחות, החזרים וזיכויים, תשלומים לספקים, הוצאות, סיכומים ודשבורד
--  - payments: יומן לכל הזמנה (סכום עם סימן): תשלום (+), החזר (−), זיכוי יוצא (−) / נכנס (+). אין מחיקה – רק ביטול רשומה.
--  - orders.paid_amount = סכום הרשומות שלא בוטלו (טריגר, app.payment_sync)
--  - אמצעי תשלום: מזומן / צ'ק / ביט / העברה (+ "זיכוי" להעברה בין הזמנות). בלי אשראי. בלי קבלות.
--  - ספקים: חוב = שווי מה שהתקבל (כמות × מחיר קנייה, פחות עודפים שהוחזרו) − תשלומים. שלילי = שולם מראש.
--  - קובץ זה רק יוצר דברים חדשים (לא מעדכן פונקציות קיימות).
-- =====================================================================

-- ---------- תשלומים מלקוחות ----------
create table public.payments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete restrict,
  kind text not null check (kind in ('payment', 'refund', 'credit_out', 'credit_in')),
  amount numeric(10, 2) not null check (amount <> 0),
  method text not null check (method in ('cash', 'check', 'bit', 'transfer', 'credit')),
  paid_at date not null default public.israel_today(),
  reference text,
  notes text,
  related_payment_id uuid references public.payments (id) on delete set null,
  voided boolean not null default false,
  voided_at timestamptz,
  voided_by_name text,
  void_reason text,
  created_at timestamptz not null default now(),
  created_by_name text,
  check ((kind in ('payment', 'credit_in') and amount > 0) or (kind in ('refund', 'credit_out') and amount < 0)),
  check ((kind in ('credit_in', 'credit_out')) = (method = 'credit'))
);
create index payments_order on public.payments (order_id);
create index payments_paid_at on public.payments (paid_at);
create index payments_related on public.payments (related_payment_id);

-- סכום ששולם בהזמנה = רשומות שלא בוטלו
create or replace function public.sync_order_paid()
returns trigger language plpgsql security definer set search_path = '' as $$
declare oid uuid := coalesce(new.order_id, old.order_id);
begin
  perform set_config('app.payment_sync', 'on', true);
  update public.orders
     set paid_amount = coalesce((select sum(amount) from public.payments where order_id = oid and not voided), 0)
   where id = oid;
  perform set_config('app.payment_sync', 'off', true);
  return null;
end;
$$;
revoke all on function public.sync_order_paid() from public, anon, authenticated;
create trigger payments_sync_order after insert or update on public.payments
  for each row execute function public.sync_order_paid();

create or replace function public.payment_method_label(m text)
returns text language sql immutable set search_path = '' as $$
  select case m when 'cash' then 'מזומן' when 'check' then 'צ׳ק' when 'bit' then 'ביט'
    when 'transfer' then 'העברה בנקאית' when 'credit' then 'זיכוי' else m end;
$$;

-- רישום תשלום (עד גובה היתרה)
create or replace function public.record_payment(
  p_order uuid, p_amount numeric, p_method text, p_date date default null, p_reference text default null, p_notes text default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  o public.orders%rowtype;
  pid uuid;
begin
  perform public.require_permission('payments_record');
  select * into o from public.orders where id = p_order;
  if o.id is null then raise exception 'ההזמנה לא נמצאה'; end if;
  if p_method not in ('cash', 'check', 'bit', 'transfer') then raise exception 'אמצעי תשלום לא תקין'; end if;
  if coalesce(p_amount, 0) <= 0 then raise exception 'יש להזין סכום חיובי'; end if;
  if o.balance <= 0 then raise exception 'ההזמנה כבר שולמה במלואה'; end if;
  if p_amount > o.balance then
    raise exception 'הסכום (% ₪) גבוה מהיתרה לתשלום (% ₪)', p_amount, o.balance;
  end if;
  insert into public.payments (order_id, kind, amount, method, paid_at, reference, notes, created_by_name)
  values (p_order, 'payment', p_amount, p_method, coalesce(p_date, public.israel_today()),
          nullif(trim(coalesce(p_reference, '')), ''), nullif(trim(coalesce(p_notes, '')), ''), public.my_full_name())
  returning id into pid;
  insert into public.order_events (order_id, user_name, event, description)
  values (p_order, public.my_full_name(), 'payment', format('תשלום %s ₪ (%s)', p_amount, public.payment_method_label(p_method)));
  return pid;
end;
$$;

-- החזר כספי מיתרת זכות
create or replace function public.refund_payment(
  p_order uuid, p_amount numeric, p_method text, p_date date default null, p_reference text default null, p_notes text default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  o public.orders%rowtype;
  pid uuid;
begin
  perform public.require_permission('payments_refund');
  select * into o from public.orders where id = p_order;
  if o.id is null then raise exception 'ההזמנה לא נמצאה'; end if;
  if p_method not in ('cash', 'check', 'bit', 'transfer') then raise exception 'אמצעי תשלום לא תקין'; end if;
  if coalesce(p_amount, 0) <= 0 then raise exception 'יש להזין סכום חיובי'; end if;
  if -o.balance < p_amount then
    raise exception 'יתרת הזכות בהזמנה היא % ₪ – אי אפשר להחזיר יותר', greatest(-o.balance, 0);
  end if;
  insert into public.payments (order_id, kind, amount, method, paid_at, reference, notes, created_by_name)
  values (p_order, 'refund', -p_amount, p_method, coalesce(p_date, public.israel_today()),
          nullif(trim(coalesce(p_reference, '')), ''), nullif(trim(coalesce(p_notes, '')), ''), public.my_full_name())
  returning id into pid;
  insert into public.order_events (order_id, user_name, event, description)
  values (p_order, public.my_full_name(), 'refund', format('החזר כספי %s ₪ (%s)', p_amount, public.payment_method_label(p_method)));
  return pid;
end;
$$;

-- העברת יתרת זכות כזיכוי להזמנה אחרת של אותו לקוח
create or replace function public.transfer_credit(p_from_order uuid, p_to_order uuid, p_amount numeric, p_notes text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare
  a public.orders%rowtype;
  b public.orders%rowtype;
  out_id uuid;
  in_id uuid;
begin
  perform public.require_permission('payments_record');
  select * into a from public.orders where id = p_from_order;
  select * into b from public.orders where id = p_to_order;
  if a.id is null or b.id is null then raise exception 'ההזמנה לא נמצאה'; end if;
  if a.id = b.id then raise exception 'יש לבחור הזמנה אחרת'; end if;
  if a.customer_id <> b.customer_id then raise exception 'אפשר להעביר זיכוי רק בין הזמנות של אותו לקוח'; end if;
  if coalesce(p_amount, 0) <= 0 then raise exception 'יש להזין סכום חיובי'; end if;
  if -a.balance < p_amount then raise exception 'יתרת הזכות בהזמנה % היא % ₪', a.number, greatest(-a.balance, 0); end if;
  if b.balance < p_amount then raise exception 'היתרה לתשלום בהזמנה % היא % ₪', b.number, greatest(b.balance, 0); end if;
  insert into public.payments (order_id, kind, amount, method, notes, created_by_name)
  values (a.id, 'credit_out', -p_amount, 'credit', coalesce(nullif(trim(coalesce(p_notes, '')), ''), 'זיכוי להזמנה ' || b.number), public.my_full_name())
  returning id into out_id;
  insert into public.payments (order_id, kind, amount, method, notes, related_payment_id, created_by_name)
  values (b.id, 'credit_in', p_amount, 'credit', coalesce(nullif(trim(coalesce(p_notes, '')), ''), 'זיכוי מהזמנה ' || a.number), out_id, public.my_full_name())
  returning id into in_id;
  update public.payments set related_payment_id = in_id where id = out_id;
  insert into public.order_events (order_id, user_name, event, description) values
    (a.id, public.my_full_name(), 'credit', format('הועבר זיכוי %s ₪ להזמנה %s', p_amount, b.number)),
    (b.id, public.my_full_name(), 'credit', format('התקבל זיכוי %s ₪ מהזמנה %s', p_amount, a.number));
end;
$$;

-- ביטול רשומת תשלום (טעות) – זיכוי מבוטל יחד עם הרשומה המקבילה
create or replace function public.void_payment(p_payment uuid, p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  p public.payments%rowtype;
begin
  perform public.require_permission('payments_refund');
  if nullif(trim(coalesce(p_reason, '')), '') is null then raise exception 'יש לרשום סיבה לביטול'; end if;
  select * into p from public.payments where id = p_payment;
  if p.id is null then raise exception 'הרשומה לא נמצאה'; end if;
  if p.voided then raise exception 'הרשומה כבר בוטלה'; end if;
  update public.payments
     set voided = true, voided_at = now(), voided_by_name = public.my_full_name(), void_reason = trim(p_reason)
   where id = p.id or (p.related_payment_id is not null and id = p.related_payment_id);
  insert into public.order_events (order_id, user_name, event, description)
  select order_id, public.my_full_name(), 'payment_void',
         format('בוטלה רשומת %s של %s ₪ – %s',
                case kind when 'payment' then 'תשלום' when 'refund' then 'החזר' else 'זיכוי' end, abs(amount), trim(p_reason))
  from public.payments where id = p.id or (p.related_payment_id is not null and id = p.related_payment_id);
end;
$$;

-- ---------- ספקים ----------
create table public.supplier_payments (
  id uuid primary key default gen_random_uuid(),
  supplier_id uuid not null references public.suppliers (id) on delete restrict,
  year_id uuid references public.academic_years (id) on delete set null,
  amount numeric(10, 2) not null check (amount > 0),
  method text not null check (method in ('cash', 'check', 'bit', 'transfer')),
  paid_at date not null default public.israel_today(),
  reference text,
  notes text,
  voided boolean not null default false,
  voided_at timestamptz,
  voided_by_name text,
  void_reason text,
  created_at timestamptz not null default now(),
  created_by_name text
);
create index supplier_payments_supplier on public.supplier_payments (supplier_id);
create index supplier_payments_year on public.supplier_payments (year_id);

create or replace function public.record_supplier_payment(
  p_supplier uuid, p_amount numeric, p_method text, p_year uuid default null, p_date date default null,
  p_reference text default null, p_notes text default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare pid uuid;
begin
  perform public.require_permission('supplier_payments_manage');
  if coalesce(p_amount, 0) <= 0 then raise exception 'יש להזין סכום חיובי'; end if;
  if p_method not in ('cash', 'check', 'bit', 'transfer') then raise exception 'אמצעי תשלום לא תקין'; end if;
  insert into public.supplier_payments (supplier_id, year_id, amount, method, paid_at, reference, notes, created_by_name)
  values (p_supplier, p_year, p_amount, p_method, coalesce(p_date, public.israel_today()),
          nullif(trim(coalesce(p_reference, '')), ''), nullif(trim(coalesce(p_notes, '')), ''), public.my_full_name())
  returning id into pid;
  insert into public.audit_logs (action, entity, entity_id, description)
  values ('create', 'supplier_payments', pid::text,
          format('תשלום לספק "%s": %s ₪ (%s)', (select name from public.suppliers where id = p_supplier), p_amount, public.payment_method_label(p_method)));
  return pid;
end;
$$;

create or replace function public.void_supplier_payment(p_payment uuid, p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
declare sp public.supplier_payments%rowtype;
begin
  perform public.require_permission('supplier_payments_manage');
  if nullif(trim(coalesce(p_reason, '')), '') is null then raise exception 'יש לרשום סיבה לביטול'; end if;
  select * into sp from public.supplier_payments where id = p_payment;
  if sp.id is null or sp.voided then raise exception 'הרשומה לא נמצאה או שכבר בוטלה'; end if;
  update public.supplier_payments set voided = true, voided_at = now(), voided_by_name = public.my_full_name(), void_reason = trim(p_reason)
   where id = p_payment;
  insert into public.audit_logs (action, entity, entity_id, description)
  values ('cancel', 'supplier_payments', p_payment::text,
          format('בוטל תשלום לספק "%s" של %s ₪ – %s', (select name from public.suppliers where id = sp.supplier_id), sp.amount, trim(p_reason)));
end;
$$;

-- יתרות ספקים: שווי שהתקבל (לפי מחיר קנייה, פחות עודפים שהוחזרו) מול תשלומים. p_year ריק = כל השנים.
create or replace function public.supplier_balances(p_year uuid default null)
returns table (supplier_id uuid, received_value numeric, paid numeric, balance numeric, missing_cost_items integer)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.require_any_permission(array['finance_view', 'supplier_payments_manage']);
  return query
  with recv as (
    select po.supplier_id sid,
           sum((i.qty_received - coalesce((select sum(r.qty) from public.po_returns r where r.po_item_id = i.id and r.kind = 'excess'), 0))
               * coalesce(c.unit_cost, 0)) v,
           count(*) filter (where c.unit_cost is null and i.qty_received > 0)::integer miss
    from public.po_items i
    join public.purchase_orders po on po.id = i.po_id
    left join public.po_item_costs c on c.po_item_id = i.id
    where po.status <> 'cancelled' and (p_year is null or po.year_id = p_year)
    group by po.supplier_id),
  pay as (
    select sp.supplier_id sid, sum(sp.amount) v from public.supplier_payments sp
    where not sp.voided and (p_year is null or sp.year_id = p_year) group by sp.supplier_id),
  ids as (select recv.sid from recv union select pay.sid from pay)
  select ids.sid, coalesce(recv.v, 0)::numeric, coalesce(pay.v, 0)::numeric,
         (coalesce(recv.v, 0) - coalesce(pay.v, 0))::numeric, coalesce(recv.miss, 0)
  from ids left join recv on recv.sid = ids.sid left join pay on pay.sid = ids.sid;
end;
$$;

-- ---------- הוצאות ----------
create table public.expenses (
  id uuid primary key default gen_random_uuid(),
  year_id uuid references public.academic_years (id) on delete set null,
  institution_year_id uuid references public.institution_years (id) on delete set null,
  expense_date date not null default public.israel_today(),
  amount numeric(10, 2) not null check (amount > 0),
  category text not null check (length(trim(category)) > 0),
  payee text,
  method text check (method is null or method in ('cash', 'check', 'bit', 'transfer')),
  reference text,
  notes text,
  created_at timestamptz not null default now(),
  created_by_name text,
  updated_at timestamptz not null default now()
);
create index expenses_year on public.expenses (year_id);
create index expenses_iy on public.expenses (institution_year_id);
create trigger expenses_updated_at before update on public.expenses for each row execute function public.set_updated_at();
create trigger expenses_audit after insert or update or delete on public.expenses
  for each row execute function public.audit_row('הוצאה');

create or replace function public.fill_created_by_name()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  new.created_by_name := public.my_full_name();
  return new;
end;
$$;
revoke all on function public.fill_created_by_name() from public, anon, authenticated;
create trigger expenses_created_by before insert on public.expenses for each row execute function public.fill_created_by_name();

-- ---------- סיכומים ----------
-- סיכום כספי לשנה
create or replace function public.finance_summary(p_year uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare res jsonb;
begin
  perform public.require_permission('finance_view');
  select jsonb_build_object(
    'orders_count', (select count(*) from public.orders where year_id = p_year and status <> 'cancelled'),
    'sales_total', coalesce((select sum(total) from public.orders where year_id = p_year and status <> 'cancelled'), 0),
    'discounts', coalesce((select sum(least(discount, subtotal)) from public.orders where year_id = p_year and status <> 'cancelled'), 0),
    'received', coalesce((select sum(p.amount) from public.payments p join public.orders o on o.id = p.order_id
                          where o.year_id = p_year and not p.voided and p.kind = 'payment'), 0),
    'refunded', coalesce((select -sum(p.amount) from public.payments p join public.orders o on o.id = p.order_id
                          where o.year_id = p_year and not p.voided and p.kind = 'refund'), 0),
    'open_debt', coalesce((select sum(balance) from public.orders where year_id = p_year and balance > 0 and status <> 'cancelled'), 0),
    'debt_orders', (select count(*) from public.orders where year_id = p_year and balance > 0 and status <> 'cancelled'),
    'open_credit', coalesce((select -sum(balance) from public.orders where year_id = p_year and balance < 0), 0),
    'by_method', coalesce((select jsonb_object_agg(method, s) from (
        select p.method, sum(p.amount) s from public.payments p join public.orders o on o.id = p.order_id
        where o.year_id = p_year and not p.voided and p.kind in ('payment', 'refund') group by p.method) t), '{}'::jsonb),
    'purchases', coalesce((select sum(received_value) from public.supplier_balances(p_year)), 0),
    'supplier_paid', coalesce((select sum(paid) from public.supplier_balances(p_year)), 0),
    'supplier_owed', coalesce((select sum(balance) from public.supplier_balances(p_year)), 0),
    'delivery_costs', coalesce((select sum(d.cost) from public.institution_deliveries d join public.institution_years iy on iy.id = d.institution_year_id
                                where iy.year_id = p_year and d.status <> 'cancelled'), 0),
    'expenses_total', coalesce((select sum(amount) from public.expenses where year_id = p_year), 0),
    'expenses_by_category', coalesce((select jsonb_object_agg(category, s) from (
        select category, sum(amount) s from public.expenses where year_id = p_year group by category) t), '{}'::jsonb))
  into res;
  return res;
end;
$$;

-- מסך ראשי: תמונת מצב לשנה (סכומים רק עם finance_view)
create or replace function public.dashboard_stats(p_year uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  res jsonb;
  money_ok boolean := public.has_permission('finance_view');
begin
  perform public.require_permission('dashboard_view');
  select jsonb_build_object(
    'institutions', (select count(*) from public.institution_years where year_id = p_year),
    'orders', (select count(*) from public.orders where year_id = p_year and status <> 'cancelled'),
    'orders_by_status', coalesce((select jsonb_object_agg(status, n) from (
        select status, count(*) n from public.orders where year_id = p_year group by status) t), '{}'::jsonb),
    'orders_unhandled', (select count(*) from public.orders where year_id = p_year and status in ('new', 'pending')),
    'books_missing', coalesce((select sum(greatest(demand - allocated, 0)) from public.demand_by_institution(p_year)), 0),
    'books_to_order', coalesce((select sum(greatest(d.demand - d.ordered - d.ordered_draft, 0)) from public.demand_by_institution(p_year) d), 0),
    'po_open', (select count(*) from public.purchase_orders where year_id = p_year and status in ('draft', 'sent', 'partial')),
    'orders_to_pack', (select count(*) from public.orders o where o.year_id = p_year and o.status not in ('cancelled', 'delivered')
                         and (select coalesce(sum(oi.qty), 0) from public.order_items oi where oi.order_id = o.id and oi.status = 'active')
                           > public.order_packed_qty(o.id)),
    'bags_in_progress', (select count(*) from public.bags b join public.orders o on o.id = b.order_id
                         where o.year_id = p_year and b.status in ('picking', 'picked', 'checked')),
    'bags_ready', (select count(*) from public.bags b join public.orders o on o.id = b.order_id
                   where o.year_id = p_year and b.status = 'ready'),
    'deliveries_open', (select count(*) from public.institution_deliveries d join public.institution_years iy on iy.id = d.institution_year_id
                        where iy.year_id = p_year and d.status in ('planned', 'sent')),
    'money', case when money_ok then jsonb_build_object(
        'sales_total', coalesce((select sum(total) from public.orders where year_id = p_year and status <> 'cancelled'), 0),
        'received', coalesce((select sum(p.amount) from public.payments p join public.orders o on o.id = p.order_id
                              where o.year_id = p_year and not p.voided and p.kind in ('payment', 'refund')), 0),
        'open_debt', coalesce((select sum(balance) from public.orders where year_id = p_year and balance > 0 and status <> 'cancelled'), 0),
        'expenses', coalesce((select sum(amount) from public.expenses where year_id = p_year), 0)
                    + coalesce((select sum(d.cost) from public.institution_deliveries d join public.institution_years iy on iy.id = d.institution_year_id
                                where iy.year_id = p_year and d.status <> 'cancelled'), 0),
        'supplier_owed', coalesce((select sum(balance) from public.supplier_balances(p_year)), 0)) end)
  into res;
  return res;
end;
$$;

create or replace function public.order_packed_qty(p_order uuid)
returns integer language sql stable security definer set search_path = '' as $$
  select coalesce(sum(bi.qty), 0)::integer from public.bag_items bi join public.bags b on b.id = bi.bag_id
  where b.order_id = p_order and b.status <> 'cancelled';
$$;
revoke all on function public.order_packed_qty(uuid) from public, anon, authenticated;

-- דוח לפי מוסד: הזמנות, סכומים, תשלומים, חובות
create or replace function public.institution_finance(p_year uuid)
returns table (institution_year_id uuid, inst_name text, orders_count integer, sales_total numeric, paid numeric, open_debt numeric, delivered_orders integer)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.require_permission('finance_view');
  return query
  select iy.id, i.name,
         count(o.id) filter (where o.status <> 'cancelled')::integer,
         coalesce(sum(o.total) filter (where o.status <> 'cancelled'), 0)::numeric,
         coalesce(sum(o.paid_amount), 0)::numeric,
         coalesce(sum(o.balance) filter (where o.balance > 0 and o.status <> 'cancelled'), 0)::numeric,
         count(o.id) filter (where o.status = 'delivered')::integer
  from public.institution_years iy
  join public.institutions i on i.id = iy.institution_id
  left join public.orders o on o.institution_year_id = iy.id
  where iy.year_id = p_year
  group by iy.id, i.name;
end;
$$;

-- ---------- הרשאות לפונקציות ----------
revoke all on function public.record_payment(uuid, numeric, text, date, text, text) from public, anon;
revoke all on function public.refund_payment(uuid, numeric, text, date, text, text) from public, anon;
revoke all on function public.transfer_credit(uuid, uuid, numeric, text) from public, anon;
revoke all on function public.void_payment(uuid, text) from public, anon;
revoke all on function public.record_supplier_payment(uuid, numeric, text, uuid, date, text, text) from public, anon;
revoke all on function public.void_supplier_payment(uuid, text) from public, anon;
revoke all on function public.supplier_balances(uuid) from public, anon;
revoke all on function public.finance_summary(uuid) from public, anon;
revoke all on function public.dashboard_stats(uuid) from public, anon;
revoke all on function public.institution_finance(uuid) from public, anon;
grant execute on function public.record_payment(uuid, numeric, text, date, text, text) to authenticated;
grant execute on function public.refund_payment(uuid, numeric, text, date, text, text) to authenticated;
grant execute on function public.transfer_credit(uuid, uuid, numeric, text) to authenticated;
grant execute on function public.void_payment(uuid, text) to authenticated;
grant execute on function public.record_supplier_payment(uuid, numeric, text, uuid, date, text, text) to authenticated;
grant execute on function public.void_supplier_payment(uuid, text) to authenticated;
grant execute on function public.supplier_balances(uuid) to authenticated;
grant execute on function public.finance_summary(uuid) to authenticated;
grant execute on function public.dashboard_stats(uuid) to authenticated;
grant execute on function public.institution_finance(uuid) to authenticated;

-- ---------- RLS ----------
alter table public.payments enable row level security;
alter table public.supplier_payments enable row level security;
alter table public.expenses enable row level security;

-- תשלומים: צפייה עם finance_view או מי שרושם תשלומים (במסירה); כתיבה רק דרך הפונקציות
create policy payments_select on public.payments for select to authenticated
  using ((select public.has_permission('finance_view')) or (select public.has_permission('payments_record')));
create policy supplier_payments_select on public.supplier_payments for select to authenticated
  using ((select public.has_permission('finance_view')) or (select public.has_permission('supplier_payments_manage')));

create policy expenses_select on public.expenses for select to authenticated
  using ((select public.has_permission('finance_view')) or (select public.has_permission('expenses_manage')));
create policy expenses_insert on public.expenses for insert to authenticated with check ((select public.has_permission('expenses_manage')));
create policy expenses_update on public.expenses for update to authenticated
  using ((select public.has_permission('expenses_manage'))) with check ((select public.has_permission('expenses_manage')));
create policy expenses_delete on public.expenses for delete to authenticated using ((select public.has_permission('expenses_manage')));

revoke all on public.payments, public.supplier_payments, public.expenses from anon;
