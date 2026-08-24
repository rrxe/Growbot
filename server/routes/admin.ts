import { Router } from 'express'

import { adminMiddleware } from '../lib/admin-auth.js'
import { clearSettingsCache } from '../lib/settings.js'

import { supabase } from '../lib/supabase.js'
import { broadcastToUsers } from '../lib/telegram-send.js'
import { broadcastToUsers } from '../lib/telegram-send.js'

export const adminRouter =
  Router()


adminRouter.get(
  '/me',
  adminMiddleware('admin'),
  async (req, res) => {
    res.json({
      telegramId:
        req.telegramUser!.id,
      role:
        req.adminRole
    })
  }
)


adminRouter.get(
  '/stats',
  adminMiddleware('admin'),
  async (_req, res, next) => {
    try {
      const activeSince =
        new Date(
          Date.now() -
            5 * 60 * 1000
        ).toISOString()

      const [
        users,
        activeUsers,
        bannedUsers,
        tasks,
        activeTasks,
        completedTasks,
        pendingVerifications,
        referrals,
        purchases
      ] = await Promise.all([
        supabase
          .from('users')
          .select(
            'id',
            {
              count: 'exact',
              head: true
            }
          ),

        supabase
          .from('users')
          .select(
            'id',
            {
              count: 'exact',
              head: true
            }
          )
          .gte(
            'last_seen_at',
            activeSince
          ),

        supabase
          .from('users')
          .select(
            'id',
            {
              count: 'exact',
              head: true
            }
          )
          .eq(
            'is_banned',
            true
          ),

        supabase
          .from('tasks')
          .select(
            'id',
            {
              count: 'exact',
              head: true
            }
          ),

        supabase
          .from('tasks')
          .select(
            'id',
            {
              count: 'exact',
              head: true
            }
          )
          .eq(
            'status',
            'active'
          ),

        supabase
          .from('tasks')
          .select(
            'id',
            {
              count: 'exact',
              head: true
            }
          )
          .eq(
            'status',
            'completed'
          ),

        supabase
          .from(
            'task_completions'
          )
          .select(
            'id',
            {
              count: 'exact',
              head: true
            }
          )
          .eq(
            'status',
            'pending'
          ),

        supabase
          .from('referrals')
          .select(
            'id',
            {
              count: 'exact',
              head: true
            }
          ),

        supabase
          .from('purchases')
          .select(
            'id',
            {
              count: 'exact',
              head: true
            }
          )
          .eq(
            'status',
            'completed'
          )
      ])

      for (
        const result
        of [
          users,
          activeUsers,
          bannedUsers,
          tasks,
          activeTasks,
          completedTasks,
          pendingVerifications,
          referrals,
          purchases
        ]
      ) {
        if (result.error) {
          throw result.error
        }
      }

      const {
        data: pointRows,
        error: pointsError
      } = await supabase
        .from('users')
        .select('points')

      if (pointsError) {
        throw pointsError
      }

      const totalPoints =
        (pointRows || [])
          .reduce(
            (
              total,
              row
            ) =>
              total +
              Number(
                row.points || 0
              ),
            0
          )

      const {
        data: purchaseRows,
        error: purchaseError
      } = await supabase
        .from('purchases')
        .select(
          'usd_amount'
        )
        .eq(
          'status',
          'completed'
        )

      if (purchaseError) {
        throw purchaseError
      }

      const totalRevenue =
        (purchaseRows || [])
          .reduce(
            (
              total,
              row
            ) =>
              total +
              Number(
                row.usd_amount || 0
              ),
            0
          )

      res.json({
        stats: {
          users:
            users.count || 0,
          activeUsers:
            activeUsers.count || 0,
          bannedUsers:
            bannedUsers.count || 0,
          tasks:
            tasks.count || 0,
          activeTasks:
            activeTasks.count || 0,
          completedTasks:
            completedTasks.count || 0,
          pendingVerifications:
            pendingVerifications.count ||
            0,
          referrals:
            referrals.count || 0,
          purchases:
            purchases.count || 0,
          totalPoints,
          totalRevenue
        }
      })
    } catch (error) {
      next(error)
    }
  }
)


