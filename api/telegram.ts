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

  if (
    ownerId > 0 &&
    userId === ownerId &&
    webAppUrl
  ) {
    keyboard.webApp(
      '⚙️ لوحة الإدارة',
      `${webAppUrl.replace(
        /\/$/,
        ''
      )}/admin.html`
    )
  }

  return keyboard
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

    await ctx.reply(
      lines.join('\n'),
      {
        reply_markup:
          appKeyboard(
            ctx.from.id
          )
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
      console.error(
        '[payment:success]',
        error
      )
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


export default async function handler(
  req: any,
  res: any
) {
  if (
    req.method !==
    'POST'
  ) {
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
