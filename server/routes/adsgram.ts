import { Router } from 'express'
import { authMiddleware } from '../lib/auth.js'
import { supabase } from '../lib/supabase.js'

export const adsgramRouter = Router()

const ADSGRAM_REWARD_BLOCK_ID = '46262'
const ADSGRAM_REWARD_DAILY_LIMIT = 20
const ADSGRAM_REWARD_POINTS = 6
const ADSGRAM_NATIVE_TASK_BLOCK_ID = 'task-46724'
const ADSGRAM_NATIVE_TASK_REWARD = 1

function getBaghdadDay() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Baghdad',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
}

function getRewardSecret(req: any) {
  const expected = process.env.ADSGRAM_REWARD_SECRET || ''
  const provided = String(req.query?.secret || '')
  return Boolean(expected) && provided === expected
}

adsgramRouter.post(
  '/watch/start',
  authMiddleware,
  async (req, res, next) => {
    try {
      const user = req.dbUser
      const { data, error } = await supabase.rpc('start_adsgram_watch_session', {
        p_user_id: user.id,
        p_telegram_id: user.telegram_id,
        p_block_id: ADSGRAM_REWARD_BLOCK_ID,
        p_daily_limit: ADSGRAM_REWARD_DAILY_LIMIT,
        p_reward_points: ADSGRAM_REWARD_POINTS,
      })

      if (error) throw error

      res.json({
        success: true,
        ...data,
        blockId: ADSGRAM_REWARD_BLOCK_ID,
        dailyLimit: ADSGRAM_REWARD_DAILY_LIMIT,
        rewardPoints: ADSGRAM_REWARD_POINTS,
      })
    } catch (error: any) {
      const message = String(error?.message || error)
      if (message.includes('AD_DAILY_LIMIT')) {
        return res.status(429).json({
          success: false,
          error: 'وصلت للحد اليومي: 20 إعلان.',
          code: 'AD_DAILY_LIMIT',
        })
      }
      if (message.includes('AD_SESSION_EXISTS')) {
        return res.status(409).json({
          success: false,
          error: 'هناك إعلان قيد التحقق بالفعل. أكمل الإعلان الحالي أولاً.',
          code: 'AD_SESSION_EXISTS',
        })
      }
      next(error)
    }
  },
)

/**
 * Primary reward path (client-triggered, authenticated).
 * AdsGram's own docs say the server-side Reward URL postback is only
 * meaningful for publishers with 50k+ daily users and is sent
 * "in addition to" the client-side show() callback -- it is NOT a
 * replacement for it, and it never fires at all in debug/test mode.
 * So we must not depend solely on the external webhook: grant the
 * reward here, right after controller.show() resolves on the client.
 * This reuses the exact same RPC as the webhook, so whichever path
 * arrives first wins and the other becomes a harmless no-op
 * (NO_PENDING_AD) -- no double reward is possible.
 */
adsgramRouter.post(
  '/watch/complete',
  authMiddleware,
  async (req, res, next) => {
    try {
      const user = req.dbUser
      const { data, error } = await supabase.rpc('reward_adsgram_watch_session', {
        p_telegram_id: user.telegram_id,
        p_block_id: ADSGRAM_REWARD_BLOCK_ID,
        p_daily_limit: ADSGRAM_REWARD_DAILY_LIMIT,
      })

      if (error) {
        const message = String(error.message || error)
        if (message.includes('NO_PENDING_AD')) {
          return res.status(409).json({
            success: false,
            error: 'NO_PENDING_AD',
            code: 'NO_PENDING_AD',
          })
        }
        if (message.includes('AD_DAILY_LIMIT')) {
          return res.status(429).json({
            success: false,
            error: 'وصلت للحد اليومي: 20 إعلان.',
            code: 'AD_DAILY_LIMIT',
          })
        }
        throw error
      }

      res.json({
        success: true,
        type: 'watch_ad',
        reward: ADSGRAM_REWARD_POINTS,
        blockId: ADSGRAM_REWARD_BLOCK_ID,
        dailyLimit: ADSGRAM_REWARD_DAILY_LIMIT,
        ...data,
      })
    } catch (error) {
      next(error)
    }
  },
)

