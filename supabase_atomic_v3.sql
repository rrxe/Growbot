create or replace function public.create_task_atomic(
  p_owner_id uuid,
  p_type public.task_type,
  p_title text,
  p_chat_id bigint,
  p_chat_username text,
  p_chat_title text,
  p_budget_points bigint,
  p_reward_points integer
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user public.users%rowtype;
  v_task public.tasks%rowtype;
  v_new_balance bigint;
  v_target integer;
begin
  if p_reward_points <= 0 then
    raise exception 'INVALID_REWARD';
  end if;

  if p_budget_points < p_reward_points then
    raise exception 'INVALID_BUDGET';
  end if;

  if mod(
    p_budget_points,
    p_reward_points
  ) <> 0 then
    raise exception 'INVALID_BUDGET_MULTIPLE';
  end if;

  select *
  into v_user
  from public.users
  where id = p_owner_id
  for update;

  if not found then
    raise exception 'USER_NOT_FOUND';
  end if;

  if v_user.is_banned then
    raise exception 'USER_BANNED';
  end if;

  if v_user.points < p_budget_points then
    raise exception 'INSUFFICIENT_POINTS';
  end if;

  v_target :=
    floor(
      p_budget_points::numeric /
      p_reward_points::numeric
    );

  update public.users
  set points =
    points - p_budget_points
  where id = p_owner_id
  returning points
  into v_new_balance;

  insert into public.tasks (
    owner_id,
    type,
    title,
    chat_id,
    chat_username,
    chat_title,
    budget_points,
    remaining_points,
    reward_points,
    target_completions,
    completed_completions,
    status
  )
  values (
    p_owner_id,
    p_type,
    p_title,
    p_chat_id,
    p_chat_username,
    p_chat_title,
    p_budget_points,
    p_budget_points,
    p_reward_points,
    v_target,
    0,
    'active'
  )
  returning *
  into v_task;

  insert into public.point_transactions (
    user_id,
    amount,
    balance_after,
    transaction_type,
    reference_id,
    description
  )
  values (
    p_owner_id,
    -p_budget_points,
    v_new_balance,
    'campaign_refund',
    v_task.id,
    'حجز ميزانية مهمة جديدة'
  );

  return jsonb_build_object(
    'task',
    to_jsonb(v_task),
    'new_balance',
    v_new_balance
  );
end;
$$;


create or replace function public.complete_task_atomic(
  p_task_id uuid,
  p_user_id uuid,
  p_verify_after timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_task public.tasks%rowtype;
  v_user public.users%rowtype;
  v_completion public.task_completions%rowtype;
  v_new_balance bigint;
begin
  select *
  into v_task
  from public.tasks
  where id = p_task_id
  for update;

  if not found then
    raise exception 'TASK_NOT_FOUND';
  end if;

  if v_task.owner_id = p_user_id then
    raise exception 'OWN_TASK';
  end if;

  if v_task.status <> 'active' then
    raise exception 'TASK_NOT_ACTIVE';
  end if;

  if v_task.remaining_points <
     v_task.reward_points then
    raise exception 'TASK_BUDGET_EMPTY';
  end if;

  select *
  into v_user
  from public.users
  where id = p_user_id
  for update;

  if not found then
    raise exception 'USER_NOT_FOUND';
  end if;

  if v_user.is_banned then
    raise exception 'USER_BANNED';
  end if;

  if exists (
    select 1
    from public.task_completions
    where task_id = p_task_id
      and user_id = p_user_id
      and status in (
        'pending',
        'verified'
      )
  ) then
    raise exception 'ALREADY_COMPLETED';
  end if;

  update public.tasks
  set
    remaining_points =
      remaining_points -
      reward_points,

    completed_completions =
      completed_completions + 1,

    status =
      case
        when remaining_points -
             reward_points <= 0
        then 'completed'::public.task_status
        else 'active'::public.task_status
      end
  where id = p_task_id;

  insert into public.task_completions (
    task_id,
    user_id,
    reward_points,
    status,
    joined_at,
    verify_after
  )
  values (
    p_task_id,
    p_user_id,
    v_task.reward_points,
    'pending',
    now(),
    p_verify_after
  )
  returning *
  into v_completion;

  update public.users
  set
    points =
      points +
      v_task.reward_points,

    completed_tasks =
      completed_tasks + 1,

    last_seen_at =
      now()
  where id = p_user_id
  returning points
  into v_new_balance;

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
    v_task.reward_points,
    v_new_balance,
    'task_reward',
    v_completion.id,
    'مكافأة تنفيذ مهمة'
  );

  perform public.increment_referral_and_reward(
    p_user_id
  );

  return jsonb_build_object(
    'completion',
    to_jsonb(v_completion),
    'new_balance',
    v_new_balance
  );
end;
$$;


create or replace function public.reverse_task_completion_atomic(
  p_completion_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_completion public.task_completions%rowtype;
  v_task public.tasks%rowtype;
  v_new_balance bigint;
begin
  select *
  into v_completion
  from public.task_completions
  where id = p_completion_id
  for update;

  if not found then
    raise exception 'COMPLETION_NOT_FOUND';
  end if;

  if v_completion.status <> 'pending' then
    return jsonb_build_object(
      'processed',
      false
    );
  end if;

  select *
  into v_task
  from public.tasks
  where id = v_completion.task_id
  for update;

  if not found then
    raise exception 'TASK_NOT_FOUND';
  end if;

  update public.task_completions
  set
    status = 'reversed',
    reversed_at = now(),
    reversal_reason =
      'المستخدم غادر قبل التحقق النهائي'
  where id = v_completion.id;

  update public.users
  set points =
    points -
    v_completion.reward_points
  where id = v_completion.user_id
  returning points
  into v_new_balance;

  insert into public.point_transactions (
    user_id,
    amount,
    balance_after,
    transaction_type,
    reference_id,
    description
  )
  values (
    v_completion.user_id,
    -v_completion.reward_points,
    v_new_balance,
    'task_reversal',
    v_completion.id,
    'خصم مكافأة لأن المستخدم غادر قبل التحقق'
  );

  if v_task.status = 'cancelled' then

    perform public.adjust_user_points(
      v_task.owner_id,
      v_completion.reward_points,
      'campaign_refund',
      v_task.id,
      'إرجاع قيمة تنفيذ بعد إلغاء المهمة'
    );

  else

    update public.tasks
    set
      remaining_points =
        least(
          budget_points,
          remaining_points +
          reward_points
        ),

      completed_completions =
        greatest(
          0,
          completed_completions - 1
        ),

      status =
        case
          when status = 'completed'
          then 'active'::public.task_status
          else status
        end

    where id = v_task.id;

  end if;

  return jsonb_build_object(
    'processed',
    true,
    'new_balance',
    v_new_balance
  );
end;
$$;


create or replace function public.mark_task_completion_verified(
  p_completion_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_updated integer;
begin
  update public.task_completions
  set
    status = 'verified',
    verified_at = now()
  where id = p_completion_id
    and status = 'pending';

  get diagnostics
    v_updated = row_count;

  return v_updated > 0;
end;
$$;


create index if not exists
idx_task_completions_user_status
on public.task_completions(
  user_id,
  status
);

create index if not exists
idx_tasks_owner_status
on public.tasks(
  owner_id,
  status
);
