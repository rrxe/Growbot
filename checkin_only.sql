create table if not exists public.daily_checkins (
  id uuid primary key default gen_random_uuid(),

  user_id uuid not null references public.users(id) on delete cascade,

  day_key date not null default current_date,

  reward_points integer not null default 100,

  created_at timestamptz not null default now(),

  unique (user_id, day_key)
);

create index if not exists idx_daily_checkins_user_day
on public.daily_checkins(
  user_id,
  day_key
);

insert into public.app_settings(key, value)
values
  ('daily_checkin_points', '100')
on conflict (key)
do update set value = excluded.value;

create or replace function public.claim_daily_checkin(
  p_user_id uuid,
  p_reward_points integer
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_balance bigint;
  v_checkin public.daily_checkins%rowtype;
begin
  if exists (
    select 1
    from public.daily_checkins
    where user_id = p_user_id
      and day_key = current_date
  ) then
    raise exception 'ALREADY_CHECKED_IN';
  end if;

  insert into public.daily_checkins (
    user_id,
    day_key,
    reward_points
  )
  values (
    p_user_id,
    current_date,
    p_reward_points
  )
  returning *
  into v_checkin;

  select public.adjust_user_points(
    p_user_id,
    p_reward_points,
    'purchase',
    v_checkin.id,
    'مكافأة تسجيل الدخول اليومي'
  )
  into v_balance;

  return jsonb_build_object(
    'checkedIn',
    true,
    'points',
    p_reward_points,
    'balance',
    v_balance
  );
end;
$$;

create or replace function public.get_daily_checkin_status(
  p_user_id uuid
)
returns jsonb
language sql
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'checkedInToday',
    exists (
      select 1
      from public.daily_checkins
      where user_id = p_user_id
        and day_key = current_date
    )
  );
$$;

notify pgrst, 'reload schema';
