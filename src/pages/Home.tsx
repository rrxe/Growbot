import {
  useEffect,
  useState
} from 'react'

import {
  getMe,
  getCheckinStatus,
  claimDailyCheckin,
  createStarsInvoice
} from '../lib/api.js'

import {
  hapticError,
  hapticSuccess,
  openInvoice,
  openTelegramLink,
  showAlert
} from '../lib/telegram.js'

import type {
  Screen
} from '../App.js'

import type {
  User
} from '../lib/types.js'

import '../styles/home.css'

interface Props {
  user: User
  onNavigate: (
    screen: Screen
  ) => void
  onUserChanged: (
    user: User
  ) => void
}

const DAILY_CHECKIN_POINTS = 100

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
  onNavigate,
  onUserChanged
}: Props) {
  const [
    checkedInToday,
    setCheckedInToday
  ] = useState(false)

  const [
    checkinLoading,
    setCheckinLoading
  ] = useState(false)

  const [
    showBuy,
    setShowBuy
  ] = useState(false)

  async function loadCheckinStatus() {
    try {
      const result =
        await getCheckinStatus()

      setCheckedInToday(
        result.checkedInToday
      )
    } catch {
      // ما بنعطل الصفحة إذا فشل التحقق من حالة التسجيل اليومي
    }
  }

  useEffect(() => {
    void loadCheckinStatus()
  }, [])

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

  async function claimCheckin() {
    if (
      checkinLoading ||
      checkedInToday
    ) {
      return
    }

    try {
      setCheckinLoading(true)

      const result =
        await claimDailyCheckin()

      setCheckedInToday(true)

      hapticSuccess()

      showAlert(
        `✅ تم تسجيل الدخول اليومي وإضافة +${result.points} نقطة.`
      )

      await refreshUser()
    } catch (
      error
    ) {
      hapticError()

      showAlert(
        error instanceof Error
          ? error.message
          : 'تعذر تسجيل الدخول اليومي.'
      )

      // إذا كان السبب إنه استلم مسبقًا، نحدث الحالة بدل ما نضل نعرض الزر شغال
      void loadCheckinStatus()
    } finally {
      setCheckinLoading(false)
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
            G
          </div>

          <div>
            <strong>GrowBot</strong>
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
              +{DAILY_CHECKIN_POINTS} نقطة كل يوم
            </span>
          </div>

          <div
            className={
              checkedInToday
                ? 'checkin-status-badge done'
                : 'checkin-status-badge'
            }
          >
            {checkedInToday
              ? 'تم اليوم ✓'
              : 'متاح'}
          </div>

        </div>


        <div className="checkin-meta">
          <span>
            المكافأة تتجدد كل يوم
          </span>

          <span>
            مرة واحدة يوميًا
          </span>
        </div>


        <button
          className="checkin-button"
          disabled={
            checkinLoading ||
            checkedInToday
          }
          onClick={() =>
            void claimCheckin()
          }
        >
          {checkinLoading
            ? 'جاري التسجيل...'
            : checkedInToday
              ? 'تم استلام مكافأة اليوم'
              : `سجّل دخولك +${DAILY_CHECKIN_POINTS}`}
        </button>

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
            'https://t.me/ncryptix'
          )
        }
      >
        <div>
          <strong>
            تحتاج مساعدة؟
          </strong>

          <span>
            تواصل مع @ncryptix
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
