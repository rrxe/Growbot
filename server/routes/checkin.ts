import {
  Router
} from 'express'

import {
  authMiddleware
} from '../lib/auth.js'

import {
  supabase
} from '../lib/supabase.js'

export const checkinRouter =
  Router()

const DAILY_CHECKIN_POINTS = 100

checkinRouter.get(
  '/status',
  authMiddleware,
  async (
    req,
    res,
    next
  ) => {
    try {
      const {
        data,
        error
      } = await supabase.rpc(
        'get_daily_checkin_status',
        {
          p_user_id:
            req.dbUser.id
        }
      )

      if (error) {
        throw error
      }

      res.json({
        checkedInToday:
          Boolean(
            data?.checkedInToday
          ),

        rewardPoints:
          DAILY_CHECKIN_POINTS
      })
    } catch (error) {
      next(error)
    }
  }
)

checkinRouter.post(
  '/claim',
  authMiddleware,
  async (
    req,
    res,
    next
  ) => {
    try {
      const {
        data,
        error
      } = await supabase.rpc(
        'claim_daily_checkin',
        {
          p_user_id:
            req.dbUser.id,

          p_reward_points:
            DAILY_CHECKIN_POINTS
        }
      )

      if (error) {
        if (
          error.message.includes(
            'ALREADY_CHECKED_IN'
          )
        ) {
          return res
            .status(400)
            .json({
              error:
                'استلمت مكافأة اليوم بالفعل، رجّع بكرة.'
            })
        }

        throw error
      }

      res.json(
        data
      )
    } catch (error) {
      next(error)
    }
  }
)
