-- =====================================================================
-- שלב ד׳ – חלק ב׳: פונקציות + עדכון 3 פונקציות קיימות (guard_orders, guard_order_items, set_allocation)
-- ממתין לאישור ידני של המשתמש (נדחה ב-apply_migration). הטבלאות הוחלו ב-20261118180000_phase_d_warehouse_tables.sql
-- =====================================================================
-- ---------- עזר ----------
-- כמה נארז מפריט הזמנה (שקיות שלא בוטלו)
create or replace function public.item_packed(p_item uuid)
returns integer language sql stable security definer set search_path = '' as $$
  select coalesce(sum(bi.qty), 0)::integer from public.bag_items bi join public.bags b on b.id = bi.bag_id
  where bi.order_item_id = p_item and b.status <> 'cancelled';
$$;

-- ארוז-ולא-נמסר למוסד+ספר (תופס מההקצאה)
create or replace function public.packed_open(p_iy uuid, p_book uuid, p_except_bag uuid default null)
returns integer language sql stable security definer set search_path = '' as $$
  select coalesce(sum(bi.qty), 0)::integer
  from public.bag_items bi
  join public.bags b on b.id = bi.bag_id
  join public.order_items oi on oi.id = bi.order_item_id
  join public.orders o on o.id = oi.order_id
  where o.institution_year_id = p_iy and oi.book_id = p_book
    and b.status not in ('cancelled', 'delivered')
    and (p_except_bag is null or b.id <> p_except_bag);
$$;
revoke all on function public.item_packed(uuid) from public, anon, authenticated;
revoke all on function public.packed_open(uuid, uuid, uuid) from public, anon, authenticated;

-- ---------- הזמנה: עדכון סטטוס אוטומטי מהשקיות (בלי בדיקת הרשאות להזמנות) ----------
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

-- פריט הזמנה: אי אפשר לבטל/להפחית מתחת למה שכבר נארז
create or replace function public.guard_order_items()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  is_user boolean := auth.uid() is not null;
  o_status text;
  is_reduction boolean;
  packed integer;
begin
  select status into o_status from public.orders where id = new.order_id;

  if tg_op = 'INSERT' then
    if o_status in ('cancelled', 'delivered') then
      raise exception 'אי אפשר להוסיף ספר להזמנה במצב "%"', public.order_status_label(o_status);
    end if;
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

  if new.book_id <> old.book_id or new.order_id <> old.order_id then
    raise exception 'אי אפשר להחליף ספר בפריט – יש לבטל ולהוסיף';
  end if;
  if is_user then
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
    packed := public.item_packed(old.id);
    if (case when new.status = 'cancelled' then 0 else new.qty end) < packed then
      raise exception 'כבר נארזו % עותקים של הספר הזה בשקית – יש להוציא אותם מהשקית לפני הביטול', packed;
    end if;
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

-- סטטוס ההזמנה לפי השקיות
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
    when open_bags > 0 and in_sent_delivery = open_bags and p >= q then 'sent'
    when open_bags > 0 and open_not_ready = 0 and p >= q then 'ready'
    when p > 0 or open_bags > 0 then 'preparing'
    when o.status in ('preparing', 'ready', 'sent', 'delivered') then 'processing'
    else o.status end;

  if target is distinct from o.status then
    perform set_config('app.bag_sync', 'on', true);
    update public.orders set status = target where id = p_order;
    perform set_config('app.bag_sync', 'off', true);
  end if;
end;
$$;
revoke all on function public.sync_order_from_bags(uuid) from public, anon, authenticated;

-- הקצאה לא יורדת מתחת למה שכבר ארוז
create or replace function public.set_allocation(p_iy uuid, p_book uuid, p_qty integer)
returns void language plpgsql security definer set search_path = '' as $$
declare
  on_hand integer;
  others integer;
  old_qty integer;
  packed integer;
