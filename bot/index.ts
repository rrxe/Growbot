import 'dotenv/config'

import {
  Bot,
  InlineKeyboard
} from 'grammy'

import {
  config
} from '../server/lib/config.js'

import {
  supabase
} from '../server/lib/supabase.js'

import {
  broadcastToUsers
} from '../server/lib/telegram-send.js'


function baseAppUrl() {
  return config.webAppUrl
    .replace(
      /\/$/,
      ''
    )
}

function miniAppKeyboard() {
  const keyboard =
    new InlineKeyboard()

  if (
    config.webAppUrl
  ) {
    keyboard.webApp(
      '🚀 فتح STORM',
      config.webAppUrl
    )
  }

  return keyboard
}

function adminAppUrl() {
  if (
    !config.webAppUrl
  ) {
    return ''
  }

  return `${baseAppUrl()}/admin.html`
}

async function resolveRole(
  telegramId: number
) {
  const ownerId =
    Number(
      process.env
        .OWNER_TELEGRAM_ID ||
      0
    )

  if (
    ownerId > 0 &&
    telegramId ===
      ownerId
  ) {
    return 'owner' as const
  }

  const {
    data,
    error
  } = await supabase
    .from('admin_users')
    .select('role')
    .eq(
      'telegram_id',
      telegramId
    )
    .eq(
      'is_active',
      true
    )
    .maybeSingle()

  if (error) {
    throw error
  }

  if (
    data?.role ===
      'admin' ||
    data?.role ===
      'owner'
  ) {
    return data.role
  }

  return null
}

async function sendHome(
  ctx: any,
  referralPayload = ''
) {
  const keyboard = miniAppKeyboard()

  let role:
    | 'owner'
    | 'admin'
    | null = null

  try {
    role = await resolveRole(ctx.from!.id)
  } catch (error) {
    console.error('[bot:role]', error)
  }

  if (role && adminAppUrl()) {
    keyboard.webApp(
      'لوحة الإدارة',
      adminAppUrl()
    )
  }

  const lines = [
    'مرحبًا بك في بوت تبادل قنوات وبوتات STORM',
    '',
    'منصة لتنمية القنوات والمجموعات والبوتات عبر مهام واضحة ونظام نقاط مباشر، وتقدر تنشر رابط إحالة بوتك كمان ضمن حملتك.',
    '',
    '🚀 نفّذ المهام واربح نقاط فورًا',
    '📢 انشر قناتك أو مجموعتك أو بوتك وزوّد أعضاءه',
    `🤝 مكافأة الإحالة: +${config.referralReward} نقطة بعد ${config.referralRequiredTasks} مهام`,
    '',
    'ابدأ من التطبيق وتصفح المهام أو أطلق حملتك الخاصة.'
  ]

  if (referralPayload.startsWith('ref_')) {
    lines.push(
      '',
      'تم تسجيل رابط الإحالة لهذا الدخول.'
    )
  }

  await ctx.reply(
    lines.join('\n'),
    {
      reply_markup: keyboard
    }
  )
}

export const bot =
  config.botToken
    ? new Bot(config.botToken)
    : null

// الاشتراك الإلزامي يُفحص داخل الـMini App عند كل فتح، وليس داخل محادثة البوت.

// telegram_id (owner) -> task id في انتظار سبب الرفض
const pendingRejections =
  new Map<number, string>()

// telegram_id (صاحب مهمة) -> completion id في انتظار سبب رفض تنفيذ
const pendingCompletionRejections =
  new Map<number, string>()

function ownerId() {
  return Number(
    process.env.OWNER_TELEGRAM_ID || 0
  )
}

// يرسل إشعار لصاحب المشروع لمراجعة مهمة Join Bot الجديدة
export async function sendBotTaskForReview(
  task: {
    id: string
    title?: string | null
    bot_link?: string | null
    botLink?: string | null
    description?: string | null
    reward_points?: number | null
    rewardPoints?: number | null
    budget_points?: number | null
    budgetPoints?: number | null
  },
  owner: {
    id: string
    username?: string | null
    first_name?: string | null
    telegram_id?: number | null
  }
) {
  const targetOwnerId = ownerId()

  if (!bot || targetOwnerId <= 0) {
    console.error(
      '[bot:review] bot غير متاح أو OWNER_TELEGRAM_ID غير مضبوط.'
    )

    return
  }

  const link =
    task.bot_link ?? task.botLink ?? ''

  const reward =
    task.reward_points ?? task.rewardPoints ?? 0

  const budget =
    task.budget_points ?? task.budgetPoints ?? 0

  const text = [
    '🆕 مهمة Join Bot بانتظار المراجعة',
    '',
    `العنوان: ${task.title || '—'}`,
    `رابط البوت: ${link || '—'}`,
    ...(task.description ? [`الوصف: ${task.description}`] : []),
    `النقاط لكل تنفيذ: ${reward}`,
    `الميزانية الكلية: ${budget}`,
    `صاحب المهمة: ${owner.first_name || ''} ${
      owner.username ? '@' + owner.username : ''
    }`.trim()
  ].join('\n')

  const keyboard =
    new InlineKeyboard()
      .text('✅ Approve', `task_approve:${task.id}`)
      .text('❌ Reject', `task_reject:${task.id}`)

  try {
    await bot.api.sendMessage(
      targetOwnerId,
      text,
      {
        reply_markup: keyboard
      }
    )
  } catch (error) {
    console.error(
      '[bot:review] فشل إرسال إشعار المراجعة:',
      error
    )
  }
}

