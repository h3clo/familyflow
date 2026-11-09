-- Family Flow core schema (separate Supabase project from Haze Flow).
-- Apply only after creating a NEW project. Do not run against Haze Flow.

create extension if not exists pgcrypto;

create table if not exists public.households (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 80),
  budget_won integer check (budget_won is null or budget_won >= 0),
  created_at timestamptz not null default now()
);

create table if not exists public.household_members (
  household_id uuid not null references public.households(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  display_name text not null default '' check (char_length(display_name) <= 80),
  role text not null check (role in ('owner','editor','viewer')),
  created_at timestamptz not null default now(),
  primary key (household_id, user_id)
);

create table if not exists public.shopping_lists (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 120),
  status text not null default 'open' check (status in ('open','done','archived')),
  budget_won integer check (budget_won is null or budget_won >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.shopping_items (
  id uuid primary key default gen_random_uuid(),
  list_id uuid not null references public.shopping_lists(id) on delete cascade,
  household_id uuid not null references public.households(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  quantity numeric not null default 1 check (quantity > 0),
  unit text not null default '개' check (char_length(unit) between 1 and 20),
  priority text not null default 'must' check (priority in ('must','nice')),
  category text not null default 'other' check (category in ('food','household','other')),
  estimated_price integer check (estimated_price is null or estimated_price >= 0),
  note text not null default '' check (char_length(note) <= 200),
  checked boolean not null default false,
  checked_at timestamptz,
  inventory_id uuid,
  source_text text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists public.inventory_items (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  location text not null check (location in ('fridge','freezer','pantry','storage')),
  status text not null check (status in ('enough','low','out','unknown')),
  quantity numeric check (quantity is null or quantity > 0),
  unit text check (unit is null or char_length(unit) <= 20),
  category text not null default 'other' check (category in ('food','household','other')),
  note text not null default '' check (char_length(note) <= 200),
  updated_at timestamptz not null default now()
);

-- Future domains (empty shells / placeholders — additive later)
-- health_* tables must use member-scoped RLS and never leak into household shopping selects.

alter table public.households enable row level security;
alter table public.household_members enable row level security;
alter table public.shopping_lists enable row level security;
alter table public.shopping_items enable row level security;
alter table public.inventory_items enable row level security;

create or replace function public.is_household_member(hid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists(
    select 1 from public.household_members m
    where m.household_id = hid and m.user_id = auth.uid()
  );
$$;

create or replace function public.can_edit_household(hid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists(
    select 1 from public.household_members m
    where m.household_id = hid and m.user_id = auth.uid() and m.role in ('owner','editor')
  );
$$;

create policy "members read households" on public.households
  for select to authenticated using (public.is_household_member(id));
create policy "editors update households" on public.households
  for update to authenticated using (public.can_edit_household(id));

create policy "members read membership" on public.household_members
  for select to authenticated using (public.is_household_member(household_id));

create policy "members read lists" on public.shopping_lists
  for select to authenticated using (public.is_household_member(household_id));
create policy "editors write lists" on public.shopping_lists
  for all to authenticated using (public.can_edit_household(household_id))
  with check (public.can_edit_household(household_id));

create policy "members read items" on public.shopping_items
  for select to authenticated using (public.is_household_member(household_id));
create policy "editors write items" on public.shopping_items
  for all to authenticated using (public.can_edit_household(household_id))
  with check (public.can_edit_household(household_id));

create policy "members read inventory" on public.inventory_items
  for select to authenticated using (public.is_household_member(household_id));
create policy "editors write inventory" on public.inventory_items
  for all to authenticated using (public.can_edit_household(household_id))
  with check (public.can_edit_household(household_id));

revoke all on function public.is_household_member(uuid) from public;
revoke all on function public.can_edit_household(uuid) from public;
grant execute on function public.is_household_member(uuid) to authenticated;
grant execute on function public.can_edit_household(uuid) to authenticated;
