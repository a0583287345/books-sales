-- =====================================================================
-- תפקידים, הרשאות, חריגות למשתמש ויומן פעולות
--
-- מצב הרשאה: 'allowed' (מותר) | 'locked' (מוצג חסום) | 'hidden' (מוסתר). חסר = מוסתר.
-- ההרשאה האפקטיבית = חריגת המשתמש, ואם אין – התפקיד.
-- תפקיד is_super ("מנהלת ראשית") – הכול מותר תמיד, לא ניתן למחיקה, ותמיד נשאר לפחות משתמש פעיל אחד בו.
-- מי שאינו is_super: לא יכול לשנות את עצמו / את התפקיד שלו / מנהלת ראשית,
-- ולא יכול להעניק הרשאה שאין לו בעצמו.
-- =====================================================================

-- ---------- טבלאות ----------
create table public.roles (
  id uuid primary key default gen_random_uuid(),
  name text not null unique check (length(trim(name)) > 0),
  description text,
  is_super boolean not null default false,
  permissions jsonb not null default '{}'::jsonb check (jsonb_typeof(permissions) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- רק תפקיד-על אחד
create unique index roles_single_super on public.roles (is_super) where is_super;

create table public.user_profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null check (length(trim(full_name)) > 0),
  role_id uuid not null references public.roles (id) on delete restrict,
  is_active boolean not null default true,
  permission_overrides jsonb not null default '{}'::jsonb check (jsonb_typeof(permission_overrides) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index user_profiles_role_id on public.user_profiles (role_id);

create table public.audit_logs (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  user_id uuid default auth.uid() references auth.users (id) on delete set null,
  user_name text,
  action text not null,           -- create / update / delete / copy / cancel / login ...
  entity text,                    -- שם הטבלה / סוג הרשומה
  entity_id text,
  description text,
  details jsonb
);
create index audit_logs_created_at on public.audit_logs (created_at desc);
create index audit_logs_user_id on public.audit_logs (user_id);
create index audit_logs_entity on public.audit_logs (entity, entity_id);

-- ---------- פונקציות הרשאה ----------
create or replace function public.is_super_user()
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((
    select r.is_super
    from public.user_profiles u join public.roles r on r.id = u.role_id
    where u.id = auth.uid() and u.is_active
  ), false);
$$;

create or replace function public.my_role_id()
returns uuid language sql stable security definer set search_path = '' as $$
  select role_id from public.user_profiles where id = auth.uid() and is_active;
$$;

-- מצב ההרשאה האפקטיבי של המשתמש המחובר
create or replace function public.permission_state(p text)
returns text language sql stable security definer set search_path = '' as $$
  select coalesce((
    select case
             when r.is_super then 'allowed'
             else coalesce(u.permission_overrides ->> p, r.permissions ->> p, 'hidden')
           end
    from public.user_profiles u join public.roles r on r.id = u.role_id
    where u.id = auth.uid() and u.is_active
  ), 'hidden');
$$;

create or replace function public.has_permission(p text)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.permission_state(p) = 'allowed';
$$;

-- כל מה שהדפדפן צריך במכה אחת: פרטי המשתמש + מפת ההרשאות המאוחדת
create or replace function public.my_access()
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'user_id', u.id,
    'full_name', u.full_name,
    'role_id', r.id,
    'role_name', r.name,
    'is_super', r.is_super,
    'permissions', r.permissions || u.permission_overrides
  )
  from public.user_profiles u join public.roles r on r.id = u.role_id
  where u.id = auth.uid() and u.is_active;
$$;

-- מונע הענקת הרשאה שאין למבצע בעצמו
create or replace function public.assert_can_grant(perms jsonb)
returns void language plpgsql stable security definer set search_path = '' as $$
declare k text;
begin
  if auth.uid() is null or public.is_super_user() then return; end if;
  for k in select key from jsonb_each_text(coalesce(perms, '{}'::jsonb)) where value = 'allowed' loop
    if not public.has_permission(k) then
      raise exception 'אין אפשרות להעניק הרשאה שאין לך: %', k using errcode = '42501';
    end if;
  end loop;
end;
$$;

revoke all on function public.is_super_user() from public, anon;
revoke all on function public.my_role_id() from public, anon;
revoke all on function public.permission_state(text) from public, anon;
revoke all on function public.has_permission(text) from public, anon;
revoke all on function public.my_access() from public, anon;
revoke all on function public.assert_can_grant(jsonb) from public, anon;
grant execute on function public.is_super_user() to authenticated;
grant execute on function public.my_role_id() to authenticated;
grant execute on function public.permission_state(text) to authenticated;
grant execute on function public.has_permission(text) to authenticated;
grant execute on function public.my_access() to authenticated;

-- ---------- updated_at ----------
create or replace function public.set_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin new.updated_at = now(); return new; end;
$$;
create trigger roles_updated_at before update on public.roles
  for each row execute function public.set_updated_at();
create trigger user_profiles_updated_at before update on public.user_profiles
  for each row execute function public.set_updated_at();

-- ---------- שמירה על התפקידים ----------
create or replace function public.guard_roles()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'DELETE' then
    if old.is_super then raise exception 'לא ניתן למחוק את תפקיד המנהלת הראשית' using errcode = '42501'; end if;
  end if;

  -- מכאן: רק פעולות של משתמש מחובר (service_role / מיגרציות פטורים)
  if auth.uid() is null then return coalesce(new, old); end if;

  if tg_op = 'INSERT' and new.is_super then
    raise exception 'לא ניתן ליצור תפקיד-על נוסף' using errcode = '42501';
  end if;
  if tg_op = 'UPDATE' and (new.is_super is distinct from old.is_super) then
    raise exception 'לא ניתן לשנות סימון תפקיד-על' using errcode = '42501';
  end if;

  if not public.is_super_user() then
    if tg_op <> 'INSERT' and old.is_super then
      raise exception 'רק המנהלת הראשית יכולה לשנות את התפקיד הזה' using errcode = '42501';
    end if;
    if tg_op <> 'INSERT' and old.id = public.my_role_id() then
      raise exception 'לא ניתן לשנות את התפקיד שלך עצמך' using errcode = '42501';
    end if;
    if tg_op <> 'DELETE' then perform public.assert_can_grant(new.permissions); end if;
  end if;

  return coalesce(new, old);
end;
$$;
create trigger roles_guard before insert or update or delete on public.roles
  for each row execute function public.guard_roles();

-- ---------- שמירה על המשתמשים ----------
create or replace function public.guard_user_profiles()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  old_super boolean := false;
  new_super boolean := false;
begin
  if tg_op <> 'INSERT' then
    select is_super into old_super from public.roles where id = old.role_id;
  end if;
  if tg_op <> 'DELETE' then
    select is_super into new_super from public.roles where id = new.role_id;
  end if;

  -- תמיד נשאר לפחות משתמש פעיל אחד עם תפקיד המנהלת הראשית (גם ל-service_role)
  if tg_op <> 'INSERT' and old_super and old.is_active
     and (tg_op = 'DELETE' or not new_super or not new.is_active) then
    if not exists (
      select 1 from public.user_profiles u join public.roles r on r.id = u.role_id
      where r.is_super and u.is_active and u.id <> old.id
    ) then
      raise exception 'חייבת להישאר לפחות מנהלת ראשית פעילה אחת' using errcode = '42501';
    end if;
  end if;

  if auth.uid() is null or public.is_super_user() then return coalesce(new, old); end if;

  -- מבצע שאינו מנהלת ראשית
  if old_super or new_super then
    raise exception 'רק המנהלת הראשית יכולה לנהל משתמשים בתפקיד הזה' using errcode = '42501';
  end if;
  if tg_op <> 'INSERT' and old.id = auth.uid() then
    raise exception 'לא ניתן לשנות את המשתמש שלך עצמך' using errcode = '42501';
  end if;
  if tg_op <> 'DELETE' then perform public.assert_can_grant(new.permission_overrides); end if;

  return coalesce(new, old);
end;
$$;
create trigger user_profiles_guard before insert or update or delete on public.user_profiles
  for each row execute function public.guard_user_profiles();

-- ---------- יומן: שם המשתמש נקבע בצד המסד ----------
create or replace function public.fill_audit_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is not null then
    new.user_id := auth.uid();
    new.user_name := (select full_name from public.user_profiles where id = auth.uid());
  end if;
  new.created_at := now();
  return new;
end;
$$;
create trigger audit_logs_fill_user before insert on public.audit_logs
  for each row execute function public.fill_audit_user();

revoke all on function public.guard_roles() from public, anon, authenticated;
revoke all on function public.guard_user_profiles() from public, anon, authenticated;
revoke all on function public.fill_audit_user() from public, anon, authenticated;
revoke all on function public.set_updated_at() from public, anon, authenticated;

-- ---------- RLS ----------
revoke all on all tables in schema public from anon;
alter table public.roles enable row level security;
alter table public.user_profiles enable row level security;
alter table public.audit_logs enable row level security;

create policy roles_select on public.roles for select to authenticated
  using (id = (select public.my_role_id())
         or (select public.has_permission('roles_manage'))
         or (select public.has_permission('users_manage')));
create policy roles_insert on public.roles for insert to authenticated
  with check ((select public.has_permission('roles_manage')));
create policy roles_update on public.roles for update to authenticated
  using ((select public.has_permission('roles_manage')))
  with check ((select public.has_permission('roles_manage')));
create policy roles_delete on public.roles for delete to authenticated
  using ((select public.has_permission('roles_manage')));

create policy user_profiles_select on public.user_profiles for select to authenticated
  using (id = (select auth.uid()) or (select public.has_permission('users_manage')));
create policy user_profiles_insert on public.user_profiles for insert to authenticated
  with check ((select public.has_permission('users_manage')));
create policy user_profiles_update on public.user_profiles for update to authenticated
  using ((select public.has_permission('users_manage')))
  with check ((select public.has_permission('users_manage')));
create policy user_profiles_delete on public.user_profiles for delete to authenticated
  using ((select public.has_permission('users_manage')));

create policy audit_logs_select on public.audit_logs for select to authenticated
  using ((select public.has_permission('audit_view')));
create policy audit_logs_insert on public.audit_logs for insert to authenticated
  with check (true);  -- user_id/user_name נקבעים ע"י הטריגר
-- אין update/delete ליומן

-- ---------- תפקידי ברירת מחדל ----------
insert into public.roles (name, description, is_super, permissions) values
  ('מנהלת ראשית', 'גישה מלאה לכל המערכת. לא ניתן להגביל או למחוק.', true, '{}'),
  ('מנהל', 'ניהול המערכת לפי ההרשאות שיוגדרו', false, '{"audit_view": "allowed"}'),
  ('עובד', 'פעולות מחסן: קליטה, ליקוט, שקיות ומשלוחים – לפי ההרשאות שיוגדרו', false, '{}');
