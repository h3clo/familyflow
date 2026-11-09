-- Family Flow S5-A: auth-ready household sharing (SEPARATE Supabase project from Haze Flow).
-- Apply after 202611090001_familyflow_core.sql on a NEW project only.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Profiles (optional display name for auth.users)
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default '' check (char_length(display_name) <= 80),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

drop policy if exists "users read own profile" on public.profiles;
create policy "users read own profile" on public.profiles
  for select to authenticated using (user_id = auth.uid());

drop policy if exists "users upsert own profile" on public.profiles;
create policy "users upsert own profile" on public.profiles
  for all to authenticated using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Invites (join by code; never expose other households)
-- ---------------------------------------------------------------------------
create table if not exists public.household_invites (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  code text not null unique check (char_length(code) between 6 and 32),
  role text not null default 'editor' check (role in ('editor','viewer')),
  created_by uuid not null references auth.users(id) on delete cascade,
  expires_at timestamptz not null default (now() + interval '14 days'),
  max_uses integer not null default 20 check (max_uses > 0),
  used_count integer not null default 0 check (used_count >= 0),
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists household_invites_code_idx on public.household_invites (code);
alter table public.household_invites enable row level security;

-- ---------------------------------------------------------------------------
-- Meals (shared household data — always household_id)
-- ---------------------------------------------------------------------------
create table if not exists public.meal_plans (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  week_start date not null,
  status text not null default 'draft' check (status in ('draft','confirmed')),
  payload jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  unique (household_id, week_start)
);

create table if not exists public.today_dinners (
  household_id uuid primary key references public.households(id) on delete cascade,
  dinner_date date not null,
  title text not null default '',
  protein text,
  payload jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.meal_plans enable row level security;
alter table public.today_dinners enable row level security;

-- ---------------------------------------------------------------------------
-- Membership helpers (security definer; no privilege escalation)
-- ---------------------------------------------------------------------------
create or replace function public.is_household_member(hid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists(
    select 1 from public.household_members m
    where m.household_id = hid and m.user_id = auth.uid()
  );
$$;

create or replace function public.can_edit_household(hid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists(
    select 1 from public.household_members m
    where m.household_id = hid
      and m.user_id = auth.uid()
      and m.role in ('owner','editor')
  );
$$;

create or replace function public.is_household_owner(hid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists(
    select 1 from public.household_members m
    where m.household_id = hid and m.user_id = auth.uid() and m.role = 'owner'
  );
$$;

revoke all on function public.is_household_member(uuid) from public, anon;
revoke all on function public.can_edit_household(uuid) from public, anon;
revoke all on function public.is_household_owner(uuid) from public, anon;
grant execute on function public.is_household_member(uuid) to authenticated;
grant execute on function public.can_edit_household(uuid) to authenticated;
grant execute on function public.is_household_owner(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Atomic household create (caller becomes owner)
-- ---------------------------------------------------------------------------
create or replace function public.create_household(p_name text, p_budget_won integer default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  hid uuid;
  uname text;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  if p_name is null or length(trim(p_name)) < 1 then
    raise exception 'household name required';
  end if;

  insert into public.households (name, budget_won)
  values (trim(p_name), p_budget_won)
  returning id into hid;

  select coalesce(nullif(trim(display_name), ''), '나')
    into uname
  from public.profiles
  where user_id = auth.uid();

  if uname is null then
    uname := '나';
    insert into public.profiles (user_id, display_name)
    values (auth.uid(), uname)
    on conflict (user_id) do nothing;
  end if;

  insert into public.household_members (household_id, user_id, display_name, role)
  values (hid, auth.uid(), uname, 'owner');

  return hid;
end;
$$;

revoke all on function public.create_household(text, integer) from public, anon;
grant execute on function public.create_household(text, integer) to authenticated;

-- ---------------------------------------------------------------------------
-- Invite create / accept
-- ---------------------------------------------------------------------------
create or replace function public.create_household_invite(
  p_household_id uuid,
  p_role text default 'editor',
  p_days integer default 14
)
returns table (invite_id uuid, code text, expires_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code text;
  v_id uuid;
  v_exp timestamptz;
  v_role text;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  if not public.is_household_owner(p_household_id) and not public.can_edit_household(p_household_id) then
    raise exception 'not allowed';
  end if;
  v_role := case when p_role in ('editor','viewer') then p_role else 'editor' end;
  v_code := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));
  v_exp := now() + make_interval(days => greatest(1, least(coalesce(p_days, 14), 60)));

  insert into public.household_invites (household_id, code, role, created_by, expires_at)
  values (p_household_id, v_code, v_role, auth.uid(), v_exp)
  returning id into v_id;

  -- Assign OUT columns explicitly (avoids RETURNS TABLE vs RETURNING expires_at ambiguity).
  invite_id := v_id;
  code := v_code;
  expires_at := v_exp;
  return next;
end;
$$;

revoke all on function public.create_household_invite(uuid, text, integer) from public, anon;
grant execute on function public.create_household_invite(uuid, text, integer) to authenticated;

create or replace function public.accept_household_invite(p_code text, p_display_name text default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  inv public.household_invites%rowtype;
  uname text;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  select * into inv
  from public.household_invites
  where code = upper(trim(p_code))
  for update;

  if not found then
    raise exception 'invite not found';
  end if;
  if inv.revoked_at is not null then
    raise exception 'invite revoked';
  end if;
  if inv.expires_at < now() then
    raise exception 'invite expired';
  end if;
  if inv.used_count >= inv.max_uses then
    raise exception 'invite exhausted';
  end if;

  uname := coalesce(nullif(trim(p_display_name), ''), '가족');
  insert into public.profiles (user_id, display_name)
  values (auth.uid(), uname)
  on conflict (user_id) do update
    set display_name = excluded.display_name,
        updated_at = now();

  insert into public.household_members (household_id, user_id, display_name, role)
  values (inv.household_id, auth.uid(), uname, inv.role)
  on conflict (household_id, user_id) do nothing;

  update public.household_invites
    set used_count = used_count + 1
  where id = inv.id;

  return inv.household_id;
end;
$$;

revoke all on function public.accept_household_invite(text, text) from public, anon;
grant execute on function public.accept_household_invite(text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- RLS policies (drop+recreate for idempotent apply)
-- ---------------------------------------------------------------------------

-- households
drop policy if exists "members read households" on public.households;
drop policy if exists "editors update households" on public.households;
create policy "members read households" on public.households
  for select to authenticated using (public.is_household_member(id));
create policy "editors update households" on public.households
  for update to authenticated
  using (public.can_edit_household(id))
  with check (public.can_edit_household(id));
-- No direct INSERT/DELETE for clients — use create_household() RPC.

-- household_members
drop policy if exists "members read membership" on public.household_members;
drop policy if exists "owners manage membership" on public.household_members;
create policy "members read membership" on public.household_members
  for select to authenticated using (public.is_household_member(household_id));
create policy "owners manage membership" on public.household_members
  for all to authenticated
  using (public.is_household_owner(household_id))
  with check (public.is_household_owner(household_id));

-- invites: members can read own household invites; mutations via RPC
drop policy if exists "members read invites" on public.household_invites;
create policy "members read invites" on public.household_invites
  for select to authenticated using (public.is_household_member(household_id));

-- shopping / inventory (from core) — reinforce
drop policy if exists "members read lists" on public.shopping_lists;
drop policy if exists "editors write lists" on public.shopping_lists;
create policy "members read lists" on public.shopping_lists
  for select to authenticated using (public.is_household_member(household_id));
create policy "editors write lists" on public.shopping_lists
  for all to authenticated
  using (public.can_edit_household(household_id))
  with check (public.can_edit_household(household_id));

drop policy if exists "members read items" on public.shopping_items;
drop policy if exists "editors write items" on public.shopping_items;
create policy "members read items" on public.shopping_items
  for select to authenticated using (public.is_household_member(household_id));
create policy "editors write items" on public.shopping_items
  for all to authenticated
  using (public.can_edit_household(household_id))
  with check (public.can_edit_household(household_id));

drop policy if exists "members read inventory" on public.inventory_items;
drop policy if exists "editors write inventory" on public.inventory_items;
create policy "members read inventory" on public.inventory_items
  for select to authenticated using (public.is_household_member(household_id));
create policy "editors write inventory" on public.inventory_items
  for all to authenticated
  using (public.can_edit_household(household_id))
  with check (public.can_edit_household(household_id));

drop policy if exists "members read meal plans" on public.meal_plans;
drop policy if exists "editors write meal plans" on public.meal_plans;
create policy "members read meal plans" on public.meal_plans
  for select to authenticated using (public.is_household_member(household_id));
create policy "editors write meal plans" on public.meal_plans
  for all to authenticated
  using (public.can_edit_household(household_id))
  with check (public.can_edit_household(household_id));

drop policy if exists "members read today dinners" on public.today_dinners;
drop policy if exists "editors write today dinners" on public.today_dinners;
create policy "members read today dinners" on public.today_dinners
  for select to authenticated using (public.is_household_member(household_id));
create policy "editors write today dinners" on public.today_dinners
  for all to authenticated
  using (public.can_edit_household(household_id))
  with check (public.can_edit_household(household_id));
