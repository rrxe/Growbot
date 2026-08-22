export type TaskType = 'channel' | 'group'

export type TaskStatus =
  | 'active'
  | 'paused'
  | 'completed'
  | 'cancelled'

export type CompletionStatus =
  | 'pending'
  | 'verified'
  | 'reversed'
  | 'failed'

export interface User {
  id: string
  telegram_id: number
  username: string | null
  first_name: string | null
  last_name: string | null
  points: number
  completed_tasks: number
  successful_referrals: number
  referral_code: string
}

export interface Task {
  id: string
  owner_id: string
  type: TaskType
  title: string
  chat_id: number | null
  chat_username: string | null
  chat_title: string | null
  budget_points: number
  remaining_points: number
  reward_points: number
  target_completions: number
  completed_completions: number
  status: TaskStatus
  created_at: string
}

export interface TaskCompletion {
  id: string
  task_id: string
  user_id: string
  reward_points: number
  status: CompletionStatus
  joined_at: string
  verify_after: string
  verified_at: string | null
  reversed_at: string | null
  reversal_reason: string | null
}

export interface MeResponse {
  user: User
  dailyCheckin: {
    claimedToday: boolean
    justClaimed: boolean
    points: number
  }
  referral: {
    code: string
    link: string | null
    completed_tasks: number
    required_tasks: number
    reward_points: number
    rewarded: boolean
  }
}

export interface TaskListResponse {
  tasks: Task[]
  completedTaskIds: string[]
}
