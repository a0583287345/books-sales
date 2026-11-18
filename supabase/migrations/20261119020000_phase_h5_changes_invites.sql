-- =====================================================================
-- ח5 – קישור אישי, בקשות שינוי באישור משרד, "הזמנה להזמין" (docs/SPEC_EMAIL.md 5.5–5.6)
--   order_links.kind 'personal'        – קישור אישי ללקוח במכירה של מוסד (customer_id)
--   online_change_requests              – בקשות שינוי מקישור הצפייה (רק דרך פונקציות)
--   public_order_view(code)             – צפייה בהזמנה + אפשרויות שינוי (anon)
--   request_order_change(...)           – בקשת שינוי / ביטול (anon, עד נעילת ההזמנה)
--   decide_change_request(id, ok, why)  – אישור/דחייה במשרד (online_changes_approve; השינוי עצמו דרך הטריגרים הרגילים)
--   public_personal_form(code)          – טופס ממולא בקישור אישי (anon)
--   submit_personal_order(...)          – הזמנה מקישור אישי (anon)
--   public_unsubscribe(code)            – הסרה מרשימת התפוצה מקישור אישי (anon)
--   invite_candidates(...) / invite_links(...) – קהל ל"הזמנה להזמין" וקישורים אישיים (emails_send)
-- רק יצירה של דברים חדשים.
-- =====================================================================

-- ---------- קישור אישי ----------
alter table public.order_links drop constraint order_links_kind_check;
alter table public.order_links drop constraint order_links_check;
alter table public.order_links add column customer_id uuid references public.customers(id) on delete cascade;
alter table public.order_links add constraint order_links_kind_check check (kind in ('institution', 'class', 'order', 'personal'));
alter table public.order_links add constraint order_links_shape_check check (
     (kind = 'institution' and class_id is null and order_id is null and customer_id is null)
  or (kind = 'class' and class_id is not null and order_id is null and customer_id is null)
  or (kind = 'order' and order_id is not null and customer_id is null)
  or (kind = 'personal' and customer_id is not null and order_id is null and class_id is null));
create unique index order_links_personal_uq on public.order_links (institution_year_id, customer_id) where kind = 'personal';
create index order_links_customer_idx on public.order_links (customer_id) where customer_id is not null;

-- ---------- בקשות שינוי ----------
create table public.online_change_requests (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'replaced')),
  add_books uuid[] not null default '{}',
  remove_books uuid[] not null default '{}',
  delivery_method text check (delivery_method in ('pickup', 'institution_day')),
  cancel_order boolean not null default false,
  note text,
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  decided_by uuid,
  decided_by_name text,
  decision_reason text,
  received_emailed boolean not null default false,
  decision_emailed boolean not null default false,
  updated_at timestamptz not null default now()
);
create index online_change_requests_order_idx on public.online_change_requests (order_id);
create index online_change_requests_pending_idx on public.online_change_requests (created_at) where status = 'pending';

create trigger online_change_requests_updated_at before update on public.online_change_requests
  for each row execute function public.set_updated_at();
create trigger online_change_requests_audit after insert or update or delete on public.online_change_requests
  for each row execute function public.audit_row('בקשת שינוי מהקישור');

alter table public.online_change_requests enable row level security;
create policy online_change_requests_select on public.online_change_requests for select to authenticated
  using ((select public.has_permission('orders_view')) or (select public.has_permission('online_changes_approve')));
-- כתיבה רק דרך הפונקציות

-- ---------- רשימת הכיתות והספרים לטופס הציבורי (משותף) ----------
create function public._public_classes(p_iy uuid, p_only_class uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', c.id, 'name', c.name,
      'books', coalesce((
        select jsonb_agg(jsonb_build_object(
          'book_id', cb.book_id, 'name', b.name, 'qty', cb.qty_per_student, 'price', cb.sale_price,
          'required', cb.is_required,
          'closed', coalesce(cb.order_deadline, iy.order_deadline) is not null
                    and public.israel_today() > coalesce(cb.order_deadline, iy.order_deadline))
          order by cb.sort_order, b.name)
        from public.class_books cb join public.books b on b.id = cb.book_id
        where cb.class_id = c.id), '[]'::jsonb))
      || public._class_texts(c.id)
      order by c.sort_order, c.name), '[]'::jsonb)
  from public.classes c join public.institution_years iy on iy.id = c.institution_year_id
  where c.institution_year_id = p_iy
    and (p_only_class is null or c.id = p_only_class)
    and exists (select 1 from public.class_books cb where cb.class_id = c.id)
    and not exists (select 1 from public.order_links cl where cl.kind = 'class' and cl.class_id = c.id and not cl.is_active);
