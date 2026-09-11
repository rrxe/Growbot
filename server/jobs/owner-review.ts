import { supabase } from '../lib/supabase.js'

let running = false

const AUTO_APPROVE_AFTER_MINUTES = 15

export async function runOwnerReviewAutoApproveJob() {
  if (running) {
    return
  }

  running = true

  try {
    const cutoff =
      new Date(
        Date.now() - AUTO_APPROVE_AFTER_MINUTES * 60 * 1000
      ).toISOString()

    const {
      data: completions,
      error
    } =
      await supabase
        .from('task_completions')
        .select('id')
        .eq('status', 'owner_review')
        .lte('created_at', cutoff)
        .limit(100)

    if (error) {
      console.error(
        '[owner-review-auto-approve:load]',
        error
      )

      return
    }

    for (
      const completion
      of completions || []
    ) {
      const result =
        await supabase.rpc(
          'approve_bot_completion_atomic',
          {
            p_completion_id: completion.id
          }
        )

      if (result.error) {
        console.error(
          '[owner-review-auto-approve:approve]',
          completion.id,
          result.error
        )
      }
    }
  } finally {
    running = false
  }
}