begin
  perform public.require_permission('inventory_allocate');
  if p_qty is null or p_qty < 0 then raise exception 'כמות לא תקינה'; end if;
  if exists (select 1 from public.institution_years iy join public.academic_years y on y.id = iy.year_id
             where iy.id = p_iy and y.status = 'closed') then
    raise exception 'שנת הלימודים סגורה';
  end if;
  packed := public.packed_open(p_iy, p_book);
  if p_qty < packed then
    raise exception 'כבר נארזו % עותקים בשקיות למוסד הזה – אי אפשר להקצות פחות', packed;
  end if;
  on_hand := public.book_on_hand(p_book);
  select coalesce(sum(qty), 0) into others from public.stock_allocations where book_id = p_book and institution_year_id <> p_iy;
  if others + p_qty > on_hand then
    raise exception 'אין מספיק מלאי: במלאי %, מוקצה למוסדות אחרים % – אפשר להקצות כאן עד %', on_hand, others, greatest(on_hand - others, 0);
  end if;
  select qty into old_qty from public.stock_allocations where institution_year_id = p_iy and book_id = p_book;
  if p_qty = 0 then
    delete from public.stock_allocations where institution_year_id = p_iy and book_id = p_book;
  else
    insert into public.stock_allocations (institution_year_id, book_id, qty, updated_by_name)
    values (p_iy, p_book, p_qty, public.my_full_name())
    on conflict (institution_year_id, book_id)
    do update set qty = excluded.qty, updated_at = now(), updated_by_name = excluded.updated_by_name;
  end if;
  if coalesce(old_qty, 0) <> p_qty then
    insert into public.audit_logs (action, entity, entity_id, description)
    values ('allocate', 'stock_allocations', p_book::text,
            format('הקצאת "%s" למוסד "%s": %s ← %s', (select name from public.books where id = p_book),
                   (select i.name from public.institution_years iy join public.institutions i on i.id = iy.institution_id where iy.id = p_iy),
                   coalesce(old_qty, 0), p_qty));
  end if;
end;
$$;

-- =====================================================================
-- פעולות שקית
-- =====================================================================

