import type { Task } from './types.js'

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
  if (task.type === 'bot') {
    return task.title || 'مهمة Join Bot'
  }

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

// شارة المهمة (قناة/بوت/مجموعة) صارت وجه قطة (TaskCatIcon) على خلفية
// تتبع المظهر مباشرة (أسود مع وجه أبيض بالمظهر الداكن، أبيض مع وجه
// أسود بالفاتح) — راجع .task-avatar / .my-task-avatar بالـ CSS.
