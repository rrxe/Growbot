import express, { Router } from 'express'

import {
  authMiddleware
} from '../lib/auth.js'

import { getSettings } from '../lib/settings.js'

import {
  supabase
} from '../lib/supabase.js'

import {
  getChat,
  getChatMember
} from '../lib/telegram.js'

import {
  sendBotRejectionForReview,
  sendCompletionReviewToOwner,
  notifyCompletionDecision
} from '../../bot/index.js'

export const tasksRouter =
  Router()


tasksRouter.get(
  '/',
  authMiddleware,
  async (
    req,
    res,
    next
  ) => {
    try {
      const type =
        typeof req.query.type ===
        'string'
          ? req.query.type
          : null

      let query =
        supabase
          .from('tasks')
          .select('*')
          .eq(
            'status',
            'active'
          )
          .gt(
            'remaining_points',
            0
          )
          .neq(
            'owner_id',
            req.dbUser.id
          )
          .order(
            'created_at',
            {
              ascending: false
            }
          )
          .limit(100)

      if (
        type === 'channel' ||
        type === 'group' ||
        type === 'bot'
      ) {
        query =
          query.eq(
            'type',
            type
          )
      }

      const {
        data: tasks,
        error
      } = await query

      if (error) {
        throw error
      }

      const taskIds =
        (tasks || []).map(
          task =>
            task.id
        )

      let completedTaskIds:
        string[] = []

      if (
        taskIds.length
      ) {
        const {
          data: completions,
          error:
            completionError
        } =
          await supabase
            .from(
              'task_completions'
            )
            .select(
              'task_id'
            )
            .eq(
              'user_id',
              req.dbUser.id
            )
            .in(
              'task_id',
              taskIds
            )
            .in(
              'status',
              [
                'pending',
                'verified',
                'owner_review',
                'rejected'
              ]
            )

        if (
          completionError
        ) {
          throw completionError
        }

        completedTaskIds =
          (
            completions ||
            []
          ).map(
            item =>
              item.task_id
          )
      }

      res.json({
        tasks:
          tasks || [],
        completedTaskIds
      })
    } catch (error) {
      next(error)
    }
  }
)


