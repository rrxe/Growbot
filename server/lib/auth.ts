import type { NextFunction, Request, Response } from 'express'
import {
  validateTelegramInitData
} from './telegram'
import { getOrCreateUser } from './users'

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

    const dbUser =
      await getOrCreateUser(
        telegramUser,
        startParam
      )

    if (dbUser.is_banned) {
      return res
        .status(403)
        .json({
          error:
            'تم إيقاف حسابك عن استخدام GrowBot.'
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
