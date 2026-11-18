-- =====================================================================
-- ח4 – הזמנה בקישור (docs/SPEC_EMAIL.md סעיף 5)
--   order_links       – קישורים /o/<קוד>: למוסד (class_id ריק), לכיתה, ולצפייה בהזמנה (order_id)
--   online_attempts   – הגבלת ניסיונות (IP / ת"ז) – בלי מדיניות, רק הפונקציות
--   orders            – מקור 'online', סימון "לבדיקה" (needs_review + review_details)
--   public_order_form(code)       – מה שהדף הציבורי מציג (anon)
--   submit_online_order(...)      – יצירת ההזמנה, זיהוי לפי ת"ז (anon)
--   online_confirm_data(view_code) – נתונים למייל האישור (service_role בלבד – השרת)
--   order_links_ensure(iy)        – יצירת קישורים חסרים למוסד ולכיתות (online_links_manage)
--   order_link_regenerate(id)     – קוד חדש לקישור (הקודם מפסיק לעבוד)
-- רק יצירה של דברים חדשים (בלי create or replace על פונקציות קיימות).
-- =====================================================================

-- ---------- הזמנות: מקור "קישור" + "לבדיקה" ----------
alter table public.orders drop constraint orders_source_check;
alter table public.orders add constraint orders_source_check check (source in ('manual', 'phone', 'copy', 'online'));
alter table public.orders
  add column needs_review boolean not null default false,
  add column review_details jsonb;
create index orders_needs_review_idx on public.orders (year_id) where needs_review;

-- ---------- פרטי התקשרות שמוצגים בדף הציבורי (כשהקישור לא פעיל וכו') ----------
alter table public.email_settings add column public_contact text;

-- ---------- קישורים ----------
create table public.order_links (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[A-Za-z0-9]{16,40}$'),
  kind text not null check (kind in ('institution', 'class', 'order')),
  institution_year_id uuid not null references public.institution_years(id) on delete cascade,
  class_id uuid references public.classes(id) on delete cascade,
  order_id uuid references public.orders(id) on delete cascade,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((kind = 'institution' and class_id is null and order_id is null)
      or (kind = 'class' and class_id is not null and order_id is null)
      or (kind = 'order' and order_id is not null))
);
create unique index order_links_institution_uq on public.order_links (institution_year_id) where kind = 'institution';
create unique index order_links_class_uq on public.order_links (class_id) where kind = 'class';
create unique index order_links_order_uq on public.order_links (order_id) where kind = 'order';

create trigger order_links_updated_at before update on public.order_links
  for each row execute function public.set_updated_at();
create trigger order_links_audit after insert or update or delete on public.order_links
  for each row execute function public.audit_row('קישור הזמנה');

alter table public.order_links enable row level security;
create policy order_links_select on public.order_links for select to authenticated
  using ((select public.has_permission('online_links_manage')) or (select public.has_permission('orders_view')));
create policy order_links_update on public.order_links for update to authenticated
  using ((select public.has_permission('online_links_manage')))
  with check ((select public.has_permission('online_links_manage')));
-- יצירה / קוד חדש – רק דרך הפונקציות

-- קוד אקראי ארוך (24 תווים, a-z A-Z 0-9)
create function public.random_link_code()
returns text language sql volatile set search_path = '' as $$
  select string_agg(substr('ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789', 1 + (get_byte(b, i) % 57), 1), '')
  from extensions.gen_random_bytes(24) b, generate_series(0, 23) i;
$$;
revoke all on function public.random_link_code() from public, anon, authenticated;

create function public.order_links_ensure(p_institution_year uuid)
returns integer language plpgsql security definer set search_path = '' as $$
declare n integer := 0; k integer;
begin
  perform public.require_permission('online_links_manage');
  insert into public.order_links (code, kind, institution_year_id)
  select public.random_link_code(), 'institution', p_institution_year
  where exists (select 1 from public.institution_years where id = p_institution_year)
    and not exists (select 1 from public.order_links where kind = 'institution' and institution_year_id = p_institution_year);
  get diagnostics k = row_count; n := n + k;
  insert into public.order_links (code, kind, institution_year_id, class_id)
  select public.random_link_code(), 'class', c.institution_year_id, c.id
  from public.classes c
  where c.institution_year_id = p_institution_year
    and not exists (select 1 from public.order_links l where l.kind = 'class' and l.class_id = c.id);
  get diagnostics k = row_count; n := n + k;
  return n;
end;
$$;
revoke all on function public.order_links_ensure(uuid) from public, anon;
grant execute on function public.order_links_ensure(uuid) to authenticated;

create function public.order_link_regenerate(p_link uuid)
returns text language plpgsql security definer set search_path = '' as $$
declare c text := public.random_link_code();
begin
  perform public.require_permission('online_links_manage');
  update public.order_links set code = c where id = p_link;
  if not found then raise exception 'הקישור לא נמצא'; end if;
  return c;
end;
$$;
revoke all on function public.order_link_regenerate(uuid) from public, anon;
grant execute on function public.order_link_regenerate(uuid) to authenticated;

-- ---------- הגבלת ניסיונות ----------
create table public.online_attempts (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  ip text,
  id_hash text,
  kind text not null,     -- 'submit' | 'bad' (ניסיון שנכשל)
  ok boolean not null default false
);
create index online_attempts_ip_idx on public.online_attempts (ip, created_at);
create index online_attempts_id_idx on public.online_attempts (id_hash, created_at);
alter table public.online_attempts enable row level security;
-- בכוונה בלי מדיניות: רק הפונקציות (definer) כותבות וקוראות

-- כתובת ה-IP של הגולש (PostgREST מעביר את הכותרות של הבקשה)
create function public.request_ip()
returns text language sql stable set search_path = '' as $$
  select nullif(split_part(coalesce(
    nullif(current_setting('request.headers', true), '')::json->>'cf-connecting-ip',
    nullif(current_setting('request.headers', true), '')::json->>'x-real-ip',
    nullif(current_setting('request.headers', true), '')::json->>'x-forwarded-for', ''), ',', 1), '');
$$;
revoke all on function public.request_ip() from public, anon, authenticated;

-- ת"ז ישראלית: 5–9 ספרות, משלימים ל-9 באפסים, ספרת ביקורת
create function public.valid_israeli_id(p text)
returns boolean language plpgsql immutable set search_path = '' as $$
declare d text := regexp_replace(coalesce(p, ''), '\D', '', 'g'); s integer := 0; v integer; i integer;
begin
  if length(d) < 5 or length(d) > 9 then return false; end if;
  d := lpad(d, 9, '0');
  if d = '000000000' then return false; end if;
  for i in 1..9 loop
    v := substr(d, i, 1)::integer * (case when i % 2 = 0 then 2 else 1 end);
    s := s + (case when v > 9 then v - 9 else v end);
  end loop;
  return s % 10 = 0;
end;
$$;
grant execute on function public.valid_israeli_id(text) to anon, authenticated;

create function public.norm_id_number(p text)
returns text language sql immutable set search_path = '' as $$
  select case when regexp_replace(coalesce(p, ''), '\D', '', 'g') = '' then null
              else lpad(regexp_replace(p, '\D', '', 'g'), 9, '0') end;
$$;
create index customer_private_id_norm_idx on public.customer_private (public.norm_id_number(id_number));

-- ---------- מצב הקישור (משותף לטופס ולשליחה) ----------
-- מחזיר: ok | not_found | inactive | closed_year | not_open | locked
create function public._online_link_state(l public.order_links)
returns text language plpgsql stable security definer set search_path = '' as $$
declare iy public.institution_years; y text;
begin
  if l.id is null then return 'not_found'; end if;
  if not l.is_active then return 'inactive'; end if;
  select * into iy from public.institution_years where id = l.institution_year_id;
  select status into y from public.academic_years where id = iy.year_id;
  if y = 'closed' then return 'closed_year'; end if;
  if iy.sale_open_date is not null and public.israel_today() < iy.sale_open_date then return 'not_open'; end if;
  if iy.order_deadline is not null and public.israel_today() > iy.order_deadline then return 'locked'; end if;
  if iy.order_deadline is null and iy.sale_close_date is not null and public.israel_today() > iy.sale_close_date then
    return 'locked';
  end if;
  return 'ok';
end;
$$;
revoke all on function public._online_link_state(public.order_links) from public, anon, authenticated;

-- הוראות תשלום / פרטי איסוף: כיתה ← מוסד ← ברירת מחדל
create function public._class_texts(p_class uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'payment_instructions', coalesce(nullif(trim(cl.payment_instructions), ''), nullif(trim(iy.payment_instructions), ''),
                                     (select nullif(trim(default_payment_instructions), '') from public.email_settings where id = 1)),
    'pickup_info', coalesce(nullif(trim(cl.pickup_info), ''), nullif(trim(iy.pickup_info), ''),
                            (select nullif(trim(default_pickup_info), '') from public.email_settings where id = 1)))
  from public.classes cl join public.institution_years iy on iy.id = cl.institution_year_id
  where cl.id = p_class;
$$;
revoke all on function public._class_texts(uuid) from public, anon, authenticated;

-- ---------- הטופס הציבורי ----------
create function public.public_order_form(p_code text)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  l public.order_links;
  st text;
  iy public.institution_years;
  base jsonb;
  o public.orders;
begin
  select * into l from public.order_links where code = trim(coalesce(p_code, ''));
  st := public._online_link_state(l);
  base := jsonb_build_object('contact', (select nullif(trim(public_contact), '') from public.email_settings where id = 1));
  if st = 'not_found' then return base || jsonb_build_object('state', st); end if;

  select * into iy from public.institution_years where id = l.institution_year_id;
  base := base || jsonb_build_object(
    'kind', l.kind,
    'institution', (select name from public.institutions where id = iy.institution_id),
    'year', (select name from public.academic_years where id = iy.year_id),
    'deadline', iy.order_deadline,
    'open_date', iy.sale_open_date);

  -- צפייה בהזמנה (הקישור שבמייל האישור) – רק ההזמנה הזו
  if l.kind = 'order' then
    if not l.is_active then return base || jsonb_build_object('state', 'inactive'); end if;
    select * into o from public.orders where id = l.order_id;
    return base || jsonb_build_object('state', 'ok', 'order', jsonb_build_object(
      'number', o.number, 'status', o.status, 'student_name', o.student_name,
      'class_name', (select name from public.classes where id = o.class_id),
      'created_at', o.created_at, 'delivery_method', o.delivery_method,
      'total', o.total, 'paid_amount', o.paid_amount, 'balance', o.balance,
      'books', coalesce((select jsonb_agg(jsonb_build_object('name', b.name, 'qty', oi.qty, 'price', oi.unit_price) order by oi.created_at, b.name)
                         from public.order_items oi join public.books b on b.id = oi.book_id
                         where oi.order_id = o.id and oi.status = 'active'), '[]'::jsonb),
      'sale_day_date', iy.sale_day_date)
      || public._class_texts(o.class_id));
  end if;

  if st <> 'ok' then return base || jsonb_build_object('state', st); end if;

  return base || jsonb_build_object(
    'state', 'ok',
    'sale_day_date', iy.sale_day_date,
    'sale_day_notes', iy.sale_day_notes,
    'classes', coalesce((
      select jsonb_agg(jsonb_build_object(
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
        order by c.sort_order, c.name)
      from public.classes c
      where c.institution_year_id = iy.id
        and (l.kind = 'institution' or c.id = l.class_id)
        and exists (select 1 from public.class_books cb where cb.class_id = c.id)
        -- קישור למוסד: רק כיתות שהקישור שלהן לא כובה
        and not exists (select 1 from public.order_links cl where cl.kind = 'class' and cl.class_id = c.id
                        and not cl.is_active and l.kind = 'institution')), '[]'::jsonb));
end;
$$;
revoke all on function public.public_order_form(text) from public;
grant execute on function public.public_order_form(text) to anon, authenticated;

-- ---------- שליחת הזמנה מהקישור ----------
-- p_items: מערך של book_id (הכמות תמיד לפי רשימת הכיתה)
-- מחזיר { ok, number, total, view_code, email_ok, payment_instructions, pickup_info } או { ok:false, error, message }
create function public.submit_online_order(
  p_code text,
  p_class_id uuid,
  p_first_name text,
  p_last_name text,
  p_id_number text,
  p_phone text,
  p_email text,
  p_parent_name text,
  p_items jsonb,
  p_delivery text,
  p_notes text,
  p_trap text default null)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  l public.order_links;
  st text;
  v_ip text := public.request_ip();
  v_idn text := public.norm_id_number(p_id_number);
  v_idh text;
  v_first text := left(trim(coalesce(p_first_name, '')), 60);
  v_last text := left(trim(coalesce(p_last_name, '')), 60);
  v_phone text := left(trim(coalesce(p_phone, '')), 30);
  v_digits text := regexp_replace(coalesce(p_phone, ''), '\D', '', 'g');
  v_email text := lower(left(trim(coalesce(p_email, '')), 120));
  v_parent text := nullif(left(trim(coalesce(p_parent_name, '')), 80), '');
  v_notes text := nullif(left(trim(coalesce(p_notes, '')), 500), '');
  v_delivery text := coalesce(p_delivery, 'pickup');
  iy public.institution_years;
  cust public.customers;
  v_cust uuid;
  diffs jsonb := '{}'::jsonb;
  v_order uuid;
  o public.orders;
  v_code text;
  bad_book text;
  n_items integer;
  attempt_id bigint;
  busy text := 'יותר מדי ניסיונות. אפשר לנסות שוב בעוד שעה, או להתקשר למשרד.';
begin
  -- מלכודת לרובוטים (שדה נסתר שאדם לא ממלא)
  if coalesce(p_trap, '') <> '' then
    return jsonb_build_object('ok', false, 'error', 'invalid', 'message', 'הבקשה לא התקבלה');
  end if;

  -- הגבלת קצב לפי IP: עד 8 שליחות בשעה, עד 4 ת"ז שונות בשעה, עד 30 ביום
  if v_ip is not null and (
       (select count(*) from public.online_attempts a where a.ip = v_ip and a.created_at > now() - interval '1 hour') >= 8
    or (select count(distinct a.id_hash) from public.online_attempts a where a.ip = v_ip and a.created_at > now() - interval '1 hour') >= 4
    or (select count(*) from public.online_attempts a where a.ip = v_ip and a.created_at > now() - interval '1 day') >= 30) then
    return jsonb_build_object('ok', false, 'error', 'rate', 'message', busy);
  end if;

  select * into l from public.order_links where code = trim(coalesce(p_code, '')) and kind in ('institution', 'class');
  st := public._online_link_state(l);
  if st <> 'ok' then
    return jsonb_build_object('ok', false, 'error', st, 'message', 'ההזמנה בקישור הזה סגורה כרגע');
  end if;
  select * into iy from public.institution_years where id = l.institution_year_id;

  -- בדיקות שדות
  if length(v_first) < 2 or length(v_last) < 2 then
    return jsonb_build_object('ok', false, 'error', 'invalid', 'message', 'יש למלא שם פרטי ושם משפחה');
  end if;
  if not public.valid_israeli_id(p_id_number) then
    return jsonb_build_object('ok', false, 'error', 'invalid', 'message', 'מספר תעודת הזהות לא תקין');
  end if;
  if v_digits !~ '^0\d{8,9}$' then
    return jsonb_build_object('ok', false, 'error', 'invalid', 'message', 'מספר הטלפון לא תקין');
  end if;
  if v_email <> '' and v_email !~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' then
    return jsonb_build_object('ok', false, 'error', 'invalid', 'message', 'כתובת המייל לא תקינה');
  end if;
  if v_delivery not in ('pickup', 'institution_day') or (v_delivery = 'institution_day' and iy.sale_day_date is null) then
    v_delivery := 'pickup';
  end if;

  -- הגבלה לפי ת"ז: עד 5 שליחות בשעה
  v_idh := md5('books-sales:' || v_idn);
  if (select count(*) from public.online_attempts a where a.id_hash = v_idh and a.created_at > now() - interval '1 hour') >= 5 then
    return jsonb_build_object('ok', false, 'error', 'rate', 'message', busy);
  end if;
  insert into public.online_attempts (ip, id_hash, kind) values (v_ip, v_idh, 'submit') returning id into attempt_id;

  -- הכיתה שייכת לקישור
  if not exists (select 1 from public.classes c where c.id = p_class_id and c.institution_year_id = iy.id
                 and (l.kind = 'institution' or c.id = l.class_id)) then
    return jsonb_build_object('ok', false, 'error', 'invalid', 'message', 'הכיתה לא נמצאה');
  end if;

  -- הספרים: מרשימת הכיתה, ושלא עבר המועד שלהם (הכמות – לפי הרשימה)
  if jsonb_typeof(p_items) is distinct from 'array' then
    return jsonb_build_object('ok', false, 'error', 'invalid', 'message', 'יש לבחור לפחות ספר אחד');
  end if;
  select count(distinct x) into n_items from jsonb_array_elements_text(p_items) x;
  if n_items = 0 then
    return jsonb_build_object('ok', false, 'error', 'invalid', 'message', 'יש לבחור לפחות ספר אחד');
  end if;
  if n_items > 200 or exists (
       select 1 from jsonb_array_elements_text(p_items) x
       where x !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
          or not exists (select 1 from public.class_books cb where cb.class_id = p_class_id and cb.book_id = x::uuid)) then
    return jsonb_build_object('ok', false, 'error', 'invalid', 'message', 'אחד הספרים לא נמצא ברשימת הכיתה – יש לרענן את הדף');
  end if;
  select b.name into bad_book
  from jsonb_array_elements_text(p_items) x
  join public.class_books cb on cb.class_id = p_class_id and cb.book_id = x::uuid
  join public.books b on b.id = cb.book_id
  where coalesce(cb.order_deadline, iy.order_deadline) is not null
    and public.israel_today() > coalesce(cb.order_deadline, iy.order_deadline)
  limit 1;
  if bad_book is not null then
    return jsonb_build_object('ok', false, 'error', 'invalid', 'message', 'עבר המועד להזמנת הספר "' || bad_book || '"');
  end if;

  -- זיהוי לפי ת"ז
  select c.* into cust from public.customers c join public.customer_private p on p.customer_id = c.id
  where public.norm_id_number(p.id_number) = v_idn
  order by c.created_at limit 1;

  if cust.id is not null then
    v_cust := cust.id;
    if exists (select 1 from public.orders where customer_id = v_cust and class_id = p_class_id and status <> 'cancelled') then
      update public.online_attempts set ok = true where id = attempt_id;
      return jsonb_build_object('ok', false, 'error', 'exists',
        'message', 'כבר קיימת הזמנה לתלמיד הזה בכיתה הזו. לשינוי ההזמנה אפשר להשתמש בקישור שנשלח במייל האישור, או להתקשר למשרד.');
    end if;
    -- פרטים שונים מהכרטיס – לא דורסים, מסמנים "לבדיקה"
    if lower(trim(cust.first_name)) <> lower(v_first) or lower(trim(cust.last_name)) <> lower(v_last) then
      diffs := diffs || jsonb_build_object('name', v_first || ' ' || v_last);
    end if;
    if cust.phone is not null and cust.phone2 is not null
       and regexp_replace(cust.phone, '\D', '', 'g') <> v_digits
       and regexp_replace(cust.phone2, '\D', '', 'g') <> v_digits then
      diffs := diffs || jsonb_build_object('phone', v_phone);
    end if;
    if v_email <> '' and cust.email is not null and lower(trim(cust.email)) <> v_email then
      diffs := diffs || jsonb_build_object('email', v_email);
    end if;
    if v_parent is not null and cust.parent_name is not null and trim(cust.parent_name) <> v_parent then
      diffs := diffs || jsonb_build_object('parent_name', v_parent);
    end if;
    -- השלמת פרטים חסרים בכרטיס (טלפון / טלפון שני / מייל / שם הורה)
    update public.customers c set
      phone = coalesce(c.phone, v_phone),
      phone2 = case when c.phone is not null and c.phone2 is null and regexp_replace(c.phone, '\D', '', 'g') <> v_digits
                    then v_phone else c.phone2 end,
      email = coalesce(c.email, nullif(v_email, '')),
      parent_name = coalesce(c.parent_name, v_parent)
    where c.id = v_cust;
  else
    insert into public.customers (first_name, last_name, phone, email, parent_name, notes)
    values (v_first, v_last, v_phone, nullif(v_email, ''), v_parent, 'נוצר מהזמנה בקישור')
    returning id into v_cust;
    insert into public.customer_private (customer_id, id_number) values (v_cust, v_idn);
  end if;

  -- יצירת ההזמנה (כמו create_order, בלי בדיקת הרשאה – הגולש לא מחובר; המחירים נקבעים בטריגר מרשימת הכיתה)
  insert into public.orders (class_id, customer_id, student_name, delivery_method, notes, source, year_id, institution_year_id,
                             needs_review, review_details)
  select p_class_id, v_cust, c.first_name || ' ' || c.last_name, v_delivery, v_notes, 'online', null, null,
         diffs <> '{}'::jsonb, case when diffs <> '{}'::jsonb then diffs end
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
         'ספרים בהזמנה: ' || string_agg(b.name || ' × ' || oi.qty, ', ' order by b.name)
         || case when diffs <> '{}'::jsonb then ' · לבדיקה: הפרטים שהוקלדו שונים מהכרטיס' else '' end
  from public.order_items oi join public.books b on b.id = oi.book_id
  where oi.order_id = v_order;

  v_code := public.random_link_code();
  insert into public.order_links (code, kind, institution_year_id, class_id, order_id)
  values (v_code, 'order', iy.id, p_class_id, v_order);

  update public.online_attempts set ok = true where id = attempt_id;

  select * into o from public.orders where id = v_order;
  return jsonb_build_object('ok', true, 'number', o.number, 'total', o.total, 'view_code', v_code,
           'email_ok', (select email is not null from public.customers where id = v_cust))
         || public._class_texts(p_class_id);
end;
$$;
revoke all on function public.submit_online_order(text, uuid, text, text, text, text, text, text, jsonb, text, text, text) from public;
grant execute on function public.submit_online_order(text, uuid, text, text, text, text, text, text, jsonb, text, text, text) to anon, authenticated;

-- ---------- נתונים למייל האישור (השרת בלבד, אחרי ההזמנה) ----------
create function public.online_confirm_data(p_view_code text)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'order_id', o.id, 'number', o.number, 'customer_id', o.customer_id, 'student_name', o.student_name,
    'parent_name', c.parent_name, 'email', c.email, 'created_at', o.created_at, 'source', o.source,
    'inst_name', i.name, 'class_name', cl.name, 'total', o.total, 'paid_amount', o.paid_amount, 'balance', o.balance,
    'delivery_method', o.delivery_method, 'sale_day_date', iy.sale_day_date, 'sale_day_notes', iy.sale_day_notes,
    'books', coalesce((select jsonb_agg(jsonb_build_object('name', b.name, 'qty', oi.qty) order by oi.created_at, b.name)
                       from public.order_items oi join public.books b on b.id = oi.book_id
                       where oi.order_id = o.id and oi.status = 'active'), '[]'::jsonb),
    'already_sent', exists (select 1 from public.email_outbox e where e.order_id = o.id and e.kind = 'order_confirm'))
    || public._class_texts(o.class_id)
  from public.order_links l
  join public.orders o on o.id = l.order_id
  join public.customers c on c.id = o.customer_id
  join public.classes cl on cl.id = o.class_id
  join public.institution_years iy on iy.id = o.institution_year_id
  join public.institutions i on i.id = iy.institution_id
  where l.kind = 'order' and l.code = p_view_code;
$$;
revoke all on function public.online_confirm_data(text) from public, anon, authenticated;
grant execute on function public.online_confirm_data(text) to service_role;
