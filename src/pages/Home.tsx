import {
  useEffect,
  useRef,
  useState
} from 'react'

import {
  getAdStatus,
  startAdSession,
  cancelAdSession,
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
}

const ADS_BLOCK_ID = '43643'

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
  onNavigate
}: Props) {
  const [
    watchedAds,
    setWatchedAds
  ] = useState(0)

  const [
    adLoading,
    setAdLoading
  ] = useState(false)

  const [
    showBuy,
    setShowBuy
  ] = useState(false)

  const controllerRef =
    useRef<
      AdsgramController | null
    >(null)

  async function loadAds() {
    try {
      const result =
        await getAdStatus()

      setWatchedAds(
        result.watched
      )
    } catch {
      setWatchedAds(0)
    }
  }

  useEffect(() => {
    void loadAds()

    if (
      window.Adsgram
    ) {
      controllerRef.current =
        window.Adsgram.init({
          blockId:
            ADS_BLOCK_ID
        })
    }
  }, [])

  async function watchAd() {
    if (
      adLoading ||
      watchedAds >= 10
    ) {
      return
    }

    if (
      !window.Adsgram
    ) {
      showAlert(
        'تعذر تحميل نظام الإعلانات الآن.'
      )

      return
    }

    let sessionId: string | null = null

    try {
      setAdLoading(true)

      const started =
        await startAdSession()

      sessionId =
        started.session.id

      if (
        !controllerRef.current
      ) {
        controllerRef.current =
          window.Adsgram.init({
            blockId:
              ADS_BLOCK_ID
          })
      }

      try {
        await controllerRef.current.show()
      } catch (showError) {
        // الإعلان ما ظهر (no fill / تم إغلاقه بدري)
        // لازم نلغي الجلسة فورًا وإلا تضل "pending" وتقفل المستخدم 15 دقيقة
        if (sessionId) {
          await cancelAdSession(
            sessionId
          ).catch(() => {})
        }

        throw showError
      }

      for (
        let i = 0;
        i < 8;
        i++
      ) {
        await new Promise(
          resolve =>
            setTimeout(
              resolve,
              1000
            )
        )

        const result =
          await getAdStatus()

        setWatchedAds(
          result.watched
        )

        if (
          result.watched >
          watchedAds
        ) {
          hapticSuccess()

          showAlert(
            '✅ تم تسجيل الإعلان وإضافة +10 نقاط.'
          )

          break
        }
      }
    } catch (
      error
    ) {
      hapticError()

      showAlert(
        error instanceof Error
          ? error.message
          : 'لم يكتمل الإعلان.'
      )
    } finally {
      setAdLoading(false)
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

  const remaining =
    Math.max(
      0,
      10 - watchedAds
    )

  const progress =
    `${(watchedAds / 10) * 100}%`

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


      <section className="ads-card">

        <div className="ads-card-top">

          <div className="ads-icon">
            ▶
          </div>

          <div className="ads-copy">
            <strong>
              شاهد إعلان واكسب
            </strong>

            <span>
              +10 نقاط لكل إعلان
            </span>
          </div>

          <div className="ads-count-badge">
            {watchedAds}/10
          </div>

        </div>


        <div className="ads-progress">
          <div
            style={{
              width:
                progress
            }}
          />
        </div>


        <div className="ads-meta">
          <span>
            باقي اليوم: {remaining}
          </span>

          <span>
            الحد اليومي 10
          </span>
        </div>


        <button
          className="ads-button"
          disabled={
            adLoading ||
            watchedAds >= 10
          }
          onClick={() =>
            void watchAd()
          }
        >
          {adLoading
            ? 'جاري تشغيل الإعلان...'
            : watchedAds >= 10
              ? 'اكتمل حد اليوم'
              : 'شاهد الإعلان +10'}
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
