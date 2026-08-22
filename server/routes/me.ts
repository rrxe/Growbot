import { Router } from 'express'
import { config } from '../lib/config'
import { supabase } from '../lib/supabase'
import { authMiddleware } from '../lib/auth'

export const meRouter =
  Router()

meRouter.get(
  '/',
  authMiddleware,
  async (req, res, next) => {
    try {
      const user = req.dbUser

      const { data: referral } =
        await supabase
          .from('referrals')
          .select(
            'completed_tasks, required_tasks, reward_points, rewarded'
          )
          .eq(
            'referred_id',
            user.id
          )
          .maybeSingle()

      let referralLink: string | null =
        null

      if (config.botUsername) {
        referralLink =
          `https://t.me/${config.botUsername}?start=ref_${user.referral_code}`
      }

      res.json({
        user,
        referral: {
          code:
            user.referral_code,
          link:
            referralLink,
          completed_tasks:
            referral?.completed_tasks ??
            0,
          required_tasks:
            referral?.required_tasks ??
            config.referralRequiredTasks,
          reward_points:
            referral?.reward_points ??
            config.referralReward,
          rewarded:
            referral?.rewarded ??
            false
        }
      })
    } catch (error) {
      next(error)
    }
  }
)
