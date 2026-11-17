-- =====================================================================
-- שלב ב׳: הזמנות
--  - הזמנה = ילד אחד (student_name חובה), בכיתה אחת, ללקוח אחד
--  - פריטי הזמנה: המחיר והמועדים נלקחים תמיד מרשימת הכיתה (טריגר) – לא מהדפדפן
--  - ביטול/הפחתת כמות: orders_cancel; אחרי המועד האחרון לביטול – רק עם orders_cancel_late (נאכף כאן)
--  - אין מחיקת הזמנות/פריטים – רק ביטול (היסטוריה מלאה ב-order_events)
--  - סכומים: subtotal מחושב מהפריטים הפעילים; total/balance – עמודות מחושבות; paid_amount – יעודכן מהתשלומים (שלב ה׳)
--  - אין משלוחים: delivery_method = pickup (איסוף עצמי) / institution_day (יום מכירה במוסד)
-- =====================================================================

-- ---------- יום מכירה במוסד ----------
alter table public.institution_years
  add column sale_day_date date,
  add column sale_day_notes text;

-- ---------- ילדים של לקוח ----------
create table public.customer_students (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers (id) on delete cascade,
  name text not null check (length(trim(name)) > 0),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (customer_id, name)
);
create trigger customer_students_updated_at before update on public.customer_students
  for each row execute function public.set_updated_at();
create trigger customer_students_audit after insert or update or delete on public.customer_students
  for each row execute function public.audit_row('ילד של לקוח');

-- ---------- הזמנות ----------
create sequence public.orders_number_seq start 10001;
create table public.orders (
  id uuid primary key default gen_random_uuid(),
  number integer not null unique default nextval('public.orders_number_seq'),
  year_id uuid not null references public.academic_years (id) on delete restrict,
  institution_year_id uuid not null references public.institution_years (id) on delete restrict,
  class_id uuid not null references public.classes (id) on delete restrict,
  customer_id uuid not null references public.customers (id) on delete restrict,
  student_id uuid references public.customer_students (id) on delete set null,
  student_name text not null check (length(trim(student_name)) > 0),
  status text not null default 'new'
    check (status in ('new', 'pending', 'approved', 'processing', 'preparing', 'ready', 'sent', 'delivered', 'cancelled')),
  delivery_method text not null default 'pickup' check (delivery_method in ('pickup', 'institution_day')),
  subtotal numeric(10, 2) not null default 0,
  discount numeric(10, 2) not null default 0 check (discount >= 0),
  discount_reason text,
  total numeric(10, 2) generated always as (greatest(subtotal - discount, 0)) stored,
  paid_amount numeric(10, 2) not null default 0,
  balance numeric(10, 2) generated always as (greatest(subtotal - discount, 0) - paid_amount) stored,
  source text not null default 'manual' check (source in ('manual', 'phone', 'copy')),
  copied_from uuid references public.orders (id) on delete set null,
  notes text,
  cancelled_at timestamptz,
  cancelled_by_name text,
  cancel_reason text,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  created_by_name text,
  updated_at timestamptz not null default now()
);
alter sequence public.orders_number_seq owned by public.orders.number;
create index orders_year on public.orders (year_id);
create index orders_institution_year on public.orders (institution_year_id);
create index orders_class on public.orders (class_id);
create index orders_customer on public.orders (customer_id);
create index orders_student on public.orders (student_id);
create index orders_copied_from on public.orders (copied_from);
create index orders_status on public.orders (status);

create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete cascade,
  book_id uuid not null references public.books (id) on delete restrict,
  class_book_id uuid references public.class_books (id) on delete set null,
  qty integer not null default 1 check (qty > 0),
  unit_price numeric(10, 2) not null default 0 check (unit_price >= 0),
  is_required boolean not null default true,
  order_deadline date,
  cancel_deadline date,
  status text not null default 'active' check (status in ('active', 'cancelled')),
  cancelled_at timestamptz,
  cancelled_by_name text,
  cancel_reason text,
  cancelled_late boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (order_id, book_id)
);
create index order_items_book on public.order_items (book_id);
create index order_items_class_book on public.order_items (class_book_id);

