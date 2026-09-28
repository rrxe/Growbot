import 'dotenv/config'

import app from './app.js'

import {
  config
} from './lib/config.js'

import {
  getMe as getTelegramMe
} from './lib/telegram.js'

import {
  startJobs
} from './jobs/index.js'

import {
  startBot,
  bot as telegramBot
} from '../bot/index.js'

async function start() {
  if (
    !config.botToken
  ) {
    console.log(
      '[storm] BOT_TOKEN not configured.'
    )
  } else {
    try {
      const me =
        await getTelegramMe()

      process.env.BOT_ID =
        String(me.id)

      console.log(
        `[storm] Telegram bot @${me.username || 'unknown'}`
      )
    } catch (error) {
      console.error(
        '[storm] Telegram startup check failed:',
        error
      )
    }
  }

  startJobs()

  void startBot()

  app.listen(
    config.port,
    '0.0.0.0',
    () => {
      console.log(
        `[storm] API running on :${config.port}`
      )
    }
  )
}

async function shutdown(signal: string) {
  console.log(`[storm] ${signal} received, stopping bot polling...`)

  try {
    await telegramBot?.stop()
  } catch (error) {
    console.error('[storm] error while stopping bot:', error)
  }

  process.exit(0)
}

process.on('SIGTERM', () => shutdown('SIGTERM'))
process.on('SIGINT', () => shutdown('SIGINT'))

void start()
