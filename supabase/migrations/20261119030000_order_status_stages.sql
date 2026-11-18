-- =====================================================================
-- סטטוסי הזמנה = שלבי ההכנה (כמו הלשוניות במסך "הכנת שקיות")
--   pending   ממתינה לאישור (טלפון שנותק) – אישור ידני מעביר ל-new
--   new       חדשה – עוד לא התחילו לארוז
--   preparing בליקוט – יש שקית שעוד לא סומנה מוכנה
--   partial   מוכנה חלקית – יש שקית מוכנה/שנמסרה אבל חסרים ספרים (כולל נמסרה בחלקה)
--   ready     מוכנה – הכול בשקיות מוכנות, בלי חוסר
--   sent      הועברה ליום המכירה – כל השקיות הפתוחות במשלוח שיצא
--   delivered נמסרה – הכול נמסר
--   cancelled בוטלה (ידני)
-- הסטטוס מתעדכן אוטומטית (שקיות + שינוי ספרים בהזמנה). ידנית – רק אישור (pending → new) וביטול.
-- הוסרו: approved (מאושרת), processing (בטיפול) – הועברו ל-new.
-- מעדכן פונקציות קיימות – להריץ ב-SQL Editor של Supabase.
-- =====================================================================

-- 1. סטטוסים
alter table public.orders drop constraint if exists orders_status_check;
update public.orders set status = 'new' where status in ('approved', 'processing');
alter table public.orders add constraint orders_status_check
  check (status in ('new', 'pending', 'preparing', 'partial', 'ready', 'sent', 'delivered', 'cancelled'));

create or replace function public.order_status_label(s text)
returns text language sql immutable set search_path = '' as $$
  select case s
    when 'new' then 'חדשה' when 'pending' then 'ממתינה לאישור' when 'preparing' then 'בליקוט'
    when 'partial' then 'מוכנה חלקית' when 'ready' then 'מוכנה'
    when 'sent' then 'הועברה ליום המכירה' when 'delivered' then 'נמסרה' when 'cancelled' then 'בוטלה' else s end;
$$;

