-- Allow snack as a first-class shopping / inventory category (간식).

do $$
declare
  r record;
begin
  for r in
    select c.conname, cl.relname
    from pg_constraint c
    join pg_class cl on cl.oid = c.conrelid
    join pg_namespace n on n.oid = cl.relnamespace
    where n.nspname = 'public'
      and cl.relname in ('shopping_items', 'inventory_items')
      and c.contype = 'c'
      and pg_get_constraintdef(c.oid) ilike '%category%'
  loop
    execute format('alter table public.%I drop constraint %I', r.relname, r.conname);
  end loop;
end $$;

alter table public.shopping_items
  add constraint shopping_items_category_check
  check (category in ('food', 'snack', 'household', 'other'));

alter table public.inventory_items
  add constraint inventory_items_category_check
  check (category in ('food', 'snack', 'household', 'other'));
