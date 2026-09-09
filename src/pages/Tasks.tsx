import { useEffect, useRef, useState } from 'react'
import { completeTask, completeTaskWithScreenshot, getTasks } from '../lib/api'
import { compressImageToBase64 } from '../lib/image'
import {
  hapticError,
  hapticSuccess,
  openTelegramLink,
  showAlert
} from '../lib/telegram'
import { taskDisplayName, taskTypeStyle } from '../lib/format'
import type { Task, User } from '../lib/types'
import '../styles/tasks.css'

interface Props {
  user: User
  initialTasks?: Task[]
  initialCompletedIds?: string[]
  onUserChanged: (user: User) => void
}

type Filter = 'all' | 'channel' | 'group' | 'bot'

export function Tasks({
  user,
  initialTasks,
  initialCompletedIds,
  onUserChanged
}: Props) {
  const [filter, setFilter] = useState<Filter>('all')
  const [tasks, setTasks] = useState<Task[]>(initialTasks || [])
  const [completedIds, setCompletedIds] = useState<string[]>(initialCompletedIds || [])
  const [joinedIds, setJoinedIds] = useState<string[]>([])
  const [submittedIds, setSubmittedIds] = useState<string[]>([])
  const [loading, setLoading] = useState(!initialTasks)
  const [busyId, setBusyId] = useState<string | null>(null)
  const isMountRender = useRef(true)

  async function loadTasks() {
    try {
      setLoading(true)

      const response = await getTasks(
        filter === 'all' ? undefined : filter
      )

      setTasks(response.tasks)
      setCompletedIds(response.completedTaskIds)
    } catch (error) {
      showAlert(
        error instanceof Error
          ? error.message
          : 'تعذر تحميل المهام'
      )
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    // أول رندر: إذا عندنا بيانات جاهزة من صفحة التحميل الأولى (فلتر "الكل")
    // ما في داعي نعيد جلبها ونعرض سبينر ثاني. أي تغيير فلتر بعد هيك بيجيب طازة.
    if (isMountRender.current) {
      isMountRender.current = false

      if (initialTasks) {
        return
      }
    }

    void loadTasks()
  }, [filter])

  // خطوة 1: فتح القناة/المجموعة، بدون أي نافذة تأكيد مزعجة
  function handleJoin(task: Task) {
    if (task.chat_username) {
      const raw = task.chat_username.trim()

      const link = /^https?:\/\//i.test(raw)
        ? raw
        : `https://t.me/${raw.replace(/^@/, '')}`

      openTelegramLink(link)
    } else if (task.chat_id) {
      showAlert(
        'افتح القناة أو المجموعة من الرابط الموجود في المهمة، ثم ارجع واضغط تحقق.'
      )
    }

    setJoinedIds((current) => [
      ...current,
      task.id
    ])
  }

  // خطوة 2: التحقق الفعلي — بعد ما المستخدم يكون انضم فعليًا وضغط تحقق
  async function handleVerify(task: Task) {
    if (busyId) return

    try {
      setBusyId(task.id)

      const response = await completeTask(task.id)

      hapticSuccess()

      setCompletedIds((current) => [
        ...current,
        task.id
      ])

      onUserChanged({
        ...user,
        points: response.userPoints,
        completed_tasks: user.completed_tasks + 1
      })

      showAlert(
        `تم التحقق بنجاح.\n\n+${response.completion.rewardPoints} نقطة الآن.\nسيعاد فحص العضوية بعد 10 ساعات.`
      )
    } catch (error) {
      hapticError()

      showAlert(
        error instanceof Error
          ? error.message
          : 'تعذر تنفيذ المهمة'
      )
    } finally {
      setBusyId(null)
    }
  }

  // خطوة 2 (لمهام bot فقط): رفع سكرين شوت بدل التحقق التلقائي —
  // بيدخل بحالة "بانتظار مراجعة صاحب المهمة" لحد ما يوافق أو يرفض
  async function handleScreenshotSelected(
    task: Task,
    file: File
  ) {
    if (busyId) return

    try {
      setBusyId(task.id)

      const base64 = await compressImageToBase64(file)

      await completeTaskWithScreenshot(task.id, base64)

      hapticSuccess()

      setSubmittedIds((current) => [
        ...current,
        task.id
      ])

      showAlert(
        'تم إرسال السكرين شوت.\n\nبانتظار مراجعة صاحب المهمة.'
      )
    } catch (error) {
      hapticError()

      showAlert(
        error instanceof Error
          ? error.message
          : 'تعذر رفع الصورة'
      )
    } finally {
      setBusyId(null)
    }
  }

  const visibleTasks = tasks.filter(
    (task) =>
      !completedIds.includes(task.id) &&
      !submittedIds.includes(task.id)
  )

  return (
    <section className="page">
      <div className="page-header">
        <div>
          <span className="eyebrow">اكسب نقاط</span>
          <h1>المهام</h1>
        </div>

        <div className="points-badge">
          {user.points.toLocaleString('en-US')} نقطة
        </div>
      </div>

      <div className="filter-tabs">
        <button
          className={filter === 'all' ? 'active' : ''}
          onClick={() => setFilter('all')}
        >
          الكل
        </button>

        <button
          className={filter === 'channel' ? 'active' : ''}
          onClick={() => setFilter('channel')}
        >
          قنوات
        </button>

        <button
          className={filter === 'group' ? 'active' : ''}
          onClick={() => setFilter('group')}
        >
          مجموعات
        </button>

        <button
          className={filter === 'bot' ? 'active' : ''}
          onClick={() => setFilter('bot')}
        >
          بوتات
        </button>
      </div>

      {loading ? (
        <div className="empty-state">
          <div className="loading-spinner" />
          <p>جاري تحميل المهام...</p>
        </div>
      ) : visibleTasks.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">✓</div>
          <strong>لا توجد مهام الآن</strong>
          <p>
            جرّب مرة ثانية لاحقًا، المهام الجديدة تظهر هنا تلقائيًا.
          </p>
        </div>
      ) : (
        <div className="task-list">
          {visibleTasks.map((task) => {
            const name = taskDisplayName(task)
            const style = taskTypeStyle(task.type)
            const isJoined = joinedIds.includes(task.id)

            return (
            <article
              className="task-card"
              key={task.id}
            >
              <div
                className="task-avatar"
                style={{
                  background: `linear-gradient(135deg, ${style.colorFrom}, ${style.colorTo})`
                }}
              >
                {style.icon}
              </div>

              <div className="task-content">
                <strong>
                  {name}
                </strong>

                <span>
                  {task.type === 'channel'
                    ? 'قناة'
                    : task.type === 'bot'
                    ? 'بوت'
                    : 'مجموعة'}
                  {task.type !== 'bot' && task.chat_username
                    ? ` · ${task.chat_username}`
                    : ''}
                </span>

                <div className="task-progress-row">
                  <div className="task-progress-bar">
                    <div
                      style={{
                        width: `${task.target_completions > 0
                          ? Math.min(100, Math.round((task.completed_completions / task.target_completions) * 100))
                          : 0}%`
                      }}
                    />
                  </div>

                  <small>
                    {task.completed_completions} من {task.target_completions} انضموا
                  </small>
                </div>
              </div>

              <div className="task-right">
                <b>+{task.reward_points}</b>

                {isJoined && task.type === 'bot' ? (
                  <label className="task-action task-action-upload">
                    {busyId === task.id
                      ? 'جاري الرفع...'
                      : 'إرسال سكرين شوت'}

                    <input
                      type="file"
                      accept="image/*"
                      hidden
                      disabled={busyId !== null}
                      onChange={(event) => {
                        const file = event.target.files?.[0]

                        if (file) {
                          void handleScreenshotSelected(task, file)
                        }

                        event.target.value = ''
                      }}
                    />
                  </label>
                ) : isJoined ? (
                  <button
                    className="task-action task-action-verify"
                    disabled={busyId !== null}
                    onClick={() => void handleVerify(task)}
                  >
                    {busyId === task.id
                      ? 'جاري...'
                      : 'تحقق ✓'}
                  </button>
                ) : (
                  <button
                    className="task-action"
                    disabled={busyId !== null}
                    onClick={() => handleJoin(task)}
                  >
                    انضم
                  </button>
                )}
              </div>
            </article>
            )
          })}
        </div>
      )}
    </section>
  )
}
