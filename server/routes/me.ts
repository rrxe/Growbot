import { Router } from 'express'
import { config } from '../lib/config.js'
import { supabase } from '../lib/supabase.js'
import { authMiddleware } from '../lib/auth.js'
import { getRequiredChannelsStatus } from '../lib/required-channels.js'

export const meRouter =
  Router()

const DAILY_CHECKIN_POINTS = 100

meRouter.get(
  '/',
  authMiddleware,
  async (req, res, next) => {
    try {
      const user = req.dbUser
      const requiredChannelStatus = await getRequiredChannelsStatus(user.telegram_id)
      const requiredChannels = requiredChannelStatus.map((channel) => ({
        id: channel.id,
        title: channel.title,
        url: channel.invite_link || (channel.chat_username ? `https://t.me/${channel.chat_username}` : ''),
        joined: channel.joined
      }))
      const missingChannels = requiredChannels.filter((channel) => !channel.joined)
      const membershipRequired = requiredChannels.length > 0
      const membershipVerified = missingChannels.length === 0

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

      // إحصائية "إحالاتي": كم شخص دخل من رابط هذا المستخدم (بغض النظر عن
      // إتمام المهام)، مقابل successful_referrals يلي بيمثل كم منهم أكمل
      // العدد المطلوب من المهام واستحق المكافأة.
      const { count: totalInvited } =
        await supabase
          .from('referrals')
          .select('id', { count: 'exact', head: true })
          .eq(
            'referrer_id',
            user.id
          )

      let referralLink: string | null =
        null

      if (config.botUsername) {
        // رابط Mini App مباشر (t.me/bot/appname?startapp=) —
        // رابط البوت الكلاسيكي (?start=) ما بيوصل الـ start_param
        // بشكل موثوق لما التطبيق يفتح كـ Mini App.
        referralLink =
          `https://t.me/${config.botUsername}/${config.botAppShortName}?startapp=ref_${user.referral_code}`
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
        membershipRequired,
        membershipVerified,
        requiredChannels,
        missingChannels,
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
            false,
          total_invited:
            totalInvited ?? 0,
          successful_referrals:
            user.successful_referrals ?? 0
        }
      })
    } catch (error) {
      next(error)
    }
  }
)