// يعدّل نص/كابشن رسالة المراجعة بعد ما مالكة STORM تحسم (قبول رفض أو عقاب) —
// الرسالة ممكن تكون نص عادي أو صورة (لو فيه سكرين شوت)، فنتعامل مع الحالتين
async function finalizeReviewMessage(
  ctx: any,
  suffix: string
) {
  const message = ctx.callbackQuery.message

  if (message?.caption !== undefined) {
    await ctx.editMessageCaption(
      `${message.caption || ''}${suffix}`
    ).catch(() => {})

    return
  }

  await ctx.editMessageText(
    `${message?.text || ''}${suffix}`
  ).catch(() => {})
}

// تصعيد لمالكة STORM (OWNER_TELEGRAM_ID) لما owner مهمة يرفض تنفيذ Join Bot —
// هي تحسم: تقبل الرفض، أو تعاقب صاحب المهمة (رصيده يصفّر ومهامه تُلغى والمنفّذ يُدفع فورًا)
export async function sendBotRejectionForReview(
  completionId: string,
  reason: string,
  payload: {
    task_owner_id: string
    executor_user_id: string
    task_title: string | null
    screenshot_url: string | null
  }
) {
  const targetOwnerId = ownerId()

  if (!bot || targetOwnerId <= 0) {
    console.error(
      '[bot:reject_review] bot غير متاح أو OWNER_TELEGRAM_ID غير مضبوط.'
    )

    return
  }

  const [ownerRow, executorRow] = await Promise.all([
    supabase
      .from('users')
      .select('username, first_name, telegram_id')
      .eq('id', payload.task_owner_id)
      .maybeSingle(),

    supabase
      .from('users')
      .select('username, first_name, telegram_id')
      .eq('id', payload.executor_user_id)
      .maybeSingle()
  ])

  const ownerUser = ownerRow.data
  const executorUser = executorRow.data

  const caption = [
    '⛔ رفض تنفيذ مهمة Join Bot — بانتظار قرارك',
    '',
    `المهمة: ${payload.task_title || '—'}`,
    `صاحب المهمة: ${ownerUser?.first_name || ''} ${
      ownerUser?.username ? '@' + ownerUser.username : ''
    }`.trim(),
    `المنفّذ: ${executorUser?.first_name || ''} ${
      executorUser?.username ? '@' + executorUser.username : ''
    }`.trim(),
    '',
    `سبب الرفض: ${reason}`
  ].join('\n')

  const keyboard = new InlineKeyboard()
    .text('✅ قبول الرفض', `reject_accept:${completionId}`)
    .text('⛔ عاقب', `reject_punish:${completionId}`)

  try {
    if (payload.screenshot_url) {
      await bot.api.sendPhoto(
        targetOwnerId,
        payload.screenshot_url,
        {
          caption,
          reply_markup: keyboard
        }
      )
    } else {
      await bot.api.sendMessage(
        targetOwnerId,
        caption,
        {
          reply_markup: keyboard
        }
      )
    }
  } catch (error) {
    console.error(
      '[bot:reject_review] فشل إرسال إشعار التصعيد:',
      error
    )
  }
}

// يجيب بيانات تنفيذ (completion) + المهمة + المنفّذ في استعلام واحد،
// بما فيها chat_id/message_id لرسالة المراجعة المرسلة لصاحب المهمة (إن وُجدت)
async function loadCompletionForReview(completionId: string) {
  const { data, error } = await supabase
    .from('task_completions')
    .select(
      'id, task_id, user_id, screenshot_url, status, ' +
      'owner_notify_chat_id, owner_notify_message_id, ' +
      'tasks!inner(id, title, owner_id, reward_points), ' +
      'users(username, first_name, telegram_id)'
    )
    .eq('id', completionId)
    .maybeSingle()

  if (error || !data) {
    if (error) {
      console.error('[bot:completion_review:load]', error)
    }

    return null
  }

  return data as unknown as {
    id: string
    task_id: string
    user_id: string
    screenshot_url: string | null
    status: string
    owner_notify_chat_id: number | null
    owner_notify_message_id: number | null
    tasks: {
      id: string
      title: string | null
      owner_id: string
      reward_points: number | null
    }
    users: {
      username: string | null
      first_name: string | null
      telegram_id: number | null
    } | null
  }
}

