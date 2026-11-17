-- =====================================================================
-- שלב א׳: שנות לימודים, מוסדות, כיתות ורשימות ספרים, קטלוג, ספקים, לקוחות
--
-- קבוע (פעם אחת):  institutions, books, suppliers, book_suppliers, customers (+ customer_private)
-- לפי שנה:          academic_years → institution_years (המכירה של מוסד בשנה) → classes → class_books
-- שנה סגורה (status='closed') – אי אפשר לשנות את המכירות/כיתות/רשימות שלה (היסטוריה נשמרת).
-- מחירי קנייה – רק ב-book_suppliers (מוגן בהרשאה books_view_cost). ת"ז/כתובת – רק ב-customer_private.
-- =====================================================================

-- ---------- עזר ----------
create or replace function public.is_active_user()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.user_profiles where id = auth.uid() and is_active);
$$;
revoke all on function public.is_active_user() from public, anon;
grant execute on function public.is_active_user() to authenticated;

-- תיעוד אוטומטי של כל שינוי ביומן. tg_argv[0] = שם הישות בעברית.
-- בפעולות העתקה גדולות: set_config('app.skip_row_audit','on',true) ורישום שורת סיכום אחת.
create or replace function public.audit_row()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  rec jsonb;
  old_j jsonb;
  diff jsonb;
  label text;
begin
  if current_setting('app.skip_row_audit', true) = 'on' then return null; end if;
  rec := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;

  if tg_table_name = 'class_books' then
    label := (select b.name from public.books b where b.id = (rec->>'book_id')::uuid)
             || ' (כיתה ' || coalesce((select c.name from public.classes c where c.id = (rec->>'class_id')::uuid), '') || ')';
  elsif tg_table_name = 'institution_years' then
    label := (select i.name from public.institutions i where i.id = (rec->>'institution_id')::uuid)
             || ' – ' || coalesce((select y.name from public.academic_years y where y.id = (rec->>'year_id')::uuid), '');
  elsif tg_table_name = 'book_suppliers' then
    label := (select b.name from public.books b where b.id = (rec->>'book_id')::uuid)
             || ' / ' || coalesce((select s.name from public.suppliers s where s.id = (rec->>'supplier_id')::uuid), '');
  else
    label := coalesce(
      rec->>'name',
      nullif(trim(coalesce(rec->>'first_name', '') || ' ' || coalesce(rec->>'last_name', '')), ''),
      rec->>'id', rec->>'customer_id');
  end if;

  if tg_op = 'UPDATE' then
    old_j := to_jsonb(old);
    select jsonb_object_agg(key, jsonb_build_object('from', old_j->key, 'to', value)) into diff
    from jsonb_each(rec)
    where key not in ('updated_at', 'created_at') and (old_j->key) is distinct from value;
    if diff is null then return null; end if;
  end if;

  insert into public.audit_logs (action, entity, entity_id, description, details)
  values (lower(tg_op), tg_table_name, coalesce(rec->>'id', rec->>'customer_id'), tg_argv[0] || ': ' || coalesce(label, ''), diff);
  return null;
end;
$$;
revoke all on function public.audit_row() from public, anon, authenticated;

