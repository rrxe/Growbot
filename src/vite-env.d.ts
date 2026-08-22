/// <reference types="vite/client" />

interface TelegramWebAppUser {
  id: number
  is_bot?: boolean
  first_name: string
  last_name?: string
  username?: string
  language_code?: string
  is_premium?: boolean
}

interface TelegramWebApp {
  initData: string
  initDataUnsafe: {
    user?: TelegramWebAppUser
    start_param?: string
    query_id?: string
    auth_date?: number
    hash?: string
  }
  ready(): void
  expand(): void
  close(): void
  showPopup(params: {
    title?: string
    message: string
    buttons?: Array<{
      id?: string
      type?: 'default' | 'ok' | 'close' | 'cancel' | 'destructive'
      text: string
    }>
  }, callback?: (id?: string) => void): void
  showAlert(message: string, callback?: () => void): void
  openTelegramLink(url: string): void
  openLink(url: string): void
  HapticFeedback?: {
    impactOccurred(style: 'light' | 'medium' | 'heavy' | 'rigid' | 'soft'): void
    notificationOccurred(type: 'error' | 'success' | 'warning'): void
    selectionChanged(): void
  }
}

interface Window {
  Telegram?: {
    WebApp: TelegramWebApp
  }
}
