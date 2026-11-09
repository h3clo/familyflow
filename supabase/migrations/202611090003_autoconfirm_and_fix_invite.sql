-- Local/dev: auto-confirm email on signup (no SMTP required).
-- Safe for Family Flow private project; revisit when custom SMTP is enabled.

create or replace function public.ff_autoconfirm_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.email is not null and new.email_confirmed_at is null then
    new.email_confirmed_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists ff_autoconfirm_user on auth.users;
create trigger ff_autoconfirm_user
  before insert on auth.users
  for each row execute function public.ff_autoconfirm_user();

revoke all on function public.ff_autoconfirm_user() from public, anon, authenticated;

-- Fix ambiguous expires_at in create_household_invite
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

  invite_id := v_id;
  code := v_code;
  expires_at := v_exp;
  return next;
end;
$$;

revoke all on function public.create_household_invite(uuid, text, integer) from public, anon;
grant execute on function public.create_household_invite(uuid, text, integer) to authenticated;
