-- =====================================================================
-- ח2 (המשך): העתקות (כיתה / מוסד / מוסד לשנה / שנה) מעתיקות גם את "הוראות תשלום" ו"פרטי איסוף".
-- מעדכן פונקציות קיימות (create or replace) – אם apply_migration נדחה, להריץ ידנית ב-SQL Editor של Supabase.
-- זהה לגרסה ב-20261118090000_phase_a_core.sql, רק עם שתי העמודות החדשות.
-- =====================================================================

create or replace function public.copy_class(p_source_class uuid, p_target_institution_year uuid, p_name text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare new_id uuid;
begin
  perform public.require_permission('classes_copy');
  insert into public.classes (institution_year_id, name, student_count, sort_order, notes, payment_instructions, pickup_info)
  select p_target_institution_year, trim(p_name), student_count, sort_order, notes, payment_instructions, pickup_info
  from public.classes where id = p_source_class
  returning id into new_id;
  if new_id is null then raise exception 'כיתת המקור לא נמצאה'; end if;
  perform public.copy_class_books(p_source_class, new_id, false);
  return new_id;
end;
$$;

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
    insert into public.classes (institution_year_id, name, student_count, sort_order, notes, payment_instructions, pickup_info)
    values (p_target_iy, c.name, c.student_count, c.sort_order, c.notes, c.payment_instructions, c.pickup_info)
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
                                        cancel_deadline, notes, settings, payment_instructions, pickup_info)
  values (new_inst, coalesce(p_target_year, src.year_id),
          case when same_year then src.sale_open_date end, case when same_year then src.sale_close_date end,
          case when same_year then src.order_deadline end, case when same_year then src.cancel_deadline end,
          src.notes, src.settings, src.payment_instructions, src.pickup_info)
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
  insert into public.institution_years (institution_id, year_id, notes, settings, payment_instructions, pickup_info)
  values (src.institution_id, p_target_year, src.notes, src.settings, src.payment_instructions, src.pickup_info)
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
                                          order_deadline, cancel_deadline, notes, settings, payment_instructions, pickup_info)
    values (iy.institution_id, new_year, iy.sale_open_date + shift, iy.sale_close_date + shift,
            iy.order_deadline + shift, iy.cancel_deadline + shift, iy.notes, iy.settings, iy.payment_instructions, iy.pickup_info)
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
