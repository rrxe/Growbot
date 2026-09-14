do $$
begin
  create type public.admin_role as enum ('owner', 'admin');
exception
  when duplicate_object then null;
end $$;


create table if not exists public.admin_users (
  id uuid primary key default gen_random_uuid(),

  telegram_id bigint not null unique,

  role public.admin_role not null default 'admin',

  is_active boolean not null default true,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);


alter table public.users
  add column if not exists last_seen_at timestamptz;

alter table public.users
  add column if not exists banned_at timestamptz;

alter table public.users
  add column if not exists ban_reason text;


create index if not exists idx_users_last_seen
on public.users(last_seen_at);

create index if not exists idx_users_points_desc
on public.users(points desc);

create index if not exists idx_users_banned
on public.users(is_banned);


drop trigger if exists trg_admin_users_updated_at
on public.admin_users;

create trigger trg_admin_users_updated_at
before update on public.admin_users
for each row
execute function public.set_updated_at();


alter table public.admin_users enable row level security;


create or replace function public.get_admin_role(
  p_telegram_id bigint
)
returns public.admin_role
language sql
security definer
set search_path = public
as $$
  select role
  from public.admin_users
  where telegram_id = p_telegram_id
    and is_active = true
  limit 1;
$$;


create or replace function public.admin_adjust_points(
  p_user_id uuid,
  p_amount bigint,
  p_admin_telegram_id bigint,
  p_description text
)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role public.admin_role;
  v_new_balance bigint;
begin
  select public.get_admin_role(
    p_admin_telegram_id
  )
  into v_role;

  if v_role is null then
    raise exception 'ADMIN_ACCESS_DENIED';
  end if;

  update public.users
  set points = points + p_amount
  where id = p_user_id
  returning points into v_new_balance;

  if not found then
    raise exception 'USER_NOT_FOUND';
  end if;

  insert into public.point_transactions (
    user_id,
    amount,
    balance_after,
    transaction_type,
    reference_id,
    description
  )
  values (
    p_user_id,
    p_amount,
    v_new_balance,
    'admin_adjustment',
    null,
    p_description
  );

  return v_new_balance;
end;
$$;


insert into public.app_settings(key, value)
values
  ('admin_active_minutes', '5')
on conflict (key)
do update set value = excluded.value;
