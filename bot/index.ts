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

if (!config.botToken) {
  console.error(
    '[bot] BOT_TOKEN is missing.'
  )

  process.exit(1)
}

const bot =
  new Bot(
    config.botToken
  )


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
        '/admin — لوحة الإدارة',
        '/help — المساعدة',
        '',
        'من داخل التطبيق تقدر تكسب نقاط وتستخدمها للترويج لقناتك أو مجموعتك.'
      ].join('\n')
    )
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
    command: 'admin',
    description:
      'لوحة الإدارة'
  },
  {
    command: 'help',
    description:
      'المساعدة'
  }
])


console.log(
  '[bot] Starting GrowBot...'
)

await bot.start()