tasksRouter.post(
  '/',
  authMiddleware,
  async (
    req,
    res,
    next
  ) => {
    try {
      const settings = await getSettings()

      const MIN_REFERRALS_TO_PUBLISH = 3

      const successfulReferrals =
        Number(req.dbUser.successful_referrals || 0)

      if (successfulReferrals < MIN_REFERRALS_TO_PUBLISH) {
        return res.status(403).json({
          error: `يجب إتمام ${MIN_REFERRALS_TO_PUBLISH} إحالات ناجحة على الأقل قبل نشر أي حملة.`
        })
      }

      const {
        type,
        chat,
        title,
        budgetPoints,
        botLink,
        description
      } =
        req.body || {}

      const cleanDescription =
        typeof description === 'string' && description.trim()
          ? description.trim().slice(0, 500)
          : null

      if (type === 'bot') {
        // مكافأة مهمة البوت أصبحت ثابتة (20 نقطة) — لا نثق بقيمة يرسلها العميل
        const reward = 20
        const budget = Number(budgetPoints)

        if (
          typeof botLink !== 'string' ||
          !botLink.trim()
        ) {
          return res.status(400).json({
            error: 'أدخل رابط إحالة البوت.'
          })
        }

        if (
          !Number.isInteger(budget) ||
          budget < reward ||
          budget % reward !== 0
        ) {
          return res.status(400).json({
            error: `الميزانية يجب أن تكون من مضاعفات ${reward}.`
          })
        }

        const botResult = await supabase.rpc(
          'create_bot_task_atomic',
          {
            p_owner_id: req.dbUser.id,
            p_title:
              typeof title === 'string' && title.trim()
                ? title.trim()
                : 'مهمة Join Bot',
            p_bot_link: botLink.trim(),
            p_budget_points: budget,
            p_reward_points: reward,
            p_description: cleanDescription
          }
        )

        if (botResult.error) {
          const message = botResult.error.message

          if (message.includes('INSUFFICIENT_POINTS')) {
            return res.status(400).json({ error: 'رصيدك غير كافٍ.' })
          }

          if (message.includes('USER_BANNED')) {
            return res.status(403).json({ error: 'حسابك محظور.' })
          }

          throw botResult.error
        }

        const botPayload = botResult.data as {
          task: {
            id: string
            title: string | null
            bot_link?: string | null
            description?: string | null
            reward_points?: number | null
            budget_points?: number | null
          }
          new_balance: number
        }

        return res.json({
          task: botPayload.task,
          userPoints: Number(botPayload.new_balance)
        })
      }

      if (
        type !== 'channel' &&
        type !== 'group'
      ) {
        return res
          .status(400)
          .json({
            error:
              'نوع المهمة غير صحيح.'
          })
      }

      if (
        typeof chat !==
          'string' ||
        !chat.trim()
      ) {
        return res
          .status(400)
          .json({
            error:
              'أدخل يوزر القناة أو المجموعة.'
          })
      }

      const budget =
        Number(
          budgetPoints
        )

      if (
        !Number.isInteger(
          budget
        ) ||
        budget <
          settings.pointsPerTask ||
        budget %
            settings.pointsPerTask !==
          0
      ) {
        return res
          .status(400)
          .json({
            error:
              `الميزانية يجب أن تكون من مضاعفات ${settings.pointsPerTask}.`
          })
      }

      const rawChat =
        chat.trim()

      let chatInput =
        rawChat

      if (
        /^https?:\/\/(t\.me|telegram\.me)\//i.test(
          rawChat
        )
      ) {
        const parsed =
          new URL(
            rawChat
          )

        const parts =
          parsed.pathname
            .split('/')
            .filter(Boolean)

        if (
          parts.length >= 1 &&
          !parts[0].startsWith('+') &&
          parts[0] !== 'joinchat'
        ) {
          chatInput =
            `@${parts[0].replace(/^@/, '')}`
        }
      }

      if (
        /^@?[A-Za-z0-9_]{5,}$/.test(
          chatInput
        ) &&
        !chatInput.startsWith('@')
      ) {
        chatInput =
          `@${chatInput}`
      }

      const chatInfo =
        await getChat(
          chatInput
        )

      if (
        type === 'channel' &&
        chatInfo.type !==
          'channel'
      ) {
        return res
          .status(400)
          .json({
            error:
              'المكان الذي أدخلته ليس قناة.'
          })
      }

      if (
        type === 'group' &&
        ![
          'group',
          'supergroup'
        ].includes(
          chatInfo.type
        )
      ) {
        return res
          .status(400)
          .json({
            error:
              'المكان الذي أدخلته ليس مجموعة.'
          })
      }

      const botId =
        Number(
          process.env.BOT_ID || 0
        )

      if (
        botId <= 0
      ) {
        return res
          .status(500)
          .json({
            error:
              'البوت غير متصل بعد.'
          })
      }

      const botMember =
        await getChatMember(
          chatInfo.id,
          botId
        )

      if (
        botMember.status !==
          'administrator' &&
        botMember.status !==
          'creator'
      ) {
        return res
          .status(400)
          .json({
            error:
              'لازم تضيف بوت STORM كمسؤول (أدمن) بالقناة أو القروب قبل النشر.'
          })
      }

      const result =
        await supabase.rpc(
          'create_task_atomic',
          {
            p_owner_id:
              req.dbUser.id,

            p_type:
              type,

            p_title:
              typeof title ===
                'string' &&
              title.trim()
                ? title.trim()
                : (
                    chatInfo.title ||
                    chatInfo.username ||
                    'مهمة جديدة'
                  ),

            p_chat_id:
              chatInfo.id,

            p_chat_username:
              chatInfo.username
                ? `@${chatInfo.username}`
                : null,

            p_chat_title:
              chatInfo.title ||
              null,

            p_budget_points:
              budget,

            p_reward_points:
              settings.pointsPerTask
          }
        )

      if (
        result.error
      ) {
        const message =
          result.error.message

        if (
          message.includes(
            'INSUFFICIENT_POINTS'
          )
        ) {
          return res
            .status(400)
            .json({
              error:
                'رصيدك غير كافٍ.'
            })
        }

        if (
          message.includes(
            'USER_BANNED'
          )
        ) {
          return res
            .status(403)
            .json({
              error:
                'حسابك محظور.'
            })
        }

        throw result.error
      }

      const payload =
        result.data as {
          task: unknown
          new_balance: number
        }

      res.json({
        task:
          payload.task,
        userPoints:
          Number(
            payload.new_balance
          )
      })
    } catch (error) {
      next(error)
    }
  }
)


