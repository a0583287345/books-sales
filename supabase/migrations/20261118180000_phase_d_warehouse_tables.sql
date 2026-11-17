-- =====================================================================
-- שלב ד׳: ליקוט, שקיות, מדבקות, משלוחים למוסד ומסירה
--  - שקית שייכת להזמנה; bag_items = כמה מכל פריט נארז. קוד ייחודי (QR) = "<מס' הזמנה>-<מס' שקית>"
--  - אורזים רק ממלאי שהוקצה למוסד: ארוז-ולא-נמסר ≤ הקצאה (מוסד+ספר)
--  - מסירה: תנועת מלאי delivered (−) + הקטנת ההקצאה; סטטוס ההזמנה מתעדכן אוטומטית
--  - משלוח למוסד (יום מכירה): institution_deliveries + שיוך שקיות
--  - הכול דרך פונקציות (security definer + בדיקת הרשאה) – גם לעובד בלי הרשאה להזמנות/לקוחות
-- =====================================================================

create sequence public.institution_deliveries_number_seq start 801;
create table public.institution_deliveries (
  id uuid primary key default gen_random_uuid(),
  number integer not null unique default nextval('public.institution_deliveries_number_seq'),
  institution_year_id uuid not null references public.institution_years (id) on delete restrict,
  delivery_date date,
  carrier text,
  cost numeric(10, 2) check (cost is null or cost >= 0),
  paid_by text,
  boxes_count integer check (boxes_count is null or boxes_count >= 0),
  status text not null default 'planned' check (status in ('planned', 'sent', 'delivered', 'cancelled')),
  receiver_name text,
  delivered_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  created_by_name text,
  updated_at timestamptz not null default now()
);
alter sequence public.institution_deliveries_number_seq owned by public.institution_deliveries.number;
create index institution_deliveries_iy on public.institution_deliveries (institution_year_id);

create table public.bags (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete cascade,
  bag_no integer not null,
  code text not null unique,
  status text not null default 'picking' check (status in ('picking', 'picked', 'checked', 'ready', 'delivered', 'cancelled')),
  is_partial boolean not null default false,
  delivery_id uuid references public.institution_deliveries (id) on delete set null,
  notes text,
  created_at timestamptz not null default now(),
  created_by_name text,
  picked_at timestamptz, picked_by_name text,
  checked_at timestamptz, checked_by_name text,
  ready_at timestamptz, ready_by_name text,
  delivered_at timestamptz, delivered_by_name text,
  received_by text,
  label_printed_at timestamptz,
  updated_at timestamptz not null default now(),
  unique (order_id, bag_no)
);
create index bags_delivery on public.bags (delivery_id);
create index bags_status on public.bags (status);

create table public.bag_items (
  id uuid primary key default gen_random_uuid(),
  bag_id uuid not null references public.bags (id) on delete cascade,
  order_item_id uuid not null references public.order_items (id) on delete restrict,
  qty integer not null check (qty > 0),
  unique (bag_id, order_item_id)
);
create index bag_items_order_item on public.bag_items (order_item_id);

create trigger institution_deliveries_updated_at before update on public.institution_deliveries for each row execute function public.set_updated_at();
create trigger bags_updated_at before update on public.bags for each row execute function public.set_updated_at();


alter table public.institution_deliveries enable row level security;
alter table public.bags enable row level security;
alter table public.bag_items enable row level security;

create policy institution_deliveries_select on public.institution_deliveries for select to authenticated
  using ((select public.has_permission('shipments_view')) or (select public.has_permission('shipments_manage')) or (select public.has_permission('pickups_do')));
create policy bags_select on public.bags for select to authenticated
  using ((select public.has_permission('picking_do')) or (select public.has_permission('bags_check'))
      or (select public.has_permission('pickups_do')) or (select public.has_permission('labels_print'))
      or (select public.has_permission('shipments_view')) or (select public.has_permission('orders_view')));
create policy bag_items_select on public.bag_items for select to authenticated
  using ((select public.has_permission('picking_do')) or (select public.has_permission('bags_check'))
      or (select public.has_permission('pickups_do')) or (select public.has_permission('labels_print'))
      or (select public.has_permission('shipments_view')) or (select public.has_permission('orders_view')));
