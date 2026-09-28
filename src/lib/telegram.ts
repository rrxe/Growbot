import {
  requestAlert,
  requestConfirm
} from './modal'

export function getTelegramWebApp() {
  return (
    window.Telegram?.WebApp ||
    null
  )
}

export function initTelegram() {
  const webApp =
    getTelegramWebApp()

  if (!webApp) {
    return null
  }

  webApp.ready()
  webApp.expand()

  return webApp
}

export function getInitData() {
  return (
    getTelegramWebApp()
      ?.initData || ''
  )
}

export function openTelegramLink(
  url: string
) {
  const webApp =
    getTelegramWebApp()

  if (webApp) {
    webApp.openTelegramLink(
      url
    )

    return
  }

  window.open(
    url,
    '_blank',
    'noopener,noreferrer'
  )
}

export function openInvoice(
  url: string,
  callback?: (
    status: string
  ) => void
) {
  const webApp =
    getTelegramWebApp()

  if (!webApp) {
    window.open(
      url,
      '_blank',
      'noopener,noreferrer'
    )

    return
  }

  webApp.openInvoice(
    url,
    callback
  )
}

export function hapticSuccess() {
  getTelegramWebApp()
    ?.HapticFeedback
    ?.notificationOccurred(
      'success'
    )
}

export function hapticError() {
  getTelegramWebApp()
    ?.HapticFeedback
    ?.notificationOccurred(
      'error'
    )
}

// نافذة تنبيه بستايل STORM الخاص بدل نافذة تيليجرام الافتراضية الرمادية
export function showAlert(
  message: string
) {
  void requestAlert(
    message
  )
}

// تأكيد بستايل STORM الخاص بدل نافذة تيليجرام الافتراضية (showPopup) أو نافذة المتصفح
export function showConfirm(
  message: string
): Promise<boolean> {
  return requestConfirm(
    message
  )
}
