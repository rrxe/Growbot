import {
  useEffect,
  useState
} from 'react'
import {
  approveCompletion,
  cancelTask,
  getOwnerReviewCompletions,
  rejectCompletion
} from '../lib/api'
import { hapticError, hapticSuccess, showAlert, showConfirm } from '../lib/telegram'
import { taskDisplayName, taskTypeStyle } from '../lib/format'
import type { MeResponse, OwnerReviewItem, Task, User } from '../lib/types'
import '../styles/profile.css'

interface Props {
  user: User
  initialMyTasks?: Task[]
  initialReferral?: MeResponse['referral'] | null
  onUserChanged: (user: User) => void
}

const STATUS_LABEL: Record<
  Task['status'],
  string
> = {
  active: 'نشطة',
  paused: 'متوقفة',
  completed: 'مكتملة',
  cancelled: 'ملغاة',
  pending_review: 'بانتظار المراجعة',
  rejected: 'مرفوضة'
}

export function Profile({
  user,
  initialMyTasks,
  initialReferral,
  onUserChanged
}: Props) {
  const [referral] = useState<
    MeResponse['referral'] | null
  >(initialReferral || null)

  const [myTasks, setMyTasks] = useState<Task[]>(initialMyTasks || [])
  const [tasksLoading] = useState(!initialMyTasks)
  const [cancellingId, setCancellingId] = useState<string | null>(null)

  const [reviewItems, setReviewItems] = useState<OwnerReviewItem[]>([])
  const [reviewLoading, setReviewLoading] = useState(true)
  const [reviewBusyId, setReviewBusyId] = useState<string | null>(null)
  const [rejectingId, setRejectingId] = useState<string | null>(null)
  const [rejectReason, setRejectReason] = useState('')

  useEffect(() => {
    let active = true

    getOwnerReviewCompletions()
      .then((response) => {
        if (active) {
          setReviewItems(response.items)
        }
      })
      .catch(() => {})
      .finally(() => {
        if (active) {
          setReviewLoading(false)
        }
      })

    return () => {
      active = false
    }
  }, [])

  async function handleApproveReview(item: OwnerReviewItem) {
    if (reviewBusyId) return

    try {
      setReviewBusyId(item.id)

      await approveCompletion(item.id)

      hapticSuccess()

      setReviewItems((current) =>
        current.filter((row) => row.id !== item.id)
      )
    } catch (error) {
      hapticError()

      showAlert(
        error instanceof Error
          ? error.message
          : 'تعذرت الموافقة.'
      )
    } finally {
      setReviewBusyId(null)
    }
  }

  async function handleRejectReview(item: OwnerReviewItem) {
    if (reviewBusyId) return

    const reason = rejectReason.trim()

    if (!reason) {
      showAlert('اكتب سبب الرفض.')
      return
    }

    try {
      setReviewBusyId(item.id)

      await rejectCompletion(item.id, reason)

      hapticSuccess()

      setReviewItems((current) =>
        current.filter((row) => row.id !== item.id)
      )

      setRejectingId(null)
      setRejectReason('')
    } catch (error) {
      hapticError()

      showAlert(
        error instanceof Error
          ? error.message
          : 'تعذر الرفض.'
      )
    } finally {
      setReviewBusyId(null)
    }
  }

  async function handleCancel(task: Task) {
    if (cancellingId) return

    const confirmed = await showConfirm(
      `بتوقف "${taskDisplayName(task)}" وبيرجعلك الباقي من الميزانية (${task.remaining_points.toLocaleString('en-US')} نقطة). أكمل؟`
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
          {(user.first_name || 'S')
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

              const name = taskDisplayName(task)
              const style = taskTypeStyle(task.type)

              return (
                <div
                  className="my-task-card"
                  key={task.id}
                >
                  <div className="my-task-top">
                    <div className="my-task-identity">
                      <div
                        className="my-task-avatar"
                        style={{
                          background: `linear-gradient(135deg, ${style.colorFrom}, ${style.colorTo})`
                        }}
                      >
                        {style.icon}
                      </div>

                      <strong>{name}</strong>
                    </div>

                    <span
                      className={`status-pill status-${task.status}`}
                    >
                      {STATUS_LABEL[task.status]}
                    </span>
                  </div>

                  <span className="my-task-sub">
                    {task.type === 'channel' ? 'قناة' : 'مجموعة'}
                    {task.chat_username ? ` · ${task.chat_username}` : ''}
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

      <div className="my-tasks-section">
        <div className="my-tasks-head">
          <span className="eyebrow">مراجعة التنفيذ</span>
          <h2>قيد المراجعة</h2>
        </div>

        {reviewLoading ? (
          <div className="my-tasks-empty">
            <div className="loading-spinner" />
            <p>جاري التحميل...</p>
          </div>
        ) : reviewItems.length === 0 ? (
          <div className="my-tasks-empty">
            <p>لا يوجد طلبات بانتظار مراجعتك حاليًا.</p>
          </div>
        ) : (
          <div className="my-task-list">
            {reviewItems.map((item) => (
              <div className="review-card" key={item.id}>
                <div className="review-top">
                  <strong>
                    {item.tasks?.title || 'مهمة Join Bot'}
                  </strong>

                  <span>
                    {item.users?.first_name || ''}
                    {item.users?.username
                      ? ` @${item.users.username}`
                      : ''}
                  </span>
                </div>

                {item.screenshot_url && (
                  <img
                    className="review-screenshot"
                    src={item.screenshot_url}
                    alt="سكرين شوت التنفيذ"
                  />
                )}

                {rejectingId === item.id ? (
                  <div className="review-reject-box">
                    <textarea
                      placeholder="اكتب سبب الرفض..."
                      value={rejectReason}
                      onChange={(event) =>
                        setRejectReason(event.target.value)
                      }
                    />

                    <div className="review-actions">
                      <button
                        className="review-btn review-btn-cancel"
                        disabled={reviewBusyId === item.id}
                        onClick={() => {
                          setRejectingId(null)
                          setRejectReason('')
                        }}
                      >
                        رجوع
                      </button>

                      <button
                        className="review-btn review-btn-reject"
                        disabled={reviewBusyId === item.id}
                        onClick={() => void handleRejectReview(item)}
                      >
                        {reviewBusyId === item.id
                          ? 'جاري...'
                          : 'تأكيد الرفض'}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="review-actions">
                    <button
                      className="review-btn review-btn-reject"
                      disabled={reviewBusyId !== null}
                      onClick={() => {
                        setRejectingId(item.id)
                        setRejectReason('')
                      }}
                    >
                      رفض
                    </button>

                    <button
                      className="review-btn review-btn-approve"
                      disabled={reviewBusyId !== null}
                      onClick={() => void handleApproveReview(item)}
                    >
                      {reviewBusyId === item.id
                        ? 'جاري...'
                        : 'موافقة'}
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="rules-card">
        <h3>قواعد StormGrow</h3>

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
