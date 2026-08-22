import crypto from 'node:crypto'
import { config } from './config.js'

export interface TelegramUser {
  id: number
  first_name: string
  last_name?: string
  username?: string
  language_code?: string
  is_premium?: boolean
}

function buildSecretKey() {
  return crypto
    .createHmac(
      'sha256',
      'WebAppData'
    )
    .update(config.botToken)
    .digest()
}

export function validateTelegramInitData(
  initData: string,
  maxAgeSeconds = 86400
): TelegramUser {
  if (!config.botToken) {
    throw new Error(
      'BOT_TOKEN is not configured'
    )
  }

  if (!initData) {
    throw new Error(
      'Missing Telegram init data'
    )
  }

  const params =
    new URLSearchParams(initData)

  const receivedHash =
    params.get('hash')

  const authDate =
    Number(params.get('auth_date'))

  if (!receivedHash || !authDate) {
    throw new Error(
      'Invalid Telegram init data'
    )
  }

  const now = Math.floor(
    Date.now() / 1000
  )

  if (
    !Number.isFinite(authDate) ||
    now - authDate > maxAgeSeconds ||
    authDate - now > 60
  ) {
    throw new Error(
      'Telegram init data expired'
    )
  }

  params.delete('hash')

  const dataCheckString = [
    ...params.entries()
  ]
    .sort(([a], [b]) =>
      a.localeCompare(b)
    )
    .map(([key, value]) =>
      `${key}=${value}`
    )
    .join('\n')

  const calculatedHash =
    crypto
      .createHmac(
        'sha256',
        buildSecretKey()
      )
      .update(dataCheckString)
      .digest('hex')

  const receivedBuffer =
    Buffer.from(
      receivedHash,
      'hex'
    )

  const calculatedBuffer =
    Buffer.from(
      calculatedHash,
      'hex'
    )

  if (
    receivedBuffer.length !==
    calculatedBuffer.length ||
    !crypto.timingSafeEqual(
      receivedBuffer,
      calculatedBuffer
    )
  ) {
    throw new Error(
      'Invalid Telegram signature'
    )
  }

  const userRaw = params.get('user')

  if (!userRaw) {
    throw new Error(
      'Telegram user missing'
    )
  }

  let user: TelegramUser

  try {
    user = JSON.parse(userRaw)
  } catch {
    throw new Error(
      'Invalid Telegram user'
    )
  }

  if (!user?.id) {
    throw new Error(
      'Invalid Telegram user'
    )
  }

  return user
}

async function telegramRequest<T>(
  method: string,
  body: Record<string, unknown>
): Promise<T> {
  if (!config.botToken) {
    throw new Error(
      'BOT_TOKEN is not configured'
    )
  }

  const response = await fetch(
    `https://api.telegram.org/bot${config.botToken}/${method}`,
    {
      method: 'POST',
      headers: {
        'content-type':
          'application/json'
      },
      body: JSON.stringify(body)
    }
  )

  const data = await response.json() as {
    ok: boolean
    result?: T
    description?: string
  }

  if (!data.ok) {
    throw new Error(
      data.description ||
      `Telegram API error: ${method}`
    )
  }

  return data.result as T
}

export interface TelegramChat {
  id: number
  type: string
  title?: string
  username?: string
}

export interface TelegramChatMember {
  user: TelegramUser
  status:
    | 'creator'
    | 'administrator'
    | 'member'
    | 'restricted'
    | 'left'
    | 'kicked'
  is_anonymous?: boolean
  can_manage_chat?: boolean
}

export function getChat(
  chatId: string | number
) {
  return telegramRequest<TelegramChat>(
    'getChat',
    {
      chat_id: chatId
    }
  )
}

export function getChatMember(
  chatId: number,
  userId: number
) {
  return telegramRequest<TelegramChatMember>(
    'getChatMember',
    {
      chat_id: chatId,
      user_id: userId
    }
  )
}

export function getMe() {
  return telegramRequest<TelegramUser>(
    'getMe',
    {}
  )
}
