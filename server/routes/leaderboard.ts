import { Router } from 'express'
import { authMiddleware } from '../lib/auth.js'
import { supabase } from '../lib/supabase.js'

export const leaderboardRouter = Router()

leaderboardRouter.get('/', authMiddleware, async (req, res, next) => {
  try {
    const { data: weekRows, error: weekError } = await supabase.rpc('get_baghdad_week_start')
    if (weekError) {
      // Fallback in case an older database has not loaded the migration yet.
      if (!String(weekError.message || '').includes('does not exist')) throw weekError
    }

    let weekStart: string
    if (typeof weekRows === 'string') {
      weekStart = weekRows
    } else {
      const now = new Date()
      const localText = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Baghdad',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).format(now)
      const localDate = new Date(`${localText}T00:00:00`)
      const day = localDate.getDay() // Sunday=0, Friday=5
      const daysSinceFriday = (day - 5 + 7) % 7
      localDate.setDate(localDate.getDate() - daysSinceFriday)
      weekStart = `${localDate.getFullYear()}-${String(localDate.getMonth() + 1).padStart(2, '0')}-${String(localDate.getDate()).padStart(2, '0')}`
    }

    const { data: rows, error } = await supabase
      .from('weekly_task_leaderboard')
      .select('user_id,telegram_id,username,first_name,task_count,updated_at')
      .eq('week_start', weekStart)
      .gt('task_count', 0)
      .order('task_count', { ascending: false })
      .order('updated_at', { ascending: true })
      .limit(50)

    if (error) throw error

    const meTelegramId = req.dbUser.telegram_id
    const list = (rows || []).map((row, index) => ({
      rank: index + 1,
      telegramId: String(row.telegram_id),
      name: row.username
        ? `@${row.username}`
        : row.first_name || `User ••••${String(row.telegram_id).slice(-4)}`,
      tasks: Number(row.task_count || 0),
      isMe: Number(row.telegram_id) === Number(meTelegramId),
    }))

    let me = list.find((row) => row.isMe) || null

    if (!me) {
      const { data: meRow, error: meError } = await supabase
        .from('weekly_task_leaderboard')
        .select('telegram_id,username,first_name,task_count')
        .eq('week_start', weekStart)
        .eq('user_id', req.dbUser.id)
        .maybeSingle()

      if (meError) throw meError

      if (meRow) {
        const { count, error: countError } = await supabase
          .from('weekly_task_leaderboard')
          .select('user_id', { count: 'exact', head: true })
          .eq('week_start', weekStart)
          .gt('task_count', Number(meRow.task_count || 0))

        if (countError) throw countError

        me = {
          rank: Number(count || 0) + 1,
          telegramId: String(meRow.telegram_id),
          name: meRow.username
            ? `@${meRow.username}`
            : meRow.first_name || `User ••••${String(meRow.telegram_id).slice(-4)}`,
          tasks: Number(meRow.task_count || 0),
          isMe: true,
        }
      }
    }

    res.json({
      success: true,
      weekStart,
      resetsEvery: 'Friday',
      list,
      me,
    })
  } catch (error) {
    next(error)
  }
})
