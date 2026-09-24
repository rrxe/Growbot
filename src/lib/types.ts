export type TaskType = 'channel' | 'group' | 'bot'

export type TaskStatus =
  | 'active'
  | 'paused'
  | 'completed'
  | 'cancelled'
  | 'pending_review'
  | 'rejected'

export type CompletionStatus =
  | 'pending'
  | 'verified'
  | 'reversed'
  | 'failed'
  | 'owner_review'
  | 'rejected'

export interface User {
  id: string
  telegram_id: number
  username: string | null
  first_name: string | null
  last_name: string | null
  points: number
  completed_tasks: number
  successful_referrals: number
  tasks_at_last_publish: number
  is_owner?: boolean
  referral_code: string
}

export interface Task {
  id: string
  owner_id: string
  type: TaskType
  title: string
  description: string | null
  chat_id: number | null
  chat_username: string | null
  chat_title: string | null
  bot_link: string | null
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
  screenshot_url: string | null
  owner_reviewed_at: string | null
  owner_rejection_reason: string | null
}

export interface OwnerReviewItem {
  id: string
  task_id: string
  user_id: string
  screenshot_url: string | null
  created_at: string
  tasks: {
    id: string
    title: string | null
    chat_username: string | null
    owner_id: string
    reward_points: number
  } | null
  users: {
    username: string | null
    first_name: string | null
    last_name: string | null
    telegram_id: number
  } | null
}

export interface RequiredChannel {
  id: string
  title: string
  url: string
  joined: boolean
}

export interface MeResponse {
  isDuplicateDevice: boolean
  membershipRequired: boolean
  membershipVerified: boolean
  requiredChannels: RequiredChannel[]
  missingChannels: RequiredChannel[]
  user: User
  dailyCheckin: {
    claimedToday: boolean
    justClaimed: boolean
    points: number
    tasksToday: number
    tasksRequired: number
  }
  referral: {
    code: string
    link: string | null
    completed_tasks: number
    required_tasks: number
    reward_points: number
    rewarded: boolean
    total_invited: number
    successful_referrals: number
  }
}

export interface TaskListResponse {
  tasks: Task[]
  completedTaskIds: string[]
}