// يرسل لصاحب المهمة رسالة (نص أو صورة) فيها تفاصيل تنفيذ Join Bot وزري قبول/رفض،
// ويخزّن chat_id/message_id في task_completions عشان نقدر نعدّل نفس الرسالة لاحقًا
// (مثلاً لما تتم الموافقة تلقائيًا بعد 15 دقيقة بدون رد)
export async function sendCompletionReviewToOwner(
  completionId: string
) {
  if (!bot) {
    return
  }

  const completion = await loadCompletionForReview(completionId)

  if (!completion) {
    console.error(
      '[bot:completion_review:send] completion غير موجود:',
      completionId
    )

    return
  }

  const { data: owner } = await supabase
    .from('users')
    .select('telegram_id')
    .eq('id', completion.tasks.owner_id)
    .maybeSingle()

  if (!owner?.telegram_id) {
    return
  }

  const executor = completion.users

  const caption = [
    '📩 طلب مراجعة تنفيذ مهمتك',
    '',
    `المهمة: ${completion.tasks.title || '—'}`,
    `المنفّذ: ${executor?.first_name || ''} ${
      executor?.username ? '@' + executor.username : ''
    }`.trim(),
    `النقاط: ${completion.tasks.reward_points ?? 0}`,
    '',
    '⏳ إذا ما رديت خلال 15 دقيقة، بتتم الموافقة تلقائيًا.'
  ].join('\n')

  const keyboard = new InlineKeyboard()
    .text('✅ قبول', `completion_approve:${completion.id}`)
    .text('❌ رفض', `completion_reject:${completion.id}`)

  try {
    const sent = completion.screenshot_url
      ? await bot.api.sendPhoto(
          owner.telegram_id,
          completion.screenshot_url,
          {
            caption,
            reply_markup: keyboard
          }
        )
      : await bot.api.sendMessage(
          owner.telegram_id,
          caption,
          {
            reply_markup: keyboard
          }
        )

    await supabase
      .from('task_completions')
      .update({
        owner_notify_chat_id: sent.chat.id,
        owner_notify_message_id: sent.message_id
      })
      .eq('id', completion.id)
  } catch (error) {
    console.error('[bot:completion_review:send]', error)
  }
}

// يعدّل رسالة المراجعة عند صاحب المهمة (نص أو كابشن صورة) لتوضّح القرار النهائي
async function finalizeCompletionOwnerMessage(
  chatId: number | null | undefined,
  messageId: number | null | undefined,
  suffixText: string
) {
  if (!bot || !chatId || !messageId) {
    return
  }

  await bot.api
    .editMessageReplyMarkup(chatId, messageId, {
      reply_markup: undefined
    })
    .catch(() => {})

  const captionEdited = await bot.api
    .editMessageCaption(chatId, messageId, {
      caption: suffixText
    })
    .catch(() => null)

  if (!captionEdited) {
    await bot.api
      .editMessageText(chatId, messageId, suffixText)
      .catch(() => {})
  }
}

// يشعر المنفّذ بقرار المراجعة (قبول/رفض) عبر شات البوت، ويعدّل رسالة صاحب المهمة
// لو كانت موجودة — تُستخدم من: أزرار البوت، مسار الموافقة/الرفض من التطبيق،
// وجوب الموافقة التلقائية بعد 15 دقيقة
export async function notifyCompletionDecision(
  completionId: string,
  decision: 'approved' | 'rejected',
  opts: { reason?: string; auto?: boolean } = {}
) {
  if (!bot) {
    return
  }

  const completion = await loadCompletionForReview(completionId)

  if (!completion) {
    return
  }

  const executorTelegramId = completion.users?.telegram_id
  const reward = completion.tasks.reward_points ?? 0
  const title = completion.tasks.title || '—'

  if (decision === 'approved') {
    if (executorTelegramId) {
      const intro = opts.auto
        ? '⏰ تمت الموافقة تلقائيًا بعد مرور 15 دقيقة بدون رد صاحب المهمة.'
        : '🎉 مبروك! تم قبول تنفيذك للمهمة.'

      await bot.api
        .sendMessage(
          executorTelegramId,
          [
            intro,
            '',
            `المهمة: ${title}`,
            `✅ تم إضافة ${reward} نقطة لرصيدك.`
          ].join('\n')
        )
        .catch((error) => {
          console.error('[bot:notify_executor:approved]', error)
        })
    }

    await finalizeCompletionOwnerMessage(
      completion.owner_notify_chat_id,
      completion.owner_notify_message_id,
      opts.auto
        ? `\n\n⏰ تمت الموافقة تلقائيًا بعد 15 دقيقة — المهمة: ${title}`
        : `\n\n✅ تمت الموافقة — المهمة: ${title}`
    )
  } else {
    if (executorTelegramId) {
      await bot.api
        .sendMessage(
          executorTelegramId,
          [
            '❌ تم رفض تنفيذك للمهمة.',
            '',
            `المهمة: ${title}`,
            ...(opts.reason ? [`السبب: ${opts.reason}`] : [])
          ].join('\n')
        )
        .catch((error) => {
          console.error('[bot:notify_executor:rejected]', error)
        })
    }

    await finalizeCompletionOwnerMessage(
      completion.owner_notify_chat_id,
      completion.owner_notify_message_id,
      `\n\n❌ تم الرفض — المهمة: ${title}`
    )
  }
}

let started = false

