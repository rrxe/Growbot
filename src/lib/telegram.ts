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

export function showAlert(
  message: string
) {
  const webApp =
    getTelegramWebApp()

  if (webApp) {
    webApp.showAlert(
      message
    )

    return
  }

  window.alert(
    message
  )
}

// تأكيد بستايل تيليجرام الأصلي بدل نافذة المتصفح القبيحة (window.confirm)
export function showConfirm(
  message: string
): Promise<boolean> {
  const webApp =
    getTelegramWebApp()

  if (!webApp) {
    return Promise.resolve(
      window.confirm(message)
    )
  }

  return new Promise((resolve) => {
    webApp.showPopup(
      {
        message,
        buttons: [
          {
            id: 'cancel',
            type: 'cancel',
            text: 'إلغاء'
          },
          {
            id: 'ok',
            type: 'default',
            text: 'تأكيد'
          }
        ]
      },
      (id) => resolve(id === 'ok')
    )
  })
}
