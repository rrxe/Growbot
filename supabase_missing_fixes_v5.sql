-- =========================================================
-- 1) جدول app_settings (كان بس فيه insert بدون create!)
-- =========================================================
create table if not exists public.app_settings (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);

insert into public.app_settings(key, value)
values
  ('points_per_task', '5'),
  ('points_per_usd', '500'),
  ('referral_reward', '150'),
  ('referral_required_tasks', '5'),
  ('verification_delay_hours', '10'),
  ('adsgram_block_id', '43643'),
  ('ads_daily_limit', '10'),
  ('ads_reward_points', '10'),
  ('stars_per_500_points', '50'),
  ('admin_active_minutes', '5')
on conflict (key) do nothing;


-- =========================================================
-- 2) دالة set_updated_at (مطلوبة لـ trigger على admin_users)
-- =========================================================
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;


-- =========================================================
-- 3) دالة adjust_user_points (مركزية لإضافة/خصم نقاط + سجل)
-- =========================================================
create or replace function public.adjust_user_points(
  p_user_id uuid,
  p_amount bigint,
  p_transaction_type text,
  p_reference_id uuid,
  p_description text
)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_new_balance bigint;
begin
  update public.users
  set points = greatest(0, points + p_amount)
  where id = p_user_id
  returning points into v_new_balance;

  if not found then
    raise exception 'USER_NOT_FOUND';
  end if;

  insert into public.point_transactions (
    user_id, amount, balance_after,
    transaction_type, reference_id, description
  )
  values (
    p_user_id, p_amount, v_new_balance,
    p_transaction_type, p_reference_id, p_description
  );

  return v_new_balance;
end;
$$;


-- =========================================================
-- 4) دالة increment_referral_and_reward (مفقودة بالكامل)
--    تزيد completed_tasks للمُحيل، وتكافئه لما يوصل الحد المطلوب
-- =========================================================
create or replace function public.increment_referral_and_reward(
  p_referred_user_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ref public.referrals%rowtype;
begin
  select *
  into v_ref
  from public.referrals
  where referred_id = p_referred_user_id
    and rewarded = false
  for update;

  if not found then
    return;
  end if;

  update public.referrals
  set completed_tasks = completed_tasks + 1
  where id = v_ref.id
  returning * into v_ref;

  if v_ref.completed_tasks >= v_ref.required_tasks then

    update public.referrals
    set rewarded = true
    where id = v_ref.id;

    perform public.adjust_user_points(
      v_ref.referrer_id,
      v_ref.reward_points,
      'referral_reward',
      v_ref.id,
      'مكافأة إحالة صديق بعد إكمال المهام المطلوبة'
    );

  end if;
end;
$$;


-- =========================================================
-- 5) إصلاح باغ "هناك إعلان قيد التحقق بالفعل":
--    دالة جديدة لإلغاء الجلسة فورًا لما الإعلان يفشل بالعرض
-- =========================================================
create or replace function public.cancel_ad_session(
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
  update public.ad_sessions
  set status = 'expired'
  where id = p_session_id
    and user_id = p_user_id
    and status = 'pending';

  get diagnostics v_updated = row_count;

  return v_updated > 0;
end;
$$;

-- شبكة أمان: أي جلسة pending أقدم من 15 دقيقة تصير منتهية تلقائيًا
create or replace function public.expire_stale_ad_sessions()
returns void
language sql
security definer
set search_path = public
as $$
  update public.ad_sessions
  set status = 'expired'
  where status = 'pending'
    and started_at <= now() - interval '15 minutes';
$$;
