-- =====================================================================
-- יתרות ספקים: זיכויים על החזרות יורדים מהחוב רק כשסומנו "זוכה" (ידני).
-- (לפני כן ירדו אוטומטית עודפים שהוחזרו מתוך הזמנת רכש – בוטל.)
-- מעדכן פונקציה קיימת → להריץ ידנית ב-SQL Editor של Supabase.
-- =====================================================================

drop function if exists public.supplier_balances(uuid);

create function public.supplier_balances(p_year uuid default null)
returns table (supplier_id uuid, received_value numeric, credited numeric, paid numeric, balance numeric, missing_cost_items integer)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.require_any_permission(array['finance_view', 'supplier_payments_manage']);
  return query
  with recv as (
    select po.supplier_id sid,
           sum(i.qty_received * coalesce(c.unit_cost, 0)) v,
           count(*) filter (where c.unit_cost is null and i.qty_received > 0)::integer miss
    from public.po_items i
    join public.purchase_orders po on po.id = i.po_id
    left join public.po_item_costs c on c.po_item_id = i.id
    where po.status <> 'cancelled' and (p_year is null or po.year_id = p_year)
    group by po.supplier_id),
  cr as (
    select sr.supplier_id sid, sum(sr.credit_amount) v from public.supplier_returns sr
    where not sr.cancelled and sr.credit_status = 'credited' and (p_year is null or sr.year_id = p_year)
    group by sr.supplier_id),
  pay as (
    select sp.supplier_id sid, sum(sp.amount) v from public.supplier_payments sp
    where not sp.voided and (p_year is null or sp.year_id = p_year) group by sp.supplier_id),
  ids as (select recv.sid from recv union select cr.sid from cr union select pay.sid from pay)
  select ids.sid, coalesce(recv.v, 0)::numeric, coalesce(cr.v, 0)::numeric, coalesce(pay.v, 0)::numeric,
         (coalesce(recv.v, 0) - coalesce(cr.v, 0) - coalesce(pay.v, 0))::numeric, coalesce(recv.miss, 0)
  from ids left join recv on recv.sid = ids.sid left join cr on cr.sid = ids.sid left join pay on pay.sid = ids.sid;
end;
$$;

revoke all on function public.supplier_balances(uuid) from public, anon;
grant execute on function public.supplier_balances(uuid) to authenticated;