create table public.order_events (
  id bigint generated always as identity primary key,
  order_id uuid not null references public.orders (id) on delete cascade,
  created_at timestamptz not null default now(),
  user_id uuid default auth.uid(),
  user_name text,
  event text not null,
  description text not null
);
create index order_events_order on public.order_events (order_id, created_at);

create trigger orders_updated_at before update on public.orders for each row execute function public.set_updated_at();
create trigger order_items_updated_at before update on public.order_items for each row execute function public.set_updated_at();

-- ---------- עזר ----------
create or replace function public.order_status_label(s text)
returns text language sql immutable set search_path = '' as $$
  select case s
    when 'new' then 'חדשה' when 'pending' then 'ממתינה לאישור' when 'approved' then 'מאושרת'
    when 'processing' then 'בטיפול' when 'preparing' then 'בהכנה' when 'ready' then 'מוכנה לאיסוף'
    when 'sent' then 'הועברה ליום המכירה' when 'delivered' then 'נמסרה' when 'cancelled' then 'בוטלה' else s end;
$$;

create or replace function public.israel_today()
returns date language sql stable set search_path = '' as $$
  select (now() at time zone 'Asia/Jerusalem')::date;
$$;

create or replace function public.my_full_name()
returns text language sql stable security definer set search_path = '' as $$
  select full_name from public.user_profiles where id = auth.uid();
$$;
revoke all on function public.my_full_name() from public, anon, authenticated;

-- ---------- שנה סגורה: גם הזמנות ----------
create or replace function public.guard_closed_year()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  rec jsonb := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
  y uuid;
begin
  if tg_table_name in ('institution_years', 'orders') then
    y := (rec->>'year_id')::uuid;
    if y is null and tg_table_name = 'orders' then
      select iy.year_id into y from public.classes c join public.institution_years iy on iy.id = c.institution_year_id
      where c.id = (rec->>'class_id')::uuid;
    end if;
  elsif tg_table_name = 'classes' then
    select iy.year_id into y from public.institution_years iy where iy.id = (rec->>'institution_year_id')::uuid;
  elsif tg_table_name = 'class_books' then
    select iy.year_id into y from public.classes c join public.institution_years iy on iy.id = c.institution_year_id
    where c.id = (rec->>'class_id')::uuid;
  elsif tg_table_name = 'order_items' then
    select o.year_id into y from public.orders o where o.id = (rec->>'order_id')::uuid;
  end if;
  if y is not null and exists (select 1 from public.academic_years where id = y and status = 'closed') then
    raise exception 'שנת הלימודים סגורה – אי אפשר לשנות אותה (אפשר לפתוח אותה מחדש במסך שנות לימודים)'
      using errcode = '42501';
  end if;
  return coalesce(new, old);
end;
$$;

-- ---------- הזמנה: מילוי ושמירה על הכללים ----------
create or replace function public.guard_orders()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  is_user boolean := auth.uid() is not null;
begin
  if tg_op = 'INSERT' then
    select iy.year_id, c.institution_year_id into new.year_id, new.institution_year_id
    from public.classes c join public.institution_years iy on iy.id = c.institution_year_id
    where c.id = new.class_id;
    if new.year_id is null then raise exception 'הכיתה לא נמצאה'; end if;
    new.subtotal := 0;
    new.paid_amount := 0;
    new.status := coalesce(new.status, 'new');
    new.created_by := auth.uid();
    new.created_by_name := public.my_full_name();
    if is_user and new.discount > 0 then perform public.require_permission('orders_discount'); end if;
    return new;
  end if;

  -- UPDATE
  if new.class_id is distinct from old.class_id or new.year_id is distinct from old.year_id
     or new.institution_year_id is distinct from old.institution_year_id then
    raise exception 'אי אפשר להעביר הזמנה לכיתה אחרת – אפשר להעתיק את ההזמנה לכיתה החדשה ולבטל את הישנה';
  end if;
  -- סכומים: רק מהחישוב / מהתשלומים
  if coalesce(current_setting('app.order_recalc', true), '') <> 'on' then new.subtotal := old.subtotal; end if;
  if coalesce(current_setting('app.payment_sync', true), '') <> 'on' then new.paid_amount := old.paid_amount; end if;

  if old.status = 'cancelled' and new.status <> 'cancelled' then
    raise exception 'הזמנה שבוטלה לא נפתחת מחדש – אפשר להעתיק אותה להזמנה חדשה';
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
create trigger orders_guard before insert or update on public.orders
  for each row execute function public.guard_orders();
