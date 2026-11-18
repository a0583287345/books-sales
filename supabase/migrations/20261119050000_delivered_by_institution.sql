-- כמה נמסר בפועל לכל מוסד+ספר בשנה (תנועות delivered). מסך המלאי מחשב "חסר" = נדרש − נמסר − מוקצה
-- (במסירה ההקצאה קטנה, ובלי זה ספר שנמסר נראה שוב כחסר).
create function public.delivered_by_institution(p_year uuid)
returns table (institution_year_id uuid, book_id uuid, delivered integer)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.require_any_permission(array['inventory_view', 'po_view', 'receiving_do']);
  return query
  select sm.institution_year_id, sm.book_id, (-sum(sm.qty))::integer
  from public.stock_movements sm
  join public.institution_years iy on iy.id = sm.institution_year_id
  where sm.kind = 'delivered' and iy.year_id = p_year
  group by sm.institution_year_id, sm.book_id;
end;
$$;
revoke all on function public.delivered_by_institution(uuid) from public, anon;
grant execute on function public.delivered_by_institution(uuid) to authenticated;
