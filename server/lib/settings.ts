import { supabase } from './supabase'

export interface AppSettings {
  pointsPerTask: number
  pointsPerUsd: number
  referralReward: number
  referralRequiredTasks: number
  verificationDelayHours: number
}

const defaults: AppSettings = {
  pointsPerTask: 5,
  pointsPerUsd: 500,
  referralReward: 150,
  referralRequiredTasks: 5,
  verificationDelayHours: 10
}

let cachedSettings: AppSettings = {
  ...defaults
}

let loadedAt = 0

const CACHE_MS = 15_000

function parsePositiveNumber(
  value: string | undefined,
  fallback: number
) {
  const parsed = Number(value)

  if (
    !Number.isFinite(parsed) ||
    parsed <= 0
  ) {
    return fallback
  }

  return parsed
}

export async function getSettings(
  force = false
): Promise<AppSettings> {
  const now = Date.now()

  if (
    !force &&
    now - loadedAt < CACHE_MS
  ) {
    return cachedSettings
  }

  const {
    data,
    error
  } = await supabase
    .from('app_settings')
    .select('key,value')

  if (error) {
    throw error
  }

  const map: Record<
    string,
    string
  > = {}

  for (
    const row of data || []
  ) {
    map[row.key] = row.value
  }

  cachedSettings = {
    pointsPerTask:
      parsePositiveNumber(
        map.points_per_task,
        defaults.pointsPerTask
      ),

    pointsPerUsd:
      parsePositiveNumber(
        map.points_per_usd,
        defaults.pointsPerUsd
      ),

    referralReward:
      parsePositiveNumber(
        map.referral_reward,
        defaults.referralReward
      ),

    referralRequiredTasks:
      parsePositiveNumber(
        map.referral_required_tasks,
        defaults.referralRequiredTasks
      ),

    verificationDelayHours:
      parsePositiveNumber(
        map.verification_delay_hours,
        defaults.verificationDelayHours
      )
  }

  loadedAt = now

  return cachedSettings
}

export function clearSettingsCache() {
  loadedAt = 0
}

export { defaults as defaultSettings }
