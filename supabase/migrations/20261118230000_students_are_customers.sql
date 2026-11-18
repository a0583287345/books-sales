-- =====================================================================
-- התלמיד הוא הלקוח (ביטול "הורה + ילדים")
--  - כרטיס לקוח = תלמיד; שם ההורה – שדה רשות (parent_name)
--  - orders.student_name נשאר (מופיע במדבקות/דוחות) – נקבע אוטומטית משם הלקוח ומתעדכן כשהשם משתנה
--  - נתונים קיימים: כל ילד עם הזמנות הופך ללקוח (טלפונים/ת"ז/כתובת מועתקים, שם ההורה נשמר),
--    ההזמנות עוברות אליו, וכרטיסי ההורים שנשארו בלי הזמנות נמחקים
--  - הטבלה customer_students נמחקת
-- =====================================================================

alter table public.customers add column parent_name text;

-- ---------- המרת נתונים קיימים ----------
do $$
declare
  s record;
  new_cid uuid;
  first_part text;
  rest_part text;
begin
  for s in
    select cs.id, cs.name, cs.notes, c.id as parent_id, c.first_name, c.last_name, c.phone, c.phone2, c.email
    from public.customer_students cs join public.customers c on c.id = cs.customer_id
    where exists (select 1 from public.orders o where o.student_id = cs.id)
  loop
    first_part := split_part(trim(s.name), ' ', 1);
    rest_part := trim(substr(trim(s.name), length(first_part) + 1));
    insert into public.customers (first_name, last_name, phone, phone2, email, notes, parent_name)
    values (first_part, coalesce(nullif(rest_part, ''), s.last_name), s.phone, s.phone2, s.email, s.notes,
            s.first_name || ' ' || s.last_name)
    returning id into new_cid;

    insert into public.customer_private (customer_id, id_number, address, city)
    select new_cid, id_number, address, city from public.customer_private where customer_id = s.parent_id;

    update public.orders
       set customer_id = new_cid, student_id = null,
           student_name = first_part || ' ' || coalesce(nullif(rest_part, ''), s.last_name)
     where student_id = s.id;
  end loop;

  -- הזמנות שנשארו אצל הורה (בלי ילד מקושר) – נשארות אצלו
  delete from public.customers c
   where exists (select 1 from public.customer_students cs where cs.customer_id = c.id)
     and not exists (select 1 from public.orders o where o.customer_id = c.id);
end;
$$;

drop table public.customer_students cascade;

-- ---------- יצירת הזמנה: שם התלמיד = שם הלקוח ----------
create or replace function public.create_order(
  p_class_id uuid,
  p_customer_id uuid,
  p_student_name text,
  p_items jsonb,
  p_student_id uuid default null,
  p_delivery text default 'pickup',
  p_discount numeric default 0,
  p_discount_reason text default null,
  p_notes text default null,
  p_source text default 'manual',
  p_copied_from uuid default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  sname text;
  new_id uuid;
begin
  perform public.require_permission('orders_create');
  if coalesce(jsonb_array_length(p_items), 0) = 0 then raise exception 'יש לבחור לפחות ספר אחד'; end if;
  select first_name || ' ' || last_name into sname from public.customers where id = p_customer_id;
  if sname is null then raise exception 'הלקוח לא נמצא'; end if;

  insert into public.orders (class_id, customer_id, student_id, student_name, delivery_method, discount, discount_reason,
                             notes, source, copied_from, year_id, institution_year_id)
  values (p_class_id, p_customer_id, null, sname, coalesce(p_delivery, 'pickup'), coalesce(p_discount, 0),
          nullif(trim(coalesce(p_discount_reason, '')), ''), nullif(trim(coalesce(p_notes, '')), ''),
          coalesce(p_source, 'manual'), p_copied_from, null, null)
  returning id into new_id;

  perform set_config('app.order_creating', 'on', true);
  insert into public.order_items (order_id, book_id, qty)
  select new_id, (e->>'book_id')::uuid, greatest(coalesce((e->>'qty')::integer, 1), 1)
  from jsonb_array_elements(p_items) e;
  perform set_config('app.order_creating', 'off', true);

  insert into public.order_events (order_id, user_name, event, description)
  select new_id, public.my_full_name(), 'items',
         'ספרים בהזמנה: ' || string_agg(b.name || ' × ' || oi.qty, ', ' order by b.name)
  from public.order_items oi join public.books b on b.id = oi.book_id
  where oi.order_id = new_id;
  return new_id;
end;
$$;

-- ---------- שינוי שם בכרטיס → מתעדכן בהזמנות (ובמדבקות) ----------
create function public.sync_customer_name_to_orders()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.first_name is distinct from old.first_name or new.last_name is distinct from old.last_name then
    perform set_config('app.bag_sync', 'on', true);
    update public.orders set student_name = new.first_name || ' ' || new.last_name
     where customer_id = new.id and student_name is distinct from new.first_name || ' ' || new.last_name;
    perform set_config('app.bag_sync', 'off', true);
  end if;
  return new;
end;
$$;
revoke all on function public.sync_customer_name_to_orders() from public, anon, authenticated;
create trigger customers_sync_orders_name after update on public.customers
  for each row execute function public.sync_customer_name_to_orders();
