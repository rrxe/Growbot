import crypto from 'node:crypto'

import {
  supabase
} from './supabase.js'

import {
  getSettings
} from './settings.js'

import type {
  TelegramUser
} from './telegram.js'

function makeReferralCode() {
  return crypto
    .randomBytes(5)
    .toString('hex')
}

export async function getOrCreateUser(
  telegramUser: TelegramUser,
  referralCode?: string | null
) {
  const settings =
    await getSettings()

  const {
    data: existing,
    error: existingError
  } = await supabase
    .from('users')
    .select('*')
    .eq(
      'telegram_id',
      telegramUser.id
    )
    .maybeSingle()

  if (existingError) {
    throw existingError
  }

  if (existing) {
    const {
      data: updated,
      error: updateError
    } = await supabase
      .from('users')
      .update({
        username:
          telegramUser.username ?? null,
        first_name:
          telegramUser.first_name ?? null,
        last_name:
          telegramUser.last_name ?? null,
        last_seen_at:
          new Date().toISOString()
      })
      .eq(
        'id',
        existing.id
      )
      .select('*')
      .single()

    if (updateError) {
      throw updateError
    }

    return updated
  }

  let referredBy:
    string | null = null

  if (referralCode) {
    const {
      data: referrer,
      error: referrerError
    } = await supabase
      .from('users')
      .select(
        'id, telegram_id'
      )
      .eq(
        'referral_code',
        referralCode
      )
      .maybeSingle()

    if (referrerError) {
      throw referrerError
    }

    if (
      referrer &&
      referrer.telegram_id !==
        telegramUser.id
    ) {
      referredBy =
        referrer.id
    }
  }

  let referralCodeForNewUser =
    makeReferralCode()

  for (;;) {
    const {
      data: existingCode,
      error: codeError
    } = await supabase
      .from('users')
      .select('id')
      .eq(
        'referral_code',
        referralCodeForNewUser
      )
      .maybeSingle()

    if (codeError) {
      throw codeError
    }

    if (!existingCode) {
      break
    }

    referralCodeForNewUser =
      makeReferralCode()
  }

  const {
    data: created,
    error: createError
  } = await supabase
    .from('users')
    .insert({
      telegram_id:
        telegramUser.id,

      username:
        telegramUser.username ??
        null,

      first_name:
        telegramUser.first_name ??
        null,

      last_name:
        telegramUser.last_name ??
        null,

      referral_code:
        referralCodeForNewUser,

      referred_by:
        referredBy,

      last_seen_at:
        new Date().toISOString()
    })
    .select('*')
    .single()

  if (createError) {
    throw createError
  }

  if (referredBy) {
    const {
      error: referralError
    } = await supabase
      .from('referrals')
      .insert({
        referrer_id:
          referredBy,

        referred_id:
          created.id,

        required_tasks:
          settings.referralRequiredTasks,

        completed_tasks:
          0,

        reward_points:
          settings.referralReward,

        rewarded:
          false
      })

    if (
      referralError &&
      referralError.code !==
        '23505'
    ) {
      throw referralError
    }
  }

  return created
}
