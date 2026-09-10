import { useEffect, useRef, useState } from 'react'
import { tryAcquireGlobalAdLock, releaseGlobalAdLock, getAdLockWaitSeconds } from '../lib/adLock.js'
import { completeTask, completeTaskWithScreenshot, getTasks, getMe, getAdsgramNativeStatus } from '../lib/api.js'
import { compressImageToBase64 } from '../lib/image'
import {
  hapticError,
  hapticSuccess,
  openTelegramLink,
  showAlert,
  showConfirm
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

const ADSGRAM_NATIVE_TASK_BLOCK_ID = 'task-46724'
const ADSGRAM_NATIVE_TASK_REWARD = 1


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
  const nativeTaskElRef = useRef<HTMLElement | null>(null)
  const nativeRewardCountRef = useRef(0)
  const nativePollTimerRef = useRef<number | null>(null)
  const [nativeTaskAvailable, setNativeTaskAvailable] = useState(true)
  const [nativeTaskReady, setNativeTaskReady] = useState(false)
  const [nativeTaskBusy, setNativeTaskBusy] = useState(false)

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

  useEffect(() => {
    let cancelled = false

    const loadNativeCount = async () => {
      try {
        const result = await getAdsgramNativeStatus()
        nativeRewardCountRef.current = result.count
        setNativeTaskReady(true)
      } catch {
        setNativeTaskReady(true)
        // keep zero as fallback; the webhook confirmation can still arrive later
      }
    }

    void loadNativeCount()

    const el = nativeTaskElRef.current
    if (!el) return

    const onReward = async () => {
      if (nativeTaskBusy || cancelled) return
      const before = nativeRewardCountRef.current
      setNativeTaskBusy(true)

      if (!tryAcquireGlobalAdLock()) {
        setNativeTaskBusy(false)
        showAlert(`انتظر ${getAdLockWaitSeconds()} ثانية قبل تشغيل إعلان آخر.`)
        return
      }

      try {
        // الحدث من الويب كومبوننت مجرد trigger. المكافأة الحقيقية تأتي من Reward URL.
        for (let attempt = 0; attempt < 900; attempt += 1) {
          await new Promise(resolve => window.setTimeout(resolve, 200))
          const result = await getAdsgramNativeStatus()
          nativeRewardCountRef.current = result.count

          if (result.count > before) {
            try {
              const latest = await getMe()
              onUserChanged(latest.user)
            } catch {}
            hapticSuccess()
            showAlert(`+${ADSGRAM_NATIVE_TASK_REWARD} نقطة ✅`)
            return
          }
        }

        showAlert('تم إنهاء المهمة، لكن تأكيد المكافأة ما وصل بعد. لا تضغط مرة ثانية؛ سيتحدث الرصيد عند وصول التأكيد.')
      } catch (error) {
        showAlert(error instanceof Error ? error.message : 'تعذر تأكيد مكافأة الإعلان.')
      } finally {
        releaseGlobalAdLock()
        setNativeTaskBusy(false)
      }
    }

    const onNotFound = () => setNativeTaskAvailable(false)
    el.addEventListener('reward', onReward)
    el.addEventListener('onBannerNotFound', onNotFound)

    return () => {
      cancelled = true
      el.removeEventListener('reward', onReward)
      el.removeEventListener('onBannerNotFound', onNotFound)
      if (nativePollTimerRef.current !== null) {
        window.clearTimeout(nativePollTimerRef.current)
      }
    }
  }, [nativeTaskBusy, nativeTaskReady, onUserChanged])

  // خطوة 1 (بوت): يعرض وصف المهمة بنافذة تأكيد تيليجرام الأصلية، وبعد
  // ما المستخدم يضغط "تأكيد" فقط يفتح رابط البوت.
  async function handleJoinBot(task: Task) {
    const confirmed = await showConfirm(
      task.description?.trim()
        ? task.description.trim()
        : 'بتنتقل الآن لبوت خارجي، افتحه واضغط Start فيه ثم ارجع هنا وأرسل سكرين شوت.'
    )

    if (!confirmed) {
      return
    }

    if (task.bot_link) {
      openTelegramLink(task.bot_link)
    }

    setJoinedIds((current) => [
      ...current,
      task.id
    ])
  }

  // خطوة 1: فتح القناة/المجموعة، بدون أي نافذة تأكيد مزعجة
  function handleJoin(task: Task) {
    if (task.type === 'bot') {
      void handleJoinBot(task)

      return
    }

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

      {nativeTaskAvailable && nativeTaskReady && (
        <article className="adsgram-native-task-card">
          <div className="adsgram-native-task-badge">AD</div>
          <div className="adsgram-native-task-copy">
            <strong>مهمة AdsGram</strong>
            <span>نفّذ الإعلان واربح +1 نقطة</span>
          </div>
          <div className="adsgram-native-task-host">
            {/* @ts-expect-error AdsGram web component */}
            <adsgram-task ref={nativeTaskElRef} data-block-id={ADSGRAM_NATIVE_TASK_BLOCK_ID} data-debug="false">
              <span slot="reward">+1</span>
              <span slot="button">{nativeTaskBusy ? 'جاري التحقق...' : 'فتح الإعلان'}</span>
              <span slot="claim">استلام +1</span>
              <span slot="done">تمت المهمة ✓</span>
            {/* @ts-expect-error AdsGram web component */}
            </adsgram-task>
          </div>
        </article>
      )}

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

                {task.description ? (
                  <p className="task-desc">
                    {task.description}
                  </p>
                ) : null}

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


