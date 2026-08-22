import {
  Bot,
  InlineKeyboard
} from 'grammy'

import {
  supabase
} from '../server/lib/supabase.js'

const token =
  process.env.BOT_TOKEN ||
  ''

const username =
  process.env.BOT_USERNAME ||
  ''

const webAppUrl =
  process.env.WEBAPP_URL ||
  ''

const ownerId =
  Number(
    process.env.OWNER_TELEGRAM_ID ||
    0
  )

if (!token) {
  throw new Error(
    'BOT_TOKEN is missing'
  )
}

const bot =
  new Bot(token)


function appKeyboard(
  userId: number
) {
  const keyboard =
    new InlineKeyboard()

  if (webAppUrl) {
    keyboard.webApp(
      '🚀 فتح GrowBot',
      webAppUrl
    )
  }

  return keyboard
}


function adminAppUrl() {
  if (!webAppUrl) {
    return ''
  }

  return `${webAppUrl.replace(
    /\/$/,
    ''
  )}/admin.html`
}


async function resolveRole(
  telegramId: number
) {
  if (
    ownerId > 0 &&
    telegramId === ownerId
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
    data?.role === 'admin' ||
    data?.role === 'owner'
  ) {
    return data.role
  }

  return null
}


bot.command(
  'start',
  async (
    ctx
  ) => {
    const payload =
      ctx.match?.trim() ||
      ''

    const lines = [
      '🚀 أهلًا بك في GrowBot',
      '',
      'منصة لتبادل نمو القنوات والمجموعات.',
      '',
      '💚 تنفيذ المهمة = +5 نقاط',
      '🎁 الإحالة = +150 نقطة بعد 5 مهام',
      '',
      'افتح التطبيق من الزر بالأسفل.'
    ]

    if (
      payload.startsWith(
        'ref_'
      )
    ) {
      lines.push(
        '',
        '✅ تم حفظ رابط الإحالة لهذا الدخول.'
      )
    }

    let role:
      'owner' | 'admin' | null =
      null

    try {
      role = await resolveRole(
        ctx.from.id
      )
    } catch (error) {
      console.error(
        '[bot:role]',
        error
      )
    }

    const keyboard =
      appKeyboard(ctx.from.id)

    if (
      role &&
      adminAppUrl()
    ) {
      keyboard.webApp(
        '⚙️ لوحة الإدارة',
        adminAppUrl()
      )
    }

    await ctx.reply(
      lines.join('\n'),
      {
        reply_markup:
          keyboard
      }
    )
  }
)


