-- Family Flow: server-side AI call quota (Groq via Edge Function).
-- No health/finance data. Family Flow project only.

create table if not exists public.ai_usage_events (
  id bigserial primary key,
  household_id uuid not null references public.households(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null default 'groq' check (char_length(provider) <= 32),
  model text not null default '' check (char_length(model) <= 80),
  created_at timestamptz not null default now()
);

create index if not exists ai_usage_events_hh_created_idx
  on public.ai_usage_events (household_id, created_at desc);

alter table public.ai_usage_events enable row level security;

drop policy if exists "members read ai usage" on public.ai_usage_events;
create policy "members read ai usage" on public.ai_usage_events
  for select to authenticated using (public.is_household_member(household_id));

-- Inserts only via claim_ai_quota RPC (security definer).
revoke insert, update, delete on public.ai_usage_events from authenticated, anon, public;

create or replace function public.claim_ai_quota(
  p_household_id uuid,
  p_provider text default 'groq',
  p_model text default '',
  p_rpm integer default 20,
  p_rpd integer default 200
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_min int;
  v_day int;
  v_rpm int := greatest(1, least(coalesce(p_rpm, 20), 30));
  v_rpd int := greatest(1, least(coalesce(p_rpd, 200), 1000));
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  if p_household_id is null then
    raise exception 'household required';
  end if;
  if not public.can_edit_household(p_household_id) then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  select count(*)::int into v_min
  from public.ai_usage_events
  where household_id = p_household_id
    and created_at > now() - interval '1 minute';

  if v_min >= v_rpm then
    return jsonb_build_object(
      'ok', false,
      'reason', 'rpm',
      'limit', v_rpm,
      'used', v_min,
      'retryAfterSec', 60
    );
  end if;

  select count(*)::int into v_day
  from public.ai_usage_events
  where household_id = p_household_id
    and created_at > now() - interval '1 day';

  if v_day >= v_rpd then
    return jsonb_build_object(
      'ok', false,
      'reason', 'rpd',
      'limit', v_rpd,
      'used', v_day,
      'retryAfterSec', null
    );
  end if;

  insert into public.ai_usage_events (household_id, user_id, provider, model)
  values (
    p_household_id,
    v_uid,
    coalesce(nullif(trim(p_provider), ''), 'groq'),
    left(coalesce(p_model, ''), 80)
  );

  return jsonb_build_object(
    'ok', true,
    'usedMinute', v_min + 1,
    'usedDay', v_day + 1,
    'limitRpm', v_rpm,
    'limitRpd', v_rpd
  );
end;
$$;

revoke all on function public.claim_ai_quota(uuid, text, text, integer, integer) from public, anon;
grant execute on function public.claim_ai_quota(uuid, text, text, integer, integer) to authenticated;
