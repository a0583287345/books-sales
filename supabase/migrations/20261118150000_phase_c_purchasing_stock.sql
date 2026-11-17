-- =====================================================================
-- שלב ג׳: הזמנות רכש, קליטת סחורה, מלאי והקצאה
--  - הזמנת רכש = ספק אחד; כל ספר מחולק למוסדות (po_item_allocations; institution_year_id ריק = רזרבה)
--  - מחיר קנייה – po_item_costs (books_view_cost בלבד)
--  - קליטה: rpc receive_po → שורות קליטה + תנועות מלאי + סטטוס אוטומטי (התקבלה חלקית / במלואה)
--  - סגירה עם חוסר – רק עם הערת טיפול בחוסר (po_close)
--  - מלאי מרכזי לכל השנים: stock_movements (פתיחה / תיקון / קליטה / החזרה לספק / מסירה – שלב ד׳)
--  - הקצאה ידנית למוסד: stock_allocations, סך ההקצאות ≤ המלאי בפועל
-- =====================================================================

-- ---------- הזמנות רכש ----------
create sequence public.purchase_orders_number_seq start 5001;
create table public.purchase_orders (
  id uuid primary key default gen_random_uuid(),
  number integer not null unique default nextval('public.purchase_orders_number_seq'),
  supplier_id uuid not null references public.suppliers (id) on delete restrict,
  year_id uuid not null references public.academic_years (id) on delete restrict,
  status text not null default 'draft' check (status in ('draft', 'sent', 'partial', 'received', 'closed', 'cancelled')),
  order_date date,
  expected_date date,
  notes text,
  close_note text,
  closed_at timestamptz,
  closed_by_name text,
  created_at timestamptz not null default now(),
  created_by_name text,
  updated_at timestamptz not null default now()
);
alter sequence public.purchase_orders_number_seq owned by public.purchase_orders.number;
create index purchase_orders_supplier on public.purchase_orders (supplier_id);
create index purchase_orders_year on public.purchase_orders (year_id);

create table public.po_items (
  id uuid primary key default gen_random_uuid(),
  po_id uuid not null references public.purchase_orders (id) on delete cascade,
  book_id uuid not null references public.books (id) on delete restrict,
  qty_ordered integer not null default 0 check (qty_ordered >= 0),
  qty_received integer not null default 0 check (qty_received >= 0),
  qty_damaged integer not null default 0 check (qty_damaged >= 0),
  qty_wrong integer not null default 0 check (qty_wrong >= 0),
  qty_returned integer not null default 0 check (qty_returned >= 0),
  shortage_note text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (po_id, book_id)
);
create index po_items_book on public.po_items (book_id);

create table public.po_item_costs (
  po_item_id uuid primary key references public.po_items (id) on delete cascade,
  unit_cost numeric(10, 2) check (unit_cost is null or unit_cost >= 0),
  updated_at timestamptz not null default now()
);

create table public.po_item_allocations (
  id uuid primary key default gen_random_uuid(),
  po_item_id uuid not null references public.po_items (id) on delete cascade,
  institution_year_id uuid references public.institution_years (id) on delete restrict,  -- ריק = רזרבה
  qty integer not null check (qty >= 0),
  unique nulls not distinct (po_item_id, institution_year_id)
);
create index po_item_allocations_iy on public.po_item_allocations (institution_year_id);

create table public.po_receipts (
  id uuid primary key default gen_random_uuid(),
  po_id uuid not null references public.purchase_orders (id) on delete cascade,
  received_at timestamptz not null default now(),
  received_by_name text,
  notes text
);
create index po_receipts_po on public.po_receipts (po_id);

create table public.po_receipt_lines (
  id uuid primary key default gen_random_uuid(),
  receipt_id uuid not null references public.po_receipts (id) on delete cascade,
  po_item_id uuid not null references public.po_items (id) on delete cascade,
  qty_good integer not null default 0 check (qty_good >= 0),
  qty_damaged integer not null default 0 check (qty_damaged >= 0),
  qty_wrong integer not null default 0 check (qty_wrong >= 0)
);
create index po_receipt_lines_receipt on public.po_receipt_lines (receipt_id);
create index po_receipt_lines_item on public.po_receipt_lines (po_item_id);

create table public.po_returns (
  id uuid primary key default gen_random_uuid(),
  po_item_id uuid not null references public.po_items (id) on delete cascade,
  qty integer not null check (qty > 0),
  kind text not null check (kind in ('damaged', 'wrong', 'excess')),
  reason text,
  created_at timestamptz not null default now(),
  created_by_name text
);
create index po_returns_item on public.po_returns (po_item_id);

