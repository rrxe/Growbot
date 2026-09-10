import { supabase } from './supabase.js'
import { getChatMember } from './telegram.js'

export interface RequiredChannel {
  id: string
  chat_username: string | null
  chat_id: number | null
  title: string
  invite_link: string | null
  is_active?: boolean
}

const JOINED_STATUSES = new Set([
  'member',
  'administrator',
  'creator',
  'restricted'
])

export async function getRequiredChannels(): Promise<RequiredChannel[]> {
  const { data, error } = await supabase
    .from('required_channels')
    .select('id, chat_username, chat_id, title, invite_link, is_active')
    .eq('is_active', true)
    .order('created_at', { ascending: true })

  if (error) {
    throw error
  }

  return (data || []) as RequiredChannel[]
}

export async function getMissingRequiredChannels(
  telegramUserId: number
): Promise<RequiredChannel[]> {
  const channels = await getRequiredChannels()

  if (channels.length === 0) {
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
      continue
    }

    try {
      const member = await getChatMember(identifier, telegramUserId)

      if (!JOINED_STATUSES.has(member.status)) {
        missing.push(channel)
      }
    } catch (error) {
      console.error(
        '[required-channels:check]',
        channel.title,
        error
      )

      // لا نعتبر الفشل في فحص قناة كأنه اشتراك صحيح.
      missing.push(channel)
    }
  }

  return missing
}

export function buildRequiredChannelsKeyboard(
  channels: RequiredChannel[]
) {
  const rows: Array<Array<{
    text: string
    url?: string
    callback_data?: string
  }>> = []

  for (const channel of channels) {
    const url =
      channel.invite_link ||
      (channel.chat_username
        ? `https://t.me/${channel.chat_username}`
        : '')

    if (url) {
      rows.push([
        {
          text: `الانضمام إلى ${channel.title}`,
          url
        }
      ])
    }
  }

  rows.push([
    {
      text: 'تحققت من الانضمام',
      callback_data: 'check_required_channels'
    }
  ])

  return {
    inline_keyboard: rows
  }
}

export async function sendRequiredChannelsGate(ctx: any) {
  let missing: RequiredChannel[]

  try {
    missing = await getMissingRequiredChannels(ctx.from.id)
  } catch (error) {
    console.error('[required-channels:gate]', error)

    await ctx.reply(
      [
        'تعذر التحقق من الاشتراك حاليًا.',
        '',
        'حاول مرة أخرى بعد قليل.'
      ].join('\n')
    )

    return false
  }

  if (missing.length === 0) {
    return true
  }

  await ctx.reply(
    [
      'الانضمام مطلوب قبل استخدام STORM.',
      '',
      'انضم إلى القنوات الرسمية التالية ثم اضغط «تحققت من الانضمام».',
      '',
      ...missing.map((channel) => `• ${channel.title}`)
    ].join('\n'),
    {
      reply_markup: buildRequiredChannelsKeyboard(missing)
    }
  )

  return false
}