tasksRouter.post(
  '/:taskId/complete',
  authMiddleware,
  async (
    req,
    res,
    next
  ) => {
    try {
      const taskId =
        req.params.taskId

      const {
        data: task,
        error: taskError
      } =
        await supabase
          .from('tasks')
          .select('*')
          .eq(
            'id',
            taskId
          )
          .maybeSingle()

      if (
        taskError
      ) {
        throw taskError
      }

      if (!task) {
        return res
          .status(404)
          .json({
            error:
              'المهمة غير موجودة.'
          })
      }

      if (
        task.owner_id ===
        req.dbUser.id
      ) {
        return res
          .status(400)
          .json({
            error:
              'لا يمكنك تنفيذ مهمتك الخاصة.'
          })
      }

      const settings = await getSettings()

      if (
        task.status !==
          'active' ||
        task.remaining_points <
          settings.pointsPerTask
      ) {
        return res
          .status(400)
          .json({
            error:
              'هذه المهمة غير متاحة الآن.'
          })
      }

      const membership =
        await getChatMember(
          task.chat_id,
          req.telegramUser!.id
        )

      const valid =
        membership.status ===
          'member' ||
        membership.status ===
          'administrator' ||
        membership.status ===
          'creator' ||
        membership.status ===
          'restricted'

      if (!valid) {
        return res
          .status(400)
          .json({
            error:
              'لم يتم العثور عليك كعضو. انضم للقناة أولًا.'
          })
      }

      const verifyAfter =
        new Date(
          Date.now() +
            settings.verificationDelayHours *
              60 *
              60 *
              1000
        )

      const result =
        await supabase.rpc(
          'complete_task_atomic',
          {
            p_task_id:
              task.id,

            p_user_id:
              req.dbUser.id,

            p_verify_after:
              verifyAfter.toISOString()
          }
        )

      if (
        result.error
      ) {
        const message =
          result.error.message

        if (
          message.includes(
            'ALREADY_COMPLETED'
          )
        ) {
          return res
            .status(400)
            .json({
              error:
                'لقد نفذت هذه المهمة مسبقًا.'
            })
        }

        if (
          message.includes(
            'TASK_BUDGET_EMPTY'
          ) ||
          message.includes(
            'TASK_NOT_ACTIVE'
          )
        ) {
          return res
            .status(400)
            .json({
              error:
                'انتهت ميزانية المهمة.'
            })
        }

        if (
          message.includes(
            'OWN_TASK'
          )
        ) {
          return res
            .status(400)
            .json({
              error:
                'لا يمكنك تنفيذ مهمتك الخاصة.'
            })
        }

        throw result.error
      }

      const payload =
        result.data as {
          completion: {
            id: string
            status: string
            verify_after: string
            reward_points: number
          }
          new_balance: number
        }

      res.json({
        completion: {
          id:
            payload.completion.id,

          status:
            payload.completion.status,

          rewardPoints:
            payload.completion.reward_points,

          verifyAfter:
            payload.completion.verify_after
        },

        userPoints:
          Number(
            payload.new_balance
          )
      })
    } catch (error) {
      next(error)
    }
  }
)


