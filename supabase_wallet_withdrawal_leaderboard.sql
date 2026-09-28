-- =========================================================
-- Growbot / Stormy - Coins + USDT + Gram withdrawals + weekly leaderboard
-- Additive migration. Run AFTER the existing Growbot SQL migrations.
-- =========================================================

-- ---------------------------------------------------------
-- 1) User wallet columns
-- ---------------------------------------------------------
alter table public.users
  add column if not exists coins bigint not null default 0,
  add column if not exists usdt_balance numeric(20,6) not null default 0,
  add column if not exists gram_address text,
  add column if not exists withdrawal_ads_watched integer not null default 0,
  add column if not exists withdrawal_ads_date date;

-- Defensive normalization for installs that may already contain nulls.
update public.users
set coins = coalesce(coins, 0),
    usdt_balance = coalesce(usdt_balance, 0),
    withdrawal_ads_watched = greatest(0, coalesce(withdrawal_ads_watched, 0));

-- ---------------------------------------------------------
-- 2) Wallet / coin audit tables
-- ---------------------------------------------------------
create table if not exists public.coin_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  amount bigint not null,
  balance_after bigint not null,
  transaction_type text not null,
  reference_id uuid,
  description text,
  created_at timestamptz not null default now()
);

create index if not exists idx_coin_transactions_user_created
on public.coin_transactions(user_id, created_at desc);

create table if not exists public.wallet_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  transaction_type text not null,
  coins_amount bigint,
  usdt_amount numeric(20,6),
  balance_after_coins bigint,
  balance_after_usdt numeric(20,6),
  reference_id uuid,
  description text,
  created_at timestamptz not null default now()
);

create index if not exists idx_wallet_transactions_user_created
on public.wallet_transactions(user_id, created_at desc);

-- ---------------------------------------------------------
-- 3) Weekly task leaderboard
--    A new week starts automatically every Friday, Baghdad time.
--    No destructive reset is needed.
-- ---------------------------------------------------------
create table if not exists public.weekly_task_leaderboard (
  id uuid primary key default gen_random_uuid(),
  week_start date not null,
  user_id uuid not null references public.users(id) on delete cascade,
  telegram_id bigint not null,
  username text,
  first_name text,
  task_count integer not null default 0,
  updated_at timestamptz not null default now(),
  unique (week_start, user_id)
);

create index if not exists idx_weekly_task_leaderboard_week_count
on public.weekly_task_leaderboard(week_start, task_count desc, updated_at asc);

create or replace function public.get_baghdad_week_start(p_at timestamptz default now())
returns date
language plpgsql
immutable
as $$
declare
  v_date date;
  v_dow integer;
begin
  v_date := (p_at at time zone 'Asia/Baghdad')::date;
  v_dow := extract(isodow from v_date)::integer;
  return v_date - ((v_dow - 5 + 7) % 7);
end;
$$;

-- ---------------------------------------------------------
-- 4) Wallet settings
-- ---------------------------------------------------------
insert into public.app_settings(key, value)
values
  ('task_coin_reward_channel', '50'),
  ('task_coin_reward_group', '50'),
  ('task_coin_reward_bot', '80'),
  ('coins_per_usdt', '100000'),
  ('usdt_per_1000_coins', '0.01'),
  ('wallet_reward_ads_block_id', '50410'),
  ('wallet_withdrawal_ads_required', '7'),
  ('wallet_exchange_min_coins', '1000'),
  ('wallet_withdrawal_min_usdt', '0.01')
on conflict (key) do update set value = excluded.value, updated_at = now();

-- ---------------------------------------------------------
-- 5) Withdrawal requests
-- ---------------------------------------------------------
create table if not exists public.withdrawal_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  telegram_id bigint not null,
  username text,
  first_name text,
  amount_usdt numeric(20,6) not null,
  gram_address text not null,
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected')),
  admin_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  processed_at timestamptz
);

create index if not exists idx_withdrawal_requests_status_created
on public.withdrawal_requests(status, created_at desc);

create index if not exists idx_withdrawal_requests_user_created
on public.withdrawal_requests(user_id, created_at desc);

-- Only one pending request per user at a time.
create unique index if not exists uq_withdrawal_requests_one_pending
on public.withdrawal_requests(user_id)
where status = 'pending';

