import { getInitData } from './telegram.js'

import type {
  MeResponse,
  OwnerReviewItem,
  Task,
  TaskListResponse
} from './types.js'

async function request<T>(
  url: string,
  options: RequestInit = {}
): Promise<T> {
  const initData =
    getInitData()

  const headers =
    new Headers(
      options.headers
    )

  headers.set(
    'Content-Type',
    'application/json'
  )

  if (initData) {
    headers.set(
      'X-Telegram-Init-Data',
      initData
    )
  }

  if (typeof window !== 'undefined') {
    const n = window.navigator
    const s = window.screen

    headers.set(
      'X-Client-Signals',
      [
        `screen=${s?.width || 0}x${s?.height || 0}x${s?.colorDepth || 0}`,
        `pixelRatio=${window.devicePixelRatio || 1}`,
        `tz=${Intl.DateTimeFormat().resolvedOptions().timeZone || ''}`,
        `lang=${n.language || ''}`,
        `platform=${n.platform || ''}`,
        `cores=${n.hardwareConcurrency || 0}`,
        `touch=${n.maxTouchPoints || 0}`
      ].join('|')
    )
  }

  const response =
    await fetch(
      url,
      {
        ...options,
        headers
      }
    )

  const data =
    await response
      .json()
      .catch(() => null)

  if (!response.ok) {
    throw new Error(
      data?.error ||
      data?.message ||
      'حدث خطأ غير متوقع'
    )
  }

  return data as T
}


export function getMe() {
  return request<MeResponse>(
    '/api/me'
  )
}


export function getTasks(
  type?: string
) {
  const query =
    type
      ? `?type=${encodeURIComponent(type)}`
      : ''

  return request<TaskListResponse>(
    `/api/tasks${query}`
  )
}


export function createTask(
  payload: {
    type:
      | 'channel'
      | 'group'
      | 'bot'

    chat?: string

    title?: string

    budgetPoints: number

    botLink?: string

    rewardPoints?: number

    description?: string
  }
) {
  return request<{
    task: Task
    userPoints: number
  }>(
    '/api/tasks',
    {
      method: 'POST',
      body:
        JSON.stringify(
          payload
        )
    }
  )
}


export function completeTask(
  taskId: string
) {
  return request<{
    completion: {
      id: string
      status: string
      rewardPoints: number
      verifyAfter: string
    }

    userPoints: number
  }>(
    `/api/tasks/${taskId}/complete`,
    {
      method: 'POST'
    }
  )
}


export function completeTaskWithScreenshot(
  taskId: string,
  screenshotBase64: string
) {
  return request<{
    completion: {
      id: string
      status: string
    }
  }>(
    `/api/tasks/${taskId}/complete-with-screenshot`,
    {
      method: 'POST',
      body:
        JSON.stringify({
          screenshotBase64
        })
    }
  )
}


export function getOwnerReviewCompletions() {
  return request<{
    items: OwnerReviewItem[]
  }>(
    '/api/tasks/owner-review'
  )
}


export function approveCompletion(
  completionId: string
) {
  return request<{
    ok: true
  }>(
    `/api/tasks/completions/${completionId}/approve`,
    {
      method: 'POST'
    }
  )
}


export function rejectCompletion(
  completionId: string,
  reason: string
) {
  return request<{
    ok: true
  }>(
    `/api/tasks/completions/${completionId}/reject`,
    {
      method: 'POST',
      body:
        JSON.stringify({
          reason
        })
    }
  )
}


export function getMyTasks() {
  return request<{
    tasks: Task[]
  }>(
    '/api/tasks/mine'
  )
}


export function cancelTask(
  taskId: string
) {
  return request<{
    ok: true
    refundedPoints: number
    userPoints: number
  }>(
    `/api/tasks/${taskId}/cancel`,
    {
      method: 'POST'
    }
  )
}