$$;
revoke all on function public._public_classes(uuid, uuid) from public, anon, authenticated;

-- קישור צפייה להזמנה (נוצר אם אין – גם להזמנה שנרשמה במשרד)
create function public._order_view_code(p_order uuid)
returns text language plpgsql volatile security definer set search_path = '' as $$
declare v text;
begin
  select code into v from public.order_links where kind = 'order' and order_id = p_order;
  if v is null then
    v := public.random_link_code();
    insert into public.order_links (code, kind, institution_year_id, class_id, order_id)
    select v, 'order', o.institution_year_id, o.class_id, o.id from public.orders o where o.id = p_order;
  end if;
  return v;
end;
$$;
revoke all on function public._order_view_code(uuid) from public, anon, authenticated;

-- הגבלת קצב כללית לפי IP (kind: 'change' / 'personal' / 'unsub')
create function public._online_rate_ok(p_kind text, p_per_hour integer)
returns boolean language plpgsql volatile security definer set search_path = '' as $$
declare v_ip text := public.request_ip();
begin
  if v_ip is not null and (select count(*) from public.online_attempts a
                           where a.ip = v_ip and a.kind = p_kind and a.created_at > now() - interval '1 hour') >= p_per_hour then
    return false;
  end if;
  insert into public.online_attempts (ip, kind, ok) values (v_ip, p_kind, true);
  return true;
end;
$$;
revoke all on function public._online_rate_ok(text, integer) from public, anon, authenticated;

-- ---------- צפייה בהזמנה + אפשרויות שינוי ----------
create function public.public_order_view(p_code text)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  l public.order_links;
  o public.orders;
  iy public.institution_years;
  st text;
  pend public.online_change_requests;
  last_dec public.online_change_requests;
  names jsonb;
begin
  select * into l from public.order_links where code = trim(coalesce(p_code, '')) and kind = 'order';
  if l.id is null then return jsonb_build_object('state', 'not_found'); end if;
  if not l.is_active then return jsonb_build_object('state', 'inactive'); end if;
  select * into o from public.orders where id = l.order_id;
  select * into iy from public.institution_years where id = o.institution_year_id;
  st := public._online_link_state(l);   -- ok = לפני נעילת ההזמנה

  select * into pend from public.online_change_requests where order_id = o.id and status = 'pending' order by created_at desc limit 1;
  select * into last_dec from public.online_change_requests where order_id = o.id and status in ('approved', 'rejected')
    order by decided_at desc limit 1;
  select coalesce(jsonb_object_agg(b.id, b.name), '{}'::jsonb) into names
  from public.books b
  where b.id = any(coalesce(pend.add_books, '{}') || coalesce(pend.remove_books, '{}'));

  return jsonb_build_object(
    'state', 'ok',
    'contact', (select nullif(trim(public_contact), '') from public.email_settings where id = 1),
    'institution', (select name from public.institutions where id = iy.institution_id),
    'year', (select name from public.academic_years where id = iy.year_id),
    'deadline', iy.order_deadline,
    'sale_day_date', iy.sale_day_date,
    'can_change', st = 'ok' and o.status not in ('cancelled', 'delivered'),
    'order', jsonb_build_object(
      'number', o.number, 'status', o.status, 'student_name', o.student_name,
      'class_name', (select name from public.classes where id = o.class_id),
      'created_at', o.created_at, 'delivery_method', o.delivery_method,
      'total', o.total, 'paid_amount', o.paid_amount, 'balance', o.balance,
      'books', coalesce((select jsonb_agg(jsonb_build_object('book_id', oi.book_id, 'name', b.name, 'qty', oi.qty, 'price', oi.unit_price)
                                         order by oi.created_at, b.name)
                         from public.order_items oi join public.books b on b.id = oi.book_id
                         where oi.order_id = o.id and oi.status = 'active'), '[]'::jsonb),
      'sale_day_date', iy.sale_day_date) || public._class_texts(o.class_id),
    'class_books', coalesce((public._public_classes(o.institution_year_id, o.class_id))->0->'books', '[]'::jsonb),
    'pending', case when pend.id is null then null else jsonb_build_object(
      'created_at', pend.created_at, 'cancel_order', pend.cancel_order, 'delivery_method', pend.delivery_method, 'note', pend.note,
      'add', (select coalesce(jsonb_agg(names->>(x::text)), '[]'::jsonb) from unnest(pend.add_books) x),
      'remove', (select coalesce(jsonb_agg(names->>(x::text)), '[]'::jsonb) from unnest(pend.remove_books) x)) end,
    'last_decision', case when last_dec.id is null then null else jsonb_build_object(
      'status', last_dec.status, 'decided_at', last_dec.decided_at, 'reason', last_dec.decision_reason) end);