create trigger orders_closed_guard before insert or update or delete on public.orders
  for each row execute function public.guard_closed_year();

-- ביטול הזמנה → ביטול כל הפריטים הפעילים (כל פריט נבדק מול המועד האחרון שלו)
create or replace function public.cascade_order_cancel()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.status = 'cancelled' and old.status <> 'cancelled' then
    update public.order_items set status = 'cancelled', cancel_reason = new.cancel_reason
    where order_id = new.id and status = 'active';
  end if;
  return null;
end;
$$;
create trigger orders_cancel_items after update of status on public.orders
  for each row execute function public.cascade_order_cancel();

-- ---------- פריט הזמנה ----------
create or replace function public.guard_order_items()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  is_user boolean := auth.uid() is not null;
  o_status text;
  is_reduction boolean;
begin
  select status into o_status from public.orders where id = new.order_id;

  if tg_op = 'INSERT' then
    if o_status in ('cancelled', 'delivered') then
      raise exception 'אי אפשר להוסיף ספר להזמנה במצב "%"', public.order_status_label(o_status);
    end if;
    -- המחיר, חובה/רשות והמועדים – תמיד מרשימת הכיתה
    select cb.id, cb.sale_price, cb.is_required,
           coalesce(cb.order_deadline, iy.order_deadline), coalesce(cb.cancel_deadline, iy.cancel_deadline)
      into new.class_book_id, new.unit_price, new.is_required, new.order_deadline, new.cancel_deadline
    from public.orders o
    join public.class_books cb on cb.class_id = o.class_id and cb.book_id = new.book_id
    join public.institution_years iy on iy.id = o.institution_year_id
    where o.id = new.order_id;
    if new.class_book_id is null then raise exception 'הספר לא נמצא ברשימת הספרים של הכיתה'; end if;
    new.status := 'active';
    new.cancelled_at := null; new.cancelled_by_name := null; new.cancel_reason := null; new.cancelled_late := false;
    return new;
  end if;

  -- UPDATE
  if new.book_id <> old.book_id or new.order_id <> old.order_id then
    raise exception 'אי אפשר להחליף ספר בפריט – יש לבטל ולהוסיף';
  end if;
  if is_user then
    -- המחיר והמועדים לא נערכים ידנית (הנחה – ברמת ההזמנה)
    new.unit_price := old.unit_price;
    new.cancel_deadline := old.cancel_deadline;
    new.order_deadline := old.order_deadline;
  end if;

  if old.status = 'cancelled' and new.status = 'active' then
    if is_user then perform public.require_permission('orders_edit'); end if;
    if o_status in ('cancelled', 'delivered') then
      raise exception 'אי אפשר להחזיר ספר להזמנה במצב "%"', public.order_status_label(o_status);
    end if;
    new.cancelled_at := null; new.cancelled_by_name := null; new.cancel_reason := null; new.cancelled_late := false;
    return new;
  end if;

  is_reduction := (old.status = 'active' and new.status = 'cancelled')
               or (old.status = 'active' and new.status = 'active' and new.qty < old.qty);
  if is_reduction then
    if is_user then
      perform public.require_permission('orders_cancel');
      if old.cancel_deadline is not null and public.israel_today() > old.cancel_deadline then
        if not public.has_permission('orders_cancel_late') then
          raise exception 'עבר המועד האחרון לביטול (%) – נדרשת הרשאת "ביטול אחרי המועד האחרון"',
            to_char(old.cancel_deadline, 'DD/MM/YYYY') using errcode = '42501';
        end if;
        new.cancelled_late := true;
      end if;
    end if;
    if new.status = 'cancelled' then
      new.cancelled_at := now();
      new.cancelled_by_name := public.my_full_name();
    end if;
  elsif is_user and new.qty > old.qty then
    perform public.require_permission('orders_edit');
  end if;
  return new;
