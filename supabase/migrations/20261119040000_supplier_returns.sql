-- =====================================================================
-- החזרות לספקים – החזרה כללית לספק (לא כנגד הזמנת רכש)
--  - supplier_returns = מסמך החזרה (ספק, תאריך, הערות, מצב זיכוי ידני)
--  - supplier_return_lines = ספר + כמות + סוג:
--      damaged / wrong – פגומים/שגויים שנקלטו מהספק (לא במלאי) – עד מה שעוד לא הוחזר
--      surplus        – מהמלאי (עודף / נשאר מביטולים / רזרבה) – יוצא מהמלאי, עד המלאי הפנוי
--  - זיכוי מהספק – סימון ידני (credit_status + סכום), לא אוטומטי. יורד מיתרת הספק רק כשסומן "זוכה"
--  - כל שינוי רק דרך פונקציות (אין מדיניות כתיבה על הטבלאות)
-- =====================================================================

create sequence public.supplier_returns_number_seq start 101;
create table public.supplier_returns (
  id uuid primary key default gen_random_uuid(),
  number integer not null unique default nextval('public.supplier_returns_number_seq'),
  supplier_id uuid not null references public.suppliers (id) on delete restrict,
  year_id uuid references public.academic_years (id) on delete set null,
  return_date date not null default public.israel_today(),
  notes text,
  credit_status text not null default 'pending' check (credit_status in ('pending', 'credited', 'none')),
  credit_amount numeric(10, 2) check (credit_amount is null or credit_amount >= 0),
  credit_note text,
  credited_at timestamptz,
  credited_by_name text,
  cancelled boolean not null default false,
  cancelled_at timestamptz,
  cancelled_by_name text,
  cancel_reason text,
  created_at timestamptz not null default now(),
  created_by_name text,
  updated_at timestamptz not null default now()
);
alter sequence public.supplier_returns_number_seq owned by public.supplier_returns.number;
create index supplier_returns_supplier on public.supplier_returns (supplier_id);
create index supplier_returns_year on public.supplier_returns (year_id);

create table public.supplier_return_lines (
  id uuid primary key default gen_random_uuid(),
  return_id uuid not null references public.supplier_returns (id) on delete cascade,
  book_id uuid not null references public.books (id) on delete restrict,
  qty integer not null check (qty > 0),
  kind text not null check (kind in ('damaged', 'wrong', 'surplus')),
  po_item_id uuid references public.po_items (id) on delete set null,  -- פגומים/שגויים: מאיזו קליטה נלקחו
  reason text
);
create index supplier_return_lines_return on public.supplier_return_lines (return_id);
create index supplier_return_lines_book on public.supplier_return_lines (book_id);
create index supplier_return_lines_po_item on public.supplier_return_lines (po_item_id);

create trigger supplier_returns_updated_at before update on public.supplier_returns
  for each row execute function public.set_updated_at();

alter table public.supplier_returns enable row level security;
alter table public.supplier_return_lines enable row level security;
create policy supplier_returns_select on public.supplier_returns for select to authenticated
  using ((select public.has_permission('po_view')) or (select public.has_permission('supplier_payments_manage'))
         or (select public.has_permission('finance_view')));
create policy supplier_return_lines_select on public.supplier_return_lines for select to authenticated
  using ((select public.has_permission('po_view')) or (select public.has_permission('supplier_payments_manage'))
         or (select public.has_permission('finance_view')));

-- פגומים/שגויים שעוד לא הוחזרו, לפריט בהזמנת רכש
create function public.po_item_return_pending(p_item uuid, p_kind text)
returns integer language sql stable security definer set search_path = '' as $$
  select greatest(
    (select case p_kind when 'damaged' then i.qty_damaged when 'wrong' then i.qty_wrong else 0 end
       from public.po_items i where i.id = p_item)
    - coalesce((select sum(r.qty) from public.po_returns r where r.po_item_id = p_item and r.kind = p_kind), 0)
    - coalesce((select sum(l.qty) from public.supplier_return_lines l join public.supplier_returns sr on sr.id = l.return_id
                where l.po_item_id = p_item and l.kind = p_kind and not sr.cancelled), 0), 0)::integer;