tasksRouter.post(
  '/:taskId/complete-with-screenshot',
  express.json({
    limit: '8mb'
  }),
  authMiddleware,
  async (
    req,
    res,
    next
  ) => {
    try {
      const taskId =
        req.params.taskId

      const {
        screenshotBase64
      } = req.body || {}

      const match =
        typeof screenshotBase64 === 'string'
          ? screenshotBase64.match(
              /^data:image\/(png|jpe?g|webp);base64,(.+)$/i
            )
          : null

      if (!match) {
        return res.status(400).json({
          error: 'أرفق صورة صحيحة (سكرين شوت).'
        })
      }

      const {
        data: task,
        error: taskError
      } = await supabase
        .from('tasks')
        .select('*')
        .eq('id', taskId)
        .maybeSingle()

      if (taskError) {
        throw taskError
      }

      if (!task || task.type !== 'bot') {
        return res.status(404).json({
          error: 'المهمة غير موجودة.'
        })
      }

      if (task.owner_id === req.dbUser.id) {
        return res.status(400).json({
          error: 'لا يمكنك تنفيذ مهمتك الخاصة.'
        })
      }

      if (
        task.status !== 'active' ||
        task.remaining_points < task.reward_points
      ) {
        return res.status(400).json({
          error: 'هذه المهمة غير متاحة الآن.'
        })
      }

      const ext =
        match[1].toLowerCase() === 'jpg'
          ? 'jpeg'
          : match[1].toLowerCase()

      const buffer =
        Buffer.from(match[2], 'base64')

      if (buffer.length > 8 * 1024 * 1024) {
        return res.status(400).json({
          error: 'حجم الصورة كبير جدًا.'
        })
      }

      const storagePath =
        `${taskId}/${req.dbUser.id}-${Date.now()}.${ext}`

      const upload =
        await supabase.storage
          .from('completion-screenshots')
          .upload(
            storagePath,
            buffer,
            {
              contentType: `image/${ext}`,
              upsert: false
            }
          )

      if (upload.error) {
        throw upload.error
      }

      const {
        data: publicUrlData
      } = supabase.storage
        .from('completion-screenshots')
        .getPublicUrl(storagePath)

      const result =
        await supabase.rpc(
          'submit_bot_completion_atomic',
          {
            p_task_id: taskId,
            p_user_id: req.dbUser.id,
            p_screenshot_url: publicUrlData.publicUrl
          }
        )

      if (result.error) {
        const message = result.error.message

        if (message.includes('ALREADY_COMPLETED')) {
          return res.status(400).json({
            error: 'لقد نفذت هذه المهمة مسبقًا.'
          })
        }

        if (
          message.includes('TASK_BUDGET_EMPTY') ||
          message.includes('TASK_NOT_ACTIVE')
        ) {
          return res.status(400).json({
            error: 'انتهت ميزانية المهمة.'
          })
        }

        if (message.includes('OWN_TASK')) {
          return res.status(400).json({
            error: 'لا يمكنك تنفيذ مهمتك الخاصة.'
          })
        }

        throw result.error
      }

      const payload =
        result.data as {
          completion: {
            id: string
            status: string
          }
        }

      void sendCompletionReviewToOwner(
        payload.completion.id
      ).catch((error) => {
        console.error(
          '[tasks:bot:notify_owner_completion]',
          error
        )
      })

      res.json({
        completion: payload.completion
      })
    } catch (error) {
      next(error)
    }
  }
)


tasksRouter.get(
  '/mine',
  authMiddleware,
  async (
    req,
    res,
    next
  ) => {
    try {
      const {
        data: tasks,
        error
      } = await supabase
        .from('tasks')
        .select('*')
        .eq(
          'owner_id',
          req.dbUser.id
        )
        .order(
          'created_at',
          {
            ascending: false
          }
        )
        .limit(200)

      if (error) {
        throw error
      }

      res.json({
        tasks:
          tasks || []
      })
    } catch (error) {
      next(error)
    }
  }
)


tasksRouter.post(
  '/:taskId/cancel',
  authMiddleware,
  async (
    req,
    res,
    next
  ) => {
    try {
      const {
        data: task,
        error: taskError
      } = await supabase
        .from('tasks')
        .select(
          'id, owner_id, status, remaining_points'
        )
        .eq(
          'id',
          req.params.taskId
        )
        .maybeSingle()

      if (
        taskError
      ) {
        throw taskError
      }

      if (
        !task ||
        task.owner_id !==
          req.dbUser.id
      ) {
        return res
          .status(404)
          .json({
            error:
              'المهمة غير موجودة.'
          })
      }

      if (
        task.status !==
        'active'
      ) {
        return res
          .status(400)
          .json({
            error:
              'المهمة متوقفة أو مغلقة أصلًا.'
          })
      }

      const {
        error: cancelError
      } = await supabase.rpc(
        'cancel_task_and_refund',
        {
          p_task_id:
            req.params.taskId
        }
      )

      if (
        cancelError
      ) {
        throw cancelError
      }

      const {
        data: freshUser,
        error: userError
      } = await supabase
        .from('users')
        .select('points')
        .eq(
          'id',
          req.dbUser.id
        )
        .maybeSingle()

      if (
        userError
      ) {
        throw userError
      }

      res.json({
        ok: true,
        refundedPoints:
          task.remaining_points,
        userPoints:
          freshUser?.points ??
          req.dbUser.points
      })
    } catch (error) {
      next(error)
    }
  }
)


