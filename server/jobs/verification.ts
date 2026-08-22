import { supabase } from '../lib/supabase'
import { getSettings } from '../lib/settings'

import {
  getChatMember
} from '../lib/telegram'

let running = false

export async function runVerificationJob() {
  if (running) {
    return
  }

  running = true

  try {
    const now =
      new Date().toISOString()

    const {
      data: completions,
      error
    } =
      await supabase
        .from(
          'task_completions'
        )
        .select(`
          id,
          task_id,
          user_id,
          reward_points,
          status,
          verify_after,
          task:tasks(
            id,
            chat_id
          ),
          user:users(
            id,
            telegram_id
          )
        `)
        .eq(
          'status',
          'pending'
        )
        .lte(
          'verify_after',
          now
        )
        .order(
          'verify_after',
          {
            ascending: true
          }
        )
        .limit(100)

    if (error) {
      console.error(
        '[verification:load]',
        error
      )

      return
    }

    for (
      const completion
      of completions || []
    ) {
      await verifyOne(
        completion
      )
    }
  } finally {
    running = false
  }
}


async function verifyOne(
  completion: any
) {
  const task =
    completion.task

  const user =
    completion.user

  if (
    !task ||
    !user
  ) {
    return
  }

  try {
    const member =
      await getChatMember(
        task.chat_id,
        user.telegram_id
      )

    const stillMember =
      member.status ===
        'member' ||
      member.status ===
        'administrator' ||
      member.status ===
        'creator' ||
      member.status ===
        'restricted'

    if (stillMember) {
      const {
        error
      } =
        await supabase.rpc(
          'mark_task_completion_verified',
          {
            p_completion_id:
              completion.id
          }
        )

      if (error) {
        console.error(
          '[verification:verified]',
          error
        )
      }

      return
    }

    const {
      error
    } =
      await supabase.rpc(
        'reverse_task_completion_atomic',
        {
          p_completion_id:
            completion.id
        }
      )

    if (error) {
      console.error(
        '[verification:reverse]',
        error
      )
    }
  } catch (error) {
    console.error(
      `[verification:${completion.id}]`,
      error
    )
  }
}