$$;
revoke all on function public.po_item_return_pending(uuid, text) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- מה אפשר להחזיר לספק: לכל ספר – פגומים/שגויים ממתינים, ומלאי שמעבר לצורך
--   צורך פתוח = בשנים שאינן סגורות, לכל מוסד: נדרש − נמסר − מוקצה (לא שלילי)
--   עודף = מלאי פנוי (במלאי − מוקצה) − צורך פתוח
-- ---------------------------------------------------------------------
create function public.supplier_return_candidates(p_supplier uuid)
returns table (book_id uuid, damaged_pending integer, wrong_pending integer, on_hand integer, allocated integer,
               free integer, unmet integer, surplus integer)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.require_any_permission(array['po_view', 'po_manage']);
  return query
  with sup_books as (
    select bs.book_id bk from public.book_suppliers bs where bs.supplier_id = p_supplier
    union
    select i.book_id from public.po_items i join public.purchase_orders po on po.id = i.po_id
     where po.supplier_id = p_supplier and po.status <> 'cancelled'),
  dw as (
    select i.book_id bk,
           sum(public.po_item_return_pending(i.id, 'damaged'))::integer d,
           sum(public.po_item_return_pending(i.id, 'wrong'))::integer w
    from public.po_items i join public.purchase_orders po on po.id = i.po_id
    where po.supplier_id = p_supplier and po.status <> 'cancelled' and (i.qty_damaged > 0 or i.qty_wrong > 0)
    group by i.book_id),
  m as (select sm.book_id bk, sum(sm.qty)::integer q from public.stock_movements sm
        where sm.book_id in (select bk from sup_books) group by sm.book_id),
  a as (select sa.book_id bk, sum(sa.qty)::integer q from public.stock_allocations sa
        where sa.book_id in (select bk from sup_books) group by sa.book_id),
  dem as (
    select o.institution_year_id iy, oi.book_id bk, sum(oi.qty)::integer q
    from public.order_items oi
    join public.orders o on o.id = oi.order_id
    join public.academic_years y on y.id = o.year_id
    where y.status <> 'closed' and o.status <> 'cancelled' and oi.status = 'active'
      and oi.book_id in (select bk from sup_books)
    group by o.institution_year_id, oi.book_id),
  dlv as (
    select sm.institution_year_id iy, sm.book_id bk, (-sum(sm.qty))::integer q
    from public.stock_movements sm
    where sm.kind = 'delivered' and sm.book_id in (select bk from sup_books)
    group by sm.institution_year_id, sm.book_id),
  al as (
    select sa.institution_year_id iy, sa.book_id bk, sum(sa.qty)::integer q
    from public.stock_allocations sa where sa.book_id in (select bk from sup_books)
    group by sa.institution_year_id, sa.book_id),
  un as (
    select dem.bk, sum(greatest(dem.q - coalesce(dlv.q, 0) - coalesce(al.q, 0), 0))::integer q
    from dem left join dlv on dlv.iy = dem.iy and dlv.bk = dem.bk
             left join al on al.iy = dem.iy and al.bk = dem.bk
    group by dem.bk)
  select sb.bk,
         coalesce(dw.d, 0), coalesce(dw.w, 0),
         coalesce(m.q, 0), coalesce(a.q, 0),
         coalesce(m.q, 0) - coalesce(a.q, 0),
         coalesce(un.q, 0),
         greatest(coalesce(m.q, 0) - coalesce(a.q, 0) - coalesce(un.q, 0), 0)
  from sup_books sb
  left join dw on dw.bk = sb.bk
  left join m on m.bk = sb.bk
  left join a on a.bk = sb.bk
  left join un on un.bk = sb.bk
  where coalesce(dw.d, 0) + coalesce(dw.w, 0) > 0 or coalesce(m.q, 0) - coalesce(a.q, 0) > 0;
end;
$$;