end;
$$;
revoke all on function public.public_order_view(text) from public;
grant execute on function public.public_order_view(text) to anon, authenticated;

-- ---------- בקשת שינוי (אין שינוי מיידי – רק בקשה) ----------
create function public.request_order_change(
  p_code text, p_add uuid[], p_remove uuid[], p_delivery text, p_cancel boolean, p_note text)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  l public.order_links;
  o public.orders;
  st text;
  v_add uuid[] := coalesce(p_add, '{}');
  v_remove uuid[] := coalesce(p_remove, '{}');
  v_delivery text := nullif(p_delivery, '');
  v_note text := nullif(left(trim(coalesce(p_note, '')), 500), '');
  v_cancel boolean := coalesce(p_cancel, false);
  bad text;
  req uuid;
  descr text;
begin
  select * into l from public.order_links where code = trim(coalesce(p_code, '')) and kind = 'order';
  if l.id is null or not l.is_active then
    return jsonb_build_object('ok', false, 'message', 'הקישור לא נמצא');
  end if;
  if not public._online_rate_ok('change', 10) then
    return jsonb_build_object('ok', false, 'message', 'יותר מדי בקשות. אפשר לנסות שוב בעוד שעה, או להתקשר למשרד.');
  end if;
  select * into o from public.orders where id = l.order_id;
  st := public._online_link_state(l);
  if st <> 'ok' or o.status in ('cancelled', 'delivered') then
    return jsonb_build_object('ok', false, 'message', 'ההזמנה ננעלה – לשינוי יש לפנות למשרד');
  end if;
  if (select count(*) from public.online_change_requests where order_id = o.id and created_at > now() - interval '1 day') >= 10 then
    return jsonb_build_object('ok', false, 'message', 'נשלחו יותר מדי בקשות להזמנה הזו היום – אפשר להתקשר למשרד');
  end if;

  if v_cancel then
    if v_note is null then return jsonb_build_object('ok', false, 'message', 'יש לכתוב את סיבת הביטול'); end if;
    v_add := '{}'; v_remove := '{}'; v_delivery := null;
  else
    v_add := array(select distinct x from unnest(v_add) x);
    v_remove := array(select distinct x from unnest(v_remove) x);
    if cardinality(v_add) > 100 or cardinality(v_remove) > 100 then
      return jsonb_build_object('ok', false, 'message', 'הבקשה לא תקינה');
    end if;
    -- להוסיף: מרשימת הכיתה, לא נעול, ולא כבר בהזמנה
    select b.name into bad from unnest(v_add) x
      left join public.class_books cb on cb.class_id = o.class_id and cb.book_id = x
      left join public.books b on b.id = x
      left join public.institution_years iy on iy.id = o.institution_year_id
    where cb.id is null
       or (coalesce(cb.order_deadline, iy.order_deadline) is not null and public.israel_today() > coalesce(cb.order_deadline, iy.order_deadline))
       or exists (select 1 from public.order_items oi where oi.order_id = o.id and oi.book_id = x and oi.status = 'active')
    limit 1;
    if found then
      return jsonb_build_object('ok', false, 'message', 'אי אפשר להוסיף את "' || coalesce(bad, 'הספר') || '" – יש לרענן את הדף');
    end if;
    -- להוריד: רק ספר שבהזמנה
    if exists (select 1 from unnest(v_remove) x
               where not exists (select 1 from public.order_items oi where oi.order_id = o.id and oi.book_id = x and oi.status = 'active')) then
      return jsonb_build_object('ok', false, 'message', 'אחד הספרים להורדה כבר לא בהזמנה – יש לרענן את הדף');
    end if;
    if v_delivery is not null and (v_delivery = o.delivery_method or v_delivery not in ('pickup', 'institution_day')
       or (v_delivery = 'institution_day' and (select sale_day_date from public.institution_years where id = o.institution_year_id) is null)) then
      v_delivery := null;
    end if;
    if cardinality(v_add) = 0 and cardinality(v_remove) = 0 and v_delivery is null and v_note is null then
      return jsonb_build_object('ok', false, 'message', 'לא סומן שום שינוי');
    end if;
  end if;

  -- בקשה חדשה מחליפה בקשה קודמת שעוד ממתינה
  update public.online_change_requests set status = 'replaced' where order_id = o.id and status = 'pending';
  insert into public.online_change_requests (order_id, add_books, remove_books, delivery_method, cancel_order, note)
  values (o.id, v_add, v_remove, v_delivery, v_cancel, v_note)
  returning id into req;

  descr := case when v_cancel then 'בקשה לבטל את ההזמנה'
    else concat_ws('; ',
      case when cardinality(v_add) > 0 then 'להוסיף: ' || (select string_agg(b.name, ', ') from public.books b where b.id = any(v_add)) end,
      case when cardinality(v_remove) > 0 then 'להוריד: ' || (select string_agg(b.name, ', ') from public.books b where b.id = any(v_remove)) end,
      case when v_delivery is not null then 'מסירה: ' || case v_delivery when 'pickup' then 'איסוף עצמי' else 'יום מכירה במוסד' end end)
    end || coalesce(' – ' || v_note, '');
  insert into public.order_events (order_id, user_name, event, description)
  values (o.id, 'הזמנה בקישור', 'change_request', 'בקשת שינוי מהקישור (ממתינה לאישור): ' || descr);

  return jsonb_build_object('ok', true, 'request_id', req);