-- ---------- מלאי ----------
create table public.stock_movements (
  id bigint generated always as identity primary key,
  book_id uuid not null references public.books (id) on delete restrict,
  qty integer not null check (qty <> 0),
  kind text not null check (kind in ('opening', 'adjust', 'receipt', 'supplier_return', 'delivered')),
  po_item_id uuid references public.po_items (id) on delete set null,
  institution_year_id uuid references public.institution_years (id) on delete set null,
  order_id uuid references public.orders (id) on delete set null,
  reason text,
  created_at timestamptz not null default now(),
  created_by_name text
);
create index stock_movements_book on public.stock_movements (book_id);
create index stock_movements_po_item on public.stock_movements (po_item_id);
create index stock_movements_iy on public.stock_movements (institution_year_id);
create index stock_movements_order on public.stock_movements (order_id);

create table public.stock_allocations (
  id uuid primary key default gen_random_uuid(),
  institution_year_id uuid not null references public.institution_years (id) on delete cascade,
  book_id uuid not null references public.books (id) on delete restrict,
  qty integer not null check (qty >= 0),
  updated_at timestamptz not null default now(),
  updated_by_name text,
  unique (institution_year_id, book_id)
);
create index stock_allocations_book on public.stock_allocations (book_id);

create trigger purchase_orders_updated_at before update on public.purchase_orders for each row execute function public.set_updated_at();
create trigger po_items_updated_at before update on public.po_items for each row execute function public.set_updated_at();
create trigger po_item_costs_updated_at before update on public.po_item_costs for each row execute function public.set_updated_at();
create trigger purchase_orders_audit after insert or update or delete on public.purchase_orders
  for each row execute function public.audit_row('הזמנת רכש');

-- ---------- שמירה על הכללים ----------
-- שנה סגורה – גם הזמנות רכש
create or replace function public.guard_closed_year()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  rec jsonb := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
  y uuid;
begin
  if tg_table_name in ('institution_years', 'orders', 'purchase_orders') then
    y := (rec->>'year_id')::uuid;
    if y is null and tg_table_name = 'orders' then
      select iy.year_id into y from public.classes c join public.institution_years iy on iy.id = c.institution_year_id
      where c.id = (rec->>'class_id')::uuid;
    end if;
  elsif tg_table_name = 'classes' then
    select iy.year_id into y from public.institution_years iy where iy.id = (rec->>'institution_year_id')::uuid;
  elsif tg_table_name = 'class_books' then
    select iy.year_id into y from public.classes c join public.institution_years iy on iy.id = c.institution_year_id
    where c.id = (rec->>'class_id')::uuid;
  elsif tg_table_name = 'order_items' then
    select o.year_id into y from public.orders o where o.id = (rec->>'order_id')::uuid;
  end if;
  if y is not null and exists (select 1 from public.academic_years where id = y and status = 'closed') then
    raise exception 'שנת הלימודים סגורה – אי אפשר לשנות אותה (אפשר לפתוח אותה מחדש במסך שנות לימודים)'
      using errcode = '42501';
  end if;
  return coalesce(new, old);
end;
$$;

create or replace function public.po_status_label(s text)
returns text language sql immutable set search_path = '' as $$
  select case s when 'draft' then 'טיוטה' when 'sent' then 'נשלחה' when 'partial' then 'התקבלה חלקית'
    when 'received' then 'התקבלה במלואה' when 'closed' then 'נסגרה' when 'cancelled' then 'בוטלה' else s end;
$$;

-- סטטוס משתנה רק דרך הפונקציות; ספק/שנה לא משתנים
create or replace function public.guard_purchase_orders()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    new.status := 'draft';
    new.created_by_name := public.my_full_name();
    return new;
  end if;
  if new.supplier_id <> old.supplier_id or new.year_id <> old.year_id then
    raise exception 'אי אפשר לשנות ספק או שנה בהזמנת רכש קיימת';
  end if;
  if new.status is distinct from old.status and coalesce(current_setting('app.po_status', true), '') <> 'on' then
    raise exception 'שינוי סטטוס של הזמנת רכש – רק דרך הכפתורים במסך';
  end if;
  return new;
end;
$$;
create trigger purchase_orders_guard before insert or update on public.purchase_orders
  for each row execute function public.guard_purchase_orders();
