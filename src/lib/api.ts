import { getInitData } from './telegram'
import type {
  MeResponse,
  Task,
  TaskListResponse
} from './types'

async function request<T>(
  url: string,
  options: RequestInit = {}
): Promise<T> {
  const initData = getInitData()

  const headers = new Headers(options.headers)

  headers.set('Content-Type', 'application/json')

  if (initData) {
    headers.set('X-Telegram-Init-Data', initData)
  }

  const response = await fetch(url, {
    ...options,
    headers
  })

  const data = await response.json().catch(() => null)

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
  return request<MeResponse>('/api/me')
}

export function getTasks(type?: string) {
  const query = type ? `?type=${encodeURIComponent(type)}` : ''

  return request<TaskListResponse>(
    `/api/tasks${query}`
  )
}

export function createTask(payload: {
  type: 'channel' | 'group'
  chat: string
  title?: string
  budgetPoints: number
}) {
  return request<{
    task: Task
  }>('/api/tasks', {
    method: 'POST',
    body: JSON.stringify(payload)
  })
}

export function completeTask(taskId: string) {
  return request<{
    completion: {
      id: string
      status: string
      rewardPoints: number
      verifyAfter: string
    }
    userPoints: number
  }>(`/api/tasks/${taskId}/complete`, {
    method: 'POST'
  })
}