-- ---------- שנות לימודים ----------
create table public.academic_years (
  id uuid primary key default gen_random_uuid(),
  name text not null unique check (length(trim(name)) > 0),
  start_date date,
  end_date date,
  status text not null default 'active' check (status in ('planning', 'active', 'closed')),
  is_current boolean not null default false,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index academic_years_one_current on public.academic_years (is_current) where is_current;

-- ---------- מוסדות ----------
create sequence public.institutions_number_seq start 101;
create table public.institutions (
  id uuid primary key default gen_random_uuid(),
  number integer not null unique default nextval('public.institutions_number_seq'),
  name text not null check (length(trim(name)) > 0),
  address text,
  city text,
  contact_name text,
  phone text,
  phone2 text,
  email text,
  notes text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter sequence public.institutions_number_seq owned by public.institutions.number;

-- המכירה של מוסד בשנה מסוימת
create table public.institution_years (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid not null references public.institutions (id) on delete cascade,
  year_id uuid not null references public.academic_years (id) on delete restrict,
  sale_open_date date,
  sale_close_date date,
  order_deadline date,
  cancel_deadline date,
  notes text,
  settings jsonb not null default '{}'::jsonb check (jsonb_typeof(settings) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (institution_id, year_id)
);
create index institution_years_year on public.institution_years (year_id);

create table public.classes (
  id uuid primary key default gen_random_uuid(),
  institution_year_id uuid not null references public.institution_years (id) on delete cascade,
  name text not null check (length(trim(name)) > 0),
  student_count integer check (student_count is null or student_count >= 0),
  sort_order integer not null default 0,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (institution_year_id, name)
);

-- ---------- ספקים ----------
create sequence public.suppliers_number_seq start 1;
create table public.suppliers (
  id uuid primary key default gen_random_uuid(),
  number integer not null unique default nextval('public.suppliers_number_seq'),
  name text not null check (length(trim(name)) > 0),
  contact_name text,
  phone text,
  phone2 text,
  email text,
  address text,
  payment_terms text,
  lead_time_days integer check (lead_time_days is null or lead_time_days >= 0),
  notes text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter sequence public.suppliers_number_seq owned by public.suppliers.number;

-- ---------- קטלוג ספרים ----------
create sequence public.books_code_seq start 1;
create table public.books (
  id uuid primary key default gen_random_uuid(),
  code text not null unique default ('B' || lpad(nextval('public.books_code_seq')::text, 4, '0'))
    check (length(trim(code)) > 0),
  name text not null check (length(trim(name)) > 0),
  publisher text,
  sale_price numeric(10, 2) not null default 0 check (sale_price >= 0),
  notes text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter sequence public.books_code_seq owned by public.books.code;

-- ספק ↔ ספר: מק"ט ומחיר קנייה (מידע רגיש – books_view_cost)
create table public.book_suppliers (
  id uuid primary key default gen_random_uuid(),
  book_id uuid not null references public.books (id) on delete cascade,
  supplier_id uuid not null references public.suppliers (id) on delete cascade,
  supplier_sku text,
  purchase_price numeric(10, 2) check (purchase_price is null or purchase_price >= 0),
  is_preferred boolean not null default false,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (book_id, supplier_id)
);
create unique index book_suppliers_one_preferred on public.book_suppliers (book_id) where is_preferred;
create index book_suppliers_supplier on public.book_suppliers (supplier_id);

create table public.book_price_history (
  id bigint generated always as identity primary key,
  book_id uuid not null references public.books (id) on delete cascade,
  supplier_id uuid references public.suppliers (id) on delete set null,
  kind text not null check (kind in ('sale', 'purchase')),
  old_price numeric(10, 2),
  new_price numeric(10, 2),
  changed_at timestamptz not null default now(),
  changed_by uuid default auth.uid(),
  changed_by_name text
);
create index book_price_history_book on public.book_price_history (book_id, changed_at desc);

-- רשימת הספרים של כיתה
create table public.class_books (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references public.classes (id) on delete cascade,
  book_id uuid not null references public.books (id) on delete restrict,
  qty_per_student integer not null default 1 check (qty_per_student > 0),
  sale_price numeric(10, 2) not null default 0 check (sale_price >= 0),
  supplier_id uuid references public.suppliers (id) on delete set null,
  is_required boolean not null default true,
  order_deadline date,
  cancel_deadline date,
  notes text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (class_id, book_id)
);
create index class_books_book on public.class_books (book_id);
create index class_books_supplier on public.class_books (supplier_id);

-- ---------- לקוחות ----------
create sequence public.customers_number_seq start 1001;
create table public.customers (
  id uuid primary key default gen_random_uuid(),
  number integer not null unique default nextval('public.customers_number_seq'),
  first_name text not null check (length(trim(first_name)) > 0),
  last_name text not null check (length(trim(last_name)) > 0),
  phone text,
  phone2 text,
  email text,
  notes text,
  -- לחיפוש: ספרות הטלפונים בלבד
  phone_digits text generated always as (
    regexp_replace(coalesce(phone, ''), '\D', '', 'g') || ' ' || regexp_replace(coalesce(phone2, ''), '\D', '', 'g')
  ) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter sequence public.customers_number_seq owned by public.customers.number;
create index customers_last_name on public.customers (last_name, first_name);

-- מידע רגיש – גישה רק עם customers_view_private
create table public.customer_private (
  customer_id uuid primary key references public.customers (id) on delete cascade,
  id_number text,
  address text,
  city text,
  updated_at timestamptz not null default now()
);

-- ---------- updated_at ----------
create trigger academic_years_updated_at before update on public.academic_years for each row execute function public.set_updated_at();
create trigger institutions_updated_at before update on public.institutions for each row execute function public.set_updated_at();
create trigger institution_years_updated_at before update on public.institution_years for each row execute function public.set_updated_at();
create trigger classes_updated_at before update on public.classes for each row execute function public.set_updated_at();
create trigger suppliers_updated_at before update on public.suppliers for each row execute function public.set_updated_at();
create trigger books_updated_at before update on public.books for each row execute function public.set_updated_at();
create trigger book_suppliers_updated_at before update on public.book_suppliers for each row execute function public.set_updated_at();
create trigger class_books_updated_at before update on public.class_books for each row execute function public.set_updated_at();
create trigger customers_updated_at before update on public.customers for each row execute function public.set_updated_at();
create trigger customer_private_updated_at before update on public.customer_private for each row execute function public.set_updated_at();

-- ---------- שנה סגורה = לקריאה בלבד ----------
create or replace function public.guard_closed_year()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  rec jsonb := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
  y uuid;
begin
  if tg_table_name = 'institution_years' then
    y := (rec->>'year_id')::uuid;
  elsif tg_table_name = 'classes' then
    select iy.year_id into y from public.institution_years iy where iy.id = (rec->>'institution_year_id')::uuid;
  elsif tg_table_name = 'class_books' then
    select iy.year_id into y from public.classes c join public.institution_years iy on iy.id = c.institution_year_id
    where c.id = (rec->>'class_id')::uuid;
  end if;
  if y is not null and exists (select 1 from public.academic_years where id = y and status = 'closed') then
    raise exception 'שנת הלימודים סגורה – אי אפשר לשנות אותה (אפשר לפתוח אותה מחדש במסך שנות לימודים)'
      using errcode = '42501';
  end if;
  return coalesce(new, old);
end;
$$;
revoke all on function public.guard_closed_year() from public, anon, authenticated;
create trigger institution_years_closed_guard before insert or update or delete on public.institution_years
  for each row execute function public.guard_closed_year();
create trigger classes_closed_guard before insert or update or delete on public.classes
  for each row execute function public.guard_closed_year();
create trigger class_books_closed_guard before insert or update or delete on public.class_books
  for each row execute function public.guard_closed_year();

-- ---------- היסטוריית מחירים ----------
create or replace function public.track_book_price()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_table_name = 'books' then
    if tg_op = 'INSERT' or new.sale_price is distinct from old.sale_price then
      insert into public.book_price_history (book_id, kind, old_price, new_price, changed_by_name)
      values (new.id, 'sale', case when tg_op = 'UPDATE' then old.sale_price end, new.sale_price,
              (select full_name from public.user_profiles where id = auth.uid()));
    end if;
  else -- book_suppliers
    if tg_op = 'INSERT' or new.purchase_price is distinct from old.purchase_price then
      insert into public.book_price_history (book_id, supplier_id, kind, old_price, new_price, changed_by_name)
      values (new.book_id, new.supplier_id, 'purchase', case when tg_op = 'UPDATE' then old.purchase_price end,
              new.purchase_price, (select full_name from public.user_profiles where id = auth.uid()));
    end if;
  end if;
  return null;
end;
$$;
revoke all on function public.track_book_price() from public, anon, authenticated;
create trigger books_price_history after insert or update of sale_price on public.books
  for each row execute function public.track_book_price();
create trigger book_suppliers_price_history after insert or update of purchase_price on public.book_suppliers
  for each row execute function public.track_book_price();

-- ---------- יומן אוטומטי ----------
create trigger academic_years_audit after insert or update or delete on public.academic_years for each row execute function public.audit_row('שנת לימודים');
create trigger institutions_audit after insert or update or delete on public.institutions for each row execute function public.audit_row('מוסד');
create trigger institution_years_audit after insert or update or delete on public.institution_years for each row execute function public.audit_row('מכירה במוסד');
create trigger classes_audit after insert or update or delete on public.classes for each row execute function public.audit_row('כיתה');
create trigger suppliers_audit after insert or update or delete on public.suppliers for each row execute function public.audit_row('ספק');
create trigger books_audit after insert or update or delete on public.books for each row execute function public.audit_row('ספר');
create trigger book_suppliers_audit after insert or update or delete on public.book_suppliers for each row execute function public.audit_row('מחיר ספק');
create trigger class_books_audit after insert or update or delete on public.class_books for each row execute function public.audit_row('ספר ברשימה');
create trigger customers_audit after insert or update or delete on public.customers for each row execute function public.audit_row('לקוח');
create trigger customer_private_audit after insert or update or delete on public.customer_private for each row execute function public.audit_row('פרטים רגישים של לקוח');

-- ---------- RLS ----------
alter table public.academic_years enable row level security;
alter table public.institutions enable row level security;
alter table public.institution_years enable row level security;
alter table public.classes enable row level security;
alter table public.suppliers enable row level security;
alter table public.books enable row level security;
alter table public.book_suppliers enable row level security;
alter table public.book_price_history enable row level security;
alter table public.class_books enable row level security;
alter table public.customers enable row level security;
alter table public.customer_private enable row level security;
revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;

-- נתוני בסיס (שמות שנים/מוסדות/כיתות/ספרים/ספקים) – לקריאה לכל משתמש פעיל; כתיבה לפי הרשאה
create policy academic_years_select on public.academic_years for select to authenticated using ((select public.is_active_user()));
create policy academic_years_insert on public.academic_years for insert to authenticated with check ((select public.has_permission('years_manage')));
create policy academic_years_update on public.academic_years for update to authenticated
  using ((select public.has_permission('years_manage'))) with check ((select public.has_permission('years_manage')));
create policy academic_years_delete on public.academic_years for delete to authenticated using ((select public.has_permission('years_manage')));

create policy institutions_select on public.institutions for select to authenticated using ((select public.is_active_user()));
create policy institutions_insert on public.institutions for insert to authenticated with check ((select public.has_permission('institutions_create')));
create policy institutions_update on public.institutions for update to authenticated
  using ((select public.has_permission('institutions_edit'))) with check ((select public.has_permission('institutions_edit')));
create policy institutions_delete on public.institutions for delete to authenticated using ((select public.has_permission('institutions_delete')));

create policy institution_years_select on public.institution_years for select to authenticated using ((select public.is_active_user()));
create policy institution_years_insert on public.institution_years for insert to authenticated
  with check ((select public.has_permission('institutions_edit')) or (select public.has_permission('institutions_create')) or (select public.has_permission('years_manage')));
create policy institution_years_update on public.institution_years for update to authenticated
  using ((select public.has_permission('institutions_edit')) or (select public.has_permission('years_manage')))
  with check ((select public.has_permission('institutions_edit')) or (select public.has_permission('years_manage')));
create policy institution_years_delete on public.institution_years for delete to authenticated
  using ((select public.has_permission('institutions_delete')) or (select public.has_permission('years_manage')));

create policy classes_select on public.classes for select to authenticated using ((select public.is_active_user()));
create policy classes_insert on public.classes for insert to authenticated with check ((select public.has_permission('classes_manage')));
create policy classes_update on public.classes for update to authenticated
  using ((select public.has_permission('classes_manage'))) with check ((select public.has_permission('classes_manage')));
create policy classes_delete on public.classes for delete to authenticated using ((select public.has_permission('classes_manage')));

create policy class_books_select on public.class_books for select to authenticated using ((select public.is_active_user()));
create policy class_books_insert on public.class_books for insert to authenticated with check ((select public.has_permission('classes_manage')));
create policy class_books_update on public.class_books for update to authenticated
  using ((select public.has_permission('classes_manage'))) with check ((select public.has_permission('classes_manage')));
create policy class_books_delete on public.class_books for delete to authenticated using ((select public.has_permission('classes_manage')));

create policy suppliers_select on public.suppliers for select to authenticated using ((select public.is_active_user()));
create policy suppliers_insert on public.suppliers for insert to authenticated with check ((select public.has_permission('suppliers_manage')));
create policy suppliers_update on public.suppliers for update to authenticated
  using ((select public.has_permission('suppliers_manage'))) with check ((select public.has_permission('suppliers_manage')));
create policy suppliers_delete on public.suppliers for delete to authenticated using ((select public.has_permission('suppliers_manage')));

create policy books_select on public.books for select to authenticated using ((select public.is_active_user()));
create policy books_insert on public.books for insert to authenticated with check ((select public.has_permission('books_manage')));
create policy books_update on public.books for update to authenticated
  using ((select public.has_permission('books_manage'))) with check ((select public.has_permission('books_manage')));
create policy books_delete on public.books for delete to authenticated using ((select public.has_permission('books_manage')));

-- מחירי קנייה – רק עם books_view_cost
create policy book_suppliers_select on public.book_suppliers for select to authenticated using ((select public.has_permission('books_view_cost')));
create policy book_suppliers_insert on public.book_suppliers for insert to authenticated
  with check ((select public.has_permission('books_manage')) and (select public.has_permission('books_view_cost')));
create policy book_suppliers_update on public.book_suppliers for update to authenticated
  using ((select public.has_permission('books_manage')) and (select public.has_permission('books_view_cost')))
  with check ((select public.has_permission('books_manage')) and (select public.has_permission('books_view_cost')));
create policy book_suppliers_delete on public.book_suppliers for delete to authenticated
  using ((select public.has_permission('books_manage')) and (select public.has_permission('books_view_cost')));
create policy book_price_history_select on public.book_price_history for select to authenticated using ((select public.has_permission('books_view_cost')));

create policy customers_select on public.customers for select to authenticated using ((select public.has_permission('customers_view')));
create policy customers_insert on public.customers for insert to authenticated with check ((select public.has_permission('customers_create')));
create policy customers_update on public.customers for update to authenticated
  using ((select public.has_permission('customers_edit'))) with check ((select public.has_permission('customers_edit')));
create policy customers_delete on public.customers for delete to authenticated using ((select public.has_permission('customers_delete')));

create policy customer_private_select on public.customer_private for select to authenticated using ((select public.has_permission('customers_view_private')));
create policy customer_private_insert on public.customer_private for insert to authenticated
  with check ((select public.has_permission('customers_view_private'))
              and ((select public.has_permission('customers_edit')) or (select public.has_permission('customers_create'))));
create policy customer_private_update on public.customer_private for update to authenticated
  using ((select public.has_permission('customers_view_private')) and (select public.has_permission('customers_edit')))
  with check ((select public.has_permission('customers_view_private')) and (select public.has_permission('customers_edit')));
create policy customer_private_delete on public.customer_private for delete to authenticated
  using ((select public.has_permission('customers_view_private')) and (select public.has_permission('customers_edit')));

-- =====================================================================
-- העתקות – כל העתקה = רשומות חדשות; המקור לא משתנה. פעולה אחת שלמה (או הכול או כלום).
-- security definer + בדיקת הרשאה מפורשת; טריגר השנה הסגורה עדיין חל.
-- =====================================================================

create or replace function public.require_permission(p text)
returns void language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.has_permission(p) then
    raise exception 'אין לך הרשאה לפעולה זו (%)', p using errcode = '42501';
  end if;
end;
$$;
revoke all on function public.require_permission(text) from public, anon, authenticated;

-- העתקת רשימת ספרים לכיתה קיימת. p_replace=true מוחק קודם את הרשימה הקיימת ביעד.
create or replace function public.copy_class_books(p_source_class uuid, p_target_class uuid, p_replace boolean default false)
returns integer language plpgsql security definer set search_path = '' as $$
declare n integer;
begin
  perform public.require_permission('classes_copy');
  if p_source_class = p_target_class then raise exception 'כיתת המקור והיעד זהות'; end if;
  perform set_config('app.skip_row_audit', 'on', true);
  if p_replace then delete from public.class_books where class_id = p_target_class; end if;
  insert into public.class_books (class_id, book_id, qty_per_student, sale_price, supplier_id, is_required,
                                  order_deadline, cancel_deadline, notes, sort_order)
  select p_target_class, book_id, qty_per_student, sale_price, supplier_id, is_required,
         order_deadline, cancel_deadline, notes, sort_order
  from public.class_books where class_id = p_source_class
  on conflict (class_id, book_id) do nothing;
  get diagnostics n = row_count;
  perform set_config('app.skip_row_audit', 'off', true);
  insert into public.audit_logs (action, entity, entity_id, description)
  values ('copy', 'classes', p_target_class::text,
          format('הועתקו %s ספרים מכיתה "%s" לכיתה "%s"%s', n,
                 (select name from public.classes where id = p_source_class),
                 (select name from public.classes where id = p_target_class),
                 case when p_replace then ' (במקום הרשימה הקודמת)' else '' end));
  return n;
end;
$$;

-- העתקת כיתה (כולל רשימת הספרים) למכירה של אותו מוסד או של מוסד אחר
create or replace function public.copy_class(p_source_class uuid, p_target_institution_year uuid, p_name text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare new_id uuid;
begin
  perform public.require_permission('classes_copy');
  insert into public.classes (institution_year_id, name, student_count, sort_order, notes)
  select p_target_institution_year, trim(p_name), student_count, sort_order, notes
  from public.classes where id = p_source_class
  returning id into new_id;
  if new_id is null then raise exception 'כיתת המקור לא נמצאה'; end if;
  perform public.copy_class_books(p_source_class, new_id, false);
  return new_id;
end;
$$;

-- העתקה פנימית של כל הכיתות והרשימות ממכירה למכירה (עם הזזת תאריכים ורענון מחירים אופציונלי)
create or replace function public._copy_institution_year_content(
  p_source_iy uuid, p_target_iy uuid, p_shift_days integer, p_refresh_prices boolean)
returns integer language plpgsql security definer set search_path = '' as $$
declare
  c record;
  new_class uuid;
  total integer := 0;
  n integer;
begin
  for c in select * from public.classes where institution_year_id = p_source_iy order by sort_order, name loop
    insert into public.classes (institution_year_id, name, student_count, sort_order, notes)
    values (p_target_iy, c.name, c.student_count, c.sort_order, c.notes)
    returning id into new_class;
    insert into public.class_books (class_id, book_id, qty_per_student, sale_price, supplier_id, is_required,
                                    order_deadline, cancel_deadline, notes, sort_order)
    select new_class, cb.book_id, cb.qty_per_student,
           case when p_refresh_prices then b.sale_price else cb.sale_price end,
           cb.supplier_id, cb.is_required,
           cb.order_deadline + p_shift_days, cb.cancel_deadline + p_shift_days, cb.notes, cb.sort_order
    from public.class_books cb join public.books b on b.id = cb.book_id
    where cb.class_id = c.id;
    get diagnostics n = row_count;
    total := total + n;
  end loop;
  return total;
end;
$$;
revoke all on function public._copy_institution_year_content(uuid, uuid, integer, boolean) from public, anon, authenticated;

-- העתקת מוסד: מוסד חדש (מספר חדש) עם אותם פרטים, ומכירה בשנה הנבחרת עם כל הכיתות והרשימות
create or replace function public.copy_institution(
  p_source_iy uuid, p_new_name text, p_new_number integer default null, p_target_year uuid default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  src public.institution_years%rowtype;
  new_inst uuid;
  new_iy uuid;
  same_year boolean;
  n integer;
begin
  perform public.require_permission('institutions_copy');
  select * into src from public.institution_years where id = p_source_iy;
  if src.id is null then raise exception 'המוסד לא נמצא'; end if;
  same_year := p_target_year is null or p_target_year = src.year_id;

  perform set_config('app.skip_row_audit', 'on', true);
  insert into public.institutions (number, name, address, city, contact_name, phone, phone2, email, notes)
  select coalesce(p_new_number, nextval('public.institutions_number_seq')::integer), trim(p_new_name),
         address, city, contact_name, phone, phone2, email, notes
  from public.institutions where id = src.institution_id
  returning id into new_inst;

  insert into public.institution_years (institution_id, year_id, sale_open_date, sale_close_date, order_deadline,
                                        cancel_deadline, notes, settings)
  values (new_inst, coalesce(p_target_year, src.year_id),
          case when same_year then src.sale_open_date end, case when same_year then src.sale_close_date end,
          case when same_year then src.order_deadline end, case when same_year then src.cancel_deadline end,
          src.notes, src.settings)
  returning id into new_iy;

  n := public._copy_institution_year_content(p_source_iy, new_iy, 0, false);
  perform set_config('app.skip_row_audit', 'off', true);

  insert into public.audit_logs (action, entity, entity_id, description)
  values ('copy', 'institutions', new_inst::text,
          format('הועתק מוסד "%s" → מוסד חדש "%s" (%s כיתות, %s ספרים ברשימות)',
                 (select name from public.institutions where id = src.institution_id), trim(p_new_name),
                 (select count(*) from public.classes where institution_year_id = new_iy), n));
  return new_inst;
end;
$$;

-- העתקת מוסד קיים לשנה אחרת (אותו מוסד – מכירה חדשה עם הכיתות והרשימות)
create or replace function public.copy_institution_to_year(
  p_source_iy uuid, p_target_year uuid, p_refresh_prices boolean default false)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  src public.institution_years%rowtype;
  new_iy uuid;
  n integer;
begin
  perform public.require_permission('years_copy');
  select * into src from public.institution_years where id = p_source_iy;
  if src.id is null then raise exception 'המכירה לא נמצאה'; end if;
  if exists (select 1 from public.institution_years where institution_id = src.institution_id and year_id = p_target_year) then
    raise exception 'המוסד כבר קיים בשנה הזו';
  end if;
  perform set_config('app.skip_row_audit', 'on', true);
  insert into public.institution_years (institution_id, year_id, notes, settings)
  values (src.institution_id, p_target_year, src.notes, src.settings)
  returning id into new_iy;
  n := public._copy_institution_year_content(p_source_iy, new_iy, 0, p_refresh_prices);
  perform set_config('app.skip_row_audit', 'off', true);
  insert into public.audit_logs (action, entity, entity_id, description)
  values ('copy', 'institution_years', new_iy::text,
          format('הועתק המוסד "%s" לשנה %s (%s ספרים ברשימות)',
                 (select name from public.institutions where id = src.institution_id),
                 (select name from public.academic_years where id = p_target_year), n));
  return new_iy;
end;
$$;

-- פתיחת שנה חדשה על בסיס שנה קודמת: כל המוסדות (או רק הנבחרים), הכיתות והרשימות.
-- תאריכים מוזזים לפי ההפרש בין תחילת השנים (אם ידוע); מחירים – אפשר לרענן מהקטלוג.
create or replace function public.copy_year(
  p_source_year uuid, p_name text, p_start date default null, p_end date default null,
  p_refresh_prices boolean default false, p_institution_ids uuid[] default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  src public.academic_years%rowtype;
  new_year uuid;
  shift integer;
  iy record;
  new_iy uuid;
  inst_count integer := 0;
  book_count integer := 0;
begin
  perform public.require_permission('years_copy');
  select * into src from public.academic_years where id = p_source_year;
  if src.id is null then raise exception 'שנת המקור לא נמצאה'; end if;
  shift := coalesce(p_start - src.start_date, 0);

  perform set_config('app.skip_row_audit', 'on', true);
  insert into public.academic_years (name, start_date, end_date, status)
  values (trim(p_name), p_start, p_end, 'planning')
  returning id into new_year;

  for iy in
    select * from public.institution_years
    where year_id = p_source_year and (p_institution_ids is null or institution_id = any (p_institution_ids))
  loop
    insert into public.institution_years (institution_id, year_id, sale_open_date, sale_close_date,
                                          order_deadline, cancel_deadline, notes, settings)
    values (iy.institution_id, new_year, iy.sale_open_date + shift, iy.sale_close_date + shift,
            iy.order_deadline + shift, iy.cancel_deadline + shift, iy.notes, iy.settings)
    returning id into new_iy;
    book_count := book_count + public._copy_institution_year_content(iy.id, new_iy, shift, p_refresh_prices);
    inst_count := inst_count + 1;
  end loop;
  perform set_config('app.skip_row_audit', 'off', true);

  insert into public.audit_logs (action, entity, entity_id, description)
  values ('copy', 'academic_years', new_year::text,
          format('נפתחה שנה "%s" על בסיס "%s": %s מוסדות, %s ספרים ברשימות%s', trim(p_name), src.name,
                 inst_count, book_count, case when p_refresh_prices then ' (מחירים עודכנו מהקטלוג)' else '' end));
  return new_year;
end;
$$;

revoke all on function public.copy_class_books(uuid, uuid, boolean) from public, anon;
revoke all on function public.copy_class(uuid, uuid, text) from public, anon;
revoke all on function public.copy_institution(uuid, text, integer, uuid) from public, anon;
revoke all on function public.copy_institution_to_year(uuid, uuid, boolean) from public, anon;
revoke all on function public.copy_year(uuid, text, date, date, boolean, uuid[]) from public, anon;
grant execute on function public.copy_class_books(uuid, uuid, boolean) to authenticated;
grant execute on function public.copy_class(uuid, uuid, text) to authenticated;
grant execute on function public.copy_institution(uuid, text, integer, uuid) to authenticated;
grant execute on function public.copy_institution_to_year(uuid, uuid, boolean) to authenticated;
grant execute on function public.copy_year(uuid, text, date, date, boolean, uuid[]) to authenticated;