export function createStarsInvoice(
  stars: number
) {
  return request<{
    invoiceUrl: string
    points: number
    stars: number
  }>(
    '/api/payments/stars/invoice',
    {
      method: 'POST',
      body:
        JSON.stringify({
          stars
        })
    }
  )
}

export function startAdsgramWatch() {
  return request<{
    success: boolean
    id: string
    watched: number
    remaining: number
    blockId: string
    dailyLimit: number
    rewardPoints: number
  }>('/api/adsgram/watch/start', {
    method: 'POST'
  })
}

export function completeAdsgramWatch() {
  return request<{
    success: boolean
    reward: number
    balance: number
    watched: number
    remaining: number
    error?: string
    code?: string
  }>('/api/adsgram/watch/complete', {
    method: 'POST'
  })
}

export function getAdsgramWatchStatus() {
  return request<{
    success: boolean
    watched: number
    remaining: number
    pending: boolean
    blockId: string
    dailyLimit: number
    rewardPoints: number
  }>('/api/adsgram/watch/status')
}

export function getAdsgramNativeStatus() {
  return request<{
    success: boolean
    count: number
    rewardPoints: number
    blockId: string
  }>('/api/adsgram/native/status')
}


export type WalletWithdrawal = {
  id: string
  amountUsdt: number
  gramAddress: string
  status: 'pending' | 'approved' | 'rejected'
  adminNote: string | null
  createdAt: string
  updatedAt: string
}

export type WalletResponse = {
  success: boolean
  coins: number
  usdtBalance: number
  gramAddress: string
  withdrawalAdsWatched: number
  withdrawalAdsRequired: number
  exchangeMinCoins: number
  coinsPerUsdt: number
  usdtPer1000Coins: number
  rewardBlockId: string
  withdrawalMinUsdt: number
  withdrawals: WalletWithdrawal[]
}

export function getWallet() {
  return request<WalletResponse>('/api/wallet')
}

export function startWalletExchangeAd(amountCoins: number) {
  return request<{
    success: boolean
    sessionId: string
    blockId: string
    amountCoins: number
    usdtGained: number
  }>('/api/wallet/exchange/start', {
    method: 'POST',
    body: JSON.stringify({ amountCoins })
  })
}

export function completeWalletExchangeAd() {
  return request<{
    success: boolean
    coins: number
    usdtBalance: number
    usdtGained: number
  }>('/api/wallet/exchange/complete', {
    method: 'POST'
  })
}

export function startWithdrawalUnlockAd() {
  return request<{
    success: boolean
    sessionId: string
    blockId: string
    watched: number
    required: number
  }>('/api/wallet/withdrawal-ad/start', {
    method: 'POST'
  })
}

export function completeWithdrawalUnlockAd() {
  return request<{
    success: boolean
    watched: number
    required: number
    remaining: number
  }>('/api/wallet/withdrawal-ad/complete', {
    method: 'POST'
  })
}

export function cancelWalletAd(sessionId: string) {
  return request<{ success: boolean }>('/api/wallet/ad/cancel', {
    method: 'POST',
    body: JSON.stringify({ sessionId })
  })
}

export function createWithdrawal(amountUsdt: number, gramAddress: string) {
  return request<{
    success: boolean
    requestId: string
    usdtBalance: number
    status: 'pending'
  }>('/api/wallet/withdraw', {
    method: 'POST',
    body: JSON.stringify({ amountUsdt, gramAddress })
  })
}

export type WeeklyLeaderboardResponse = {
  success: boolean
  weekStart: string
  resetsEvery: string
  list: {
    rank: number
    telegramId: string
    name: string
    tasks: number
    isMe: boolean
  }[]
  me: {
    rank: number
    telegramId: string
    name: string
    tasks: number
    isMe: boolean
  } | null
}

export function getWeeklyLeaderboard() {
  return request<WeeklyLeaderboardResponse>('/api/leaderboard')
}