adminRouter.get(
  '/top-users',
  adminMiddleware('admin'),
  async (req, res, next) => {
    try {
      const limit =
        Math.min(
          Math.max(
            Number(
              req.query.limit ||
              20
            ),
            1
          ),
          100
        )

      const {
        data,
        error
      } = await supabase
        .from('users')
        .select(`
          id,
          telegram_id,
          username,
          first_name,
          last_name,
          points,
          completed_tasks,
          successful_referrals,
          is_banned,
          created_at
        `)
        .order(
          'points',
          {
            ascending: false
          }
        )
        .limit(
          limit
        )

      if (error) {
        throw error
      }

      res.json({
        users:
          data || []
      })
    } catch (error) {
      next(error)
    }
  }
)


adminRouter.get(
  '/users/search',
  adminMiddleware('admin'),
  async (req, res, next) => {
    try {
      const raw =
        typeof req.query.q ===
        'string'
          ? req.query.q.trim()
          : ''

      if (!raw) {
        return res.json({
          users: []
        })
      }

      const telegramId =
        Number(raw)

      let query =
        supabase
          .from('users')
          .select(`
            id,
            telegram_id,
            username,
            first_name,
            last_name,
            points,
            completed_tasks,
            successful_referrals,
            is_banned,
            banned_at,
            ban_reason,
            last_seen_at,
            created_at
          `)

      if (
        Number.isSafeInteger(
          telegramId
        ) &&
        telegramId > 0
      ) {
        query =
          query.eq(
            'telegram_id',
            telegramId
          )
      } else {
        const username =
          raw.replace(/^@/, '').trim()

        query =
          query.ilike(
            'username',
            `%${username.replace(
              /[%_]/g,
              ''
            )}%`
          )
      }

      const {
        data,
        error
      } = await query
        .limit(20)

      if (error) {
        throw error
      }

      res.json({
        users:
          data || []
      })
    } catch (error) {
      next(error)
    }
  }
)


adminRouter.get(
  '/users/:telegramId',
  adminMiddleware('admin'),
  async (req, res, next) => {
    try {
      const telegramId =
        Number(
          req.params.telegramId
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
              'Telegram ID غير صحيح.'
          })
      }

      const {
        data: user,
        error: userError
      } = await supabase
        .from('users')
        .select('*')
        .eq(
          'telegram_id',
          telegramId
        )
        .maybeSingle()

      if (userError) {
        throw userError
      }

      if (!user) {
        return res
          .status(404)
          .json({
            error:
              'المستخدم غير موجود.'
          })
      }

      const {
        data: transactions,
        error:
          transactionsError
      } = await supabase
        .from(
          'point_transactions'
        )
        .select(`
          id,
          amount,
          balance_after,
          transaction_type,
          description,
          created_at
        `)
        .eq(
          'user_id',
          user.id
        )
        .order(
          'created_at',
          {
            ascending: false
          }
        )
        .limit(50)

      if (
        transactionsError
      ) {
        throw transactionsError
      }

      const {
        data: userTasks,
        error: userTasksError
      } = await supabase
        .from(
          'task_completions'
        )
        .select(`
          id,
          status,
          reward_points,
          joined_at,
          verify_after,
          verified_at,
          reversed_at,
          task:tasks(
            id,
            title,
            type,
            status
          )
        `)
        .eq(
          'user_id',
          user.id
        )
        .order(
          'created_at',
          {
            ascending: false
          }
        )
        .limit(50)

      if (userTasksError) {
        throw userTasksError
      }

      res.json({
        user,
        transactions:
          transactions || [],
        tasks:
          userTasks || []
      })
    } catch (error) {
      next(error)
    }
  }
)