-- ---------------------------------------------------------
-- 6) AdsGram sessions used only for wallet exchange / withdrawal unlock
-- ---------------------------------------------------------
create table if not exists public.wallet_ad_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  telegram_id bigint not null,
  purpose text not null check (purpose in ('exchange', 'withdrawal')),
  block_id text not null,
  exchange_coins bigint,
  status text not null default 'pending'
    check (status in ('pending', 'rewarded', 'expired')),
  started_at timestamptz not null default now(),
  rewarded_at timestamptz
);

create index if not exists idx_wallet_ad_sessions_user_purpose
on public.wallet_ad_sessions(user_id, purpose, status, started_at desc);

-- ---------------------------------------------------------
-- 7) Coin reward helpers
-- ---------------------------------------------------------
create or replace function public.get_task_coin_reward(p_task_type public.task_type)
returns bigint
language plpgsql
stable
as $$
declare
  v_key text;
  v_value text;
begin
  v_key := case p_task_type
    when 'channel' then 'task_coin_reward_channel'
    when 'group' then 'task_coin_reward_group'
    when 'bot' then 'task_coin_reward_bot'
  end;

  select value into v_value
  from public.app_settings
  where key = v_key;

  return greatest(0, coalesce(v_value, case p_task_type
    when 'bot' then '80'
    else '50'
  end)::bigint);
end;
$$;

-- Every task reward already passes through point_transactions in the existing
-- Growbot atomic functions. We attach the new coin reward to that existing,
-- transactional event so normal tasks, bot approvals, and later reversals
-- stay in sync without rewriting the older task functions.
create or replace function public.apply_coin_reward_from_point_transaction()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_completion public.task_completions%rowtype;
  v_task public.tasks%rowtype;
  v_user public.users%rowtype;
  v_coin_amount bigint;
  v_new_coins bigint;
  v_week_start date;
begin
  if new.transaction_type not in ('task_reward', 'task_reversal') then
    return new;
  end if;

  select * into v_completion
  from public.task_completions
  where id = new.reference_id;

  if not found then
    return new;
  end if;

  select * into v_task
  from public.tasks
  where id = v_completion.task_id;

  if not found then
    return new;
  end if;

  v_coin_amount := public.get_task_coin_reward(v_task.type);
  if v_coin_amount <= 0 then
    return new;
  end if;

  if new.transaction_type = 'task_reward' then
    update public.users
    set coins = coins + v_coin_amount,
        last_seen_at = now()
    where id = v_completion.user_id
    returning * into v_user;

    if not found then
      raise exception 'USER_NOT_FOUND';
    end if;

    insert into public.coin_transactions(
      user_id, amount, balance_after, transaction_type,
      reference_id, description
    ) values (
      v_completion.user_id,
      v_coin_amount,
      v_user.coins,
      'task_reward',
      v_completion.id,
      format('مكافأة %s كوين لتنفيذ مهمة',
        case v_task.type
          when 'bot' then 'بوت'
          when 'group' then 'مجموعة'
          else 'قناة'
        end
      )
    );

    v_week_start := public.get_baghdad_week_start(now());

    insert into public.weekly_task_leaderboard(
      week_start, user_id, telegram_id, username, first_name, task_count
    ) values (
      v_week_start,
      v_completion.user_id,
      v_user.telegram_id,
      v_user.username,
      v_user.first_name,
      1
    )
    on conflict (week_start, user_id)
    do update set
      task_count = public.weekly_task_leaderboard.task_count + 1,
      telegram_id = excluded.telegram_id,
      username = excluded.username,
      first_name = excluded.first_name,
      updated_at = now();

  elsif new.transaction_type = 'task_reversal' then
    update public.users
    set coins = greatest(0, coins - v_coin_amount),
        last_seen_at = now()
    where id = v_completion.user_id
    returning coins into v_new_coins;

    insert into public.coin_transactions(
      user_id, amount, balance_after, transaction_type,
      reference_id, description
    ) values (
      v_completion.user_id,
      -v_coin_amount,
      coalesce(v_new_coins, 0),
      'task_reversal',
      v_completion.id,
      'إرجاع كوين لأن المهمة انعكست'
    );

    v_week_start := public.get_baghdad_week_start(coalesce(v_completion.joined_at, now()));

    update public.weekly_task_leaderboard
    set task_count = greatest(0, task_count - 1),
        updated_at = now()
    where week_start = v_week_start
      and user_id = v_completion.user_id;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_coin_reward_from_point_transaction
on public.point_transactions;

create trigger trg_coin_reward_from_point_transaction
after insert on public.point_transactions
for each row
execute function public.apply_coin_reward_from_point_transaction();