end;
$$;
revoke all on function public.request_order_change(text, uuid[], uuid[], text, boolean, text) from public;
grant execute on function public.request_order_change(text, uuid[], uuid[], text, boolean, text) to anon, authenticated;

-- ---------- אישור / דחייה במשרד ----------
-- האישור מבצע את השינויים כמו משתמש רגיל: הטריגרים בודקים הרשאות (עריכה/ביטול), מועדי ביטול, ספרים ארוזים וכו'.
create function public.decide_change_request(p_request uuid, p_approve boolean, p_reason text default null)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  r public.online_change_requests;
  o public.orders;
  x uuid;
  v_reason text := nullif(trim(coalesce(p_reason, '')), '');
begin
  perform public.require_permission('online_changes_approve');
  select * into r from public.online_change_requests where id = p_request for update;
  if r.id is null then raise exception 'הבקשה לא נמצאה'; end if;
  if r.status <> 'pending' then raise exception 'הבקשה כבר טופלה'; end if;
  select * into o from public.orders where id = r.order_id;

  if not p_approve then
    if v_reason is null then raise exception 'יש לכתוב סיבה לדחייה'; end if;
    update public.online_change_requests
       set status = 'rejected', decided_at = now(), decided_by = auth.uid(), decided_by_name = public.my_full_name(),
           decision_reason = v_reason
     where id = r.id;
    insert into public.order_events (order_id, user_name, event, description)
    values (o.id, public.my_full_name(), 'change_request', 'בקשת השינוי מהקישור נדחתה – ' || v_reason);
    return jsonb_build_object('ok', true, 'status', 'rejected');
  end if;

  if r.cancel_order then
    update public.orders set status = 'cancelled', cancel_reason = 'בקשת ההורה בקישור' || coalesce(': ' || r.note, '')
     where id = o.id;
  else
    foreach x in array r.remove_books loop
      update public.order_items set status = 'cancelled', cancel_reason = 'בקשת ההורה בקישור'
       where order_id = o.id and book_id = x and status = 'active';
    end loop;
    foreach x in array r.add_books loop
      if exists (select 1 from public.order_items where order_id = o.id and book_id = x and status = 'active') then
        continue;
      elsif exists (select 1 from public.order_items where order_id = o.id and book_id = x) then
        update public.order_items set status = 'active',
               qty = greatest((select cb.qty_per_student from public.class_books cb where cb.class_id = o.class_id and cb.book_id = x), 1)
         where id = (select id from public.order_items where order_id = o.id and book_id = x order by created_at desc limit 1);
      else
        insert into public.order_items (order_id, book_id, qty)
        values (o.id, x, greatest(coalesce((select cb.qty_per_student from public.class_books cb
                                            where cb.class_id = o.class_id and cb.book_id = x), 1), 1));
      end if;
    end loop;
    if r.delivery_method is not null and r.delivery_method <> o.delivery_method then
      update public.orders set delivery_method = r.delivery_method where id = o.id;
    end if;
  end if;

  update public.online_change_requests
     set status = 'approved', decided_at = now(), decided_by = auth.uid(), decided_by_name = public.my_full_name(),
         decision_reason = v_reason
   where id = r.id;
  insert into public.order_events (order_id, user_name, event, description)
  values (o.id, public.my_full_name(), 'change_request', 'בקשת השינוי מהקישור אושרה' || coalesce(' – ' || v_reason, ''));
  return jsonb_build_object('ok', true, 'status', 'approved');
