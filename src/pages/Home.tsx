import {
  useEffect,
  useState
} from 'react'

import {
  getMe,
  createStarsInvoice,
  getAdsgramWatchStatus,
  startAdsgramWatch,
  completeAdsgramWatch
} from '../lib/api.js'

import {
  hapticSuccess,
  openInvoice,
  openTelegramLink,
  showAlert
} from '../lib/telegram.js'

import type {
  Screen
} from '../App.js'

import {
  tryAcquireGlobalAdLock,
  releaseGlobalAdLock,
  getAdLockWaitSeconds
} from '../lib/adLock.js'

import type {
  User
} from '../lib/types.js'

import '../styles/home.css'

interface Props {
  user: User
  checkedInToday: boolean
  checkinTasksProgress: {
    tasksToday: number
    tasksRequired: number
  }
  initialAdsgramWatched?: number
  initialAdsgramRemaining?: number
  onNavigate: (
    screen: Screen
  ) => void
  onUserChanged: (
    user: User
  ) => void
}

const DAILY_CHECKIN_POINTS = Number(import.meta.env.VITE_DAILY_CHECKIN_POINTS) || 20

let cachedAdsgramWatched: number | null = null
let cachedAdsgramRemaining: number | null = null

const STAR_PACKAGES = [
  {
    stars: 10,
    points: 100
  },
  {
    stars: 50,
    points: 500
  },
  {
    stars: 100,
    points: 1000
  },
  {
    stars: 250,
    points: 2500
  },
  {
    stars: 500,
    points: 5000
  }
]