adminRouter.post(
  '/users/:telegramId/points',
  adminMiddleware('admin'),
  async (req, res, next) => {
    try {
      const telegramId =
        Number(
          req.params.telegramId
        )

      const amount =
        Number(
          req.body?.amount
        )

      const description =
        typeof req.body?.description ===
        'string'
          ? req.body.description.trim()
          : 'تعديل نقاط بواسطة الإدارة'

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
              'Telegram ID غير صحيح.'
          })
      }

      if (
        !Number.isSafeInteger(
          amount
        ) ||
        amount === 0
      ) {
        return res
          .status(400)
          .json({
            error:
              'قيمة النقاط غير صحيحة.'
          })
      }

      const {
        data: user,
        error: userError
      } = await supabase
        .from('users')
        .select('id')
        .eq(
          'telegram_id',
          telegramId
        )
        .maybeSingle()

      if (userError) {
        throw userError
      }

      if (!user) {
        return res
          .status(404)
          .json({
            error:
              'المستخدم غير موجود.'
          })
      }

      const {
        data: balance,
        error
      } = await supabase.rpc(
        'admin_adjust_points',
        {
          p_user_id:
            user.id,
          p_amount:
            amount,
          p_admin_telegram_id:
            req.telegramUser!.id,
          p_description:
            description ||
            'تعديل نقاط من لوحة الإدارة'
        }
      )

      if (error) {
        throw error
      }

      res.json({
        ok: true,
        newBalance:
          Number(balance)
      })
    } catch (error) {
      next(error)
    }
  }
)


adminRouter.post(
  '/users/:telegramId/ban',
  adminMiddleware('admin'),
  async (req, res, next) => {
    try {
      const telegramId =
        Number(
          req.params.telegramId
        )

      if (
        telegramId ===
        req.telegramUser!.id
      ) {
        return res
          .status(400)
          .json({
            error:
              'لا يمكنك حظر نفسك.'
          })
      }

      const reason =
        typeof req.body?.reason ===
        'string'
          ? req.body.reason.trim()
          : 'تم الحظر بواسطة الإدارة'

      const {
        data,
        error
      } = await supabase
        .from('users')
        .update({
          is_banned:
            true,
          banned_at:
            new Date().toISOString(),
          ban_reason:
            reason
        })
        .eq(
          'telegram_id',
          telegramId
        )
        .select(`
          telegram_id,
          is_banned,
          banned_at,
          ban_reason
        `)
        .maybeSingle()

      if (error) {
        throw error
      }

      if (!data) {
        return res
          .status(404)
          .json({
            error:
              'المستخدم غير موجود.'
          })
      }

      res.json({
        ok: true,
        user: data
      })
    } catch (error) {
      next(error)
    }
  }
)


adminRouter.post(
  '/users/:telegramId/unban',
  adminMiddleware('admin'),
  async (req, res, next) => {
    try {
      const telegramId =
        Number(
          req.params.telegramId
        )

      const {
        data,
        error
      } = await supabase
        .from('users')
        .update({
          is_banned:
            false,
          banned_at:
            null,
          ban_reason:
            null
        })
        .eq(
          'telegram_id',
          telegramId
        )
        .select(`
          telegram_id,
          is_banned
        `)
        .maybeSingle()

      if (error) {
        throw error
      }

      if (!data) {
        return res
          .status(404)
          .json({
            error:
              'المستخدم غير موجود.'
          })
      }

      res.json({
        ok: true,
        user: data
      })
    } catch (error) {
      next(error)
    }
  }
)


