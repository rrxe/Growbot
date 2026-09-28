import { supabase } from '../lib/supabase.js'
import { broadcastTaskReminder } from '../../bot/index.js'

let running = false

export async function runTaskReminderJob() {
  if (running) {
    return
  }

  running = true

  try {
    const {
      count,
      error
    } =
      await supabase
        .from('tasks')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'active')
        .gt('remaining_points', 0)

    if (error) {
      console.error('[task-reminder:check]', error)

      return
    }

    // ما نبعث تذكير إذا ما في مهام متاحة أصلًا — حتى ما نزعج الأعضاء بدون فايدة
    if (!count || count < 1) {
      return
    }

    await broadcastTaskReminder(count)
  } catch (error) {
    console.error('[task-reminder:run]', error)
  } finally {
    running = false
  }
}
