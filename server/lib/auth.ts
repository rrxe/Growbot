import type { NextFunction, Request, Response } from 'express'
import {
  validateTelegramInitData
} from './telegram.js'
import crypto from 'node:crypto'
import { getOrCreateUser } from './users.js'

declare global {
  namespace Express {
    interface Request {
      telegramUser?: {
        id: number
        first_name: string
        last_name?: string
        username?: string
        language_code?: string
        is_premium?: boolean
      }

      dbUser?: any
    }
  }
}

export async function authMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const initData =
      req.header(
        'X-Telegram-Init-Data'
      ) || ''

    const telegramUser =
      validateTelegramInitData(initData)

    const startParam =
      new URLSearchParams(
        initData
      ).get('start_param')

    const forwardedFor =
      String(req.header('x-forwarded-for') || '')
        .split(',')[0]
        .trim()

    const rawIp =
      String(req.header('x-real-ip') || forwardedFor || req.socket.remoteAddress || '')
        .replace(/^::ffff:/, '')
        .trim()

    const antiAbuseSalt =
      process.env.ANTI_ABUSE_SALT ||
      process.env.ADSGRAM_REWARD_SECRET ||
      'change_this_anti_abuse_salt'

    const hashSecurityValue = (value: string) =>
      value
        ? crypto
            .createHash('sha256')
            .update(`${antiAbuseSalt}::${value}`, 'utf8')
            .digest('hex')
        : null

    const clientSignals =
      String(req.header('x-client-signals') || '').trim()

    const security = {
      ipHash: hashSecurityValue(rawIp),
      uaHash: hashSecurityValue(String(req.header('user-agent') || '').trim()),
      fpHash: hashSecurityValue(clientSignals.slice(0, 2000))
    }

    const dbUser =
      await getOrCreateUser(
        telegramUser,
        startParam,
        security
      )

    if (dbUser.is_banned) {
      return res
        .status(403)
        .json({
          error:
            'تم إيقاف حسابك عن استخدام STORM.'
        })
    }

    req.telegramUser =
      telegramUser

    req.dbUser =
      dbUser

    next()
  } catch (error) {
    next(error)
  }
}
