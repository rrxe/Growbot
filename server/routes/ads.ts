import {
  Router,
  type Request,
  type Response,
  type NextFunction
} from 'express'

import {
  authMiddleware
} from '../lib/auth.js'

import {
  supabase
} from '../lib/supabase.js'

export const adsRouter =
  Router()


adsRouter.get(
  '/status',
  authMiddleware,
  async (
    req,
    res,
    next
  ) => {
    try {
      const {
        count,
        error
      } = await supabase
        .from('ad_sessions')
        .select(
          'id',
          {
            count: 'exact',
            head: true
          }
        )
        .eq(
          'user_id',
          req.dbUser.id
        )
        .eq(
          'day_key',
          new Date()
            .toISOString()
            .slice(0, 10)
        )
        .eq(
          'status',
          'rewarded'
        )

      if (error) {
        throw error
      }

      res.json({
        watched:
          count || 0,

        remaining:
          Math.max(
            0,
            10 - (count || 0)
          ),

        limit: 10,

        rewardPoints: 10
      })
    } catch (error) {
      next(error)
    }
  }
)

adsRouter.post(
  '/start',
  authMiddleware,
  async (
    req,
    res,
    next
  ) => {
    try {
      const blockId =
        process.env.ADSGRAM_BLOCK_ID ||
        '43643'

      const {
        data,
        error
      } = await supabase.rpc(
        'start_ad_session',
        {
          p_user_id:
            req.dbUser.id,

          p_telegram_id:
            req.telegramUser!.id,

          p_block_id:
            blockId,

          p_daily_limit:
            10,

          p_reward_points:
            10
        }
      )

      if (error) {
        if (
          error.message.includes(
            'AD_DAILY_LIMIT'
          )
        ) {
          return res
            .status(400)
            .json({
              error:
                'وصلت الحد اليومي: 10 إعلانات.'
            })
        }

        if (
          error.message.includes(
            'AD_SESSION_EXISTS'
          )
        ) {
          return res
            .status(400)
            .json({
              error:
                'هناك إعلان قيد التحقق بالفعل.'
            })
        }

        throw error
      }

      res.json({
        ok: true,
        session:
          data
      })
    } catch (error) {
      next(error)
    }
  }
)


adsRouter.get(
  '/reward',
  async (
    req: Request,
    res: Response,
    next: NextFunction
  ) => {
    try {
      const secret =
        process.env
          .ADSGRAM_REWARD_SECRET ||
        ''

      const givenSecret =
        typeof req.query.key ===
        'string'
          ? req.query.key
          : ''

      if (
        !secret ||
        givenSecret !==
          secret
      ) {
        return res
          .status(403)
          .json({
            error:
              'Forbidden'
          })
      }

      const rawUserId =
        typeof req.query.userid ===
        'string'
          ? req.query.userid
          : ''

      const telegramId =
        Number(
          rawUserId
        )

      if (
        !Number.isSafeInteger(
          telegramId
        ) ||
        telegramId <= 0
      ) {
        return res
          .status(400)
          .json({
            error:
              'Invalid user id'
          })
      }

      const blockId =
        process.env.ADSGRAM_BLOCK_ID ||
        '43643'

      const result =
        await supabase.rpc(
          'reward_adsgram_session',
          {
            p_telegram_id:
              telegramId,

            p_block_id:
              blockId,

            p_daily_limit:
              10
          }
        )

      if (result.error) {
        if (
          result.error.message.includes(
            'NO_PENDING_AD'
          )
        ) {
          return res.json({
            rewarded:
              false
          })
        }

        throw result.error
      }

      res.json(
        result.data
      )
    } catch (error) {
      next(error)
    }
  }
)