bot.command(
  'app',
  async (
    ctx
  ) => {
    if (!webAppUrl) {
      await ctx.reply(
        '🚧 التطبيق غير مربوط بعد.'
      )

      return
    }

    await ctx.reply(
      '🚀 افتح GrowBot:',
      {
        reply_markup:
          new InlineKeyboard()
            .webApp(
              '🚀 فتح GrowBot',
              webAppUrl
            )
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
      const role =
        await resolveRole(
          ctx.from.id
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

      await ctx.reply(
        [
          '🔐 لوحة الإدارة',
          '',
          `الصلاحية: ${
            role === 'owner'
              ? '👑 Owner'
              : '🛡️ Admin'
          }`
        ].join('\n'),
        {
          reply_markup:
            new InlineKeyboard()
              .webApp(
                '⚙️ فتح لوحة الإدارة',
                url
              )
        }
      )
    } catch (error) {
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
      `🆔 Telegram ID:\n\n${ctx.from.id}`
    )
  }
)


bot.command(
  'support',
  async (
    ctx
  ) => {
    await ctx.reply(
      'للدعم ومشاكل الطلبات:\n@ncryptix'
    )
  }
)


bot.command(
  'paysupport',
  async (
    ctx
  ) => {
    await ctx.reply(
      'لدعم عمليات الشراء أو مشاكل الدفع:\n@ncryptix'
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
        '📄 شروط استخدام GrowBot',
        '',
        'النقاط داخل GrowBot تستخدم لشراء وتنفيذ المهام داخل المنصة.',
        'الطلبات الملغاة تعيد فقط الميزانية المتبقية.',
        'نظام الإحالات يعتمد على مهام حقيقية.',
        'عمليات الشراء عبر Telegram Stars تتم عبر نظام Telegram.'
      ].join('\n')
    )
  }
)


bot.command(
  'help',
  async (
    ctx
  ) => {
    await ctx.reply(
      [
        'ℹ️ GrowBot',
        '',
        '/start — فتح البوت',
        '/app — فتح التطبيق',
        '/admin — لوحة الإدارة',
        '/id — معرفة Telegram ID',
        '/support — الدعم',
        '/paysupport — مشاكل الدفع',
        '/terms — الشروط',
        '/help — المساعدة'
      ].join('\n')
    )
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
          'تعذر العثور على الطلب.'
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
          'قيمة الفاتورة غير صحيحة.'
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
        'حدث خطأ مؤقت. حاول مرة أخرى.'
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
              ctx.from.id,

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
          '✅ تم الدفع بنجاح',
          '',
          `⭐ ${payment.total_amount} Stars`,
          'تمت إضافة النقاط إلى رصيدك.',
          '',
          webAppUrl
            ? 'افتح التطبيق لرؤية الرصيد الجديد.'
            : ''
        ]
          .filter(Boolean)
          .join('\n'),
        {
          reply_markup:
            webAppUrl
              ? new InlineKeyboard()
                  .webApp(
                    '🚀 فتح GrowBot',
                    webAppUrl
                  )
              : undefined
        }
      )
    } catch (
      error
    ) {
      // تيليجرام سحب الستارز فعليًا هون، بس ما قدرنا نضيف النقاط.
      // لازم نعلم المستخدم بدل ما نسكت، ونسجل charge_id عشان الدعم يقدر يرجعله يدويًا.
      console.error(
        '[payment:success]',
        {
          chargeId:
            payment.telegram_payment_charge_id,
          invoicePayload:
            payment.invoice_payload,
          telegramId:
            ctx.from.id,
          error
        }
      )

      await ctx.reply(
        [
          '⚠️ تم خصم الـ Stars لكن حصل خطأ مؤقت بإضافة النقاط.',
          '',
          `رقم العملية: ${payment.telegram_payment_charge_id}`,
          'تواصل مع @ncryptix وأرسل له هذا الرقم وسيتم إضافة نقاطك يدويًا فورًا.'
        ].join('\n')
      ).catch(() => {})
    }
  }
)


bot.catch(
  error => {
    console.error(
      '[telegram]',
      error
    )
  }
)


let commandsRegistered = false

export default async function handler(
  req: any,
  res: any
) {
  if (
    req.method !==
    'POST'
  ) {
    // bot/index.ts القديم كان يسجل الأوامر عند الإقلاع (setMyCommands).
    // بما إنه انحذف والـ webhook هو الوحيد المتبقي، نسجلها هون
    // (مرة واحدة لكل cold start، الاستدعاء آمن ومكرر بدون ضرر لو صار أكتر من مرة)
    if (!commandsRegistered) {
      commandsRegistered = true

      await bot.api
        .setMyCommands([
          {
            command: 'start',
            description: 'فتح البوت'
          },
          {
            command: 'app',
            description: 'فتح التطبيق'
          },
          {
            command: 'admin',
            description: 'لوحة الإدارة'
          },
          {
            command: 'id',
            description: 'معرفة Telegram ID'
          },
          {
            command: 'support',
            description: 'الدعم'
          },
          {
            command: 'paysupport',
            description: 'مشاكل الدفع'
          },
          {
            command: 'terms',
            description: 'الشروط'
          },
          {
            command: 'help',
            description: 'المساعدة'
          }
        ])
        .catch(error => {
          console.error(
            '[telegram:setMyCommands]',
            error
          )
        })
    }

    res.status(200).json({
      ok: true,
      bot:
        username || null
    })

    return
  }

  try {
    await bot.init()

    await bot.handleUpdate(
      req.body
    )

    res.status(200).json({
      ok: true
    })
  } catch (
    error
  ) {
    console.error(
      '[telegram-webhook]',
      error
    )

    res.status(500).json({
      ok: false
    })
  }
}