export async function startBot() {
  if (started) {
    return
  }

  if (!bot) {
    console.error(
      '[bot] BOT_TOKEN is missing — polling not started.'
    )

    return
  }

  started = true

  bot.command(
    'start',
    async (
      ctx
    ) => {
      try {
        const payload =
          ctx.match?.trim() ||
          ''

        await sendHome(
          ctx,
          payload
        )
      } catch (
        error
      ) {
        console.error(
          '[bot:start]',
          error
        )

        await ctx.reply(
          'حدث خطأ مؤقت. حاول مرة أخرى.'
        )
      }
    }
  )

  bot.command(
    'app',
    async (
      ctx
    ) => {
      if (
        !config.webAppUrl
      ) {
        await ctx.reply(
          'التطبيق غير متاح حاليًا. يرجى ضبط WEBAPP_URL في إعدادات الخادم.'
        )

        return
      }

      await ctx.reply(
        'افتح تطبيق STORM من الزر التالي:',
        {
          reply_markup:
            miniAppKeyboard()
        }
      )
    }
  )

  bot.command(
    'admin',
    async (
      ctx
    ) => {
      try {
        if (!ctx.from) {
          await ctx.reply(
            'تعذر تحديد حساب Telegram.'
          )

          return
        }

        const role =
          await resolveRole(
            ctx.from!.id
          )

        if (!role) {
          await ctx.reply(
            '⛔ ليس لديك صلاحية دخول لوحة الإدارة.'
          )

          return
        }

        const url =
          adminAppUrl()

        if (!url) {
          await ctx.reply(
            '🚧 لوحة الإدارة جاهزة، لكن WEBAPP_URL غير مضبوط بعد.'
          )

          return
        }

        const keyboard =
          new InlineKeyboard()
            .webApp(
              '⚙️ فتح لوحة الإدارة',
              url
            )

        await ctx.reply(
          [
            '🔐 لوحة إدارة STORM',
            '',
            `صلاحيتك: ${
              role === 'owner'
                ? '👑 المالك'
                : '🛡️ أدمن'
            }`
          ].join('\n'),
          {
            reply_markup:
              keyboard
          }
        )
      } catch (
        error
      ) {
        console.error(
          '[bot:admin]',
          error
        )

        await ctx.reply(
          'تعذر التحقق من صلاحياتك حاليًا.'
        )
      }
    }
  )

  bot.command(
    'id',
    async (
      ctx
    ) => {
      await ctx.reply(
        [
          'معرّف Telegram الخاص بك:',
          '',
          String(
            ctx.from?.id ||
            ''
          )
        ].join('\n')
      )
    }
  )

  bot.command(
    'support',
    async (
      ctx
    ) => {
      await ctx.reply(
        'الدعم\n\nللمساعدة أو الإبلاغ عن مشكلة، تواصل مع @SLYMintX_SUPPORT.'
      )
    }
  )

  bot.command(
    'paysupport',
    async (
      ctx
    ) => {
      await ctx.reply(
        'الدفع والشراء\n\nلأي مشكلة مرتبطة بالدفع، تواصل مع @SLYMintX_SUPPORT.'
      )
    }
  )

  bot.command(
    'terms',
    async (
      ctx
    ) => {
      await ctx.reply(
        [
          'شروط استخدام STORM',
          '',
          '• النقاط داخل STORM تُستخدم فقط لنشر وتنفيذ المهام على المنصة.',
          '• إيقاف أي مهمة يرجّع لك الميزانية المتبقية منها فقط.',
          '• نظام الإحالات مبني على تنفيذ مهام حقيقية، مش مجرد تسجيل دخول.',
          '• عمليات الشراء عبر Telegram Stars تتم بالكامل عبر نظام تيليجرام الرسمي.'
        ].join('\n')
      )
    }
  )

  bot.command(
    'help',
    async (
      ctx
    ) => {
      let role:
        | 'owner'
        | 'admin'
        | null = null

      try {
        role =
          await resolveRole(
            ctx.from!.id
          )
      } catch (
        error
      ) {
        console.error(
          '[bot:help:role]',
          error
        )
      }

      const lines = [
        'أوامر STORM',
        '',
        '/start — فتح البوت',
        '/app — فتح التطبيق',
        '/balance — رصيدك من النقاط',
        '/referral — رابط وإحصائيات الإحالة',
        '/id — معرفة Telegram ID تبعك',
        '/support — تواصل مع الدعم',
        '/paysupport — مشاكل الدفع والشراء',
        '/terms — الشروط والأحكام',
        '/help — عرض هذه القائمة'
      ]

      if (role) {
        lines.splice(
          4,
          0,
          '/admin — لوحة الإدارة',
          '/stats — إحصائيات سريعة'
        )
      }

      if (ctx.from!.id === ownerId()) {
        lines.push(
          '/broadcast — رسالة لكل المستخدمين'
        )
      }

      await ctx.reply(
        lines.join('\n')
      )
    }
  )

  // رصيد المستخدم مباشرة من الشات بدون فتح التطبيق
  bot.command(
    'balance',
    async (
      ctx
    ) => {
      try {
        const {
          data: user,
          error
        } = await supabase
          .from('users')
          .select('points')
          .eq(
            'telegram_id',
            ctx.from!.id
          )
          .maybeSingle()

        if (error) {
          throw error
        }

        if (!user) {
          await ctx.reply(
            '👋 لسا ما فتحت التطبيق ولا مرة!\nافتحه أول مرة بالأمر /app عشان ننشئلك حساب.'
          )

          return
        }

        const usdValue =
          config.pointsPerUsd > 0
            ? Number(user.points || 0) / config.pointsPerUsd
            : 0

        await ctx.reply(
          [
            '💰 رصيدك الحالي',
            '',
            `🪙 النقاط: ${user.points || 0}`,
            `💵 ما يعادل: $${usdValue.toFixed(2)}`
          ].join('\n')
        )
      } catch (error) {
        console.error(
          '[bot:balance]',
          error
        )

        await ctx.reply(
          '⚠️ تعذر جلب رصيدك حاليًا، جرّب كمان شوي.'
        )
      }
    }
  )

  // رابط وإحصائيات الإحالة مباشرة من الشات
  bot.command(
    'referral',
    async (
      ctx
    ) => {
      try {
        const {
          data: user,
          error
        } = await supabase
          .from('users')
          .select('id, referral_code')
          .eq(
            'telegram_id',
            ctx.from!.id
          )
          .maybeSingle()

        if (error) {
          throw error
        }

        if (!user) {
          await ctx.reply(
            '👋 لسا ما فتحت التطبيق ولا مرة!\nافتحه أول مرة بالأمر /app عشان ننشئلك حساب.'
          )

          return
        }

        const link =
          config.botUsername
            ? `https://t.me/${config.botUsername}/${config.botAppShortName}?startapp=ref_${ctx.from!.id}`
            : ''

        const {
          count: referredCount,
          error: referredError
        } = await supabase
          .from('referrals')
          .select(
            'id',
            {
              count: 'exact',
              head: true
            }
          )
          .eq(
            'referrer_id',
            user.id
          )

        if (referredError) {
          throw referredError
        }

        const {
          count: rewardedCount,
          error: rewardedError
        } = await supabase
          .from('referrals')
          .select(
            'id',
            {
              count: 'exact',
              head: true
            }
          )
          .eq(
            'referrer_id',
            user.id
          )
          .eq(
            'rewarded',
            true
          )

        if (rewardedError) {
          throw rewardedError
        }

        await ctx.reply(
          [
            '🎁 رابط الإحالة الخاص فيك',
            '',
            link || '⚠️ رابط الإحالة غير متاح حاليًا (BOT_USERNAME غير مضبوط).',
            '',
            `👥 عدد من دخلوا برابطك: ${referredCount || 0}`,
            `✅ عدد المكافآت المستلمة: ${rewardedCount || 0}`,
            `💡 كل إحالة مكتملة = +${config.referralReward} نقطة بعد ${config.referralRequiredTasks} مهام`,
            '',
            'شارك رابطك مع أصحابك وحوّل كل دعوة لنقاط 🚀'
          ].join('\n')
        )
      } catch (error) {
        console.error(
          '[bot:referral]',
          error
        )

        await ctx.reply(
          '⚠️ تعذر جلب بيانات الإحالة حاليًا، جرّب كمان شوي.'
        )
      }
    }
  )

  // إحصائيات سريعة للإدارة بدون فتح لوحة التحكم
  bot.command(
    'stats',
    async (
      ctx
    ) => {
      try {
        const role =
          await resolveRole(
            ctx.from!.id
          )

        if (!role) {
          await ctx.reply(
            '⛔ هذا الأمر للإدارة فقط.'
          )

          return
        }

        const activeSince =
          new Date(
            Date.now() - 5 * 60 * 1000
          ).toISOString()

        const [
          users,
          activeUsers,
          tasks,
          activeTasks,
          pendingVerifications,
          purchases
        ] = await Promise.all([
          supabase
            .from('users')
            .select('id', { count: 'exact', head: true }),

          supabase
            .from('users')
            .select('id', { count: 'exact', head: true })
            .gte('last_seen_at', activeSince),

          supabase
            .from('tasks')
            .select('id', { count: 'exact', head: true }),

          supabase
            .from('tasks')
            .select('id', { count: 'exact', head: true })
            .eq('status', 'active'),

          supabase
            .from('task_completions')
            .select('id', { count: 'exact', head: true })
            .eq('status', 'pending'),

          supabase
            .from('purchases')
            .select('id', { count: 'exact', head: true })
            .eq('status', 'completed')
        ])

        for (
          const result
          of [
            users,
            activeUsers,
            tasks,
            activeTasks,
            pendingVerifications,
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
          (pointRows || []).reduce(
            (total, row) =>
              total + Number(row.points || 0),
            0
          )

        await ctx.reply(
          [
            '📊 إحصائيات STORM',
            '',
            `👥 المستخدمين: ${users.count || 0}`,
            `🟢 نشيطين (آخر 5 دقائق): ${activeUsers.count || 0}`,
            `📋 المهام: ${tasks.count || 0} (نشطة: ${activeTasks.count || 0})`,
            `⏳ تنفيذات بانتظار المراجعة: ${pendingVerifications.count || 0}`,
            `💳 عمليات شراء ناجحة: ${purchases.count || 0}`,
            `🪙 مجموع النقاط بالمنصة: ${totalPoints}`
          ].join('\n')
        )
      } catch (error) {
        console.error(
          '[bot:stats]',
          error
        )

        await ctx.reply(
          '⚠️ تعذر جلب الإحصائيات حاليًا.'
        )
      }
    }
  )

  // بث رسالة لكل المستخدمين مباشرة من الشات (لصاحب المشروع فقط)
  bot.command(
    'broadcast',
    async (
      ctx
    ) => {
      if (ctx.from!.id !== ownerId()) {
        await ctx.reply(
          '⛔ هذا الأمر لصاحب المشروع فقط.'
        )

        return
      }

      const text =
        ctx.match?.trim() || ''

      if (!text) {
        await ctx.reply(
          '✍️ استخدم الأمر بهاد الشكل:\n/broadcast رسالتك هنا'
        )

        return
      }

      await ctx.reply(
        '⏳ جاري إرسال الرسالة لكل المستخدمين، بيوصلك تقرير فور ما يخلص...'
      )

      try {
        const {
          data: rows,
          error
        } = await supabase
          .from('users')
          .select('telegram_id')
          .eq('is_banned', false)

        if (error) {
          throw error
        }

        const ids =
          (rows || [])
            .map(row => row.telegram_id)
            .filter(
              (id): id is number => Boolean(id)
            )

        const result =
          await broadcastToUsers(
            ids,
            text
          )

        await ctx.reply(
          [
            '✅ انتهى البث',
            '',
            `الإجمالي: ${result.total}`,
            `تم الإرسال: ${result.sent}`,
            `محظور/غير متاح: ${result.blocked}`,
            `فشل: ${result.failed}`
          ].join('\n')
        )
      } catch (error) {
        console.error(
          '[bot:broadcast]',
          error
        )

        await ctx.reply(
          'حدث خطأ أثناء البث.'
        )
      }
    }
  )

  bot.on(
    'pre_checkout_query',
    async (
      ctx
    ) => {
      try {
        const payload =
          ctx.update
            .pre_checkout_query
            .invoice_payload

        const {
          data: purchase
        } = await supabase
          .from(
            'purchases'
          )
          .select(
            'id,status,stars_amount'
          )
          .eq(
            'invoice_payload',
            payload
          )
          .maybeSingle()

        if (
          !purchase ||
          purchase.status !==
            'pending'
        ) {
          await ctx.api.answerPreCheckoutQuery(
            ctx.update.pre_checkout_query.id,
            false,
            { error_message: 'تعذر العثور على الطلب.' }
          )

          return
        }

        if (
          Number(
            purchase.stars_amount
          ) !==
          Number(
            ctx.update
              .pre_checkout_query
              .total_amount
          )
        ) {
          await ctx.api.answerPreCheckoutQuery(
            ctx.update.pre_checkout_query.id,
            false,
            { error_message: 'قيمة الفاتورة غير صحيحة.' }
          )

          return
        }

        await ctx.api.answerPreCheckoutQuery(
          ctx.update.pre_checkout_query.id,
          true
        )
      } catch (
        error
      ) {
        console.error(
          '[payment:precheckout]',
          error
        )

        await ctx.api.answerPreCheckoutQuery(
            ctx.update.pre_checkout_query.id,
            false,
            { error_message: 'حدث خطأ مؤقت. حاول مرة أخرى.' }
          )
      }
    }
  )

  bot.on(
    'message:successful_payment',
    async (
      ctx
    ) => {
      const payment =
        ctx.message
          .successful_payment

      try {
        const result =
          await supabase.rpc(
            'complete_star_purchase',
            {
              p_invoice_payload:
                payment.invoice_payload,

              p_telegram_id:
                ctx.from!.id,

              p_total_stars:
                payment.total_amount,

              p_charge_id:
                payment.telegram_payment_charge_id
            }
          )

        if (result.error) {
          throw result.error
        }

        await ctx.reply(
          [
            '✅ تم الدفع بنجاح!',
            '',
            `⭐ ${payment.total_amount} Stars`,
            '🪙 تمت إضافة النقاط لرصيدك فورًا.',
            '',
            config.webAppUrl
              ? '👇 افتح التطبيق وشوف رصيدك الجديد.'
              : ''
          ]
            .filter(Boolean)
            .join('\n'),
          {
            reply_markup:
              config.webAppUrl
                ? miniAppKeyboard()
                : undefined
          }
        )
      } catch (
        error
      ) {
        console.error(
          '[payment:success]',
          {
            chargeId:
              payment.telegram_payment_charge_id,
            invoicePayload:
              payment.invoice_payload,
            telegramId:
              ctx.from!.id,
            error
          }
        )

        await ctx.reply(
          [
            '⚠️ تم خصم الـ Stars منك، بس صار خطأ مؤقت بإضافة النقاط.',
            '',
            `🔢 رقم العملية: ${payment.telegram_payment_charge_id}`,
            'كلّم @SLYMintX_SUPPORT وابعتله الرقم هاد، ونضيفلك نقاطك يدويًا على طول.'
          ].join('\n')
        ).catch(() => {})
      }
    }
  )

bot.callbackQuery(
    /^task_approve:(.+)$/,
    async (ctx) => {
      if (ctx.from!.id !== ownerId()) {
        await ctx.answerCallbackQuery({
          text: 'غير مصرح لك.',
          show_alert: true
        })

        return
      }

      const taskId = ctx.match[1]

      try {
        const { data: updated, error } = await supabase
          .from('tasks')
          .update({ status: 'active' })
          .eq('id', taskId)
          .eq('status', 'pending_review')
          .select('id')
          .maybeSingle()

        if (error) {
          throw error
        }

        if (!updated) {
          await ctx.answerCallbackQuery({
            text: 'تمت معالجة هذه المهمة مسبقًا.',
            show_alert: true
          })

          return
        }

        await ctx.answerCallbackQuery({ text: '✅ تمت الموافقة' })

        await ctx.editMessageReplyMarkup({
          reply_markup: undefined
        }).catch(() => {})

        await ctx.editMessageText(
          `${ctx.callbackQuery.message?.text || ''}\n\n✅ تمت الموافقة — المهمة نشطة الآن.`
        ).catch(() => {})
      } catch (error) {
        console.error('[bot:task_approve]', error)

        await ctx.answerCallbackQuery({
          text: 'حدث خطأ، حاول مرة أخرى.',
          show_alert: true
        })
      }
    }
  )

  bot.callbackQuery(
    /^task_reject:(.+)$/,
    async (ctx) => {
      if (ctx.from!.id !== ownerId()) {
        await ctx.answerCallbackQuery({
          text: 'غير مصرح لك.',
          show_alert: true
        })

        return
      }

      const taskId = ctx.match[1]

      pendingRejections.set(ctx.from!.id, taskId)

      await ctx.answerCallbackQuery()

      await ctx.reply('✍️ اكتب سبب الرفض:')
    }
  )

  bot.on(
    'message:text',
    async (ctx) => {
      const taskId = pendingRejections.get(ctx.from!.id)
      const completionId = pendingCompletionRejections.get(ctx.from!.id)

      if (!taskId && !completionId) {
        return
      }

      const reason = ctx.message.text.trim()

      if (!reason) {
        await ctx.reply('اكتب سبب الرفض كنص.')

        return
      }

      if (completionId) {
        pendingCompletionRejections.delete(ctx.from!.id)

        try {
          const result = await supabase.rpc(
            'reject_bot_completion_atomic',
            {
              p_completion_id: completionId,
              p_reason: reason
            }
          )

          if (result.error) {
            throw result.error
          }

          await ctx.reply('❌ تم رفض التنفيذ وإشعار المنفّذ.')

          await notifyCompletionDecision(
            completionId,
            'rejected',
            { reason }
          )

          const payload = result.data as {
            task_owner_id: string
            executor_user_id: string
            task_title: string | null
            screenshot_url: string | null
          }

          await sendBotRejectionForReview(
            completionId,
            reason,
            payload
          ).catch((error) => {
            console.error('[bot:completion_reject:escalate]', error)
          })
        } catch (error) {
          console.error('[bot:completion_reject]', error)

          await ctx.reply(
            'حدث خطأ أثناء الرفض. حاول مرة أخرى بالضغط على ❌ رفض من جديد.'
          )
        }

        return
      }

      if (!taskId || ctx.from!.id !== ownerId()) {
        return
      }

      pendingRejections.delete(ctx.from!.id)

      try {
        const result = await supabase.rpc(
          'reject_bot_task_and_refund',
          {
            p_task_id: taskId,
            p_reason: reason
          }
        )

        if (result.error) {
          throw result.error
        }

        const payload = result.data as {
          task: { id: string; owner_id: string; title: string | null }
        }

        await ctx.reply('❌ تم رفض المهمة وإعادة الميزانية لصاحبها.')

        const { data: owner } = await supabase
          .from('users')
          .select('telegram_id')
          .eq('id', payload.task.owner_id)
          .maybeSingle()

        if (owner?.telegram_id) {
          await bot!.api.sendMessage(
            owner.telegram_id,
            [
              `❌ تم رفض مهمتك: ${payload.task.title || ''}`,
              '',
              `السبب: ${reason}`,
              '',
              'تمت إعادة الميزانية كاملة إلى رصيدك.'
            ].join('\n')
          ).catch((error) => {
            console.error('[bot:task_reject:notify_owner]', error)
          })
        }
      } catch (error) {
        console.error('[bot:task_reject]', error)

        await ctx.reply('حدث خطأ أثناء الرفض. حاول مرة أخرى بالضغط على ❌ Reject من جديد.')
      }
    }
  )

  bot.callbackQuery(
    /^reject_accept:(.+)$/,
    async (ctx) => {
      if (ctx.from!.id !== ownerId()) {
        await ctx.answerCallbackQuery({
          text: 'غير مصرح لك.',
          show_alert: true
        })

        return
      }

      await ctx.answerCallbackQuery({
        text: '✅ تم قبول الرفض'
      })

      await ctx.deleteMessage().catch(() => {})
    }
  )

  bot.callbackQuery(
    /^reject_punish:(.+)$/,
    async (ctx) => {
      if (ctx.from!.id !== ownerId()) {
        await ctx.answerCallbackQuery({
          text: 'غير مصرح لك.',
          show_alert: true
        })

        return
      }

      const completionId = ctx.match[1]

      try {
        const result = await supabase.rpc(
          'punish_task_owner_atomic',
          {
            p_completion_id: completionId
          }
        )

        if (result.error) {
          throw result.error
        }

        await ctx.answerCallbackQuery({
          text: '⛔ تم العقاب'
        })

        await ctx.deleteMessage().catch(() => {})
      } catch (error) {
        console.error(
          '[bot:reject_punish]',
          error
        )

        await ctx.answerCallbackQuery({
          text: 'حدث خطأ، حاول مرة أخرى.',
          show_alert: true
        })
      }
    }
  )

  // صاحب المهمة يوافق على تنفيذ Join Bot من داخل شات البوت مباشرة
  bot.callbackQuery(
    /^completion_approve:(.+)$/,
    async (ctx) => {
      const completionId = ctx.match[1]

      const completion = await loadCompletionForReview(completionId)

      if (!completion) {
        await ctx.answerCallbackQuery({
          text: 'الطلب غير موجود.',
          show_alert: true
        })

        return
      }

      const { data: owner } = await supabase
        .from('users')
        .select('telegram_id')
        .eq('id', completion.tasks.owner_id)
        .maybeSingle()

      if (!owner?.telegram_id || ctx.from!.id !== owner.telegram_id) {
        await ctx.answerCallbackQuery({
          text: 'غير مصرح لك.',
          show_alert: true
        })

        return
      }

      if (completion.status !== 'owner_review') {
        await ctx.answerCallbackQuery({
          text: 'تمت معالجة هذا الطلب مسبقًا.',
          show_alert: true
        })

        return
      }

      try {
        const result = await supabase.rpc(
          'approve_bot_completion_atomic',
          { p_completion_id: completionId }
        )

        if (result.error) {
          throw result.error
        }

        await ctx.answerCallbackQuery({ text: '✅ تمت الموافقة' })

        await notifyCompletionDecision(completionId, 'approved')
      } catch (error) {
        console.error('[bot:completion_approve]', error)

        await ctx.answerCallbackQuery({
          text: 'حدث خطأ، حاول مرة أخرى.',
          show_alert: true
        })
      }
    }
  )

  // صاحب المهمة يرفض تنفيذ Join Bot من داخل شات البوت — نطلب منه سبب الرفض أولًا
  bot.callbackQuery(
    /^completion_reject:(.+)$/,
    async (ctx) => {
      const completionId = ctx.match[1]

      const completion = await loadCompletionForReview(completionId)

      if (!completion) {
        await ctx.answerCallbackQuery({
          text: 'الطلب غير موجود.',
          show_alert: true
        })

        return
      }

      const { data: owner } = await supabase
        .from('users')
        .select('telegram_id')
        .eq('id', completion.tasks.owner_id)
        .maybeSingle()

      if (!owner?.telegram_id || ctx.from!.id !== owner.telegram_id) {
        await ctx.answerCallbackQuery({
          text: 'غير مصرح لك.',
          show_alert: true
        })

        return
      }

      if (completion.status !== 'owner_review') {
        await ctx.answerCallbackQuery({
          text: 'تمت معالجة هذا الطلب مسبقًا.',
          show_alert: true
        })

        return
      }

      pendingCompletionRejections.set(ctx.from!.id, completionId)

      await ctx.answerCallbackQuery()

      await ctx.reply('✍️ اكتب سبب رفض هذا التنفيذ:')
    }
  )

  bot.catch(
    error => {
      console.error(
        '[bot]',
        error
      )
    }
  )

  await bot.api.setMyCommands([
    {
      command: 'start',
      description:
        'بدء الاستخدام'
    },
    {
      command: 'app',
      description:
        'فتح التطبيق'
    },
    {
      command: 'balance',
      description:
        'عرض الرصيد'
    },
    {
      command: 'referral',
      description:
        'عرض الإحالة'
    },
    {
      command: 'id',
      description:
        'معرفة Telegram ID'
    },
    {
      command: 'support',
      description:
        'الدعم'
    },
    {
      command: 'paysupport',
      description:
        'مشاكل الدفع'
    },
    {
      command: 'terms',
      description:
        'الشروط'
    },
    {
      command: 'help',
      description:
        'المساعدة'
    }
  ])

  console.log(
    '[bot] Starting STORM polling...'
  )

  bot.start().catch(
    error => {
      console.error(
        '[bot] polling stopped with error:',
        error
      )
    }
  )
}
