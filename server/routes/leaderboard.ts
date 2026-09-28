import { Router } from 'express'
import { authMiddleware } from '../lib/auth.js'
import { supabase } from '../lib/supabase.js'

export const leaderboardRouter = Router()

leaderboardRouter.get('/', authMiddleware, async (req, res, next) => {
  try {
    const { data: weekRows, error: weekError } = await supabase.rpc('get_baghdad_week_start')
    if (weekError) {
      // Fallback in case an older database has not loaded the migration yet.
      console.warn('get_baghdad_week_start unavailable, using JS fallback')
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

    const TOP_LIMIT = 10

    const { data: rows, error } = await supabase.rpc('get_weekly_leaderboard', {
      p_week_start: weekStart,
      p_user_id: req.dbUser.id,
      p_limit: TOP_LIMIT,
    })

    if (error) throw error

    const all = (rows || []).map((row: any) => ({
      rank: Number(row.rank),
      telegramId: String(row.telegram_id),
      name: row.username
        ? `@${row.username}`
        : row.first_name || `User ••••${String(row.telegram_id).slice(-4)}`,
      tasks: Number(row.task_count || 0),
      isMe: Number(row.telegram_id) === Number(req.dbUser.telegram_id),
    }))

    const list = all.filter((row: any) => row.rank <= TOP_LIMIT)
    const me = all.find((row: any) => row.isMe) || null

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