adminRouter.get(
  '/tasks',
  adminMiddleware('admin'),
  async (req, res, next) => {
    try {
      const status =
        typeof req.query.status ===
        'string'
          ? req.query.status
          : null

      let query =
        supabase
          .from('tasks')
          .select(`
            id,
            owner_id,
            type,
            title,
            chat_id,
            chat_username,
            chat_title,
            budget_points,
            remaining_points,
            reward_points,
            target_completions,
            completed_completions,
            status,
            created_at,
            owner:users(
              telegram_id,
              username,
              first_name
            )
          `)
          .order(
            'created_at',
            {
              ascending: false
            }
          )
          .limit(100)

      if (
        status &&
        [
          'active',
          'paused',
          'completed',
          'cancelled'
        ].includes(status)
      ) {
        query =
          query.eq(
            'status',
            status
          )
      }

      const {
        data,
        error
      } = await query

      if (error) {
        throw error
      }

      res.json({
        tasks:
          data || []
      })
    } catch (error) {
      next(error)
    }
  }
)


adminRouter.post(
  '/tasks/:taskId/status',
  adminMiddleware('admin'),
  async (req, res, next) => {
    try {
      const status =
        req.body?.status

      if (
        ![
          'active',
          'paused'
        ].includes(status)
      ) {
        return res
          .status(400)
          .json({
            error:
              'الحالة غير صحيحة.'
          })
      }

      const {
        data,
        error
      } = await supabase
        .from('tasks')
        .update({
          status
        })
        .eq(
          'id',
          req.params.taskId
        )
        .not(
          'status',
          'in',
          '(completed,cancelled)'
        )
        .select('*')
        .maybeSingle()

      if (error) {
        throw error
      }

      if (!data) {
        return res
          .status(404)
          .json({
            error:
              'المهمة غير موجودة أو مغلقة.'
          })
      }

      res.json({
        ok: true,
        task: data
      })
    } catch (error) {
      next(error)
    }
  }
)


adminRouter.post(
  '/tasks/:taskId/cancel',
  adminMiddleware('admin'),
  async (req, res, next) => {
    try {
      const {
        error
      } = await supabase.rpc(
        'cancel_task_and_refund',
        {
          p_task_id:
            req.params.taskId
        }
      )

      if (error) {
        throw error
      }

      res.json({
        ok: true
      })
    } catch (error) {
      next(error)
    }
  }
)


adminRouter.get(
  '/referrals',
  adminMiddleware('admin'),
  async (_req, res, next) => {
    try {
      const {
        data,
        error
      } = await supabase
        .from('referrals')
        .select(`
          id,
          required_tasks,
          completed_tasks,
          reward_points,
          rewarded,
          rewarded_at,
          created_at,
          referrer:users!referrals_referrer_id_fkey(
            telegram_id,
            username,
            first_name
          ),
          referred:users!referrals_referred_id_fkey(
            telegram_id,
            username,
            first_name
          )
        `)
        .order(
          'created_at',
          {
            ascending: false
          }
        )
        .limit(100)

      if (error) {
        throw error
      }

      res.json({
        referrals:
          data || []
      })
    } catch (error) {
      next(error)
    }
  }
)


adminRouter.get(
  '/purchases',
  adminMiddleware('admin'),
  async (_req, res, next) => {
    try {
      const {
        data,
        error
      } = await supabase
        .from('purchases')
        .select(`
          id,
          user_id,
          usd_amount,
          points_amount,
          provider,
          provider_payment_id,
          status,
          created_at,
          completed_at,
          user:users(
            telegram_id,
            username,
            first_name
          )
        `)
        .order(
          'created_at',
          {
            ascending: false
          }
        )
        .limit(100)

      if (error) {
        throw error
      }

      res.json({
        purchases:
          data || []
      })
    } catch (error) {
      next(error)
    }
  }
)


adminRouter.get(
  '/settings',
  adminMiddleware('admin'),
  async (_req, res, next) => {
    try {
      const {
        data,
        error
      } = await supabase
        .from('app_settings')
        .select(
          'key,value'
        )
        .order(
          'key'
        )

      if (error) {
        throw error
      }

      const settings: Record<
        string,
        string
      > = {}

      for (
        const row
        of data || []
      ) {
        settings[
          row.key
        ] = row.value
      }

      res.json({
        settings
      })
    } catch (error) {
      next(error)
    }
  }
)