adsgramRouter.get(
  '/watch/status',
  authMiddleware,
  async (req, res, next) => {
    try {
      const user = req.dbUser
      const { data, error } = await supabase.rpc('get_adsgram_watch_status', {
        p_user_id: user.id,
        p_block_id: ADSGRAM_REWARD_BLOCK_ID,
        p_daily_limit: ADSGRAM_REWARD_DAILY_LIMIT,
      })

      if (error) throw error

      res.json({
        success: true,
        ...data,
        dayKey: getBaghdadDay(),
        blockId: ADSGRAM_REWARD_BLOCK_ID,
        dailyLimit: ADSGRAM_REWARD_DAILY_LIMIT,
        rewardPoints: ADSGRAM_REWARD_POINTS,
      })
    } catch (error) {
      next(error)
    }
  },
)

adsgramRouter.get(
  '/native/status',
  authMiddleware,
  async (req, res, next) => {
    try {
      const { count, error } = await supabase
        .from('adsgram_native_rewards')
        .select('id', { count: 'exact', head: true })
        .eq('telegram_id', req.dbUser.telegram_id)
        .eq('block_id', ADSGRAM_NATIVE_TASK_BLOCK_ID)

      if (error) throw error

      res.json({
        success: true,
        count: Number(count || 0),
        rewardPoints: ADSGRAM_NATIVE_TASK_REWARD,
        blockId: ADSGRAM_NATIVE_TASK_BLOCK_ID,
      })
    } catch (error) {
      next(error)
    }
  },
)

/**
 * AdsGram Reward URL compatibility endpoint.
 * Exact URL format requested by the user:
 * /api/auth/me?adsgram_reward=1&secret=...&userid=[userId]
 * Native task appends: &kind=native_task
 */
export async function handleAdsgramRewardWebhook(req: any, res: any) {
  if (!getRewardSecret(req)) {
    return res.status(401).json({ success: false, error: 'Unauthorized' })
  }

  const telegramIdRaw = req.query?.userid
  const telegramId = Number(telegramIdRaw)
  if (!Number.isSafeInteger(telegramId) || telegramId <= 0) {
    return res.status(400).json({ success: false, error: 'Missing/invalid userid' })
  }

  try {
    const safeQuery = { ...req.query }
    delete safeQuery.secret

    // Optional audit trail. If the table is not installed yet, don't block the reward.
    try {
      await supabase.from('adsgram_reward_log').insert({
        telegram_id: telegramId,
        query: safeQuery,
      })
    } catch (logError) {
      console.warn('[adsgram] reward log insert skipped:', logError)
    }

    if (String(req.query?.kind || '') === 'native_task') {
      const { data, error } = await supabase.rpc('reward_adsgram_native_task', {
        p_telegram_id: telegramId,
        p_block_id: ADSGRAM_NATIVE_TASK_BLOCK_ID,
        p_reward_points: ADSGRAM_NATIVE_TASK_REWARD,
      })

      if (error) throw error

      return res.status(200).json({
        success: true,
        type: 'native_task',
        reward: ADSGRAM_NATIVE_TASK_REWARD,
        ...(data || {}),
      })
    }

    const { data, error } = await supabase.rpc('reward_adsgram_watch_session', {
      p_telegram_id: telegramId,
      p_block_id: ADSGRAM_REWARD_BLOCK_ID,
      p_daily_limit: ADSGRAM_REWARD_DAILY_LIMIT,
    })

    if (error) {
      const message = String(error.message || error)
      if (message.includes('NO_PENDING_AD')) {
        return res.status(200).json({
          success: false,
          error: 'NO_PENDING_AD',
          reward: 0,
        })
      }
      if (message.includes('AD_DAILY_LIMIT')) {
        return res.status(200).json({
          success: false,
          error: 'AD_DAILY_LIMIT',
          reward: 0,
        })
      }
      throw error
    }

    return res.status(200).json({
      success: true,
      type: 'watch_ad',
      reward: ADSGRAM_REWARD_POINTS,
      ...(data || {}),
    })
  } catch (error: any) {
    console.error('[adsgram] reward webhook error:', error)
    return res.status(500).json({
      success: false,
      error: error?.message || 'Internal error',
    })
  }
}