tasksRouter.get(
  '/owner-review',
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
      } = await supabase
        .from('task_completions')
        .select(
          'id, task_id, user_id, screenshot_url, created_at, ' +
          'tasks!inner(id, title, chat_username, owner_id, reward_points), ' +
          'users(username, first_name, last_name, telegram_id)'
        )
        .eq('status', 'owner_review')
        .eq('tasks.owner_id', req.dbUser.id)
        .order('created_at', {
          ascending: true
        })
        .limit(100)

      if (error) {
        throw error
      }

      res.json({
        items: data || []
      })
    } catch (error) {
      next(error)
    }
  }
)


tasksRouter.post(
  '/completions/:completionId/approve',
  authMiddleware,
  async (
    req,
    res,
    next
  ) => {
    try {
      const completionId =
        req.params.completionId

      const {
        data: completion,
        error: fetchError
      } = await supabase
        .from('task_completions')
        .select('id, status, tasks!inner(owner_id)')
        .eq('id', completionId)
        .maybeSingle()

      if (fetchError) {
        throw fetchError
      }

      const ownerId =
        (completion as any)?.tasks?.owner_id

      if (!completion || ownerId !== req.dbUser.id) {
        return res.status(404).json({
          error: 'الطلب غير موجود.'
        })
      }

      if (completion.status !== 'owner_review') {
        return res.status(400).json({
          error: 'تمت معالجة هذا الطلب مسبقًا.'
        })
      }

      const result =
        await supabase.rpc(
          'approve_bot_completion_atomic',
          {
            p_completion_id: completionId
          }
        )

      if (result.error) {
        throw result.error
      }

      void notifyCompletionDecision(
        Array.isArray(completionId)
          ? completionId[0]
          : completionId,
        'approved'
      ).catch((error) => {
        console.error(
          '[tasks:bot:notify_completion_approved]',
          error
        )
      })

      res.json({
        ok: true
      })
    } catch (error) {
      next(error)
    }
  }
)


tasksRouter.post(
  '/completions/:completionId/reject',
  authMiddleware,
  async (
    req,
    res,
    next
  ) => {
    try {
      const completionId =
        req.params.completionId

      const reason =
        typeof req.body?.reason === 'string'
          ? req.body.reason.trim()
          : ''

      if (!reason) {
        return res.status(400).json({
          error: 'اكتب سبب الرفض.'
        })
      }

      const {
        data: completion,
        error: fetchError
      } = await supabase
        .from('task_completions')
        .select('id, status, tasks!inner(owner_id)')
        .eq('id', completionId)
        .maybeSingle()

      if (fetchError) {
        throw fetchError
      }

      const ownerId =
        (completion as any)?.tasks?.owner_id

      if (!completion || ownerId !== req.dbUser.id) {
        return res.status(404).json({
          error: 'الطلب غير موجود.'
        })
      }

      if (completion.status !== 'owner_review') {
        return res.status(400).json({
          error: 'تمت معالجة هذا الطلب مسبقًا.'
        })
      }

      const result =
        await supabase.rpc(
          'reject_bot_completion_atomic',
          {
            p_completion_id: completionId,
            p_reason: reason
          }
        )

      if (result.error) {
        throw result.error
      }

      const payload =
        result.data as {
          task_owner_id: string
          executor_user_id: string
          task_title: string | null
          screenshot_url: string | null
        }

      void notifyCompletionDecision(
        Array.isArray(completionId)
          ? completionId[0]
          : completionId,
        'rejected',
        { reason }
      ).catch((error) => {
        console.error(
          '[tasks:bot:notify_completion_rejected]',
          error
        )
      })

      void sendBotRejectionForReview(
        Array.isArray(completionId)
          ? completionId[0]
          : completionId,
        reason,
        payload
      ).catch((error) => {
        console.error(
          '[tasks:bot:notify_owner_review]',
          error
        )
      })

      res.json({
        ok: true
      })
    } catch (error) {
      next(error)
    }
  }
)