adminRouter.post(
  '/settings',
  adminMiddleware('owner'),
  async (req, res, next) => {
    try {
      const settings =
        req.body?.settings

      if (
        !settings ||
        typeof settings !==
          'object'
      ) {
        return res
          .status(400)
          .json({
            error:
              'الإعدادات غير صحيحة.'
          })
      }

      const allowed = [
        'points_per_task',
        'points_per_usd',
        'referral_reward',
        'referral_required_tasks',
        'verification_delay_hours',
        'admin_active_minutes'
      ]

      for (
        const key
        of allowed
      ) {
        if (
          settings[key] ===
          undefined
        ) {
          continue
        }

        const value =
          String(
            settings[key]
          ).trim()

if (!value) {
          continue
        }

        const {
          error
        } = await supabase
          .from(
            'app_settings'
          )
          .upsert({
            key,
            value,
            updated_at:
              new Date().toISOString()
          })

        if (error) {
          throw error
        }
      }

      clearSettingsCache()

      res.json({
        ok: true
      })
    } catch (error) {
      next(error)
    }
  }
)


adminRouter.get(
  '/transactions',
  adminMiddleware('admin'),
  async (_req, res, next) => {
    try {
      const {
        data,
        error
      } = await supabase
        .from(
          'point_transactions'
        )
        .select(`
          id,
          amount,
          balance_after,
          transaction_type,
          description,
          created_at,
          user:users(
            telegram_id,
            username,
            first_name
          )
        `)
        .order(
          'created_at',
          {
            ascending: false
          }
        )
        .limit(100)

      if (error) {
        throw error
      }

      res.json({
        transactions:
          data || []
      })
    } catch (error) {
      next(error)
    }
  }
)


adminRouter.get(
  '/admins',
  adminMiddleware('owner'),
  async (_req, res, next) => {
    try {
      const {
        data,
        error
      } = await supabase
        .from('admin_users')
        .select(`
          id,
          telegram_id,
          role,
          is_active,
          created_at
        `)
        .order(
          'created_at',
          {
            ascending: false
          }
        )

      if (error) {
        throw error
      }

      res.json({
        admins:
          data || []
      })
    } catch (error) {
      next(error)
    }
  }
)


adminRouter.post(
  '/admins',
  adminMiddleware('owner'),
  async (req, res, next) => {
    try {
      const telegramId =
        Number(
          req.body?.telegramId
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
              'Telegram ID غير صحيح.'
          })
      }

      if (
        telegramId ===
        req.telegramUser!.id
      ) {
        return res
          .status(400)
          .json({
            error:
              'أنت Owner بالفعل.'
          })
      }

      const {
        data,
        error
      } = await supabase
        .from('admin_users')
        .upsert(
          {
            telegram_id:
              telegramId,
            role:
              'admin',
            is_active:
              true
          },
          {
            onConflict:
              'telegram_id'
          }
        )
        .select('*')
        .single()

      if (error) {
        throw error
      }

      res.json({
        ok: true,
        admin: data
      })
    } catch (error) {
      next(error)
    }
  }
)


adminRouter.delete(
  '/admins/:telegramId',
  adminMiddleware('owner'),
  async (req, res, next) => {
    try {
      const telegramId =
        Number(
          req.params.telegramId
        )

      if (
        telegramId ===
        req.telegramUser!.id
      ) {
        return res
          .status(400)
          .json({
            error:
              'لا يمكنك إزالة نفسك.'
          })
      }

      const {
        error
      } = await supabase
        .from('admin_users')
        .update({
          is_active:
            false
        })
        .eq(
          'telegram_id',
          telegramId
        )

      if (error) {
        throw error
      }

      res.json({
        ok: true
      })
    } catch (error) {
      next(error)
    }
  }
)


// =========================================================
// الاشتراك الإجباري (Required Channels)
// =========================================================

