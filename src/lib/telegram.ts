export function getTelegramWebApp() {
  return window.Telegram?.WebApp ?? null
}

export function initTelegram() {
  const webApp = getTelegramWebApp()

  if (!webApp) {
    return null
  }

  webApp.ready()
  webApp.expand()

  return webApp
}

export function getInitData() {
  const webApp = getTelegramWebApp()

  return webApp?.initData ?? ''
}

export function openTelegramLink(url: string) {
  const webApp = getTelegramWebApp()

  if (webApp) {
    webApp.openTelegramLink(url)
    return
  }

  window.open(url, '_blank', 'noopener,noreferrer')
}

export function hapticSuccess() {
  getTelegramWebApp()?.HapticFeedback?.notificationOccurred('success')
}

export function hapticError() {
  getTelegramWebApp()?.HapticFeedback?.notificationOccurred('error')
}

export function showAlert(message: string) {
  const webApp = getTelegramWebApp()

  if (webApp) {
    webApp.showAlert(message)
    return
  }

  window.alert(message)
}
