import {
  useEffect,
  useState
} from 'react'
import { getMe, getMyTasks, cancelTask } from '../lib/api'
import { hapticError, hapticSuccess, showAlert } from '../lib/telegram'
import type { Task, User } from '../lib/types'
import '../styles/profile.css'

interface Props {
  user: User
  onUserChanged: (user: User) => void
}

const STATUS_LABEL: Record<
  Task['status'],
  string
> = {
  active: 'نشطة',
  paused: 'متوقفة',
  completed: 'مكتملة',
  cancelled: 'ملغاة'
}

export function Profile({
  user,
  onUserChanged
}: Props) {
  const [referral, setReferral] = useState<{
    code: string
    link: string | null
    completed_tasks: number
    required_tasks: number
    reward_points: number
    rewarded: boolean
  } | null>(null)

  const [myTasks, setMyTasks] = useState<Task[]>([])
  const [tasksLoading, setTasksLoading] = useState(true)
  const [cancellingId, setCancellingId] = useState<string | null>(null)

  useEffect(() => {
    void getMe()
      .then((response) => {
        setReferral(response.referral)
      })
      .catch(() => {
        setReferral(null)
      })

    void loadMyTasks()
  }, [])

  async function loadMyTasks() {
    try {
      setTasksLoading(true)

      const response = await getMyTasks()

      setMyTasks(response.tasks)
    } catch {
      // ما بنعطل باقي الصفحة إذا فشل تحميل قائمة مهامي
    } finally {
      setTasksLoading(false)
    }
  }

  async function handleCancel(task: Task) {
    if (cancellingId) return

    const confirmed = window.confirm(
      `بتوقف "${task.title}" وبيرجعلك الباقي من الميزانية (${task.remaining_points.toLocaleString('en-US')} نقطة). أكمل؟`
    )

    if (!confirmed) return

    try {
      setCancellingId(task.id)

      const result = await cancelTask(task.id)

      hapticSuccess()

      showAlert(
        `تم إيقاف المهمة واسترجاع ${result.refundedPoints.toLocaleString('en-US')} نقطة.`
      )

      setMyTasks((current) =>
        current.map((item) =>
          item.id === task.id
            ? { ...item, status: 'cancelled', remaining_points: 0 }
            : item
        )
      )

      onUserChanged({
        ...user,
        points: result.userPoints
      })
    } catch (error) {
      hapticError()

      showAlert(
        error instanceof Error
          ? error.message
          : 'تعذر إيقاف المهمة.'
      )
    } finally {
      setCancellingId(null)
    }
  }

  const progress = referral
    ? Math.min(
        100,
        Math.round(
          (referral.completed_tasks /
            referral.required_tasks) *
          100
        )
      )
    : 0

  async function copyReferral() {
    if (!referral?.link) return

    await navigator.clipboard.writeText(
      referral.link
    )

    showAlert(
      'تم نسخ رابط الدعوة.'
    )
  }

  return (
    <section className="page">
      <div className="page-header">
        <div>
          <span className="eyebrow">الحساب</span>
          <h1>
            {user.first_name || 'مستخدم'}
          </h1>
        </div>

        <div className="avatar-large">
          {(user.first_name || 'G')
            .charAt(0)
            .toUpperCase()}
        </div>
      </div>

      <div className="stats-grid">
        <div>
          <strong>
            {user.points.toLocaleString('en-US')}
          </strong>
          <span>النقاط</span>
        </div>

        <div>
          <strong>
            {user.completed_tasks}
          </strong>
          <span>مهام</span>
        </div>

        <div>
          <strong>
            {user.successful_referrals}
          </strong>
          <span>إحالات</span>
        </div>
      </div>

      <div className="referral-card">
        <span className="eyebrow">
          نظام الإحالة
        </span>

        <h2>
          ادعُ صديقًا واربح 150 نقطة
        </h2>

        <p>
          بعد دخول صديقك من رابطك وتنفيذه 5 مهام،
          تحصل أنت على 150 نقطة إضافية.
        </p>

        <div className="referral-progress">
          <div
            style={{
              width: `${progress}%`
            }}
          />
        </div>

        <div className="referral-meta">
          <span>
            {referral?.completed_tasks ?? 0}
            {' / '}
            {referral?.required_tasks ?? 5}
            {' مهام'}
          </span>

          <strong>
            +{referral?.reward_points ?? 150}
          </strong>
        </div>

        <div className="referral-link">
          <span dir="ltr">
            {referral?.link ||
              'جاري إنشاء الرابط...'}
          </span>

          <button
            disabled={!referral?.link}
            onClick={() => void copyReferral()}
          >
            نسخ
          </button>
        </div>
      </div>

      <div className="my-tasks-section">
        <div className="my-tasks-head">
          <span className="eyebrow">
            متابعة النشر
          </span>

          <h2>مهامي</h2>
        </div>

        {tasksLoading ? (
          <div className="my-tasks-empty">
            <div className="loading-spinner" />
            <p>جاري التحميل...</p>
          </div>
        ) : myTasks.length === 0 ? (
          <div className="my-tasks-empty">
            <p>لسا ما نشرت أي مهمة.</p>
          </div>
        ) : (
          <div className="my-task-list">
            {myTasks.map((task) => {
              const percent =
                task.target_completions > 0
                  ? Math.min(
                      100,
                      Math.round(
                        (task.completed_completions /
                          task.target_completions) *
                        100
                      )
                    )
                  : 0

              return (
                <div
                  className="my-task-card"
                  key={task.id}
                >
                  <div className="my-task-top">
                    <strong>{task.title}</strong>

                    <span
                      className={`status-pill status-${task.status}`}
                    >
                      {STATUS_LABEL[task.status]}
                    </span>
                  </div>

                  <span className="my-task-sub">
                    {task.chat_title || task.chat_username}
                  </span>

                  <div className="my-task-progress-row">
                    <div className="task-progress-bar">
                      <div
                        style={{
                          width: `${percent}%`
                        }}
                      />
                    </div>

                    <small>
                      {task.completed_completions} من {task.target_completions}
                    </small>
                  </div>

                  <div className="my-task-bottom">
                    <span>
                      باقي من الميزانية:{' '}
                      <b>
                        {task.remaining_points.toLocaleString('en-US')}
                      </b>{' '}
                      نقطة
                    </span>

                    {task.status === 'active' && (
                      <button
                        className="my-task-cancel"
                        disabled={cancellingId === task.id}
                        onClick={() => void handleCancel(task)}
                      >
                        {cancellingId === task.id
                          ? 'جاري الإيقاف...'
                          : 'إيقاف واسترجاع'}
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      <div className="rules-card">
        <h3>قواعد GrowBot</h3>

        <p>
          • تنفيذ المهمة يعطيك 5 نقاط.
        </p>

        <p>
          • يتم إعادة التحقق بعد 10 ساعات.
        </p>

        <p>
          • إذا خرجت من المكان بعد الحصول على النقاط،
          يتم خصم 5 نقاط.
        </p>

        <p>
          • يمكن أن يصبح رصيدك سالبًا في حال الخصم.
        </p>
      </div>
    </section>
  )
}