create trigger purchase_orders_closed_year before insert or update or delete on public.purchase_orders
  for each row execute function public.guard_closed_year();

-- פריטים וחלוקה: רק בהזמנה פתוחה; ספר חדש רק בטיוטה; מונים רק מהפונקציות
create or replace function public.guard_po_items()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  st text;
begin
  select status into st from public.purchase_orders where id = coalesce(new.po_id, old.po_id);
  if auth.uid() is null or coalesce(current_setting('app.po_internal', true), '') = 'on' then
    return coalesce(new, old);
  end if;
  if tg_op = 'INSERT' and st not in ('draft', 'sent') then
    raise exception 'אפשר להוסיף ספר רק להזמנת רכש בטיוטה או שנשלחה';
  end if;
  if tg_op = 'DELETE' then
    if old.qty_received > 0 or old.qty_damaged > 0 or old.qty_wrong > 0 then
      raise exception 'אי אפשר למחוק ספר שכבר נקלט';
    end if;
    if st not in ('draft', 'sent') then raise exception 'אפשר למחוק ספר רק מהזמנה בטיוטה או שנשלחה'; end if;
    return old;
  end if;
  if st in ('closed', 'cancelled') then raise exception 'הזמנת הרכש סגורה'; end if;
  if tg_op = 'UPDATE' then
    -- המונים מתעדכנים רק מהקליטה/ההחזרות
    new.qty_ordered := old.qty_ordered;
    new.qty_received := old.qty_received;
    new.qty_damaged := old.qty_damaged;
    new.qty_wrong := old.qty_wrong;
    new.qty_returned := old.qty_returned;
    new.book_id := old.book_id;
    new.po_id := old.po_id;
  end if;
  return new;
end;
$$;
create trigger po_items_guard before insert or update or delete on public.po_items
  for each row execute function public.guard_po_items();

create or replace function public.guard_po_allocations()
returns trigger language plpgsql security definer set search_path = '' as $$
declare st text;
begin
  select po.status into st from public.po_items i join public.purchase_orders po on po.id = i.po_id
  where i.id = coalesce(new.po_item_id, old.po_item_id);
  if st in ('closed', 'cancelled') and coalesce(current_setting('app.po_internal', true), '') <> 'on' then
    raise exception 'הזמנת הרכש סגורה – אי אפשר לשנות את החלוקה';
  end if;
  return coalesce(new, old);
end;
$$;
create trigger po_item_allocations_guard before insert or update or delete on public.po_item_allocations
  for each row execute function public.guard_po_allocations();

-- כמות מוזמנת = סכום החלוקה
create or replace function public.sync_po_item_qty()
returns trigger language plpgsql security definer set search_path = '' as $$
declare iid uuid := coalesce(new.po_item_id, old.po_item_id);
begin
  perform set_config('app.po_internal', 'on', true);
  update public.po_items
     set qty_ordered = coalesce((select sum(qty) from public.po_item_allocations where po_item_id = iid), 0)
   where id = iid;
  perform set_config('app.po_internal', 'off', true);
  return null;
end;
$$;
create trigger po_item_allocations_sync after insert or update or delete on public.po_item_allocations
  for each row execute function public.sync_po_item_qty();

revoke all on function public.guard_purchase_orders() from public, anon, authenticated;
revoke all on function public.guard_po_items() from public, anon, authenticated;
revoke all on function public.guard_po_allocations() from public, anon, authenticated;
revoke all on function public.sync_po_item_qty() from public, anon, authenticated;

-- ---------- עזר: מלאי ----------
create or replace function public.book_on_hand(p_book uuid)
returns integer language sql stable security definer set search_path = '' as $$
  select coalesce(sum(qty), 0)::integer from public.stock_movements where book_id = p_book;
$$;
create or replace function public.book_allocated(p_book uuid)
returns integer language sql stable security definer set search_path = '' as $$
  select coalesce(sum(qty), 0)::integer from public.stock_allocations where book_id = p_book;
$$;
revoke all on function public.book_on_hand(uuid) from public, anon, authenticated;
revoke all on function public.book_allocated(uuid) from public, anon, authenticated;

-- =====================================================================
-- פעולות
-- =====================================================================