-- ---------------------------------------------------------
-- 8) Wallet AdsGram session RPCs
-- ---------------------------------------------------------
create or replace function public.start_wallet_ad_session(
  p_user_id uuid,
  p_telegram_id bigint,
  p_purpose text,
  p_block_id text,
  p_exchange_coins bigint default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_session public.wallet_ad_sessions%rowtype;
  v_min_coins bigint;
  v_watched integer;
  v_required integer;
  v_today date;
begin
  if p_purpose not in ('exchange', 'withdrawal') then
    raise exception 'INVALID_WALLET_AD_PURPOSE';
  end if;

  if p_purpose = 'exchange' then
    select greatest(1, value::bigint) into v_min_coins
    from public.app_settings
    where key = 'wallet_exchange_min_coins';

    if coalesce(p_exchange_coins, 0) < coalesce(v_min_coins, 1000) then
      raise exception 'EXCHANGE_MIN_COINS';
    end if;

    if mod(p_exchange_coins, 1) <> 0 then
      raise exception 'INVALID_EXCHANGE_COINS';
    end if;
  end if;

  if p_purpose = 'withdrawal' then
    v_required := coalesce((select value::integer from public.app_settings where key = 'wallet_withdrawal_ads_required'), 7);
    v_today := (now() at time zone 'Asia/Baghdad')::date;

    select withdrawal_ads_watched into v_watched
    from public.users
    where id = p_user_id
    for update;

    if not found then
      raise exception 'USER_NOT_FOUND';
    end if;

    if exists (
      select 1 from public.users
      where id = p_user_id
        and withdrawal_ads_date is distinct from v_today
    ) then
      update public.users
      set withdrawal_ads_watched = 0,
          withdrawal_ads_date = v_today
      where id = p_user_id;
      v_watched := 0;
    end if;

    if coalesce(v_watched, 0) >= v_required then
      raise exception 'WITHDRAWAL_ADS_COMPLETE';
    end if;
  end if;

  if exists (
    select 1
    from public.wallet_ad_sessions
    where user_id = p_user_id
      and purpose = p_purpose
      and status = 'pending'
      and started_at > now() - interval '15 minutes'
  ) then
    raise exception 'WALLET_AD_SESSION_EXISTS';
  end if;

  insert into public.wallet_ad_sessions(
    user_id, telegram_id, purpose, block_id, exchange_coins
  ) values (
    p_user_id, p_telegram_id, p_purpose, p_block_id, p_exchange_coins
  ) returning * into v_session;

  return jsonb_build_object('id', v_session.id);
end;
$$;

create or replace function public.cancel_wallet_ad_session(
  p_user_id uuid,
  p_session_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_updated integer;
begin
  update public.wallet_ad_sessions
  set status = 'expired'
  where id = p_session_id
    and user_id = p_user_id
    and status = 'pending';
  get diagnostics v_updated = row_count;
  return v_updated > 0;
end;
$$;

create or replace function public.complete_wallet_exchange_ad(
  p_telegram_id bigint,
  p_block_id text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_session public.wallet_ad_sessions%rowtype;
  v_coins bigint;
  v_new_coins bigint;
  v_new_usdt numeric(20,6);
  v_user public.users%rowtype;
  v_rate numeric(20,10);
begin
  select * into v_session
  from public.wallet_ad_sessions
  where telegram_id = p_telegram_id
    and block_id = p_block_id
    and purpose = 'exchange'
    and status = 'pending'
    and started_at > now() - interval '15 minutes'
  order by started_at desc
  limit 1
  for update;

  if not found then
    raise exception 'NO_PENDING_WALLET_AD';
  end if;

  v_coins := coalesce(v_session.exchange_coins, 0);

  select (value::numeric / 1000.0)
  into v_rate
  from public.app_settings
  where key = 'usdt_per_1000_coins';

  v_rate := coalesce(v_rate, 0.00001);

  select * into v_user
  from public.users
  where id = v_session.user_id
  for update;

  if not found then
    raise exception 'USER_NOT_FOUND';
  end if;

  if v_user.coins < v_coins then
    raise exception 'INSUFFICIENT_COINS';
  end if;

  v_new_coins := v_user.coins - v_coins;
  v_new_usdt := round((coalesce(v_user.usdt_balance, 0) + (v_coins * v_rate))::numeric, 6);

  update public.wallet_ad_sessions
  set status = 'rewarded', rewarded_at = now()
  where id = v_session.id;

  update public.users
  set coins = v_new_coins,
      usdt_balance = v_new_usdt,
      last_seen_at = now()
  where id = v_user.id
  returning * into v_user;

  insert into public.coin_transactions(
    user_id, amount, balance_after, transaction_type,
    reference_id, description
  ) values (
    v_user.id, -v_coins, v_new_coins, 'exchange', v_session.id,
    'تحويل كوينز إلى USDT بعد مشاهدة إعلان'
  );

  insert into public.wallet_transactions(
    user_id, transaction_type, coins_amount, usdt_amount,
    balance_after_coins, balance_after_usdt, reference_id, description
  ) values (
    v_user.id, 'exchange', -v_coins, v_coins * v_rate,
    v_new_coins, v_new_usdt, v_session.id,
    'تحويل الكوينز إلى رصيد USDT'
  );

  return jsonb_build_object(
    'success', true,
    'coins', v_new_coins,
    'usdtBalance', v_new_usdt,
    'usdtGained', v_coins * v_rate
  );
end;
$$;

create or replace function public.complete_wallet_withdrawal_ad(
  p_telegram_id bigint,
  p_block_id text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_session public.wallet_ad_sessions%rowtype;
  v_user public.users%rowtype;
  v_today date;
  v_required integer;
  v_watched integer;
begin
  select * into v_session
  from public.wallet_ad_sessions
  where telegram_id = p_telegram_id
    and block_id = p_block_id
    and purpose = 'withdrawal'
    and status = 'pending'
    and started_at > now() - interval '15 minutes'
  order by started_at desc
  limit 1
  for update;

  if not found then
    raise exception 'NO_PENDING_WALLET_AD';
  end if;

  v_today := (now() at time zone 'Asia/Baghdad')::date;
  v_required := coalesce((select value::integer from public.app_settings where key = 'wallet_withdrawal_ads_required'), 7);

  select * into v_user
  from public.users
  where id = v_session.user_id
  for update;

  if not found then
    raise exception 'USER_NOT_FOUND';
  end if;

  if v_user.withdrawal_ads_date is distinct from v_today then
    v_watched := 0;
  else
    v_watched := greatest(0, coalesce(v_user.withdrawal_ads_watched, 0));
  end if;

  if v_watched >= v_required then
    raise exception 'WITHDRAWAL_ADS_COMPLETE';
  end if;

  v_watched := v_watched + 1;

  update public.wallet_ad_sessions
  set status = 'rewarded', rewarded_at = now()
  where id = v_session.id;

  update public.users
  set withdrawal_ads_watched = v_watched,
      withdrawal_ads_date = v_today,
      last_seen_at = now()
  where id = v_user.id
  returning * into v_user;

  return jsonb_build_object(
    'success', true,
    'watched', v_watched,
    'required', v_required,
    'remaining', greatest(0, v_required - v_watched)
  );
end;
$$;

-- ---------------------------------------------------------
-- 9) Withdrawal request / admin RPCs
-- ---------------------------------------------------------
create or replace function public.create_withdrawal_request_atomic(
  p_user_id uuid,
  p_telegram_id bigint,
  p_amount_usdt numeric,
  p_gram_address text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user public.users%rowtype;
  v_request public.withdrawal_requests%rowtype;
  v_required integer;
  v_min_usdt numeric;
  v_today date;
  v_watched integer;
  v_new_balance numeric(20,6);
  v_address text;
begin
  v_address := trim(coalesce(p_gram_address, ''));
  v_min_usdt := coalesce((select value::numeric from public.app_settings where key = 'wallet_withdrawal_min_usdt'), 0.01);
  v_required := coalesce((select value::integer from public.app_settings where key = 'wallet_withdrawal_ads_required'), 7);

  if length(v_address) < 10 or length(v_address) > 256 then
    raise exception 'INVALID_GRAM_ADDRESS';
  end if;

  if p_amount_usdt < v_min_usdt then
    raise exception 'MIN_WITHDRAWAL';
  end if;

  select * into v_user
  from public.users
  where id = p_user_id
    and telegram_id = p_telegram_id
  for update;

  if not found then
    raise exception 'USER_NOT_FOUND';
  end if;

  if v_user.is_banned then
    raise exception 'USER_BANNED';
  end if;

  if exists (select 1 from public.withdrawal_requests where user_id = p_user_id and status = 'pending') then
    raise exception 'PENDING_WITHDRAWAL_EXISTS';
  end if;

  v_today := (now() at time zone 'Asia/Baghdad')::date;
  v_watched := case
    when v_user.withdrawal_ads_date is distinct from v_today then 0
    else greatest(0, coalesce(v_user.withdrawal_ads_watched, 0))
  end;

  if v_watched < v_required then
    raise exception 'WITHDRAWAL_ADS_REQUIRED';
  end if;

  if coalesce(v_user.usdt_balance, 0) < p_amount_usdt then
    raise exception 'INSUFFICIENT_USDT';
  end if;

  v_new_balance := round((v_user.usdt_balance - p_amount_usdt)::numeric, 6);

  insert into public.withdrawal_requests(
    user_id, telegram_id, username, first_name,
    amount_usdt, gram_address, status
  ) values (
    v_user.id, v_user.telegram_id, v_user.username, v_user.first_name,
    round(p_amount_usdt::numeric, 6), v_address, 'pending'
  ) returning * into v_request;

  update public.users
  set usdt_balance = v_new_balance,
      withdrawal_ads_watched = 0,
      withdrawal_ads_date = v_today,
      gram_address = v_address,
      last_seen_at = now()
  where id = v_user.id;

  insert into public.wallet_transactions(
    user_id, transaction_type, coins_amount, usdt_amount,
    balance_after_coins, balance_after_usdt, reference_id, description
  ) values (
    v_user.id, 'withdrawal', null, -p_amount_usdt,
    v_user.coins, v_new_balance, v_request.id,
    'طلب سحب USDT إلى Gram'
  );

  return jsonb_build_object(
    'success', true,
    'requestId', v_request.id,
    'usdtBalance', v_new_balance,
    'status', 'pending'
  );
end;
$$;

create or replace function public.approve_withdrawal_request(p_request_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request public.withdrawal_requests%rowtype;
begin
  select * into v_request
  from public.withdrawal_requests
  where id = p_request_id
  for update;

  if not found then
    raise exception 'WITHDRAWAL_NOT_FOUND';
  end if;

  if v_request.status <> 'pending' then
    raise exception 'WITHDRAWAL_NOT_PENDING';
  end if;

  update public.withdrawal_requests
  set status = 'approved',
      updated_at = now(),
      processed_at = now()
  where id = v_request.id;

  return jsonb_build_object('success', true, 'status', 'approved');
end;
$$;

create or replace function public.reject_withdrawal_request(
  p_request_id uuid,
  p_admin_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request public.withdrawal_requests%rowtype;
  v_user public.users%rowtype;
  v_new_balance numeric(20,6);
begin
  select * into v_request
  from public.withdrawal_requests
  where id = p_request_id
  for update;

  if not found then
    raise exception 'WITHDRAWAL_NOT_FOUND';
  end if;

  if v_request.status <> 'pending' then
    raise exception 'WITHDRAWAL_NOT_PENDING';
  end if;

  select * into v_user
  from public.users
  where id = v_request.user_id
  for update;

  if not found then
    raise exception 'USER_NOT_FOUND';
  end if;

  v_new_balance := round((coalesce(v_user.usdt_balance, 0) + v_request.amount_usdt)::numeric, 6);

  update public.users
  set usdt_balance = v_new_balance,
      last_seen_at = now()
  where id = v_user.id;

  update public.withdrawal_requests
  set status = 'rejected',
      admin_note = p_admin_note,
      updated_at = now(),
      processed_at = now()
  where id = v_request.id;

  insert into public.wallet_transactions(
    user_id, transaction_type, coins_amount, usdt_amount,
    balance_after_coins, balance_after_usdt, reference_id, description
  ) values (
    v_user.id, 'withdrawal_refund', null, v_request.amount_usdt,
    v_user.coins, v_new_balance, v_request.id,
    'إرجاع رصيد طلب سحب مرفوض'
  );

  return jsonb_build_object('success', true, 'status', 'rejected', 'usdtBalance', v_new_balance);
end;
$$;

-- ---------------------------------------------------------
-- 10) Helpful RLS defaults (server uses Supabase service role)
-- ---------------------------------------------------------
alter table public.coin_transactions enable row level security;
alter table public.wallet_transactions enable row level security;
alter table public.weekly_task_leaderboard enable row level security;
alter table public.withdrawal_requests enable row level security;
alter table public.wallet_ad_sessions enable row level security;

-- No direct client policies are created here; the existing server uses the
-- service-role key and owns these writes. Keep the tables server-managed.

-- Optional: make the current weekly leaderboard immediately reflect future
-- rewards without needing a cron/reset query. Historical weeks stay available.