-- ---------------------------------------------------------------------
-- רישום החזרה. p_lines = [{book_id, qty, kind, reason?, po_item_id?}]
--   damaged/wrong: מתחלק בין הקליטות מהספק (הוותיקה קודם), או רק מ-po_item_id אם נשלח
--   surplus: יוצא מהמלאי, עד המלאי הפנוי (לא מוקצה)
-- ---------------------------------------------------------------------
create function public.create_supplier_return(p_supplier uuid, p_lines jsonb, p_notes text default null,
                                              p_date date default null, p_year uuid default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  rid uuid;
  rnum integer;
  who text := public.my_full_name();
  ln jsonb;
  bk uuid;
  q integer;
  k text;
  rsn text;
  target_item uuid;
  left_q integer;
  pend integer;
  take integer;
  free integer;
  it record;
  bname text;
  summary text := '';
begin
  perform public.require_permission('po_manage');
  if not exists (select 1 from public.suppliers where id = p_supplier) then raise exception 'הספק לא נמצא'; end if;
  if jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then raise exception 'לא נבחרו ספרים להחזרה'; end if;

  insert into public.supplier_returns (supplier_id, year_id, return_date, notes, created_by_name)
  values (p_supplier, p_year, coalesce(p_date, public.israel_today()), nullif(trim(coalesce(p_notes, '')), ''), who)
  returning id, number into rid, rnum;

  for ln in select * from jsonb_array_elements(p_lines) loop
    bk := (ln->>'book_id')::uuid;
    q := coalesce((ln->>'qty')::integer, 0);
    k := ln->>'kind';
    rsn := nullif(trim(coalesce(ln->>'reason', '')), '');
    target_item := nullif(ln->>'po_item_id', '')::uuid;
    if q <= 0 then continue; end if;
    select name into bname from public.books where id = bk;
    if bname is null then raise exception 'ספר לא נמצא'; end if;

    if k = 'surplus' then
      free := public.book_on_hand(bk) - public.book_allocated(bk);
      if q > free then
        raise exception '"%": במלאי הפנוי יש רק % יחידות (השאר מוקצה למוסדות)', bname, greatest(free, 0);
      end if;
      insert into public.supplier_return_lines (return_id, book_id, qty, kind, po_item_id, reason)
      values (rid, bk, q, 'surplus', target_item, rsn);
      insert into public.stock_movements (book_id, qty, kind, po_item_id, reason, created_by_name)
      values (bk, -q, 'supplier_return', target_item,
              format('החזרה לספק מס׳ %s%s', rnum, coalesce(' – ' || rsn, '')), who);

    elsif k in ('damaged', 'wrong') then
      left_q := q;
      for it in
        select i.id from public.po_items i join public.purchase_orders po on po.id = i.po_id
        where po.supplier_id = p_supplier and po.status <> 'cancelled' and i.book_id = bk
          and (target_item is null or i.id = target_item)
        order by po.created_at, po.number
      loop
        exit when left_q <= 0;
        pend := public.po_item_return_pending(it.id, k);
        if pend <= 0 then continue; end if;
        take := least(pend, left_q);
        insert into public.supplier_return_lines (return_id, book_id, qty, kind, po_item_id, reason)
        values (rid, bk, take, k, it.id, rsn);
        perform set_config('app.po_internal', 'on', true);
        update public.po_items set qty_returned = qty_returned + take where id = it.id;
        perform set_config('app.po_internal', 'off', true);
        left_q := left_q - take;
      end loop;
      if left_q > 0 then
        raise exception '"%": אפשר להחזיר רק % יחידות %', bname, q - left_q,
          case k when 'damaged' then 'פגומות' else 'שגויות' end;
      end if;
    else
      raise exception 'סוג החזרה לא מוכר';
    end if;

    summary := summary || case when summary = '' then '' else ', ' end ||
               format('%s × %s (%s)', bname, q, case k when 'damaged' then 'פגום' when 'wrong' then 'שגוי' else 'מהמלאי' end);
  end loop;

  if summary = '' then raise exception 'לא הוזנו כמויות'; end if;

  insert into public.audit_logs (action, entity, entity_id, description)
  values ('create', 'supplier_returns', rid::text,
          format('החזרה לספק "%s" מס׳ %s: %s', (select name from public.suppliers where id = p_supplier), rnum, summary));
  return rid;
end;
$$;

-- ---------------------------------------------------------------------
-- סימון זיכוי (ידני): pending = ממתין, credited = זוכה (סכום חובה), none = ללא זיכוי
-- ---------------------------------------------------------------------
create function public.set_supplier_return_credit(p_return uuid, p_status text, p_amount numeric default null, p_note text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare r public.supplier_returns%rowtype;
begin
  perform public.require_permission('supplier_payments_manage');
  select * into r from public.supplier_returns where id = p_return;
  if r.id is null then raise exception 'ההחזרה לא נמצאה'; end if;
  if r.cancelled then raise exception 'ההחזרה בוטלה'; end if;
  if p_status not in ('pending', 'credited', 'none') then raise exception 'מצב לא מוכר'; end if;
  if p_status = 'credited' and coalesce(p_amount, 0) <= 0 then raise exception 'יש לרשום את סכום הזיכוי'; end if;
  update public.supplier_returns
     set credit_status = p_status,
         credit_amount = case when p_status = 'credited' then round(p_amount, 2) else null end,
         credit_note = nullif(trim(coalesce(p_note, '')), ''),
         credited_at = case when p_status = 'pending' then null else now() end,
         credited_by_name = case when p_status = 'pending' then null else public.my_full_name() end
   where id = p_return;
  insert into public.audit_logs (action, entity, entity_id, description)
  values ('update', 'supplier_returns', p_return::text,
          format('החזרה לספק "%s" מס׳ %s: %s', (select name from public.suppliers where id = r.supplier_id), r.number,
                 case p_status when 'credited' then format('זוכה %s ₪', round(p_amount, 2))
                               when 'none' then 'ללא זיכוי' else 'ממתין לזיכוי' end
                 || coalesce(' – ' || nullif(trim(coalesce(p_note, '')), ''), '')));
end;
$$;

-- ---------------------------------------------------------------------
-- ביטול החזרה שנרשמה בטעות: הספרים חוזרים למלאי / לפגומים הממתינים
-- ---------------------------------------------------------------------
create function public.cancel_supplier_return(p_return uuid, p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  r public.supplier_returns%rowtype;
  l record;
  who text := public.my_full_name();
begin
  perform public.require_permission('po_manage');
  if nullif(trim(coalesce(p_reason, '')), '') is null then raise exception 'יש לרשום סיבה לביטול'; end if;
  select * into r from public.supplier_returns where id = p_return for update;
  if r.id is null or r.cancelled then raise exception 'ההחזרה לא נמצאה או שכבר בוטלה'; end if;
  if r.credit_status = 'credited' then raise exception 'ההחזרה סומנה כזוכתה – יש לבטל קודם את סימון הזיכוי'; end if;
  for l in select * from public.supplier_return_lines where return_id = p_return loop
    if l.kind = 'surplus' then
      insert into public.stock_movements (book_id, qty, kind, po_item_id, reason, created_by_name)
      values (l.book_id, l.qty, 'supplier_return', l.po_item_id, format('ביטול החזרה לספק מס׳ %s – %s', r.number, trim(p_reason)), who);
    elsif l.po_item_id is not null then
      perform set_config('app.po_internal', 'on', true);
      update public.po_items set qty_returned = greatest(qty_returned - l.qty, 0) where id = l.po_item_id;
      perform set_config('app.po_internal', 'off', true);
    end if;
  end loop;
  update public.supplier_returns
     set cancelled = true, cancelled_at = now(), cancelled_by_name = who, cancel_reason = trim(p_reason)
   where id = p_return;
  insert into public.audit_logs (action, entity, entity_id, description)
  values ('cancel', 'supplier_returns', p_return::text,
          format('בוטלה החזרה לספק "%s" מס׳ %s – %s', (select name from public.suppliers where id = r.supplier_id), r.number, trim(p_reason)));
end;
$$;

revoke all on function public.supplier_return_candidates(uuid) from public, anon;
revoke all on function public.create_supplier_return(uuid, jsonb, text, date, uuid) from public, anon;
revoke all on function public.set_supplier_return_credit(uuid, text, numeric, text) from public, anon;
revoke all on function public.cancel_supplier_return(uuid, text) from public, anon;
grant execute on function public.supplier_return_candidates(uuid) to authenticated;
grant execute on function public.create_supplier_return(uuid, jsonb, text, date, uuid) to authenticated;
grant execute on function public.set_supplier_return_credit(uuid, text, numeric, text) to authenticated;
grant execute on function public.cancel_supplier_return(uuid, text) to authenticated;

-- הפונקציה הישנה (החזרה מתוך הזמנת רכש) – מוחלפת ב-create_supplier_return
revoke execute on function public.return_to_supplier(uuid, integer, text, text) from authenticated;