-- יצירת הזמנת רכש (טיוטה).
-- p_items: [{"book_id": "...", "unit_cost": 12.5, "allocations": [{"institution_year_id": "..." | null, "qty": 10}]}]
create or replace function public.create_purchase_order(
  p_supplier uuid, p_year uuid, p_items jsonb, p_notes text default null, p_expected date default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  new_po uuid;
  it jsonb;
  item_id uuid;
  n_books integer := 0;
  n_units integer := 0;
begin
  perform public.require_permission('po_manage');
  if coalesce(jsonb_array_length(p_items), 0) = 0 then raise exception 'אין ספרים בהזמנת הרכש'; end if;

  insert into public.purchase_orders (supplier_id, year_id, notes, expected_date)
  values (p_supplier, p_year, nullif(trim(coalesce(p_notes, '')), ''), p_expected)
  returning id into new_po;

  for it in select * from jsonb_array_elements(p_items) loop
    if coalesce((select sum((a->>'qty')::integer) from jsonb_array_elements(it->'allocations') a), 0) <= 0 then
      continue;
    end if;
    insert into public.po_items (po_id, book_id) values (new_po, (it->>'book_id')::uuid) returning id into item_id;
    insert into public.po_item_allocations (po_item_id, institution_year_id, qty)
    select item_id, nullif(a->>'institution_year_id', '')::uuid, sum((a->>'qty')::integer)
    from jsonb_array_elements(it->'allocations') a
    where (a->>'qty')::integer > 0
    group by nullif(a->>'institution_year_id', '')::uuid;
    -- מחיר קנייה: מהבקשה (רק למי שרואה מחירים) או מהקטלוג
    insert into public.po_item_costs (po_item_id, unit_cost)
    values (item_id, coalesce(
      case when public.has_permission('books_view_cost') then (it->>'unit_cost')::numeric end,
      (select bs.purchase_price from public.book_suppliers bs where bs.book_id = (it->>'book_id')::uuid and bs.supplier_id = p_supplier)));
    n_books := n_books + 1;
  end loop;
  if n_books = 0 then raise exception 'אין כמויות להזמנה'; end if;
  select coalesce(sum(qty_ordered), 0) into n_units from public.po_items where po_id = new_po;

  insert into public.audit_logs (action, entity, entity_id, description)
  values ('create', 'purchase_orders', new_po::text,
          format('נוצרה הזמנת רכש %s לספק "%s": %s ספרים, %s יחידות',
                 (select number from public.purchase_orders where id = new_po),
                 (select name from public.suppliers where id = p_supplier), n_books, n_units));
  return new_po;
end;
$$;

-- שינוי סטטוס: sent / draft / cancelled / closed / reopen
create or replace function public.set_po_status(p_po uuid, p_status text, p_note text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare
  po public.purchase_orders%rowtype;
  any_received boolean;
  unresolved text;
  target text := p_status;
begin
  select * into po from public.purchase_orders where id = p_po;
  if po.id is null then raise exception 'הזמנת הרכש לא נמצאה'; end if;
  select exists (select 1 from public.po_items where po_id = p_po and (qty_received + qty_damaged + qty_wrong) > 0)
    into any_received;

  if p_status = 'sent' then
    perform public.require_permission('po_manage');
    if po.status <> 'draft' then raise exception 'רק טיוטה נשלחת'; end if;
    if not exists (select 1 from public.po_items where po_id = p_po and qty_ordered > 0) then
      raise exception 'אין כמויות בהזמנה';
    end if;
  elsif p_status = 'draft' then
    perform public.require_permission('po_manage');
    if po.status <> 'sent' or any_received then raise exception 'אפשר להחזיר לטיוטה רק הזמנה שנשלחה ועוד לא נקלטה'; end if;
  elsif p_status = 'cancelled' then
    perform public.require_permission('po_manage');
    if any_received then raise exception 'אי אפשר לבטל הזמנה שכבר נקלטה בה סחורה – אפשר לסגור אותה'; end if;
    if po.status in ('closed', 'cancelled') then raise exception 'ההזמנה כבר סגורה'; end if;
  elsif p_status = 'closed' then
    perform public.require_permission('po_close');
    if po.status not in ('sent', 'partial', 'received') then raise exception 'אפשר לסגור רק הזמנה שנשלחה'; end if;
    select string_agg(b.name || ' (חסר ' || (i.qty_ordered - i.qty_received) || ')', ', ')
      into unresolved
    from public.po_items i join public.books b on b.id = i.book_id
    where i.po_id = p_po and i.qty_received < i.qty_ordered and i.shortage_note is null;
    if unresolved is not null then
      if nullif(trim(coalesce(p_note, '')), '') is null then
        raise exception 'יש חוסרים פתוחים: %. יש לרשום איך מטפלים בחוסר (למשל: יוזמן בסבב הבא / הספק לא יספק)', unresolved;
      end if;
      perform set_config('app.po_internal', 'on', true);
      update public.po_items set shortage_note = trim(p_note)
      where po_id = p_po and qty_received < qty_ordered and shortage_note is null;
      perform set_config('app.po_internal', 'off', true);
    end if;
  elsif p_status = 'reopen' then
    perform public.require_permission('po_close');
    if po.status <> 'closed' then raise exception 'רק הזמנה סגורה נפתחת מחדש'; end if;
    target := case
      when not any_received then 'sent'
      when exists (select 1 from public.po_items where po_id = p_po and qty_received < qty_ordered) then 'partial'
      else 'received' end;
  else
    raise exception 'סטטוס לא מוכר';
  end if;

  perform set_config('app.po_status', 'on', true);
  update public.purchase_orders
     set status = target,
         order_date = case when target = 'sent' then coalesce(order_date, public.israel_today()) else order_date end,
         close_note = case when target = 'closed' then nullif(trim(coalesce(p_note, '')), '') else close_note end,
         closed_at = case when target = 'closed' then now() when p_status = 'reopen' then null else closed_at end,
         closed_by_name = case when target = 'closed' then public.my_full_name() when p_status = 'reopen' then null else closed_by_name end
   where id = p_po;
  perform set_config('app.po_status', 'off', true);
end;
$$;

-- קליטת סחורה. p_lines: [{"po_item_id": "...", "good": 80, "damaged": 2, "wrong": 0}]
create or replace function public.receive_po(p_po uuid, p_lines jsonb, p_notes text default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  po public.purchase_orders%rowtype;
  rid uuid;
  ln jsonb;
  g integer; d integer; w integer;
  it public.po_items%rowtype;
  total_good integer := 0;
  summary text := '';
  bname text;
begin
  perform public.require_permission('receiving_do');
  select * into po from public.purchase_orders where id = p_po;
  if po.id is null then raise exception 'הזמנת הרכש לא נמצאה'; end if;
  if po.status not in ('sent', 'partial', 'received') then
    raise exception 'אפשר לקלוט רק להזמנה שנשלחה לספק (מצב נוכחי: %)', public.po_status_label(po.status);
  end if;

  insert into public.po_receipts (po_id, received_by_name, notes)
  values (p_po, public.my_full_name(), nullif(trim(coalesce(p_notes, '')), ''))
  returning id into rid;

  perform set_config('app.po_internal', 'on', true);
  for ln in select * from jsonb_array_elements(p_lines) loop
    g := greatest(coalesce((ln->>'good')::integer, 0), 0);
    d := greatest(coalesce((ln->>'damaged')::integer, 0), 0);
    w := greatest(coalesce((ln->>'wrong')::integer, 0), 0);
    if g + d + w = 0 then continue; end if;
    select * into it from public.po_items where id = (ln->>'po_item_id')::uuid and po_id = p_po;
    if it.id is null then raise exception 'פריט לא שייך להזמנת הרכש'; end if;
    insert into public.po_receipt_lines (receipt_id, po_item_id, qty_good, qty_damaged, qty_wrong)
    values (rid, it.id, g, d, w);
    update public.po_items
       set qty_received = qty_received + g, qty_damaged = qty_damaged + d, qty_wrong = qty_wrong + w
     where id = it.id;
    if g > 0 then
      insert into public.stock_movements (book_id, qty, kind, po_item_id, reason, created_by_name)
      values (it.book_id, g, 'receipt', it.id, format('קליטה מהזמנת רכש %s', po.number), public.my_full_name());
    end if;
    select name into bname from public.books where id = it.book_id;
    summary := summary || case when summary = '' then '' else ', ' end || bname || ' ' || g
               || case when d > 0 then ' (+' || d || ' פגומים)' else '' end
               || case when w > 0 then ' (+' || w || ' שגויים)' else '' end;
    total_good := total_good + g;
  end loop;
  perform set_config('app.po_internal', 'off', true);

  if summary = '' then raise exception 'לא הוזנו כמויות'; end if;

  perform set_config('app.po_status', 'on', true);
  update public.purchase_orders
     set status = case when exists (select 1 from public.po_items where po_id = p_po and qty_received < qty_ordered)
                       then 'partial' else 'received' end
   where id = p_po;
  perform set_config('app.po_status', 'off', true);

  insert into public.audit_logs (action, entity, entity_id, description)
  values ('receive', 'purchase_orders', p_po::text, format('קליטה להזמנת רכש %s: %s', po.number, summary));
  return rid;
end;
$$;

-- החזרה לספק: פגומים / שגויים (לא במלאי) או עודפים (יוצאים מהמלאי)
create or replace function public.return_to_supplier(p_po_item uuid, p_qty integer, p_kind text, p_reason text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare
  it public.po_items%rowtype;
  already integer;
  allowed integer;
  free integer;
begin
  perform public.require_permission('po_manage');
  select * into it from public.po_items where id = p_po_item;
  if it.id is null then raise exception 'הפריט לא נמצא'; end if;
  if p_qty is null or p_qty <= 0 then raise exception 'כמות לא תקינה'; end if;
  select coalesce(sum(qty), 0) into already from public.po_returns where po_item_id = p_po_item and kind = p_kind;
  allowed := case p_kind when 'damaged' then it.qty_damaged when 'wrong' then it.qty_wrong
                         when 'excess' then greatest(it.qty_received - it.qty_ordered, 0) else 0 end - already;
  if p_qty > allowed then raise exception 'אפשר להחזיר עד % יחידות מהסוג הזה', greatest(allowed, 0); end if;
  if p_kind = 'excess' then
    free := public.book_on_hand(it.book_id) - public.book_allocated(it.book_id);
    if p_qty > free then raise exception 'במלאי הפנוי יש רק % יחידות (השאר מוקצה למוסדות)', free; end if;
    insert into public.stock_movements (book_id, qty, kind, po_item_id, reason, created_by_name)
    values (it.book_id, -p_qty, 'supplier_return', it.id, coalesce(nullif(trim(p_reason), ''), 'החזרת עודף לספק'), public.my_full_name());
  end if;
  insert into public.po_returns (po_item_id, qty, kind, reason, created_by_name)
  values (p_po_item, p_qty, p_kind, nullif(trim(coalesce(p_reason, '')), ''), public.my_full_name());
  perform set_config('app.po_internal', 'on', true);
  update public.po_items set qty_returned = qty_returned + p_qty where id = p_po_item;
  perform set_config('app.po_internal', 'off', true);
  insert into public.audit_logs (action, entity, entity_id, description)
  values ('return', 'po_items', p_po_item::text,
          format('הוחזרו לספק %s יחידות (%s) של "%s"', p_qty,
                 case p_kind when 'damaged' then 'פגומים' when 'wrong' then 'שגויים' else 'עודף' end,
                 (select name from public.books where id = it.book_id)));
end;
$$;

-- מלאי פתיחה / תיקון מלאי
create or replace function public.adjust_stock(p_book uuid, p_qty integer, p_kind text, p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
declare on_hand integer;
begin
  perform public.require_permission('inventory_adjust');
  if p_kind not in ('opening', 'adjust') then raise exception 'סוג תנועה לא מוכר'; end if;
  if coalesce(p_qty, 0) = 0 then raise exception 'יש להזין כמות (חיובית להוספה, שלילית להורדה)'; end if;
  if nullif(trim(coalesce(p_reason, '')), '') is null then raise exception 'יש לרשום סיבה'; end if;
  on_hand := public.book_on_hand(p_book);
  if on_hand + p_qty < public.book_allocated(p_book) then
    raise exception 'אחרי התיקון יהיו במלאי % יחידות, אבל % כבר מוקצות למוסדות – יש להקטין הקצאות קודם',
      on_hand + p_qty, public.book_allocated(p_book);
  end if;
  insert into public.stock_movements (book_id, qty, kind, reason, created_by_name)
  values (p_book, p_qty, p_kind, trim(p_reason), public.my_full_name());
  insert into public.audit_logs (action, entity, entity_id, description)
  values ('update', 'stock', p_book::text,
          format('%s מלאי "%s": %s%s (%s)', case p_kind when 'opening' then 'מלאי פתיחה' else 'תיקון' end,
                 (select name from public.books where id = p_book), case when p_qty > 0 then '+' else '' end, p_qty, trim(p_reason)));
end;
$$;

-- הקצאת מלאי למוסד (כמות כוללת למוסד+ספר). סך ההקצאות ≤ המלאי.
create or replace function public.set_allocation(p_iy uuid, p_book uuid, p_qty integer)
returns void language plpgsql security definer set search_path = '' as $$
declare
  on_hand integer;
  others integer;
  old_qty integer;
begin
  perform public.require_permission('inventory_allocate');
  if p_qty is null or p_qty < 0 then raise exception 'כמות לא תקינה'; end if;
  if exists (select 1 from public.institution_years iy join public.academic_years y on y.id = iy.year_id
             where iy.id = p_iy and y.status = 'closed') then
    raise exception 'שנת הלימודים סגורה';
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

-- ---------- דוחות ----------
create or replace function public.require_any_permission(p text[])
returns void language plpgsql stable security definer set search_path = '' as $$
begin
  if not exists (select 1 from unnest(p) x where public.has_permission(x)) then
    raise exception 'אין לך הרשאה לצפייה בנתונים האלה' using errcode = '42501';
  end if;
end;
$$;
revoke all on function public.require_any_permission(text[]) from public, anon, authenticated;

-- מצב מלאי לכל ספר: במלאי, מוקצה, בהזמנות רכש פתוחות, בטיוטות
create or replace function public.stock_levels()
returns table (book_id uuid, on_hand integer, allocated integer, on_order integer, in_draft integer)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.require_any_permission(array['inventory_view', 'po_view', 'receiving_do']);
  return query
  with m as (select sm.book_id bk, sum(sm.qty)::integer q from public.stock_movements sm group by sm.book_id),
       a as (select sa.book_id bk, sum(sa.qty)::integer q from public.stock_allocations sa group by sa.book_id),
       o as (select i.book_id bk,
                    sum(case when po.status in ('sent', 'partial') and i.shortage_note is null
                             then greatest(i.qty_ordered - i.qty_received, 0) else 0 end)::integer open_q,
                    sum(case when po.status = 'draft' then i.qty_ordered else 0 end)::integer draft_q
             from public.po_items i join public.purchase_orders po on po.id = i.po_id group by i.book_id),
       ids as (select m.bk from m union select a.bk from a union select o.bk from o)
  select ids.bk, coalesce(m.q, 0), coalesce(a.q, 0), coalesce(o.open_q, 0), coalesce(o.draft_q, 0)
  from ids left join m on m.bk = ids.bk left join a on a.bk = ids.bk left join o on o.bk = ids.bk;
end;
$$;

-- לכל מוסד+ספר בשנה: נדרש (הזמנות פעילות), הוקצה, הוזמן מספק (כולל טיוטות), ספק לפי רשימת הכיתה
create or replace function public.demand_by_institution(p_year uuid)
returns table (institution_year_id uuid, book_id uuid, supplier_id uuid, demand integer, allocated integer, ordered integer, ordered_draft integer)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.require_any_permission(array['inventory_view', 'po_view', 'receiving_do']);
  return query
  with d as (
    select o.institution_year_id iy, oi.book_id bk, max(cb.supplier_id::text)::uuid sup, sum(oi.qty)::integer q
    from public.order_items oi
    join public.orders o on o.id = oi.order_id
    left join public.class_books cb on cb.id = oi.class_book_id
    where o.year_id = p_year and o.status <> 'cancelled' and oi.status = 'active'
    group by o.institution_year_id, oi.book_id),
  a as (
    select sa.institution_year_id iy, sa.book_id bk, sum(sa.qty)::integer q
    from public.stock_allocations sa join public.institution_years x on x.id = sa.institution_year_id
    where x.year_id = p_year group by sa.institution_year_id, sa.book_id),
  p as (
    select pa.institution_year_id iy, i.book_id bk,
           sum(case when po.status <> 'draft' then pa.qty else 0 end)::integer q,
           sum(case when po.status = 'draft' then pa.qty else 0 end)::integer dq,
           max(po.supplier_id::text)::uuid sup
    from public.po_item_allocations pa
    join public.po_items i on i.id = pa.po_item_id
    join public.purchase_orders po on po.id = i.po_id
    where po.year_id = p_year and po.status <> 'cancelled' and pa.institution_year_id is not null
    group by pa.institution_year_id, i.book_id),
  k as (select d.iy, d.bk from d union select a.iy, a.bk from a union select p.iy, p.bk from p)
  select k.iy, k.bk, coalesce(d.sup, p.sup), coalesce(d.q, 0), coalesce(a.q, 0), coalesce(p.q, 0), coalesce(p.dq, 0)
  from k left join d on d.iy = k.iy and d.bk = k.bk
         left join a on a.iy = k.iy and a.bk = k.bk
         left join p on p.iy = k.iy and p.bk = k.bk;
end;
$$;

revoke all on function public.create_purchase_order(uuid, uuid, jsonb, text, date) from public, anon;
revoke all on function public.set_po_status(uuid, text, text) from public, anon;
revoke all on function public.receive_po(uuid, jsonb, text) from public, anon;
revoke all on function public.return_to_supplier(uuid, integer, text, text) from public, anon;
revoke all on function public.adjust_stock(uuid, integer, text, text) from public, anon;
revoke all on function public.set_allocation(uuid, uuid, integer) from public, anon;
revoke all on function public.stock_levels() from public, anon;
revoke all on function public.demand_by_institution(uuid) from public, anon;
grant execute on function public.create_purchase_order(uuid, uuid, jsonb, text, date) to authenticated;
grant execute on function public.set_po_status(uuid, text, text) to authenticated;
grant execute on function public.receive_po(uuid, jsonb, text) to authenticated;
grant execute on function public.return_to_supplier(uuid, integer, text, text) to authenticated;
grant execute on function public.adjust_stock(uuid, integer, text, text) to authenticated;
grant execute on function public.set_allocation(uuid, uuid, integer) to authenticated;
grant execute on function public.stock_levels() to authenticated;
grant execute on function public.demand_by_institution(uuid) to authenticated;

-- ---------- RLS ----------
alter table public.purchase_orders enable row level security;
alter table public.po_items enable row level security;
alter table public.po_item_costs enable row level security;
alter table public.po_item_allocations enable row level security;
alter table public.po_receipts enable row level security;
alter table public.po_receipt_lines enable row level security;
alter table public.po_returns enable row level security;
alter table public.stock_movements enable row level security;
alter table public.stock_allocations enable row level security;
revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;

-- צפייה: רכש או קליטה. יצירה/סטטוס/קליטה – רק דרך הפונקציות.
create policy purchase_orders_select on public.purchase_orders for select to authenticated
  using ((select public.has_permission('po_view')) or (select public.has_permission('receiving_do')));
create policy purchase_orders_update on public.purchase_orders for update to authenticated
  using ((select public.has_permission('po_manage'))) with check ((select public.has_permission('po_manage')));

create policy po_items_select on public.po_items for select to authenticated
  using ((select public.has_permission('po_view')) or (select public.has_permission('receiving_do')));
create policy po_items_insert on public.po_items for insert to authenticated with check ((select public.has_permission('po_manage')));
create policy po_items_update on public.po_items for update to authenticated
  using ((select public.has_permission('po_manage'))) with check ((select public.has_permission('po_manage')));
create policy po_items_delete on public.po_items for delete to authenticated using ((select public.has_permission('po_manage')));

create policy po_item_costs_select on public.po_item_costs for select to authenticated using ((select public.has_permission('books_view_cost')));
create policy po_item_costs_write on public.po_item_costs for all to authenticated
  using ((select public.has_permission('po_manage')) and (select public.has_permission('books_view_cost')))
  with check ((select public.has_permission('po_manage')) and (select public.has_permission('books_view_cost')));

create policy po_item_allocations_select on public.po_item_allocations for select to authenticated
  using ((select public.has_permission('po_view')) or (select public.has_permission('receiving_do')));
create policy po_item_allocations_write on public.po_item_allocations for all to authenticated
  using ((select public.has_permission('po_manage'))) with check ((select public.has_permission('po_manage')));

create policy po_receipts_select on public.po_receipts for select to authenticated
  using ((select public.has_permission('po_view')) or (select public.has_permission('receiving_do')));
create policy po_receipt_lines_select on public.po_receipt_lines for select to authenticated
  using ((select public.has_permission('po_view')) or (select public.has_permission('receiving_do')));
create policy po_returns_select on public.po_returns for select to authenticated
  using ((select public.has_permission('po_view')));

create policy stock_movements_select on public.stock_movements for select to authenticated
  using ((select public.has_permission('inventory_view')));
create policy stock_allocations_select on public.stock_allocations for select to authenticated
  using ((select public.has_permission('inventory_view')) or (select public.has_permission('po_view')));

-- ---------- הרשאה חדשה: הקצאת מלאי ----------
update public.roles set permissions = permissions || '{"inventory_allocate":"allowed"}'::jsonb where name = 'מנהל' and not is_super;
