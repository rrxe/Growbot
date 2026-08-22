import 'dotenv/config'

import {
  app
} from './app'

import {
  config
} from './lib/config'

import {
  getMe as getTelegramMe
} from './lib/telegram'

import {
  startJobs
} from './jobs'

async function start() {
  if (
    !config.botToken
  ) {
    console.log(
      '[growbot] BOT_TOKEN not configured.'
    )
  } else {
    try {
      const bot =
        await getTelegramMe()

      process.env.BOT_ID =
        String(bot.id)

      console.log(
        `[growbot] Telegram bot @${bot.username || 'unknown'}`
      )
    } catch (error) {
      console.error(
        '[growbot] Telegram startup check failed:',
        error
      )
    }
  }

  startJobs()

  app.listen(
    config.port,
    '0.0.0.0',
    () => {
      console.log(
        `[growbot] API running on :${config.port}`
      )
    }
  )
}

void start()
