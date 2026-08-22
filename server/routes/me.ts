import { Router } from 'express'
import { config } from '../lib/config.js'
import { supabase } from '../lib/supabase.js'
import { authMiddleware } from '../lib/auth.js'

export const meRouter =
  Router()

const DAILY_CHECKIN_POINTS = 100

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

      // تسجيل الدخول اليومي تلقائي: أول مرة يفتح المستخدم التطبيق كل يوم
      // منحاول نمنحه المكافأة مباشرة بدون أي زر أو إجراء منه.
      let dailyCheckin = {
        claimedToday: true,
        justClaimed: false,
        points: DAILY_CHECKIN_POINTS
      }

      const { data: checkinResult, error: checkinError } =
        await supabase.rpc(
          'claim_daily_checkin',
          {
            p_user_id: user.id,
            p_reward_points: DAILY_CHECKIN_POINTS
          }
        )

      if (!checkinError && checkinResult) {
        // نجحت المطالبة = أول فتحة لليوم، رصيد المستخدم بالذاكرة صار قديم
        user.points = checkinResult.balance

        dailyCheckin = {
          claimedToday: true,
          justClaimed: true,
          points: DAILY_CHECKIN_POINTS
        }
      } else if (
        checkinError &&
        !checkinError.message.includes('ALREADY_CHECKED_IN')
      ) {
        // خطأ حقيقي (مو "استلم مسبقًا") ما بنعطل الصفحة كاملة بسببه
        console.error('[checkin:auto]', checkinError)
      }

      res.json({
        user,
        dailyCheckin,
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