end;
$$;
revoke all on function public.decide_change_request(uuid, boolean, text) from public, anon;
grant execute on function public.decide_change_request(uuid, boolean, text) to authenticated;

-- נתונים למיילים על בקשת שינוי (השרת בלבד)
create function public.change_request_mail_data(p_request uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'request_id', r.id, 'status', r.status, 'created_at', r.created_at, 'decided_at', r.decided_at,
    'reason', r.decision_reason, 'note', r.note, 'cancel_order', r.cancel_order, 'delivery_method_req', r.delivery_method,
    'received_emailed', r.received_emailed, 'decision_emailed', r.decision_emailed,
    'add', (select coalesce(jsonb_agg(b.name), '[]'::jsonb) from public.books b where b.id = any(r.add_books)),
    'remove', (select coalesce(jsonb_agg(b.name), '[]'::jsonb) from public.books b where b.id = any(r.remove_books)),
    'view_code', (select code from public.order_links l where l.kind = 'order' and l.order_id = o.id),
    'order_id', o.id, 'number', o.number, 'customer_id', o.customer_id, 'student_name', o.student_name,
    'parent_name', c.parent_name, 'email', c.email,
    'inst_name', i.name, 'class_name', cl.name, 'total', o.total, 'paid_amount', o.paid_amount, 'balance', o.balance,
    'delivery_method', o.delivery_method, 'sale_day_date', iy.sale_day_date, 'sale_day_notes', iy.sale_day_notes,
    'books', coalesce((select jsonb_agg(jsonb_build_object('name', b.name, 'qty', oi.qty) order by oi.created_at, b.name)
                       from public.order_items oi join public.books b on b.id = oi.book_id
                       where oi.order_id = o.id and oi.status = 'active'), '[]'::jsonb))
    || public._class_texts(o.class_id)
  from public.online_change_requests r
  join public.orders o on o.id = r.order_id
  join public.customers c on c.id = o.customer_id
  join public.classes cl on cl.id = o.class_id
  join public.institution_years iy on iy.id = o.institution_year_id
  join public.institutions i on i.id = iy.institution_id
  where r.id = p_request;