end;
$$;
create trigger order_items_guard before insert or update on public.order_items
  for each row execute function public.guard_order_items();
create trigger order_items_closed_guard before insert or update or delete on public.order_items
  for each row execute function public.guard_closed_year();

-- סכום ההזמנה מחושב מחדש מהפריטים הפעילים
create or replace function public.recalc_order_total()
returns trigger language plpgsql security definer set search_path = '' as $$
declare oid uuid := coalesce(new.order_id, old.order_id);
begin
  perform set_config('app.order_recalc', 'on', true);
  update public.orders
     set subtotal = coalesce((select sum(qty * unit_price) from public.order_items where order_id = oid and status = 'active'), 0)
   where id = oid;
  perform set_config('app.order_recalc', 'off', true);
  return null;
end;
$$;
create trigger order_items_recalc after insert or update or delete on public.order_items
  for each row execute function public.recalc_order_total();

-- ---------- היסטוריית הזמנה ----------
create or replace function public.order_history()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  uname text := public.my_full_name();
  bname text;
  oid uuid;
  ev text;
  d text;
begin
  if tg_table_name = 'orders' then
    oid := new.id;
    if tg_op = 'INSERT' then
      insert into public.order_events (order_id, user_name, event, description)
      values (oid, uname, 'created', 'ההזמנה נוצרה' ||
        case new.source when 'phone' then ' (טלפונית)' when 'copy' then ' (העתקה מהזמנה קודמת)' else '' end);
      return null;
    end if;
    if new.status is distinct from old.status then
      insert into public.order_events (order_id, user_name, event, description)
      values (oid, uname, case when new.status = 'cancelled' then 'cancelled' else 'status' end,
        'סטטוס: ' || public.order_status_label(old.status) || ' ← ' || public.order_status_label(new.status)
        || case when new.status = 'cancelled' and new.cancel_reason is not null then ' – ' || new.cancel_reason else '' end);
    end if;
    if new.discount is distinct from old.discount or new.discount_reason is distinct from old.discount_reason then
      insert into public.order_events (order_id, user_name, event, description)
      values (oid, uname, 'discount', format('הנחה: %s ₪ ← %s ₪%s', old.discount, new.discount,
        coalesce(' (' || new.discount_reason || ')', '')));
    end if;
    if new.delivery_method is distinct from old.delivery_method then
      insert into public.order_events (order_id, user_name, event, description)
      values (oid, uname, 'delivery', 'אופן מסירה: ' ||
        case new.delivery_method when 'pickup' then 'איסוף עצמי' else 'יום מכירה במוסד' end);
    end if;
    if new.student_name is distinct from old.student_name or new.customer_id is distinct from old.customer_id then
      insert into public.order_events (order_id, user_name, event, description)
      values (oid, uname, 'details', format('פרטי לקוח/תלמיד עודכנו (תלמיד: %s)', new.student_name));
    end if;
    if new.notes is distinct from old.notes then
      insert into public.order_events (order_id, user_name, event, description)
      values (oid, uname, 'notes', 'הערות עודכנו');
    end if;
    return null;
  end if;

  -- order_items
  oid := coalesce(new.order_id, old.order_id);
  if current_setting('app.order_creating', true) = 'on' then return null; end if;
  select name into bname from public.books where id = coalesce(new.book_id, old.book_id);
  if tg_op = 'INSERT' then
    ev := 'item_added'; d := format('נוסף ספר: %s × %s', bname, new.qty);
  elsif old.status = 'active' and new.status = 'cancelled' then
    ev := 'item_cancelled';
    d := 'בוטל ספר: ' || bname || case when new.cancelled_late then ' (אחרי המועד האחרון לביטול)' else '' end
         || coalesce(' – ' || new.cancel_reason, '');
  elsif old.status = 'cancelled' and new.status = 'active' then
    ev := 'item_restored'; d := format('הוחזר ספר: %s × %s', bname, new.qty);
  elsif new.qty <> old.qty then
    ev := 'item_qty';
    d := format('כמות %s: %s ← %s', bname, old.qty, new.qty)
         || case when new.qty < old.qty and new.cancelled_late then ' (אחרי המועד האחרון לביטול)' else '' end;
  else
    return null;
  end if;
  insert into public.order_events (order_id, user_name, event, description) values (oid, uname, ev, d);
  return null;
