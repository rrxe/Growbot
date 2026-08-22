import { Bot, InlineKeyboard } from 'grammy'

const token =
  process.env.BOT_TOKEN || ''

const username =
  process.env.BOT_USERNAME || ''

const webAppUrl =
  process.env.WEBAPP_URL || ''

const ownerId =
  Number(
    process.env.OWNER_TELEGRAM_ID || 0
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
      `${webAppUrl.replace(/\/$/, '')}/admin.html`
    )
  }

  return keyboard
}

bot.command(
  'start',
  async (ctx) => {
    const payload =
      ctx.match?.trim() || ''

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
      payload.startsWith('ref_')
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
  async (ctx) => {
    if (!webAppUrl) {
      await ctx.reply(
        '🚧 الـMini App غير مربوط بعد.'
      )
      return
    }

    await ctx.reply(
      '🚀 افتح GrowBot:',
      {
        reply_markup:
          new InlineKeyboard().webApp(
            '🚀 فتح GrowBot',
            webAppUrl
          )
      }
    )
  }
)

bot.command(
  'id',
  async (ctx) => {
    await ctx.reply(
      `🆔 Telegram ID:\n\n${ctx.from.id}`
    )
  }
)

bot.command(
  'help',
  async (ctx) => {
    await ctx.reply(
      [
        'ℹ️ GrowBot',
        '',
        '/start — فتح البوت',
        '/app — فتح التطبيق',
        '/id — معرفة Telegram ID',
        '/help — المساعدة'
      ].join('\n')
    )
  }
)

export default async function handler(
  req: any,
  res: any
) {
  if (req.method !== 'POST') {
    res.status(200).json({
      ok: true,
      bot: username || null
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
  } catch (error) {
    console.error(
      '[telegram-webhook]',
      error
    )

    res.status(500).json({
      ok: false
    })
  }
}