-- אריזה: יוצר שקית חדשה (p_bag ריק) או מעדכן שקית קיימת. p_lines: [{"order_item_id": "...", "qty": 2}]
create or replace function public.save_bag(p_order uuid, p_lines jsonb, p_bag uuid default null, p_notes text default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  o public.orders%rowtype;
  bg public.bags%rowtype;
  ln jsonb;
  it public.order_items%rowtype;
  q integer;
  other_bags integer;
  alloc integer;
  open_other integer;
  bname text;
  summary text := '';
  n integer := 0;
  missing integer;
begin
  perform public.require_permission('picking_do');
  select * into o from public.orders where id = p_order;
  if o.id is null then raise exception 'ההזמנה לא נמצאה'; end if;
  if o.status in ('cancelled', 'delivered') then
    raise exception 'אי אפשר לארוז הזמנה במצב "%"', public.order_status_label(o.status);
  end if;

  if p_bag is null then
    insert into public.bags (order_id, bag_no, code, created_by_name, notes)
    select p_order, coalesce(max(bag_no), 0) + 1, o.number || '-' || (coalesce(max(bag_no), 0) + 1), public.my_full_name(),
           nullif(trim(coalesce(p_notes, '')), '')
    from public.bags where order_id = p_order
    returning * into bg;
  else
    select * into bg from public.bags where id = p_bag and order_id = p_order;
    if bg.id is null then raise exception 'השקית לא נמצאה'; end if;
    if bg.status in ('delivered', 'cancelled') then raise exception 'אי אפשר לשנות שקית שנמסרה או בוטלה'; end if;
    delete from public.bag_items where bag_id = bg.id;
    update public.bags set notes = coalesce(nullif(trim(coalesce(p_notes, '')), ''), notes) where id = bg.id;
  end if;

  for ln in select * from jsonb_array_elements(coalesce(p_lines, '[]'::jsonb)) loop
    q := coalesce((ln->>'qty')::integer, 0);
    if q <= 0 then continue; end if;
    select * into it from public.order_items where id = (ln->>'order_item_id')::uuid and order_id = p_order;
    if it.id is null or it.status <> 'active' then raise exception 'פריט לא שייך להזמנה או שבוטל'; end if;
    select name into bname from public.books where id = it.book_id;
    other_bags := public.item_packed(it.id);
    if other_bags + q > it.qty then
      raise exception '"%": בהזמנה % עותקים, וכבר ארוזים % בשקיות אחרות', bname, it.qty, other_bags;
    end if;
    select coalesce(sum(qty), 0) into alloc from public.stock_allocations
      where institution_year_id = o.institution_year_id and book_id = it.book_id;
    open_other := public.packed_open(o.institution_year_id, it.book_id, bg.id);
    if open_other + q > alloc then
      raise exception '"%": הוקצו למוסד % עותקים וכבר ארוזים % – אפשר לארוז עוד % (יש להקצות מלאי במסך מלאי וחוסרים)',
        bname, alloc, open_other, greatest(alloc - open_other, 0);
    end if;
    insert into public.bag_items (bag_id, order_item_id, qty) values (bg.id, it.id, q);
    summary := summary || case when summary = '' then '' else ', ' end || bname || ' × ' || q;
    n := n + q;
  end loop;
  if n = 0 then raise exception 'לא נבחרו ספרים לשקית'; end if;

  select coalesce(sum(greatest(oi.qty - public.item_packed(oi.id), 0)), 0) into missing
  from public.order_items oi where oi.order_id = p_order and oi.status = 'active';

  update public.bags
     set status = 'picked', picked_at = now(), picked_by_name = public.my_full_name(),
         checked_at = null, checked_by_name = null, ready_at = null, ready_by_name = null,
         is_partial = missing > 0
   where id = bg.id;

  insert into public.order_events (order_id, user_name, event, description)
  values (p_order, public.my_full_name(), 'bag',
          format('שקית %s נארזה: %s%s', bg.bag_no, summary, case when missing > 0 then format(' (חסרים עוד %s עותקים)', missing) else '' end));
  perform public.sync_order_from_bags(p_order);
  return bg.id;
end;
$$;

-- שינוי מצב שקית: picking (פתיחה לאריזה מחדש) / checked / ready / delivered / cancelled
create or replace function public.set_bag_status(p_bag uuid, p_status text, p_received_by text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare
  bg public.bags%rowtype;
  o public.orders%rowtype;
  r record;
  who text := public.my_full_name();
  label text;
begin
  select * into bg from public.bags where id = p_bag;
  if bg.id is null then raise exception 'השקית לא נמצאה'; end if;
  select * into o from public.orders where id = bg.order_id;
  if bg.status in ('delivered', 'cancelled') then
    raise exception 'השקית כבר % – אין שינויים', case bg.status when 'delivered' then 'נמסרה' else 'בוטלה' end;
  end if;

  if p_status = 'checked' then
    perform public.require_permission('bags_check');
    if bg.status not in ('picked', 'ready') then raise exception 'יש לסיים את הליקוט לפני הבדיקה'; end if;
    update public.bags set status = 'checked', checked_at = now(), checked_by_name = who where id = p_bag;
    label := 'נבדקה';
  elsif p_status = 'ready' then
    perform public.require_permission('bags_check');
    if bg.status not in ('picked', 'checked') then raise exception 'יש לסיים את הליקוט לפני שהשקית מוכנה'; end if;
    update public.bags set status = 'ready', ready_at = now(), ready_by_name = who,
           checked_at = coalesce(checked_at, now()), checked_by_name = coalesce(checked_by_name, who)
     where id = p_bag;
    label := 'מוכנה למסירה';
  elsif p_status = 'picking' then
    perform public.require_permission('picking_do');
    update public.bags set status = 'picking', checked_at = null, checked_by_name = null, ready_at = null, ready_by_name = null
     where id = p_bag;
    label := 'נפתחה לאריזה מחדש';
  elsif p_status = 'cancelled' then
    perform public.require_permission('picking_do');
    update public.bags set status = 'cancelled', delivery_id = null where id = p_bag;
    label := 'פורקה (הספרים חזרו למדף)';
  elsif p_status = 'delivered' then
    perform public.require_permission('pickups_do');
    if bg.status = 'picking' then raise exception 'השקית עדיין בליקוט'; end if;
    if nullif(trim(coalesce(p_received_by, '')), '') is null then raise exception 'יש לרשום מי אסף את השקית'; end if;
    -- הספרים יוצאים מהמלאי ומההקצאה של המוסד
    for r in
      select oi.book_id, sum(bi.qty)::integer q
      from public.bag_items bi join public.order_items oi on oi.id = bi.order_item_id
      where bi.bag_id = p_bag group by oi.book_id
    loop
      insert into public.stock_movements (book_id, qty, kind, institution_year_id, order_id, reason, created_by_name)
      values (r.book_id, -r.q, 'delivered', o.institution_year_id, o.id, format('מסירת שקית %s', bg.code), who);
      update public.stock_allocations set qty = qty - r.q, updated_at = now(), updated_by_name = who
       where institution_year_id = o.institution_year_id and book_id = r.book_id;
      delete from public.stock_allocations where institution_year_id = o.institution_year_id and book_id = r.book_id and qty <= 0;
    end loop;
    update public.bags set status = 'delivered', delivered_at = now(), delivered_by_name = who,
           received_by = trim(p_received_by)
     where id = p_bag;
    label := 'נמסרה ל' || trim(p_received_by);
  else
    raise exception 'מצב לא מוכר';
  end if;

  insert into public.order_events (order_id, user_name, event, description)
  values (bg.order_id, who, 'bag', format('שקית %s %s', bg.bag_no, label));
  perform public.sync_order_from_bags(bg.order_id);
end;
$$;

create or replace function public.mark_labels_printed(p_bags uuid[])
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform public.require_any_permission(array['labels_print', 'picking_do']);
  update public.bags set label_printed_at = now() where id = any (p_bags);
end;
$$;

-- ---------- משלוח למוסד ----------
create or replace function public.save_delivery(
  p_iy uuid, p_delivery uuid default null, p_date date default null, p_carrier text default null,
  p_cost numeric default null, p_paid_by text default null, p_boxes integer default null, p_notes text default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare did uuid := p_delivery;
begin
  perform public.require_permission('shipments_manage');
  if did is null then
    insert into public.institution_deliveries (institution_year_id, delivery_date, carrier, cost, paid_by, boxes_count, notes, created_by_name)
    values (p_iy, p_date, nullif(trim(coalesce(p_carrier, '')), ''), p_cost, nullif(trim(coalesce(p_paid_by, '')), ''), p_boxes,
            nullif(trim(coalesce(p_notes, '')), ''), public.my_full_name())
    returning id into did;
  else
    update public.institution_deliveries
       set delivery_date = p_date, carrier = nullif(trim(coalesce(p_carrier, '')), ''), cost = p_cost,
           paid_by = nullif(trim(coalesce(p_paid_by, '')), ''), boxes_count = p_boxes, notes = nullif(trim(coalesce(p_notes, '')), '')
     where id = did and status <> 'cancelled';
  end if;
  return did;
end;
$$;

-- שיוך / הסרה של שקיות למשלוח
create or replace function public.assign_bags_to_delivery(p_delivery uuid, p_bags uuid[], p_remove boolean default false)
returns integer language plpgsql security definer set search_path = '' as $$
declare
  dl public.institution_deliveries%rowtype;
  n integer;
  oid uuid;
begin
  perform public.require_permission('shipments_manage');
  select * into dl from public.institution_deliveries where id = p_delivery;
  if dl.id is null then raise exception 'המשלוח לא נמצא'; end if;
  if dl.status in ('delivered', 'cancelled') then raise exception 'המשלוח כבר נמסר או בוטל'; end if;
  if p_remove then
    update public.bags set delivery_id = null where id = any (p_bags) and delivery_id = p_delivery and status <> 'delivered';
  else
    if exists (select 1 from public.bags b join public.orders o on o.id = b.order_id
               where b.id = any (p_bags) and o.institution_year_id <> dl.institution_year_id) then
      raise exception 'אפשר לשייך רק שקיות של המוסד הזה';
    end if;
    update public.bags set delivery_id = p_delivery
     where id = any (p_bags) and status in ('picked', 'checked', 'ready');
  end if;
  get diagnostics n = row_count;
  for oid in select distinct order_id from public.bags where id = any (p_bags) loop
    perform public.sync_order_from_bags(oid);
  end loop;
  return n;
end;
$$;

create or replace function public.set_delivery_status(p_delivery uuid, p_status text, p_receiver text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare
  dl public.institution_deliveries%rowtype;
  oid uuid;
begin
  perform public.require_permission('shipments_manage');
  select * into dl from public.institution_deliveries where id = p_delivery;
  if dl.id is null then raise exception 'המשלוח לא נמצא'; end if;
  if p_status = 'sent' then
    if dl.status <> 'planned' then raise exception 'רק משלוח בתכנון יוצא לדרך'; end if;
    if not exists (select 1 from public.bags where delivery_id = p_delivery) then raise exception 'אין שקיות במשלוח'; end if;
    update public.institution_deliveries set status = 'sent', delivery_date = coalesce(delivery_date, public.israel_today()) where id = p_delivery;
  elsif p_status = 'delivered' then
    if dl.status not in ('planned', 'sent') then raise exception 'המשלוח כבר נסגר'; end if;
    if nullif(trim(coalesce(p_receiver, '')), '') is null then raise exception 'יש לרשום את שם מקבל הסחורה במוסד'; end if;
    update public.institution_deliveries set status = 'delivered', receiver_name = trim(p_receiver), delivered_at = now(),
           delivery_date = coalesce(delivery_date, public.israel_today())
     where id = p_delivery;
  elsif p_status = 'cancelled' then
    if dl.status <> 'planned' then raise exception 'אפשר לבטל רק משלוח שעוד לא יצא'; end if;
    update public.bags set delivery_id = null where delivery_id = p_delivery and status <> 'delivered';
    update public.institution_deliveries set status = 'cancelled' where id = p_delivery;
  elsif p_status = 'planned' then
    if dl.status <> 'sent' then raise exception 'אפשר להחזיר לתכנון רק משלוח שיצא'; end if;
    update public.institution_deliveries set status = 'planned' where id = p_delivery;
  else
    raise exception 'מצב לא מוכר';
  end if;
  insert into public.audit_logs (action, entity, entity_id, description)
  values ('update', 'institution_deliveries', p_delivery::text,
          format('משלוח %s למוסד "%s": %s%s', dl.number,
                 (select i.name from public.institution_years iy join public.institutions i on i.id = iy.institution_id where iy.id = dl.institution_year_id),
                 case p_status when 'sent' then 'יצא לדרך' when 'delivered' then 'נמסר' when 'cancelled' then 'בוטל' else 'חזר לתכנון' end,
                 coalesce(' – התקבל ע״י ' || nullif(trim(coalesce(p_receiver, '')), ''), '')));
  for oid in select distinct order_id from public.bags where delivery_id = p_delivery loop
    perform public.sync_order_from_bags(oid);
  end loop;
end;
$$;

-- =====================================================================
-- נתונים למסכי המחסן (בלי צורך בהרשאה להזמנות/לקוחות)
-- =====================================================================

-- תור אריזה לשנה: כל הזמנה פעילה עם כמויות (נדרש / ארוז / נמסר)
create or replace function public.packing_queue(p_year uuid)
returns table (
  order_id uuid, order_number integer, order_status text, delivery_method text,
  student_name text, customer_name text, institution_year_id uuid, inst_name text, class_name text,
  qty_total integer, qty_packed integer, qty_delivered integer, bags_open integer, bags_ready integer, balance numeric)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.require_any_permission(array['picking_do', 'bags_check', 'pickups_do', 'labels_print', 'shipments_manage', 'shipments_view']);
  return query
  select o.id, o.number, o.status, o.delivery_method, o.student_name,
         c.last_name || ' ' || c.first_name, o.institution_year_id, i.name, cl.name,
         coalesce((select sum(oi.qty) from public.order_items oi where oi.order_id = o.id and oi.status = 'active'), 0)::integer,
         coalesce((select sum(bi.qty) from public.bag_items bi join public.bags b on b.id = bi.bag_id
                   where b.order_id = o.id and b.status <> 'cancelled'), 0)::integer,
         coalesce((select sum(bi.qty) from public.bag_items bi join public.bags b on b.id = bi.bag_id
                   where b.order_id = o.id and b.status = 'delivered'), 0)::integer,
         (select count(*) from public.bags b where b.order_id = o.id and b.status in ('picking', 'picked', 'checked'))::integer,
         (select count(*) from public.bags b where b.order_id = o.id and b.status = 'ready')::integer,
         o.balance
  from public.orders o
  join public.customers c on c.id = o.customer_id
  join public.classes cl on cl.id = o.class_id
  join public.institution_years iy on iy.id = o.institution_year_id
  join public.institutions i on i.id = iy.institution_id
  where o.year_id = p_year and o.status <> 'cancelled';
end;
$$;

-- זמינות לאריזה לכל מוסד+ספר בשנה: הוקצה − ארוז-ולא-נמסר
create or replace function public.pack_availability(p_year uuid)
returns table (institution_year_id uuid, book_id uuid, allocated integer, packed_open integer)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.require_any_permission(array['picking_do', 'bags_check', 'inventory_view']);
  return query
  select sa.institution_year_id, sa.book_id, sa.qty,
         public.packed_open(sa.institution_year_id, sa.book_id)
  from public.stock_allocations sa join public.institution_years iy on iy.id = sa.institution_year_id
  where iy.year_id = p_year;
end;
$$;

-- כל מה שצריך למסך אריזה של הזמנה / מסך שקית (json)
create or replace function public.order_pack_details(p_order uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare res jsonb;
begin
  perform public.require_any_permission(array['picking_do', 'bags_check', 'pickups_do', 'labels_print', 'shipments_manage', 'shipments_view']);
  select jsonb_build_object(
    'order', jsonb_build_object(
      'id', o.id, 'number', o.number, 'status', o.status, 'delivery_method', o.delivery_method,
      'student_name', o.student_name, 'customer_name', c.last_name || ' ' || c.first_name,
      'customer_phone', c.phone, 'institution_year_id', o.institution_year_id, 'inst_name', i.name, 'class_name', cl.name,
      'total', o.total, 'paid_amount', o.paid_amount, 'balance', o.balance, 'notes', o.notes, 'year_name', y.name,
      'sale_day_date', iy.sale_day_date),
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', oi.id, 'book_id', oi.book_id, 'book_name', b.name, 'book_code', b.code, 'qty', oi.qty,
        'packed', public.item_packed(oi.id),
        'delivered', coalesce((select sum(bi.qty) from public.bag_items bi join public.bags bg on bg.id = bi.bag_id
                               where bi.order_item_id = oi.id and bg.status = 'delivered'), 0),
        'allocated', coalesce((select sa.qty from public.stock_allocations sa
                               where sa.institution_year_id = o.institution_year_id and sa.book_id = oi.book_id), 0),
        'packed_open', public.packed_open(o.institution_year_id, oi.book_id))
        order by b.name)
      from public.order_items oi join public.books b on b.id = oi.book_id
      where oi.order_id = o.id and oi.status = 'active'), '[]'::jsonb),
    'bags', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', bg.id, 'bag_no', bg.bag_no, 'code', bg.code, 'status', bg.status, 'is_partial', bg.is_partial,
        'delivery_id', bg.delivery_id, 'notes', bg.notes, 'picked_by_name', bg.picked_by_name, 'checked_by_name', bg.checked_by_name,
        'delivered_at', bg.delivered_at, 'received_by', bg.received_by, 'delivered_by_name', bg.delivered_by_name,
        'label_printed_at', bg.label_printed_at,
        'items', coalesce((select jsonb_agg(jsonb_build_object('order_item_id', bi.order_item_id, 'qty', bi.qty))
                           from public.bag_items bi where bi.bag_id = bg.id), '[]'::jsonb))
        order by bg.bag_no)
      from public.bags bg where bg.order_id = o.id), '[]'::jsonb))
  into res
  from public.orders o
  join public.customers c on c.id = o.customer_id
  join public.classes cl on cl.id = o.class_id
  join public.institution_years iy on iy.id = o.institution_year_id
  join public.institutions i on i.id = iy.institution_id
  join public.academic_years y on y.id = o.year_id
  where o.id = p_order;
  return res;
