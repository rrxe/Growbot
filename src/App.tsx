import { useEffect, useRef, useState } from 'react'
import { tryAcquireGlobalAdLock, releaseGlobalAdLock } from './lib/adLock'
import { Home } from './pages/Home'
import { Tasks } from './pages/Tasks'
import { Publish } from './pages/Publish'
import { Profile } from './pages/Profile'
import { initTelegram, hapticSuccess, showAlert, openTelegramLink } from './lib/telegram'
import RequiredSubscription from './components/RequiredSubscription'
import { getMe, getTasks, getMyTasks } from './lib/api'
import type { MeResponse, Task, User } from './lib/types'
import './styles/app.css'

const ADSGRAM_AUTO_BLOCK_ID = 'int-46084'
const ADSGRAM_SCRIPT_SRC = 'https://sad.adsgram.ai/js/sad.min.js'

type AdsgramController = {
  show: () => Promise<any>
  addEventListener?: (event: string, callback: () => void) => void
}

declare global {
  interface Window {
    Adsgram?: {
      init: (opts: { blockId: string }) => AdsgramController
    }
  }
}


export type Screen =
  | 'home'
  | 'tasks'
  | 'publish'
  | 'profile'

export default function App() {
  const [screen, setScreen] = useState<Screen>('home')
  const [user, setUser] = useState<User | null>(null)
  const [membershipRequired, setMembershipRequired] = useState(false)
  const [membershipVerified, setMembershipVerified] = useState(true)
  const [requiredChannels, setRequiredChannels] = useState<MeResponse['requiredChannels']>([])
  const [membershipChecking, setMembershipChecking] = useState(false)
  const [membershipStatusReady, setMembershipStatusReady] = useState(false)
  const [checkedInToday, setCheckedInToday] = useState(false)
  const [referral, setReferral] = useState<MeResponse['referral'] | null>(null)
  const [browseTasks, setBrowseTasks] = useState<Task[]>([])
  const [completedTaskIds, setCompletedTaskIds] = useState<string[]>([])
  const [myTasks, setMyTasks] = useState<Task[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const adsgramAutoRef = useRef<AdsgramController | null>(null)
  const autoInFlightRef = useRef(false)

  // بنجهّز كل شي (الحساب + المهام + مهامي) مرة وحدة وبالتوازي
  // وإحنا لسا على شاشة التحميل، حتى ما يحتاج المستخدم يشوف
  // سبينر ثاني ولا ثالث لما يتنقل بين التبويبات.
  async function loadAll() {
    try {
      setLoading(true)
      setError('')

      const meResponse = await getMe()

      setMembershipRequired(meResponse.membershipRequired === true)
      setMembershipVerified(meResponse.membershipVerified === true)
      setMembershipStatusReady(true)
      setRequiredChannels(Array.isArray(meResponse.requiredChannels) ? meResponse.requiredChannels : [])
      setUser(meResponse.user)
      setCheckedInToday(meResponse.dailyCheckin.claimedToday)
      setReferral(meResponse.referral)

      if (meResponse.membershipRequired && !meResponse.membershipVerified) {
        setBrowseTasks([])
        setCompletedTaskIds([])
        setMyTasks([])
        return
      }

      const [tasksResponse, myTasksResponse] = await Promise.all([
        getTasks(),
        getMyTasks()
      ])

      setBrowseTasks(tasksResponse.tasks)
      setCompletedTaskIds(tasksResponse.completedTaskIds)
      setMyTasks(myTasksResponse.tasks)

      // أول فتحة لليوم: المكافأة انضافت تلقائيًا على السيرفر،
      // هون بس منعلم المستخدم إنها انضافت.
      if (meResponse.dailyCheckin.justClaimed) {
        hapticSuccess()

        showAlert(
          `☀️ تسجيل دخول تلقائي: تمت إضافة +${meResponse.dailyCheckin.points} نقطة.`
        )
      }
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'تعذر تحميل الحساب'
      )
    } finally {
      setLoading(false)
    }
  }

  async function verifyMembership() {
    if (membershipChecking) return

    setMembershipChecking(true)
    try {
      const meResponse = await getMe()
      setMembershipRequired(meResponse.membershipRequired === true)
      setMembershipVerified(meResponse.membershipVerified === true)
      setMembershipStatusReady(true)
      setRequiredChannels(Array.isArray(meResponse.requiredChannels) ? meResponse.requiredChannels : [])
      setUser(meResponse.user)

      if (meResponse.membershipVerified) {
        const [tasksResponse, myTasksResponse] = await Promise.all([
          getTasks(),
          getMyTasks()
        ])
        setBrowseTasks(tasksResponse.tasks)
        setCompletedTaskIds(tasksResponse.completedTaskIds)
        setMyTasks(myTasksResponse.tasks)
      }
    } catch (err) {
      console.error('[membership]', err)
    } finally {
      setMembershipChecking(false)
    }
  }

  useEffect(() => {
    initTelegram()
    void loadAll()
  }, [])

  useEffect(() => {
    // Auto Ads are completely disabled while the mandatory
    // subscription page is active.
    if (!membershipStatusReady) return
    if (membershipRequired && !membershipVerified) return
    if (typeof window === 'undefined') return

    const initAdsgram = () => {
      if (!window.Adsgram) return
      if (!adsgramAutoRef.current) {
        adsgramAutoRef.current = window.Adsgram.init({ blockId: ADSGRAM_AUTO_BLOCK_ID })
        adsgramAutoRef.current.addEventListener?.('onError', () => {
          console.warn('[AdsGram:auto] onError')
        })
        adsgramAutoRef.current.addEventListener?.('onBannerNotFound', () => {
          console.warn('[AdsGram:auto] onBannerNotFound')
        })
      }
    }

    if (window.Adsgram) {
      initAdsgram()
      return
    }

    const existing = document.querySelector<HTMLScriptElement>(
      `script[src="${ADSGRAM_SCRIPT_SRC}"]`
    )
    if (existing) {
      existing.addEventListener('load', initAdsgram, { once: true })
      const poll = window.setInterval(() => {
        if (window.Adsgram) {
          window.clearInterval(poll)
          initAdsgram()
        }
      }, 200)
      const stop = window.setTimeout(() => window.clearInterval(poll), 15000)
      return () => {
        existing.removeEventListener('load', initAdsgram)
        window.clearInterval(poll)
        window.clearTimeout(stop)
      }
    }

    const script = document.createElement('script')
    script.src = ADSGRAM_SCRIPT_SRC
    script.async = true
    script.onload = initAdsgram
    script.onerror = () => console.warn('[AdsGram] SDK load failed')
    document.head.appendChild(script)

    return () => {
      script.onload = null
      script.onerror = null
    }
  }, [membershipStatusReady, membershipRequired, membershipVerified])

  useEffect(() => {
    // NEVER schedule automatic ads before mandatory subscription is cleared.
    if (!membershipStatusReady) return
    if (membershipRequired && !membershipVerified) return

    let cancelled = false
    let timer: number | null = null

    const showAutoAd = async () => {
      // Hard safety guard: never show an automatic ad on the
      // mandatory subscription screen.
      if (!membershipStatusReady) return
      if (membershipRequired && !membershipVerified) return

      const controller = adsgramAutoRef.current
      if (!controller || cancelled || autoInFlightRef.current) return
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return
      if (!tryAcquireGlobalAdLock(true)) return

      autoInFlightRef.current = true
      try {
        await controller.show()
      } catch (error) {
        console.warn('[AdsGram:auto] skipped', error)
      } finally {
        autoInFlightRef.current = false
        releaseGlobalAdLock(true)
      }
    }

    const schedule = (delay: number) => {
      timer = window.setTimeout(async () => {
        if (cancelled) return
        await showAutoAd()
        schedule(30000)
      }, delay)
    }

    schedule(4000)

    return () => {
      cancelled = true
      if (timer !== null) window.clearTimeout(timer)
    }
  }, [membershipStatusReady, membershipRequired, membershipVerified])

  if (!loading && !error && membershipRequired && !membershipVerified) {
    return (
      <div className="app-shell">
        <RequiredSubscription
          channels={requiredChannels}
          loading={membershipChecking}
          onVerify={verifyMembership}
          onOpen={openTelegramLink}
        />
      </div>
    )
  }

  if (loading) {
    return (
      <div className="app-shell">
        <div className="loading-screen">
          <div className="loading-glow" />

          <div className="loading-logo">⚡</div>
          <div className="loading-title">STORM</div>
          <div className="loading-tagline">جاري تجهيز حسابك...</div>
          <div className="loading-spinner" />
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="app-shell">
        <div className="error-screen">
          <div className="error-icon">!</div>
          <h2>تعذر الاتصال</h2>
          <p>{error}</p>
          <button
            className="primary-button"
            onClick={() => void loadAll()}
          >
            إعادة المحاولة
          </button>
        </div>
      </div>
    )
  }

  if (!user) {
    return null
  }

  return (
    <div className="app-shell">
      <main className="screen-container">
        {screen === 'home' && (
          <Home
            user={user}
            checkedInToday={checkedInToday}
            onNavigate={setScreen}
            onUserChanged={setUser}
          />
        )}

        {/* Tasks تضل مركّبة بالـ DOM دايمًا (حتى إذا التبويب مو مفعّل)
            عشان مهمة AdsGram الأصلية تبلش تتحمل من أول ما التطبيق يفتح. */}
        <div style={{ display: screen === 'tasks' ? 'contents' : 'none' }}>
          <Tasks
            user={user}
            initialTasks={browseTasks}
            initialCompletedIds={completedTaskIds}
            onUserChanged={setUser}
          />
        </div>

        {screen === 'publish' && (
          <Publish
            user={user}
            onPublished={loadAll}
          />
        )}

        {screen === 'profile' && (
          <Profile
            user={user}
            initialMyTasks={myTasks}
            initialReferral={referral}
            onUserChanged={setUser}
          />
        )}
      </main>

      <nav className="bottom-nav">
        <button
          className={screen === 'home' ? 'nav-item active' : 'nav-item'}
          onClick={() => setScreen('home')}
        >
          <span>⌂</span>
          <small>الرئيسية</small>
        </button>

        <button
          className={screen === 'tasks' ? 'nav-item active' : 'nav-item'}
          onClick={() => setScreen('tasks')}
        >
          <span>✓</span>
          <small>المهام</small>
        </button>

        <button
          className={screen === 'publish' ? 'nav-item active' : 'nav-item'}
          onClick={() => setScreen('publish')}
        >
          <span>＋</span>
          <small>نشر</small>
        </button>

        <button
          className={screen === 'profile' ? 'nav-item active' : 'nav-item'}
          onClick={() => setScreen('profile')}
        >
          <span>◎</span>
          <small>حسابي</small>
        </button>
      </nav>
    </div>
  )
}
