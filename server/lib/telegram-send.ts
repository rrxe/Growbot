import { config } from './config.js'

// إرسال مباشر عبر Telegram Bot API، بدون الحاجة لتحميل grammY كامل
// بروتة الإدارة — كافي لرسالة واحدة أو broadcast متسلسل.
export async function sendTelegramMessage(
  chatId: number,
  text: string
): Promise<{ ok: boolean; error?: string }> {
  if (!config.botToken) {
    return {
      ok: false,
      error: 'BOT_TOKEN missing'
    }
  }

  try {
    const response = await fetch(
      `https://api.telegram.org/bot${config.botToken}/sendMessage`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          chat_id: chatId,
          text,
          disable_web_page_preview: true
        })
      }
    )

    const data = await response.json()

    if (!data.ok) {
      return {
        ok: false,
        error: data.description || 'send failed'
      }
    }

    return { ok: true }
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof Error
          ? error.message
          : 'network error'
    }
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export interface BroadcastResult {
  total: number
  sent: number
  failed: number
  blocked: number
}

// بث رسالة لعدة مستخدمين بالتسلسل مع تأخير بسيط حتى ما نصطدم
// بحدود Telegram لعدد الرسائل بالثانية (~30 رسالة/ثانية لمحادثات مختلفة)
export async function broadcastToUsers(
  telegramIds: number[],
  text: string,
  delayMs = 40
): Promise<BroadcastResult> {
  const result: BroadcastResult = {
    total: telegramIds.length,
    sent: 0,
    failed: 0,
    blocked: 0
  }

  for (const telegramId of telegramIds) {
    const outcome = await sendTelegramMessage(
      telegramId,
      text
    )

    if (outcome.ok) {
      result.sent += 1
    } else if (
      outcome.error?.includes('blocked') ||
      outcome.error?.includes('deactivated') ||
      outcome.error?.includes('not found')
    ) {
      result.blocked += 1
    } else {
      result.failed += 1
    }

    await sleep(delayMs)
  }

  return result
}
