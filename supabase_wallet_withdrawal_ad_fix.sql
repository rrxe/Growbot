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

  select *
  into v_session
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

  v_today :=
    (now() at time zone 'Asia/Baghdad')::date;

  v_required :=
    coalesce(
      (
        select value::integer
        from public.app_settings
        where key = 'wallet_withdrawal_ads_required'
      ),
      7
    );

  select *
  into v_user
  from public.users
  where id = v_session.user_id
  for update;

  if not found then
    raise exception 'USER_NOT_FOUND';
  end if;

  if v_user.withdrawal_ads_date is distinct from v_today then
    v_watched := 0;
  else
    v_watched :=
      greatest(
        0,
        coalesce(
          v_user.withdrawal_ads_watched,
          0
        )
      );
  end if;

  if v_watched >= v_required then
    raise exception 'WITHDRAWAL_ADS_COMPLETE';
  end if;

  v_watched := v_watched + 1;

  update public.wallet_ad_sessions
  set
    status = 'rewarded',
    rewarded_at = now()
  where id = v_session.id;

  update public.users
  set
    withdrawal_ads_watched = v_watched,
    withdrawal_ads_date = v_today,
    last_seen_at = now()
  where id = v_user.id;

  return jsonb_build_object(
    'success', true,
    'watched', v_watched,
    'required', v_required,
    'remaining',
      greatest(
        0,
        v_required - v_watched
      )
  );

end;
$$;

grant execute on function public.complete_wallet_withdrawal_ad(bigint,text)
to anon, authenticated, service_role;

notify pgrst, 'reload schema';
