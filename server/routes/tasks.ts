import { Router } from 'express'

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
        type === 'group'
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
                'verified'
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

      const {
        type,
        chat,
        title,
        budgetPoints
      } =
        req.body || {}

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
              'يجب إضافة GrowBot كمسؤول أولًا.'
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
