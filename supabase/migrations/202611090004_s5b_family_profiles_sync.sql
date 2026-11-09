-- Family Flow S5-B: family member profiles (not Auth users) + realtime publication.
-- No health or finance columns. Apply only to Family Flow project.

create table if not exists public.family_profiles (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 80),
  role_label text not null default '구성원'
    check (role_label in ('관리자','엄마','아빠','자녀','구성원')),
  sort_order integer not null default 0,
  note text not null default '' check (char_length(note) <= 120),
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists family_profiles_household_idx
  on public.family_profiles (household_id, sort_order);

alter table public.family_profiles enable row level security;

drop policy if exists "members read family profiles" on public.family_profiles;
create policy "members read family profiles" on public.family_profiles
  for select to authenticated using (public.is_household_member(household_id));

drop policy if exists "editors write family profiles" on public.family_profiles;
create policy "editors write family profiles" on public.family_profiles
  for all to authenticated
  using (public.can_edit_household(household_id))
  with check (public.can_edit_household(household_id));

-- Realtime for multi-device sync (shopping / inventory / meals / profiles)
do $$
begin
  begin
    alter publication supabase_realtime add table public.shopping_lists;
  exception when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.shopping_items;
  exception when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.inventory_items;
  exception when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.meal_plans;
  exception when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.today_dinners;
  exception when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.family_profiles;
  exception when duplicate_object then null;
  end;
end $$;
