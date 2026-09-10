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

type SecuritySignals = {
  ipHash: string | null
  uaHash: string | null
  fpHash: string | null
}

async function findDuplicateUser(
  security: SecuritySignals,
  excludeTelegramId?: number
) {
  if (security.fpHash) {
    let q = supabase
      .from('users')
      .select('id, telegram_id')
      .eq('security_fp_hash', security.fpHash)
      .limit(1)

    if (excludeTelegramId != null) {
      q = q.neq('telegram_id', excludeTelegramId)
    }

    const { data, error } = await q
    if (error) throw error
    if (data && data.length > 0) return true
  }

  if (security.ipHash && security.uaHash) {
    let q = supabase
      .from('users')
      .select('id, telegram_id')
      .eq('security_ip_hash', security.ipHash)
      .eq('security_ua_hash', security.uaHash)
      .limit(1)

    if (excludeTelegramId != null) {
      q = q.neq('telegram_id', excludeTelegramId)
    }

    const { data, error } = await q
    if (error) throw error
    if (data && data.length > 0) return true
  }

  return false
}

export async function getOrCreateUser(
  telegramUser: TelegramUser,
  referralCode?: string | null,
  security: SecuritySignals = {
    ipHash: null,
    uaHash: null,
    fpHash: null
  }
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
    // حساب مسجَّل مسبقًا (قديم): حالة "حساب مكرر" لا يُعاد فحصها في كل
    // فتحة للتطبيق. تُحسم مرة واحدة فقط وقت إنشاء الحساب لأول مرة
    // (أسفل هذه الدالة)، وتبقى مجمّدة بعدها. هيك حساب قديم ما راح
    // ينقلب "مكرر" لاحقًا بسبب تطابق جهاز/شبكة مع حساب جديد.
    const isDuplicate =
      existing.is_duplicate_device === true

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
          new Date().toISOString(),

        security_ip_hash:
          security.ipHash ||
          existing.security_ip_hash ||
          null,

        security_ua_hash:
          security.uaHash ||
          existing.security_ua_hash ||
          null,

        security_fp_hash:
          security.fpHash ||
          existing.security_fp_hash ||
          null,

        is_duplicate_device:
          isDuplicate
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

  const duplicateFound =
    await findDuplicateUser(
      security
    )

  if (duplicateFound) {
    referredBy = null
  }

  if (
    referralCode &&
    !duplicateFound
  ) {
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
        new Date().toISOString(),

      security_ip_hash:
        security.ipHash,

      security_ua_hash:
        security.uaHash,

      security_fp_hash:
        security.fpHash,

      is_duplicate_device:
        duplicateFound,

      duplicate_notice_seen:
        false
    })
    .select('*')
    .single()

  if (createError) {
    // تصادم توقيت: طلب تاني بالتوازي سبقنا وأنشأ نفس المستخدم
    // (مثلاً /api/me و /api/tasks بنفس اللحظة لأول مرة). بدل ما نفشل،
    // منجيب الصف يلي هو أنشأه توًا.
    if (createError.code === '23505') {
      const {
        data: raceWinner,
        error: raceError
      } = await supabase
        .from('users')
        .select('*')
        .eq(
          'telegram_id',
          telegramUser.id
        )
        .single()

      if (raceError) {
        throw raceError
      }

      return raceWinner
    }

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
