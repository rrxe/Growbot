alter table public.purchases
  add column if not exists invoice_payload text unique;

alter table public.purchases
  add column if not exists stars_amount bigint;

create table if not exists public.ad_sessions (
  id uuid primary key default gen_random_uuid(),

  user_id uuid not null references public.users(id) on delete cascade,

  telegram_id bigint not null,

  block_id text not null,

  day_key date not null default current_date,

  status text not null default 'pending',

  started_at timestamptz not null default now(),

  rewarded_at timestamptz,

  reward_points integer not null default 10,

  check (status in ('pending', 'rewarded', 'expired')),
  check (reward_points > 0)
);

create index if not exists idx_ad_sessions_user_day
on public.ad_sessions(
  user_id,
  day_key
);

create index if not exists idx_ad_sessions_pending
on public.ad_sessions(
  telegram_id,
  block_id,
  status,
  started_at
);


insert into public.app_settings(key, value)
values
  ('adsgram_block_id', '43643'),
  ('ads_daily_limit', '10'),
  ('ads_reward_points', '10'),
  ('stars_per_500_points', '50')
on conflict (key)
do update set value = excluded.value;


create or replace function public.start_ad_session(
  p_user_id uuid,
  p_telegram_id bigint,
  p_block_id text,
  p_daily_limit integer,
  p_reward_points integer
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
  v_session public.ad_sessions%rowtype;
begin
  select count(*)
  into v_count
  from public.ad_sessions
  where user_id = p_user_id
    and day_key = current_date
    and status = 'rewarded';

  if v_count >= p_daily_limit then
    raise exception 'AD_DAILY_LIMIT';
  end if;

  if exists (
    select 1
    from public.ad_sessions
    where user_id = p_user_id
      and day_key = current_date
      and status = 'pending'
      and started_at > now() - interval '15 minutes'
  ) then
    raise exception 'AD_SESSION_EXISTS';
  end if;

  insert into public.ad_sessions (
    user_id,
    telegram_id,
    block_id,
    day_key,
    status,
    reward_points
  )
  values (
    p_user_id,
    p_telegram_id,
    p_block_id,
    current_date,
    'pending',
    p_reward_points
  )
  returning *
  into v_session;

  return jsonb_build_object(
    'id',
    v_session.id
  );
end;
$$;


create or replace function public.reward_adsgram_session(
  p_telegram_id bigint,
  p_block_id text,
  p_daily_limit integer
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_session public.ad_sessions%rowtype;
  v_balance bigint;
  v_count integer;
begin
  select *
  into v_session
  from public.ad_sessions
  where telegram_id = p_telegram_id
    and block_id = p_block_id
    and day_key = current_date
    and status = 'pending'
    and started_at > now() - interval '15 minutes'
  order by started_at desc
  limit 1
  for update;

  if not found then
    raise exception 'NO_PENDING_AD';
  end if;

  update public.ad_sessions
  set
    status = 'rewarded',
    rewarded_at = now()
  where id = v_session.id;

  select public.adjust_user_points(
    v_session.user_id,
    v_session.reward_points,
    'purchase',
    v_session.id,
    'مكافأة مشاهدة إعلان AdsGram'
  )
  into v_balance;

  select count(*)
  into v_count
  from public.ad_sessions
  where user_id = v_session.user_id
    and day_key = current_date
    and status = 'rewarded';

  return jsonb_build_object(
    'rewarded',
    true,
    'points',
    v_session.reward_points,
    'balance',
    v_balance,
    'watched',
    v_count,
    'remaining',
    greatest(
      0,
      p_daily_limit - v_count
    )
  );
end;
$$;


create or replace function public.complete_star_purchase(
  p_invoice_payload text,
  p_telegram_id bigint,
  p_total_stars bigint,
  p_charge_id text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_purchase public.purchases%rowtype;
  v_user public.users%rowtype;
  v_balance bigint;
begin
  select *
  into v_purchase
  from public.purchases
  where invoice_payload = p_invoice_payload
  for update;

  if not found then
    raise exception 'PURCHASE_NOT_FOUND';
  end if;

  if v_purchase.status = 'completed' then
    return jsonb_build_object(
      'completed',
      true
    );
  end if;

  select *
  into v_user
  from public.users
  where id = v_purchase.user_id
  for update;

  if not found then
    raise exception 'USER_NOT_FOUND';
  end if;

  if v_user.telegram_id <> p_telegram_id then
    raise exception 'PAYMENT_USER_MISMATCH';
  end if;

  if v_purchase.stars_amount <> p_total_stars then
    raise exception 'PAYMENT_AMOUNT_MISMATCH';
  end if;

  select public.adjust_user_points(
    v_purchase.user_id,
    v_purchase.points_amount,
    'purchase',
    v_purchase.id,
    'شراء نقاط عبر Telegram Stars'
  )
  into v_balance;

  update public.purchases
  set
    status = 'completed',
    provider = 'telegram_stars',
    provider_payment_id = p_charge_id,
    completed_at = now()
  where id = v_purchase.id;

  return jsonb_build_object(
    'completed',
    true,
    'points',
    v_purchase.points_amount,
    'balance',
    v_balance
  );
end;
$$;
