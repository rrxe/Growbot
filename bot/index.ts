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
      '🚀 فتح GrowBot',
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
  const keyboard =
    miniAppKeyboard()

  let role:
    | 'owner'
    | 'admin'
    | null = null

  try {
    role =
      await resolveRole(
        ctx.from.id
      )
  } catch (
    error
  ) {
    console.error(
      '[bot:role]',
      error
    )
  }

  if (
    role &&
    adminAppUrl()
  ) {
    keyboard.webApp(
      '⚙️ لوحة الإدارة',
      adminAppUrl()
    )
  }

  const lines = [
    '🚀 أهلًا بك في GrowBot',
    '',
    'منصة لتبادل نمو القنوات والمجموعات.',
    '',
    '💚 تنفيذ المهمة = +5 نقاط',
    '💵 $1 = 500 نقطة',
    '🎁 الإحالة = +150 نقطة بعد 5 مهام',
    '',
    'افتح التطبيق من الزر بالأسفل.'
  ]

  if (
    referralPayload.startsWith(
      'ref_'
    )
  ) {
    lines.push(
      '',
      '✅ تم حفظ رابط الإحالة لهذا الدخول.'
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

let started = false

export async function startBot() {
  if (started) {
    return
  }

  if (!config.botToken) {
    console.error(
      '[bot] BOT_TOKEN is missing — polling not started.'
    )

    return
  }

  started = true

  const bot =
    new Bot(
      config.botToken
    )

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
          '🚧 الـMini App لم يتم ربطه بعد.\n\nسيعمل هذا الزر تلقائيًا بعد إضافة WEBAPP_URL.'
        )

        return
      }

      await ctx.reply(
        '🚀 افتح GrowBot:',
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

        const keyboard =
          new InlineKeyboard()
            .webApp(
              '⚙️ فتح لوحة الإدارة',
              url
            )

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
          '🆔 Telegram ID الخاص بك:',
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
          'النقاط داخل GrowBot تُستخدم لنشر وتنفيذ المهام داخل المنصة فقط.',
          'إيقاف مهمة يعيد فقط الميزانية المتبقية منها.',
          'نظام الإحالات يعتمد على تنفيذ مهام حقيقية، مش تسجيل دخول فقط.',
          'عمليات الشراء عبر Telegram Stars تتم بالكامل عبر نظام Telegram.'
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
            ctx.from.id
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
        'ℹ️ GrowBot',
        '',
        '/start — فتح البوت',
        '/app — فتح التطبيق',
        '/id — معرفة Telegram ID',
        '/support — الدعم',
        '/paysupport — مشاكل الدفع',
        '/terms — الشروط',
        '/help — المساعدة'
      ]

      if (role) {
        lines.splice(
          4,
          0,
          '/admin — لوحة الإدارة'
        )
      }

      await ctx.reply(
        lines.join('\n')
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
            config.webAppUrl
              ? 'افتح التطبيق لرؤية الرصيد الجديد.'
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
        '[bot]',
        error
      )
    }
  )

  await bot.api.setMyCommands([
    {
      command: 'start',
      description:
        'فتح GrowBot'
    },
    {
      command: 'app',
      description:
        'فتح التطبيق'
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
    '[bot] Starting GrowBot polling...'
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