$$;
revoke all on function public.change_request_mail_data(uuid) from public, anon, authenticated;
grant execute on function public.change_request_mail_data(uuid) to service_role;

-- ---------- קישור אישי ----------
create function public.public_personal_form(p_code text)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  l public.order_links;
  st text;
  iy public.institution_years;
  c public.customers;
  existing uuid;
  base jsonb;
begin
  select * into l from public.order_links where code = trim(coalesce(p_code, '')) and kind = 'personal';
  st := public._online_link_state(l);
  base := jsonb_build_object('contact', (select nullif(trim(public_contact), '') from public.email_settings where id = 1));
  if st = 'not_found' then return base || jsonb_build_object('state', st); end if;
  select * into iy from public.institution_years where id = l.institution_year_id;
  select * into c from public.customers where id = l.customer_id;
  base := base || jsonb_build_object(
    'kind', 'personal',
    'institution', (select name from public.institutions where id = iy.institution_id),
    'year', (select name from public.academic_years where id = iy.year_id),
    'deadline', iy.order_deadline, 'open_date', iy.sale_open_date);

  -- כבר הזמין במכירה הזו → לצפייה בהזמנה (ולבקשת שינוי)
  select o.id into existing from public.orders o
  where o.customer_id = c.id and o.institution_year_id = iy.id and o.status <> 'cancelled'
  order by o.created_at desc limit 1;
  if existing is not null then
    return base || jsonb_build_object('state', 'ordered', 'view_code', public._order_view_code(existing));
  end if;
  if st <> 'ok' then return base || jsonb_build_object('state', st); end if;

  return base || jsonb_build_object(
    'state', 'ok',
    'sale_day_date', iy.sale_day_date, 'sale_day_notes', iy.sale_day_notes,
    'student', jsonb_build_object('first_name', c.first_name, 'last_name', c.last_name,
      'has_email', c.email is not null,
      'email_hint', case when c.email is null then null
                         else left(split_part(c.email, '@', 1), 2) || '***@' || split_part(c.email, '@', 2) end,
      'has_phone', c.phone is not null),
    'classes', public._public_classes(iy.id, null));
end;
$$;
revoke all on function public.public_personal_form(text) from public;
grant execute on function public.public_personal_form(text) to anon, authenticated;

create function public.submit_personal_order(
  p_code text, p_class_id uuid, p_items jsonb, p_delivery text, p_notes text, p_email text, p_phone text, p_trap text default null)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  l public.order_links;
  st text;
  iy public.institution_years;
  v_cust uuid;
  v_email text := lower(left(trim(coalesce(p_email, '')), 120));
  v_phone text := left(trim(coalesce(p_phone, '')), 30);
  v_notes text := nullif(left(trim(coalesce(p_notes, '')), 500), '');
  v_delivery text := coalesce(p_delivery, 'pickup');
  n_items integer;
  bad_book text;
  v_order uuid;
  v_code text;
  o public.orders;
