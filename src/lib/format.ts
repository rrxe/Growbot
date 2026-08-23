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

// شعار ثابت حسب نوع المهمة (قناة/مجموعة) — نفس الشعار دايمًا لنفس
// النوع، بدل الاعتماد على أول حرف من اسم متغيّر
export function taskTypeStyle(
  type: Task['type']
) {
  if (type === 'channel') {
    return {
      icon: '📢',
      colorFrom: '#5aa7ff',
      colorTo: '#7ce0ff'
    }
  }

  return {
    icon: '👥',
    colorFrom: '#ff9c6b',
    colorTo: '#ffd76b'
  }
}