end;
$$;

-- נתונים למדבקות
create or replace function public.bag_labels(p_bags uuid[])
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.require_any_permission(array['labels_print', 'picking_do']);
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', bg.id, 'code', bg.code, 'bag_no', bg.bag_no,
      'bag_count', (select count(*) from public.bags x where x.order_id = o.id and x.status <> 'cancelled'),
      'is_partial', bg.is_partial, 'order_number', o.number, 'student_name', o.student_name,
      'customer_name', c.last_name || ' ' || c.first_name, 'inst_name', i.name, 'class_name', cl.name,
      'delivery_method', o.delivery_method, 'balance', o.balance, 'total', o.total,
      'items', (select jsonb_agg(jsonb_build_object('name', b.name, 'code', b.code, 'qty', bi.qty) order by b.name)
                from public.bag_items bi join public.order_items oi on oi.id = bi.order_item_id
                join public.books b on b.id = oi.book_id where bi.bag_id = bg.id))
      order by i.name, cl.name, o.student_name, bg.bag_no)
    from public.bags bg
    join public.orders o on o.id = bg.order_id
    join public.customers c on c.id = o.customer_id
    join public.classes cl on cl.id = o.class_id
    join public.institution_years iy on iy.id = o.institution_year_id
    join public.institutions i on i.id = iy.institution_id
    where bg.id = any (p_bags)), '[]'::jsonb);
