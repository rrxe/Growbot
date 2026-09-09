import {
  Bot,
  InlineKeyboard
} from 'grammy'

import {
  supabase
} from '../server/lib/supabase.js'

import {
  getChatMember
} from '../server/lib/telegram.js'

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
      '🚀 فتح StormGrow',
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


interface RequiredChannel {
  id: string
  chat_username: string | null
  chat_id: number | null
  title: string
  invite_link: string | null
}

async function getRequiredChannels(): Promise<
  RequiredChannel[]
> {
  const {
    data,
    error
  } = await supabase
    .from('required_channels')
    .select(
      'id, chat_username, chat_id, title, invite_link'
    )
    .eq('is_active', true)

  if (error) {
    console.error(
      '[bot:required-channels]',
      error
    )

    return []
  }

  console.log(
    '[bot:required-channels:list]',
    JSON.stringify(data)
  )

  return data || []
}

async function getMissingChannels(
  userId: number
): Promise<RequiredChannel[]> {
  const channels =
    await getRequiredChannels()

  if (channels.length === 0) {
    console.log(
      '[bot:required-channels] no active channels configured'
    )

    return []
  }

  const missing: RequiredChannel[] = []

  for (const channel of channels) {
    const identifier =
      channel.chat_id ??
      (channel.chat_username
        ? `@${channel.chat_username}`
        : null)

    if (!identifier) {
      console.log(
        '[bot:required-channels] skip — no identifier',
        channel.title
      )

      continue
    }

    try {
      const member =
        await getChatMember(
          identifier,
          userId
        )

      console.log(
        '[bot:required-channels:check]',
        channel.title,
        'user',
        userId,
        'status',
        member.status
      )

      const isMember =
        member.status === 'member' ||
        member.status === 'administrator' ||
        member.status === 'creator' ||
        member.status === 'restricted'

      if (!isMember) {
        missing.push(channel)
      }
    } catch (error) {
      // إذا فشل الفحص (البوت مو أدمن بالقناة مثلًا)، ما منوقف تجربة
      // المستخدم بالكامل بسبب خطأ إعداد — بس منسجل الخطأ ونتجاوز.
      console.error(
        '[bot:required-channels:check:error]',
        channel.title,
        error
      )
    }
  }

  console.log(
    '[bot:required-channels] missing count:',
    missing.length
  )

  return missing
}

function requiredChannelsKeyboard(
  missing: RequiredChannel[]
) {
  const keyboard =
    new InlineKeyboard()

  for (const channel of missing) {
    const url =
      channel.invite_link ||
      (channel.chat_username
        ? `https://t.me/${channel.chat_username}`
        : null)

    if (url) {
      keyboard
        .url(
          `🔗 ${channel.title}`,
          url
        )
        .row()
    }
  }

  keyboard.text(
    '✅ تحققت من الانضمام',
    'check_required_channels'
  )

  return keyboard
}

async function sendRequiredChannelsGate(
  ctx: any
) {
  const missing =
    await getMissingChannels(
      ctx.from.id
    )

  if (missing.length === 0) {
    return true
  }

  await ctx.reply(
    [
      '🔒 قبل ما تكمل، لازم تنضم للقنوات/المجموعات التالية:',
      '',
      ...missing.map(
        (channel) => `• ${channel.title}`
      ),
      '',
      'بعد ما تنضم لكلها، اضغط "تحققت من الانضمام".'
    ].join('\n'),
    {
      reply_markup:
        requiredChannelsKeyboard(
          missing
        )
    }
  )

  return false
}


async function replyWelcome(
  ctx: any
) {
  const payload =
    ctx.match?.trim() ||
    ''

  const lines = [
    '⚡ أهلًا بك في StormGrow',
    '',
    'منصة تبادل حقيقية لنمو القنوات والمجموعات.',
    '',
    '💚 تنفيذ مهمة = +5 نقاط',
    '🎁 دعوة صديق = +150 نقطة بعد 5 مهام',
    '',
    'افتح التطبيق من الزر بالأسفل وابدأ.'
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
