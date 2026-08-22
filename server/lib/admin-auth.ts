import type {
  NextFunction,
  Request,
  Response
} from 'express'

import {
  validateTelegramInitData
} from './telegram'

import {
  getOrCreateUser
} from './users'

import { supabase } from './supabase'

export type AdminRole =
  | 'owner'
  | 'admin'

declare global {
  namespace Express {
    interface Request {
      adminRole?: AdminRole
    }
  }
}

async function resolveAdminRole(
  telegramId: number
): Promise<AdminRole | null> {
  const ownerId =
    Number(
      process.env.OWNER_TELEGRAM_ID || 0
    )

  if (
    ownerId > 0 &&
    telegramId === ownerId
  ) {
    return 'owner'
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

export function adminMiddleware(
  requiredRole: AdminRole = 'admin'
) {
  return async (
    req: Request,
    res: Response,
    next: NextFunction
  ) => {
    try {
      const initData =
        req.header(
          'X-Telegram-Init-Data'
        ) || ''

      if (!initData) {
        return res
          .status(401)
          .json({
            error:
              'Telegram authentication required.'
          })
      }

      const telegramUser =
        validateTelegramInitData(
          initData
        )

      const startParam =
        new URLSearchParams(
          initData
        ).get(
          'start_param'
        )

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
              'تم إيقاف حسابك.'
          })
      }

      const role =
        await resolveAdminRole(
          telegramUser.id
        )

      if (!role) {
        return res
          .status(403)
          .json({
            error:
              'ليس لديك صلاحية دخول لوحة الإدارة.'
          })
      }

      if (
        requiredRole === 'owner' &&
        role !== 'owner'
      ) {
        return res
          .status(403)
          .json({
            error:
              'هذه العملية متاحة للـOwner فقط.'
          })
      }

      req.telegramUser =
        telegramUser

      req.dbUser =
        dbUser

      req.adminRole =
        role

      next()
    } catch (error) {
      next(error)
    }
  }
}