begin
  if coalesce(p_trap, '') <> '' then return jsonb_build_object('ok', false, 'error', 'invalid', 'message', 'הבקשה לא התקבלה'); end if;
  if not public._online_rate_ok('personal', 10) then
    return jsonb_build_object('ok', false, 'error', 'rate', 'message', 'יותר מדי ניסיונות. אפשר לנסות שוב בעוד שעה, או להתקשר למשרד.');
  end if;
  select * into l from public.order_links where code = trim(coalesce(p_code, '')) and kind = 'personal';
  st := public._online_link_state(l);
  if st <> 'ok' then return jsonb_build_object('ok', false, 'error', st, 'message', 'ההזמנה בקישור הזה סגורה כרגע'); end if;
  select * into iy from public.institution_years where id = l.institution_year_id;
  v_cust := l.customer_id;

  if exists (select 1 from public.orders where customer_id = v_cust and institution_year_id = iy.id and status <> 'cancelled') then
    return jsonb_build_object('ok', false, 'error', 'exists', 'message', 'כבר קיימת הזמנה לתלמיד הזה – יש לרענן את הדף');
  end if;
  if v_email <> '' and v_email !~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' then
    return jsonb_build_object('ok', false, 'error', 'invalid', 'message', 'כתובת המייל לא תקינה');
  end if;
  if v_phone <> '' and regexp_replace(v_phone, '\D', '', 'g') !~ '^0\d{8,9}$' then
    return jsonb_build_object('ok', false, 'error', 'invalid', 'message', 'מספר הטלפון לא תקין');
  end if;
  if not exists (select 1 from public.classes c where c.id = p_class_id and c.institution_year_id = iy.id)
     or exists (select 1 from public.order_links cl where cl.kind = 'class' and cl.class_id = p_class_id and not cl.is_active) then
    return jsonb_build_object('ok', false, 'error', 'invalid', 'message', 'הכיתה לא נמצאה');
  end if;
  if jsonb_typeof(p_items) is distinct from 'array' then
    return jsonb_build_object('ok', false, 'error', 'invalid', 'message', 'יש לבחור לפחות ספר אחד');
  end if;
  select count(distinct x) into n_items from jsonb_array_elements_text(p_items) x;
  if n_items = 0 then return jsonb_build_object('ok', false, 'error', 'invalid', 'message', 'יש לבחור לפחות ספר אחד'); end if;
  if n_items > 200 or exists (
       select 1 from jsonb_array_elements_text(p_items) x
       where x !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
          or not exists (select 1 from public.class_books cb where cb.class_id = p_class_id and cb.book_id = x::uuid)) then
    return jsonb_build_object('ok', false, 'error', 'invalid', 'message', 'אחד הספרים לא נמצא ברשימת הכיתה – יש לרענן את הדף');
  end if;
  select b.name into bad_book from jsonb_array_elements_text(p_items) x
  join public.class_books cb on cb.class_id = p_class_id and cb.book_id = x::uuid
  join public.books b on b.id = cb.book_id
  where coalesce(cb.order_deadline, iy.order_deadline) is not null and public.israel_today() > coalesce(cb.order_deadline, iy.order_deadline)
  limit 1;
  if bad_book is not null then
    return jsonb_build_object('ok', false, 'error', 'invalid', 'message', 'עבר המועד להזמנת הספר "' || bad_book || '"');
  end if;
  if v_delivery not in ('pickup', 'institution_day') or (v_delivery = 'institution_day' and iy.sale_day_date is null) then
    v_delivery := 'pickup';
  end if;

  -- השלמת מייל / טלפון חסרים בכרטיס
  update public.customers c set email = coalesce(c.email, nullif(v_email, '')), phone = coalesce(c.phone, nullif(v_phone, ''))
   where c.id = v_cust and ((c.email is null and v_email <> '') or (c.phone is null and v_phone <> ''));

  insert into public.orders (class_id, customer_id, student_name, delivery_method, notes, source, year_id, institution_year_id)
  select p_class_id, v_cust, c.first_name || ' ' || c.last_name, v_delivery, v_notes, 'online', null, null
  from public.customers c where c.id = v_cust
  returning id into v_order;

  perform set_config('app.order_creating', 'on', true);
  insert into public.order_items (order_id, book_id, qty)
  select v_order, cb.book_id, greatest(cb.qty_per_student, 1)
  from public.class_books cb
  where cb.class_id = p_class_id and cb.book_id in (select distinct x::uuid from jsonb_array_elements_text(p_items) x);
  perform set_config('app.order_creating', 'off', true);

  insert into public.order_events (order_id, user_name, event, description)
  select v_order, 'הזמנה בקישור', 'items',
         'קישור אישי. ספרים בהזמנה: ' || string_agg(b.name || ' × ' || oi.qty, ', ' order by b.name)
  from public.order_items oi join public.books b on b.id = oi.book_id
  where oi.order_id = v_order;

  v_code := public._order_view_code(v_order);
  select * into o from public.orders where id = v_order;
  return jsonb_build_object('ok', true, 'number', o.number, 'total', o.total, 'view_code', v_code,
           'email_ok', (select email is not null from public.customers where id = v_cust))
         || public._class_texts(p_class_id);