adminRouter.get(
  '/required-channels',
  adminMiddleware('admin'),
  async (_req, res, next) => {
    try {
      const {
        data,
        error
      } = await supabase
        .from('required_channels')
        .select('*')
        .order(
          'created_at',
          { ascending: false }
        )

      if (error) {
        throw error
      }

      res.json({
        channels: data || []
      })
    } catch (error) {
      next(error)
    }
  }
)


adminRouter.post(
  '/required-channels',
  adminMiddleware('admin'),
  async (req, res, next) => {
    try {
      const rawInput =
        typeof req.body?.identifier === 'string'
          ? req.body.identifier.trim()
          : ''

      const title =
        typeof req.body?.title === 'string'
          ? req.body.title.trim()
          : ''

      if (!rawInput) {
        return res
          .status(400)
          .json({
            error:
              'أدخل @username أو رابط القناة.'
          })
      }

      // نقبل @username أو t.me/username أو رابط كامل
      const username =
        rawInput
          .replace(/^https?:\/\/t\.me\//i, '')
          .replace(/^@/, '')
          .split('/')[0]
          .trim()

      if (!username) {
        return res
          .status(400)
          .json({
            error:
              'صيغة القناة غير صحيحة.'
          })
      }

      const {
        data,
        error
      } = await supabase
        .from('required_channels')
        .insert({
          chat_username: username,
          title: title || username,
          invite_link: `https://t.me/${username}`,
          is_active: true
        })
        .select('*')
        .single()

      if (error) {
        throw error
      }

      res.json({
        ok: true,
        channel: data
      })
    } catch (error) {
      next(error)
    }
  }
)


adminRouter.post(
  '/required-channels/:id/toggle',
  adminMiddleware('admin'),
  async (req, res, next) => {
    try {
      const {
        data: current,
        error: findError
      } = await supabase
        .from('required_channels')
        .select('is_active')
        .eq('id', req.params.id)
        .maybeSingle()

      if (findError) {
        throw findError
      }

      if (!current) {
        return res
          .status(404)
          .json({
            error: 'غير موجودة.'
          })
      }

      const {
        data,
        error
      } = await supabase
        .from('required_channels')
        .update({
          is_active: !current.is_active
        })
        .eq('id', req.params.id)
        .select('*')
        .single()

      if (error) {
        throw error
      }

      res.json({
        ok: true,
        channel: data
      })
    } catch (error) {
      next(error)
    }
  }
)


adminRouter.delete(
  '/required-channels/:id',
  adminMiddleware('admin'),
  async (req, res, next) => {
    try {
      const {
        error
      } = await supabase
        .from('required_channels')
        .delete()
        .eq('id', req.params.id)

      if (error) {
        throw error
      }

      res.json({
        ok: true
      })
    } catch (error) {
      next(error)
    }
  }
)


// =========================================================
// رسالة جماعية (Broadcast)
// =========================================================

adminRouter.post(
  '/broadcast',
  adminMiddleware('owner'),
  async (req, res, next) => {
    try {
      const message =
        typeof req.body?.message === 'string'
          ? req.body.message.trim()
          : ''

      if (!message) {
        return res
          .status(400)
          .json({
            error:
              'اكتب نص الرسالة أولاً.'
          })
      }

      if (message.length > 3500) {
        return res
          .status(400)
          .json({
            error:
              'الرسالة طويلة كتير (حد أقصى 3500 حرف).'
          })
      }

      const {
        data: users,
        error
      } = await supabase
        .from('users')
        .select('telegram_id')
        .eq('is_banned', false)

      if (error) {
        throw error
      }

      const telegramIds =
        (users || [])
          .map((user) => user.telegram_id)
          .filter(
            (id): id is number =>
              typeof id === 'number' && id > 0
          )

      if (telegramIds.length === 0) {
        return res
          .status(400)
          .json({
            error:
              'ما في مستخدمين لإرسال الرسالة لهم.'
          })
      }

      const result =
        await broadcastToUsers(
          telegramIds,
          message
        )

      res.json({
        ok: true,
        ...result
      })
    } catch (error) {
      next(error)
    }
  }
)