end;
$$;

-- חיפוש למסירה: מס' הזמנה / קוד שקית / שם / טלפון / תלמיד
create or replace function public.find_orders_for_pickup(p_year uuid, p_query text)
returns table (order_id uuid, order_number integer, order_status text, student_name text, customer_name text,
               customer_phone text, inst_name text, class_name text, balance numeric, bags_ready integer, bags_open integer, bags_delivered integer)
language plpgsql stable security definer set search_path = '' as $$
declare
  q text := trim(coalesce(p_query, ''));
  d text := regexp_replace(q, '\D', '', 'g');
begin
  perform public.require_any_permission(array['pickups_do', 'shipments_view', 'shipments_manage']);
  if length(q) < 2 then return; end if;
  return query
  select o.id, o.number, o.status, o.student_name, c.last_name || ' ' || c.first_name, c.phone, i.name, cl.name, o.balance,
         (select count(*) from public.bags b where b.order_id = o.id and b.status = 'ready')::integer,
         (select count(*) from public.bags b where b.order_id = o.id and b.status in ('picking', 'picked', 'checked'))::integer,
         (select count(*) from public.bags b where b.order_id = o.id and b.status = 'delivered')::integer
  from public.orders o
  join public.customers c on c.id = o.customer_id
  join public.classes cl on cl.id = o.class_id
  join public.institution_years iy on iy.id = o.institution_year_id
  join public.institutions i on i.id = iy.institution_id
  where o.year_id = p_year and o.status <> 'cancelled'
    and (
      o.number::text = q
      or exists (select 1 from public.bags b where b.order_id = o.id and b.code = q)
      or (length(d) >= 3 and c.phone_digits like '%' || d || '%')
      or (c.first_name || ' ' || c.last_name) ilike '%' || q || '%'
      or (c.last_name || ' ' || c.first_name) ilike '%' || q || '%'
      or o.student_name ilike '%' || q || '%')
  order by o.number desc
  limit 50;