export function Home({
  user,
  checkedInToday,
  checkinTasksProgress,
  initialAdsgramWatched,
  initialAdsgramRemaining,
  onNavigate,
  onUserChanged
}: Props) {
  const [
    showBuy,
    setShowBuy
  ] = useState(false)

  const [adsgramWatched, setAdsgramWatched] = useState(
    cachedAdsgramWatched ?? initialAdsgramWatched ?? 0
  )
  const [adsgramRemaining, setAdsgramRemaining] = useState(
    cachedAdsgramRemaining ?? initialAdsgramRemaining ?? 20
  )
  const [adsgramReady, setAdsgramReady] = useState(
    cachedAdsgramWatched !== null ||
    (initialAdsgramWatched !== undefined && initialAdsgramRemaining !== undefined)
  )
  const [adsgramBusy, setAdsgramBusy] = useState(false)

  function applyAdsgramStatus(watched: number, remaining: number) {
    cachedAdsgramWatched = watched
    cachedAdsgramRemaining = remaining
    setAdsgramWatched(watched)
    setAdsgramRemaining(remaining)
    setAdsgramReady(true)
  }

  async function refreshUser() {
    try {
      const result =
        await getMe()

      onUserChanged(
        result.user
      )
    } catch {
      // إذا فشل التحديث بنسيب رصيد المستخدم متل ما هو، رح يتحدث لاحقًا
    }
  }

  async function refreshAdsgramStatus() {
    try {
      const result = await getAdsgramWatchStatus()
      applyAdsgramStatus(result.watched, result.remaining)
    } catch {
      // keep current UI if the status endpoint is temporarily unavailable
    }
  }

  useEffect(() => {
    // لو التطبيق جاب حالة إعلانات اليوم مسبقًا وإحنا لسا لأول مرة عالشاشة
    // الرئيسية (الكاش لسا فاضي)، منطبّقها مباشرة بدون طلب شبكة جديد —
    // هيك ما يصير "ومضة" الرقم يبدأ 0 وبعدين يتحدث للرقم الصحيح.
    // إذا التطبيق ما قدر يجيبها هو الآخر (initial* غير موجودة)، منرجع
    // لسلوكنا القديم ونجيبها هون.
    if (cachedAdsgramWatched === null) {
      if (
        initialAdsgramWatched !== undefined &&
        initialAdsgramRemaining !== undefined
      ) {
        applyAdsgramStatus(initialAdsgramWatched, initialAdsgramRemaining)
      } else {
        void refreshAdsgramStatus()
      }
    }
  }, [])

  async function watchAdsgramReward() {
    if (adsgramBusy) return
    if (adsgramRemaining <= 0) {
      showAlert('وصلت للحد اليومي. يرجع العداد تلقائيًا عند منتصف الليل بتوقيت بغداد.')
      return
    }
    if (!window.Adsgram) {
      showAlert('إعلان AdsGram غير جاهز بعد. جرّب مرة ثانية.')
      return
    }

    if (!tryAcquireGlobalAdLock()) {
      showAlert(`انتظر ${getAdLockWaitSeconds()} ثانية قبل تشغيل إعلان آخر.`)
      return
    }

    setAdsgramBusy(true)
    try {
      const session = await startAdsgramWatch()
      const controller = window.Adsgram.init({ blockId: session.blockId })
      await controller.show()

      // نمنح المكافأة فورًا من هون بعد ما show() نجح -- هاد هو مصدر
      // المكافأة الأساسي. AdsGram Reward URL (السيرفر-تو-السيرفر) مذكور
      // بتوثيقهم إنه "بالإضافة إلى" الـ client callback مو بديل عنه،
      // وهو أصلاً مخصص للتطبيقات فوق 50 ألف مستخدم يوميًا وما بينبعث
      // إطلاقًا بوضع debug. الاعتماد عليه لحاله هو سبب توقف المكافآت.
      try {
        const result = await completeAdsgramWatch()
        applyAdsgramStatus(result.watched, result.remaining)
        hapticSuccess()
        try {
          const latest = await getMe()
          onUserChanged(latest.user)
        } catch {}
        return
      } catch (completeError) {
        // fallback: لو صار تعارض شبكة لحظي، نجرب نسحب الحالة من
        // السيرفر كم مرة بدل ما نضل عالقين لحد الأبد
        for (let attempt = 0; attempt < 10; attempt += 1) {
          await new Promise(resolve => window.setTimeout(resolve, 500))
          const status = await getAdsgramWatchStatus()
          applyAdsgramStatus(status.watched, status.remaining)
          if (status.watched > session.watched) {
            hapticSuccess()
            try {
              const latest = await getMe()
              onUserChanged(latest.user)
            } catch {}
            return
          }
        }
        throw completeError
      }
    } catch (error) {
      showAlert(error instanceof Error ? error.message : 'تعذر تشغيل الإعلان.')
    } finally {
      releaseGlobalAdLock()
      setAdsgramBusy(false)
      void refreshAdsgramStatus()
    }
  }

  async function buyStars(
    stars: number
  ) {
    try {
      const result =
        await createStarsInvoice(
          stars
        )

      setShowBuy(false)

      openInvoice(
        result.invoiceUrl,
        status => {
          if (
            status ===
            'paid'
          ) {
            hapticSuccess()

            showAlert(
              `✅ تم الدفع. تمت إضافة ${result.points} نقطة.`
            )

            // نحدث رصيد المستخدم فورًا من السيرفر، وإلا الرصيد المعروض
            // بضل قديم لحد ما يعيد فتح التطبيق
            void refreshUser()
          }

          if (
            status ===
            'cancelled'
          ) {
            return
          }

          if (
            status ===
            'failed'
          ) {
            showAlert(
              'تعذر إكمال الدفع.'
            )
          }
        }
      )
    } catch (
      error
    ) {
      showAlert(
        error instanceof Error
          ? error.message
          : 'تعذر إنشاء الفاتورة.'
      )
    }
  }

  return (
    <section className="page">

      <header className="topbar">
        <div className="brand">
          <div className="brand-mark">
            ⚡
          </div>

          <div>
            <strong>STORM</strong>
            <span>نقاط ونمو</span>
          </div>
        </div>

        <button
          className="icon-button"
          onClick={() =>
            onNavigate(
              'profile'
            )
          }
        >
          ⚙
        </button>
      </header>


      <section className="balance-card">

        <div className="balance-glow" />

        <span className="rate-pill">
          50 ⭐ = 500 نقطة
        </span>

        <div className="balance-label">
          رصيدك الحالي
        </div>

        <div className="balance-row">
          <strong>
            {user.points.toLocaleString(
              'en-US'
            )}
          </strong>

          <span>
            نقطة
          </span>
        </div>

        <div className="balance-sub">
          استخدمها لنشر مهام أو تنفيذ مهام الآخرين.
        </div>

      </section>


      <div className="quick-actions">

        <button
          className="quick-action"
          onClick={() =>
            setShowBuy(true)
          }
        >
          <div className="quick-icon green">
            ⭐
          </div>

          <span>
            شراء نقاط
          </span>
        </button>


        <button
          className="quick-action"
          onClick={() =>
            onNavigate(
              'publish'
            )
          }
        >
          <div className="quick-icon coral">
            ↗
          </div>

          <span>
            نشر مهمة
          </span>
        </button>


        <button
          className="quick-action"
          onClick={() =>
            onNavigate(
              'profile'
            )
          }
        >
          <div className="quick-icon purple">
            👥
          </div>

          <span>
            دعوة صديق
          </span>
        </button>

      </div>

      <section className="adsgram-reward-card">
        <div className="adsgram-reward-head">
          <div className="adsgram-reward-icon">AD</div>
          <div>
            <strong>شاهد إعلان واربح نقاط</strong>
            <span>+6 نقاط لكل إعلان · 20 إعلان يوميًا</span>
          </div>
          <div className="adsgram-reward-count">
            {adsgramReady ? `${adsgramWatched}/20` : '···'}
          </div>
        </div>

        <div className="adsgram-reward-progress">
          <div
            style={{
              width: adsgramReady
                ? `${Math.min(100, Math.round((adsgramWatched / 20) * 100))}%`
                : '0%'
            }}
          />
        </div>

        <button
          className="adsgram-reward-button"
          disabled={!adsgramReady || adsgramBusy || adsgramRemaining <= 0}
          onClick={() => void watchAdsgramReward()}
        >
          {!adsgramReady
            ? 'جاري التحميل...'
            : adsgramBusy
              ? 'جاري التحقق...'
              : adsgramRemaining <= 0
                ? 'اكتملت إعلانات اليوم ✓'
                : `مشاهدة الإعلان · +6 (${adsgramRemaining} متبقي)`}
        </button>

        <small>يتجدد العداد تلقائيًا كل يوم عند 00:00 بتوقيت بغداد.</small>
      </section>

      <section className="checkin-card">

        <div className="checkin-card-top">

          <div className="checkin-icon">
            📅
          </div>

          <div className="checkin-copy">
            <strong>
              تسجيل الدخول اليومي
            </strong>

            <span>
              {checkedInToday
                ? `أخذت +${DAILY_CHECKIN_POINTS} نقطة اليوم`
                : checkinTasksProgress.tasksToday < checkinTasksProgress.tasksRequired
                  ? `سويت ${checkinTasksProgress.tasksToday} من ${checkinTasksProgress.tasksRequired} مهام`
                  : `+${DAILY_CHECKIN_POINTS} نقطة تلقائيًا`}
            </span>
          </div>

          <div className={`checkin-status-badge${checkedInToday ? ' done' : checkinTasksProgress.tasksToday < checkinTasksProgress.tasksRequired ? ' locked' : ''}`}>
            {checkedInToday
              ? 'تم ✓'
              : checkinTasksProgress.tasksToday < checkinTasksProgress.tasksRequired
                ? '🔒 مقفول'
                : 'رح تنضاف'}
          </div>

        </div>

        {!checkedInToday && checkinTasksProgress.tasksToday < checkinTasksProgress.tasksRequired && (
          <button
            className="checkin-tasks-cta checkin-tasks-cta-full"
            onClick={() => onNavigate('tasks')}
          >
            سوّي مهمة →
          </button>
        )}

      </section>


      <section className="home-info-card">

        <div className="info-icon">
          ✓
        </div>

        <div>
          <strong>
            التحقق بعد المهمة
          </strong>

          <p>
            تحصل على النقاط مباشرة بعد التحقق،
            ثم يعاد فحص العضوية بعد 10 ساعات.
          </p>
        </div>

      </section>


      <button
        className="support-card"
        onClick={() =>
          openTelegramLink(
            'https://t.me/SLYMintX_SUPPORT'
          )
        }
      >
        <div>
          <strong>
            تحتاج مساعدة؟
          </strong>

          <span>
            تواصل مع @SLYMintX_SUPPORT
          </span>
        </div>

        <b>
          →
        </b>
      </button>


      {showBuy && (
        <div
          className="modal-backdrop"
          onClick={() =>
            setShowBuy(false)
          }
        >
          <div
            className="buy-modal"
            onClick={event =>
              event.stopPropagation()
            }
          >

            <div className="modal-head">
              <div>
                <span>
                  شحن الرصيد
                </span>

                <strong>
                  Telegram Stars
                </strong>
              </div>

              <button
                onClick={() =>
                  setShowBuy(false)
                }
              >
                ×
              </button>
            </div>


            <div className="package-grid">

              {STAR_PACKAGES.map(
                item => (
                  <button
                    key={
                      item.stars
                    }
                    className={
                      item.stars ===
                      50
                        ? 'package selected'
                        : 'package'
                    }
                    onClick={() =>
                      void buyStars(
                        item.stars
                      )
                    }
                  >
                    <strong>
                      {item.points.toLocaleString(
                        'en-US'
                      )}
                    </strong>

                    <span>
                      نقطة
                    </span>

                    <b>
                      ⭐ {item.stars}
                    </b>
                  </button>
                )
              )}

            </div>


            <p className="payment-note">
              الدفع يتم داخل Telegram عبر Stars.
              لا نستخدم بطاقة أو مزود دفع خارجي داخل الـMini App.
            </p>

          </div>
        </div>
      )}

    </section>
  )
}
