import { useEffect, useState } from 'react'
import { completeTask, getTasks } from '../lib/api'
import {
  hapticError,
  hapticSuccess,
  openTelegramLink,
  showAlert
} from '../lib/telegram'
import type { Task, User } from '../lib/types'
import '../styles/tasks.css'

interface Props {
  user: User
  onUserChanged: (user: User) => void
}

type Filter = 'all' | 'channel' | 'group'

export function Tasks({
  user,
  onUserChanged
}: Props) {
  const [filter, setFilter] = useState<Filter>('all')
  const [tasks, setTasks] = useState<Task[]>([])
  const [completedIds, setCompletedIds] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<string | null>(null)

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
    void loadTasks()
  }, [filter])

  async function handleTask(task: Task) {
    if (busyId) return

    try {
      setBusyId(task.id)

      if (task.chat_username) {
        openTelegramLink(
          `https://t.me/${task.chat_username.replace(/^@/, '')}`
        )
      } else if (task.chat_id) {
        showAlert(
          'افتح القناة أو المجموعة من الرابط الموجود في المهمة، ثم ارجع واضغط تحقق.'
        )
      }

      const confirmed = window.confirm(
        'بعد الانضمام فعليًا، اضغط موافق حتى نتحقق من عضويتك.'
      )

      if (!confirmed) {
        return
      }

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

  const visibleTasks = tasks.filter(
    (task) => !completedIds.includes(task.id)
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
          {visibleTasks.map((task) => (
            <article
              className="task-card"
              key={task.id}
            >
              <div className="task-avatar">
                {task.type === 'channel' ? 'ق' : 'ج'}
              </div>

              <div className="task-content">
                <strong>
                  {task.title}
                </strong>

                <span>
                  {task.chat_title || task.chat_username || 'مهمة'}
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
                <b>+5</b>

                <button
                  className="task-action"
                  disabled={busyId !== null}
                  onClick={() => void handleTask(task)}
                >
                  {busyId === task.id
                    ? 'تحقق...'
                    : 'انضم'}
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  )
}
