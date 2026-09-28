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
    return task.title || 'مهمة انضمام'
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

// ألوان شارة ثابتة حسب نوع المهمة (قناة/بوت/مجموعة) — نفس التدرّج
// دايمًا لنفس النوع. الأيقونة نفسها بقت SVG قطة (TaskCatIcon) بدل
// الإيموجي القديم، وتُختار بشكل عشوائي-ثابت حسب معرّف كل مهمة.
export function taskTypeStyle(
  type: Task['type']
) {
  if (type === 'channel') {
    return {
      colorFrom: '#5aa7ff',
      colorTo: '#7ce0ff'
    }
  }

  if (type === 'bot') {
    return {
      colorFrom: '#b98cff',
      colorTo: '#ff8cf0'
    }
  }

  return {
    colorFrom: '#ff9c6b',
    colorTo: '#ffd76b'
  }
}
