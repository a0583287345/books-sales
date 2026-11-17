-- ביומן: הזמנת רכש מוצגת לפי מספר + ספק (ולא לפי מזהה פנימי)
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
  elsif tg_table_name = 'purchase_orders' then
    label := 'מס׳ ' || (rec->>'number') || ' – '
             || coalesce((select s.name from public.suppliers s where s.id = (rec->>'supplier_id')::uuid), '');
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