end;
$$;

-- דוח אספקה למוסד (סעיף 15): לכל ספר – נדרש / סופק עד המשלוח הזה (כולל) / חסר
create or replace function public.delivery_report(p_delivery uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare res jsonb;
begin
  perform public.require_any_permission(array['shipments_view', 'shipments_manage']);
  select jsonb_build_object(
    'delivery', jsonb_build_object('id', dl.id, 'number', dl.number, 'status', dl.status, 'delivery_date', dl.delivery_date,
      'carrier', dl.carrier, 'boxes_count', dl.boxes_count, 'receiver_name', dl.receiver_name, 'notes', dl.notes,
      'bags_count', (select count(*) from public.bags b where b.delivery_id = dl.id)),
    'institution', jsonb_build_object('name', i.name, 'number', i.number, 'address', i.address, 'city', i.city,
      'contact_name', i.contact_name, 'phone', i.phone, 'year_name', y.name),
    'rows', coalesce((
      select jsonb_agg(x order by x->>'book_name') from (
        select jsonb_build_object(
          'book_name', b.name, 'book_code', b.code,
          'supplier_name', (select s.name from public.class_books cb join public.suppliers s on s.id = cb.supplier_id
                            where cb.id = min(oi.class_book_id::text)::uuid),
          'required', sum(oi.qty),
          'supplied', coalesce((select sum(bi.qty) from public.bag_items bi join public.bags bg on bg.id = bi.bag_id
                                join public.order_items oi2 on oi2.id = bi.order_item_id join public.orders o2 on o2.id = oi2.order_id
                                left join public.institution_deliveries d2 on d2.id = bg.delivery_id
                                where o2.institution_year_id = dl.institution_year_id and oi2.book_id = oi.book_id
                                  and bg.status <> 'cancelled'
                                  and (bg.status = 'delivered' or (d2.id is not null and d2.status <> 'cancelled' and d2.number <= dl.number))), 0)) x
        from public.order_items oi join public.orders o on o.id = oi.order_id join public.books b on b.id = oi.book_id
        where o.institution_year_id = dl.institution_year_id and o.status <> 'cancelled' and oi.status = 'active'
        group by oi.book_id, b.name, b.code) t), '[]'::jsonb))
  into res
  from public.institution_deliveries dl
  join public.institution_years iy on iy.id = dl.institution_year_id
  join public.institutions i on i.id = iy.institution_id
  join public.academic_years y on y.id = iy.year_id
  where dl.id = p_delivery;
  return res;
end;
$$;

-- ---------- הרשאות לפונקציות ----------
revoke all on function public.save_bag(uuid, jsonb, uuid, text) from public, anon;
revoke all on function public.set_bag_status(uuid, text, text) from public, anon;
revoke all on function public.mark_labels_printed(uuid[]) from public, anon;
revoke all on function public.save_delivery(uuid, uuid, date, text, numeric, text, integer, text) from public, anon;
revoke all on function public.assign_bags_to_delivery(uuid, uuid[], boolean) from public, anon;
revoke all on function public.set_delivery_status(uuid, text, text) from public, anon;
revoke all on function public.packing_queue(uuid) from public, anon;
revoke all on function public.pack_availability(uuid) from public, anon;
revoke all on function public.order_pack_details(uuid) from public, anon;
revoke all on function public.bag_labels(uuid[]) from public, anon;
revoke all on function public.find_orders_for_pickup(uuid, text) from public, anon;
revoke all on function public.delivery_report(uuid) from public, anon;
grant execute on function public.save_bag(uuid, jsonb, uuid, text) to authenticated;
grant execute on function public.set_bag_status(uuid, text, text) to authenticated;
grant execute on function public.mark_labels_printed(uuid[]) to authenticated;
grant execute on function public.save_delivery(uuid, uuid, date, text, numeric, text, integer, text) to authenticated;
grant execute on function public.assign_bags_to_delivery(uuid, uuid[], boolean) to authenticated;
grant execute on function public.set_delivery_status(uuid, text, text) to authenticated;
grant execute on function public.packing_queue(uuid) to authenticated;
grant execute on function public.pack_availability(uuid) to authenticated;
grant execute on function public.order_pack_details(uuid) to authenticated;
grant execute on function public.bag_labels(uuid[]) to authenticated;
grant execute on function public.find_orders_for_pickup(uuid, text) to authenticated;
grant execute on function public.delivery_report(uuid) to authenticated;


-- הטבלאות החדשות (bags, bag_items, institution_deliveries) – בלי גישה ל-anon (RLS כבר חוסם, זו שכבה נוספת)
revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
