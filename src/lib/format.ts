import type { Task } from './types.js'

const AVATAR_COLORS: [string, string][] = [
  ['#d4ff3d', '#7cff9c'],
  ['#5aa7ff', '#7ce0ff'],
  ['#ff9c6b', '#ffd76b'],
  ['#c993ff', '#7ce0ff'],
  ['#ff6b9c', '#ffb36b'],
  ['#6bffcf', '#5aa7ff']
]

function isLink(
  value: string
) {
  return /^https?:\/\//i.test(
    value.trim()
  )
}

// اسم عرض نظيف للمهمة — أبدًا رابط خام، دايمًا اسم القناة/المجموعة الفعلي
export function taskDisplayName(
  task: Task
) {
  if (task.chat_title) {
    return task.chat_title
  }

  if (task.chat_username) {
    return task.chat_username.replace(/^@/, '')
  }

  if (
    task.title &&
    !isLink(task.title)
  ) {
    return task.title
  }

  return task.type === 'channel'
    ? 'قناة تيليجرام'
    : 'مجموعة تيليجرام'
}

// لون أفتار ثابت مبني على اسم القناة (زي تيليجرام تمامًا) —
// نفس الاسم دايمًا نفس اللون، بس متنوع بين القنوات
export function avatarColors(
  name: string
): [string, string] {
  let hash = 0

  for (let i = 0; i < name.length; i++) {
    hash = (hash * 31 + name.charCodeAt(i)) % AVATAR_COLORS.length
  }

  return AVATAR_COLORS[
    Math.abs(hash) % AVATAR_COLORS.length
  ]
}
