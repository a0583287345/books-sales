-- =====================================================================
-- שלב ח2: מיילים על ההזמנה ("ההזמנה מוכנה", "מוכנה חלקית", "תזכורת תשלום")
--
-- הוראות תשלום ופרטי איסוף: לכל מכירה במוסד ולכל כיתה. סדר עדיפות: כיתה ← מוסד ← ברירת מחדל בהגדרות המייל.
-- order_email_data(ids) – כל מה שצריך למייל על ההזמנה (definer, emails_send): פרטי התלמיד והמייל,
--   מצב האריזה (כמה מוכן / נמסר), הספרים, סכומים, הטקסטים לפי סדר העדיפות, ומתי נשלח מייל קודם.
--   כך מי ששולח לא צריך הרשאות לקוחות/מחסן נפרדות.
-- =====================================================================

alter table public.institution_years add column payment_instructions text, add column pickup_info text;
alter table public.classes add column payment_instructions text, add column pickup_info text;

create function public.order_email_data(p_orders uuid[])
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  res jsonb;
  def_pay text;
  def_pickup text;
begin
  perform public.require_permission('emails_send');
  select s.default_payment_instructions, s.default_pickup_info into def_pay, def_pickup from public.email_settings s where s.id = 1;

  select coalesce(jsonb_agg(x order by x->>'inst_name', x->>'class_name', x->>'student_name'), '[]'::jsonb) into res
  from (
    select jsonb_build_object(
      'order_id', o.id, 'number', o.number, 'status', o.status, 'delivery_method', o.delivery_method,
      'student_name', o.student_name, 'customer_id', c.id, 'parent_name', c.parent_name,
      'email', c.email, 'email_opt_out', c.email_opt_out, 'phone', c.phone,
      'inst_name', i.name, 'class_name', cl.name, 'sale_day_date', iy.sale_day_date, 'sale_day_notes', iy.sale_day_notes,
      'total', o.total, 'paid_amount', o.paid_amount, 'balance', o.balance,
      'qty_total', coalesce((select sum(oi.qty) from public.order_items oi where oi.order_id = o.id and oi.status = 'active'), 0),
      'qty_ready', coalesce((select sum(bi.qty) from public.bag_items bi join public.bags b on b.id = bi.bag_id
                             where b.order_id = o.id and b.status = 'ready'), 0),
      'qty_delivered', coalesce((select sum(bi.qty) from public.bag_items bi join public.bags b on b.id = bi.bag_id
                                 where b.order_id = o.id and b.status = 'delivered'), 0),
      'books', coalesce((select jsonb_agg(jsonb_build_object('name', bk.name, 'qty', oi.qty) order by oi.created_at, bk.name)
                         from public.order_items oi join public.books bk on bk.id = oi.book_id
                         where oi.order_id = o.id and oi.status = 'active'), '[]'::jsonb),
      'payment_instructions', coalesce(nullif(trim(cl.payment_instructions), ''), nullif(trim(iy.payment_instructions), ''), def_pay),
      'pickup_info', coalesce(nullif(trim(cl.pickup_info), ''), nullif(trim(iy.pickup_info), ''), def_pickup),
      'last_ready_email', (select max(coalesce(e.sent_at, e.created_at)) from public.email_outbox e
                           where e.order_id = o.id and e.kind in ('ready', 'ready_partial') and e.status in ('sent', 'queued')),
      'last_reminder_email', (select max(coalesce(e.sent_at, e.created_at)) from public.email_outbox e
                              where e.order_id = o.id and e.kind = 'payment_reminder' and e.status in ('sent', 'queued'))
    ) x
    from public.orders o
    join public.customers c on c.id = o.customer_id
    join public.classes cl on cl.id = o.class_id
    join public.institution_years iy on iy.id = o.institution_year_id
    join public.institutions i on i.id = iy.institution_id
    where o.id = any(p_orders)
  ) t;
  return res;
end;
$$;
revoke all on function public.order_email_data(uuid[]) from public, anon;
grant execute on function public.order_email_data(uuid[]) to authenticated;