end;
$$;
revoke all on function public.submit_personal_order(text, uuid, jsonb, text, text, text, text, text) from public;
grant execute on function public.submit_personal_order(text, uuid, jsonb, text, text, text, text, text) to anon, authenticated;

-- ---------- הסרה מרשימת התפוצה (מיילים פרסומיים בלבד) ----------
create function public.public_unsubscribe(p_code text)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare l public.order_links;
begin
  if not public._online_rate_ok('unsub', 20) then return jsonb_build_object('ok', false); end if;
  select * into l from public.order_links where code = trim(coalesce(p_code, '')) and kind = 'personal';
  if l.id is null then return jsonb_build_object('ok', false); end if;
  update public.customers set email_opt_out = true where id = l.customer_id and not email_opt_out;
  return jsonb_build_object('ok', true);
end;
$$;
revoke all on function public.public_unsubscribe(text) from public;
grant execute on function public.public_unsubscribe(text) to anon, authenticated;

-- ---------- "הזמנה להזמין": קהל וקישורים ----------
-- p_mode: 'prev_institution' – הזמינו במוסד הזה בשנים קודמות; 'class' – הזמינו בכיתה p_source (כל שנה); 'ids' – p_ids
create function public.invite_candidates(p_iy uuid, p_mode text, p_source uuid default null, p_ids uuid[] default null)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_inst uuid; res jsonb;
begin
  perform public.require_permission('emails_send');
  select institution_id into v_inst from public.institution_years where id = p_iy;
  if v_inst is null then raise exception 'המכירה במוסד לא נמצאה'; end if;

  select coalesce(jsonb_agg(jsonb_build_object(
      'customer_id', c.id, 'number', c.number, 'name', c.last_name || ' ' || c.first_name,
      'first_name', c.first_name, 'last_name', c.last_name, 'parent_name', c.parent_name,
      'email', c.email, 'phone', c.phone, 'opt_out', c.email_opt_out,
      'ordered', exists (select 1 from public.orders o where o.customer_id = c.id and o.institution_year_id = p_iy and o.status <> 'cancelled'),
      'last_invite', (select max(coalesce(e.sent_at, e.created_at)) from public.email_outbox e
                      where e.customer_id = c.id and e.kind = 'invite' and e.status in ('sent', 'queued')))
      order by c.last_name, c.first_name), '[]'::jsonb) into res
  from public.customers c
  where case p_mode
    when 'prev_institution' then exists (
      select 1 from public.orders o join public.institution_years iy on iy.id = o.institution_year_id
      where o.customer_id = c.id and iy.institution_id = v_inst and iy.id <> p_iy and o.status <> 'cancelled')
    when 'class' then exists (select 1 from public.orders o where o.customer_id = c.id and o.class_id = p_source and o.status <> 'cancelled')
    when 'ids' then c.id = any(coalesce(p_ids, '{}'))
    else false end;
  return res;
end;
$$;
revoke all on function public.invite_candidates(uuid, text, uuid, uuid[]) from public, anon;
grant execute on function public.invite_candidates(uuid, text, uuid, uuid[]) to authenticated;

create function public.invite_links(p_iy uuid, p_customers uuid[])
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare res jsonb;
begin
  perform public.require_permission('emails_send');
  perform set_config('app.skip_row_audit', 'on', true);
  insert into public.order_links (code, kind, institution_year_id, customer_id)
  select public.random_link_code(), 'personal', p_iy, c.id
  from public.customers c
  where c.id = any(p_customers)
    and not exists (select 1 from public.order_links l where l.kind = 'personal' and l.institution_year_id = p_iy and l.customer_id = c.id);
  perform set_config('app.skip_row_audit', 'off', true);
  select coalesce(jsonb_object_agg(l.customer_id, l.code), '{}'::jsonb) into res
  from public.order_links l where l.kind = 'personal' and l.institution_year_id = p_iy and l.customer_id = any(p_customers);
  return res;
end;
$$;
revoke all on function public.invite_links(uuid, uuid[]) from public, anon;
grant execute on function public.invite_links(uuid, uuid[]) to authenticated;