-- 2. חישוב הסטטוס לפי השקיות
create or replace function public.sync_order_from_bags(p_order uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  o public.orders%rowtype;
  q integer; p integer; d integer;
  open_bags integer; open_not_ready integer; in_sent_delivery integer;
  target text;
begin
  select * into o from public.orders where id = p_order;
  if o.id is null or o.status = 'cancelled' then return; end if;
  select coalesce(sum(qty), 0) into q from public.order_items where order_id = p_order and status = 'active';
  select coalesce(sum(bi.qty) filter (where b.status <> 'cancelled'), 0),
         coalesce(sum(bi.qty) filter (where b.status = 'delivered'), 0)
    into p, d
  from public.bag_items bi join public.bags b on b.id = bi.bag_id where b.order_id = p_order;
  select count(*) filter (where status not in ('cancelled', 'delivered')),
         count(*) filter (where status in ('picking', 'picked', 'checked')),
         count(*) filter (where status not in ('cancelled', 'delivered')
                          and delivery_id in (select id from public.institution_deliveries where status in ('sent', 'delivered')))
    into open_bags, open_not_ready, in_sent_delivery
  from public.bags where order_id = p_order;

  target := case
    when q > 0 and d >= q then 'delivered'
    when open_not_ready > 0 then 'preparing'
    when q > 0 and p >= q and open_bags > 0 and in_sent_delivery = open_bags then 'sent'
    when q > 0 and p >= q then 'ready'
    when p > 0 then 'partial'
    when o.status = 'pending' then 'pending'
    else 'new' end;

  if target is distinct from o.status then
    perform set_config('app.bag_sync', 'on', true);
    update public.orders set status = target where id = p_order;
    perform set_config('app.bag_sync', 'off', true);
  end if;
end;
$$;
revoke all on function public.sync_order_from_bags(uuid) from public, anon, authenticated;

-- 3. שינוי ספרים בהזמנה (הוספה/הפחתה/ביטול) מעדכן את הסטטוס – למשל ספר שנוסף להזמנה מוכנה → מוכנה חלקית
create or replace function public.order_items_sync_status()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform public.sync_order_from_bags(new.order_id);
  return null;
end;
$$;
revoke all on function public.order_items_sync_status() from public, anon, authenticated;

drop trigger if exists order_items_sync_status on public.order_items;
create trigger order_items_sync_status
  after insert or update of qty, status on public.order_items
  for each row execute function public.order_items_sync_status();

-- 4. שינוי ידני של הסטטוס – רק אישור (ממתינה לאישור → חדשה) וביטול
create or replace function public.guard_orders()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  is_user boolean := auth.uid() is not null and coalesce(current_setting('app.bag_sync', true), '') <> 'on';
begin
  if tg_op = 'INSERT' then
    select iy.year_id, c.institution_year_id into new.year_id, new.institution_year_id
    from public.classes c join public.institution_years iy on iy.id = c.institution_year_id
    where c.id = new.class_id;
    if new.year_id is null then raise exception 'הכיתה לא נמצאה'; end if;
    new.subtotal := 0;
    new.paid_amount := 0;
    new.status := coalesce(new.status, 'new');
    if new.status not in ('new', 'pending') then new.status := 'new'; end if;
    new.created_by := auth.uid();
    new.created_by_name := public.my_full_name();
    if is_user and new.discount > 0 then perform public.require_permission('orders_discount'); end if;
    return new;
  end if;

  if new.class_id is distinct from old.class_id or new.year_id is distinct from old.year_id
     or new.institution_year_id is distinct from old.institution_year_id then
    raise exception 'אי אפשר להעביר הזמנה לכיתה אחרת – אפשר להעתיק את ההזמנה לכיתה החדשה ולבטל את הישנה';
  end if;
  if coalesce(current_setting('app.order_recalc', true), '') <> 'on' then new.subtotal := old.subtotal; end if;
  if coalesce(current_setting('app.payment_sync', true), '') <> 'on' then new.paid_amount := old.paid_amount; end if;

  if old.status = 'cancelled' and new.status <> 'cancelled' then
    raise exception 'הזמנה שבוטלה לא נפתחת מחדש – אפשר להעתיק אותה להזמנה חדשה';
  end if;

  if new.status = 'cancelled' and old.status <> 'cancelled'
     and exists (select 1 from public.bags where order_id = new.id and status not in ('cancelled')) then
    raise exception 'יש להזמנה שקיות ארוזות או שנמסרו – יש לפרק את השקיות לפני ביטול ההזמנה';
  end if;

  if is_user and new.status is distinct from old.status and new.status <> 'cancelled'
     and not (old.status = 'pending' and new.status = 'new') then
    raise exception 'סטטוס ההזמנה מתעדכן אוטומטית לפי השקיות – ידנית אפשר רק לאשר הזמנה שממתינה לאישור או לבטל';
  end if;

  if is_user then
    if new.discount is distinct from old.discount or new.discount_reason is distinct from old.discount_reason then
      perform public.require_permission('orders_discount');
    end if;
    if new.status = 'cancelled' and old.status <> 'cancelled' then
      perform public.require_permission('orders_cancel');
    elsif new.status is distinct from old.status
       or new.delivery_method is distinct from old.delivery_method
       or new.notes is distinct from old.notes
       or new.customer_id is distinct from old.customer_id
       or new.student_id is distinct from old.student_id
       or new.student_name is distinct from old.student_name then
      perform public.require_permission('orders_edit');
    end if;
  end if;

  if new.status = 'cancelled' and old.status <> 'cancelled' then
    new.cancelled_at := now();
    new.cancelled_by_name := public.my_full_name();
  end if;
  return new;
end;
$$;

-- 5. חישוב מחדש לכל ההזמנות הקיימות
do $$
declare r record;
begin
  for r in select id from public.orders where status <> 'cancelled' loop
    perform public.sync_order_from_bags(r.id);
  end loop;
end;
$$;