end;
$$;
create trigger orders_history after insert or update on public.orders
  for each row execute function public.order_history();
create trigger order_items_history after insert or update on public.order_items
  for each row execute function public.order_history();

revoke all on function public.guard_orders() from public, anon, authenticated;
revoke all on function public.cascade_order_cancel() from public, anon, authenticated;
revoke all on function public.guard_order_items() from public, anon, authenticated;
revoke all on function public.recalc_order_total() from public, anon, authenticated;
revoke all on function public.order_history() from public, anon, authenticated;

-- ---------- יצירת הזמנה (פעולה אחת שלמה) ----------
-- p_items: [{"book_id": "...", "qty": 1}, ...]. המחירים נקבעים מרשימת הכיתה.
-- p_student_id ריק → הילד נשמר בכרטיס הלקוח (או נמצא לפי שם אם כבר קיים).
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
  sid uuid := p_student_id;
  new_id uuid;
begin
  perform public.require_permission('orders_create');
  if coalesce(jsonb_array_length(p_items), 0) = 0 then raise exception 'יש לבחור לפחות ספר אחד'; end if;
  if length(trim(coalesce(p_student_name, ''))) = 0 then raise exception 'יש להזין את שם התלמיד'; end if;

  if sid is null then
    select id into sid from public.customer_students where customer_id = p_customer_id and name = trim(p_student_name);
    if sid is null then
      insert into public.customer_students (customer_id, name) values (p_customer_id, trim(p_student_name))
      returning id into sid;
    end if;
  end if;

  insert into public.orders (class_id, customer_id, student_id, student_name, delivery_method, discount, discount_reason,
                             notes, source, copied_from, year_id, institution_year_id)
  values (p_class_id, p_customer_id, sid, trim(p_student_name), coalesce(p_delivery, 'pickup'), coalesce(p_discount, 0),
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
revoke all on function public.create_order(uuid, uuid, text, jsonb, uuid, text, numeric, text, text, text, uuid) from public, anon;
grant execute on function public.create_order(uuid, uuid, text, jsonb, uuid, text, numeric, text, text, text, uuid) to authenticated;

-- ---------- RLS ----------
alter table public.customer_students enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.order_events enable row level security;
revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;

create policy customer_students_select on public.customer_students for select to authenticated
  using ((select public.has_permission('customers_view')) or (select public.has_permission('orders_view')));
create policy customer_students_insert on public.customer_students for insert to authenticated
  with check ((select public.has_permission('customers_edit')) or (select public.has_permission('customers_create')));
create policy customer_students_update on public.customer_students for update to authenticated
  using ((select public.has_permission('customers_edit'))) with check ((select public.has_permission('customers_edit')));
create policy customer_students_delete on public.customer_students for delete to authenticated
  using ((select public.has_permission('customers_edit')));

create policy orders_select on public.orders for select to authenticated using ((select public.has_permission('orders_view')));
-- יצירה רק דרך create_order. עדכון – הטריגר בודק איזו הרשאה נדרשת לכל שינוי. אין מחיקה.
create policy orders_update on public.orders for update to authenticated
  using ((select public.has_permission('orders_edit')) or (select public.has_permission('orders_cancel')) or (select public.has_permission('orders_discount')))
  with check ((select public.has_permission('orders_edit')) or (select public.has_permission('orders_cancel')) or (select public.has_permission('orders_discount')));

create policy order_items_select on public.order_items for select to authenticated using ((select public.has_permission('orders_view')));
create policy order_items_insert on public.order_items for insert to authenticated
  with check ((select public.has_permission('orders_edit')));
create policy order_items_update on public.order_items for update to authenticated
  using ((select public.has_permission('orders_edit')) or (select public.has_permission('orders_cancel')))
  with check ((select public.has_permission('orders_edit')) or (select public.has_permission('orders_cancel')));

create policy order_events_select on public.order_events for select to authenticated using ((select public.has_permission('orders_view')));
