function numberEnv(
  key: string,
  fallback: number
) {
  const value = process.env[key]

  if (!value) {
    return fallback
  }

  const parsed = Number(value)

  return Number.isFinite(parsed)
    ? parsed
    : fallback
}

export const config = {
  port: numberEnv('PORT', 3000),

  botToken:
    process.env.BOT_TOKEN || '',

  botUsername:
    process.env.BOT_USERNAME || '',

  webAppUrl:
    process.env.WEBAPP_URL || '',

  pointsPerTask:
    numberEnv('POINTS_PER_TASK', 5),

  pointsPerUsd:
    numberEnv('POINTS_PER_USD', 500),

  referralReward:
    numberEnv('REFERRAL_REWARD', 150),

  referralRequiredTasks:
    numberEnv(
      'REFERRAL_REQUIRED_TASKS',
      5
    ),

  verificationDelayHours:
    numberEnv(
      'VERIFICATION_DELAY_HOURS',
      10
    )
}
