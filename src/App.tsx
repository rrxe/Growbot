import { useEffect, useState } from 'react'
import { Home } from './pages/Home'
import { Tasks } from './pages/Tasks'
import { Publish } from './pages/Publish'
import { Profile } from './pages/Profile'
import { initTelegram, hapticSuccess, showAlert } from './lib/telegram'
import { getMe, getTasks, getMyTasks } from './lib/api'
import type { MeResponse, Task, User } from './lib/types'
import './styles/app.css'

export type Screen =
  | 'home'
  | 'tasks'
  | 'publish'
  | 'profile'

export default function App() {
  const [screen, setScreen] = useState<Screen>('home')
  const [user, setUser] = useState<User | null>(null)
  const [checkedInToday, setCheckedInToday] = useState(false)
  const [referral, setReferral] = useState<MeResponse['referral'] | null>(null)
  const [browseTasks, setBrowseTasks] = useState<Task[]>([])
  const [completedTaskIds, setCompletedTaskIds] = useState<string[]>([])
  const [myTasks, setMyTasks] = useState<Task[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // بنجهّز كل شي (الحساب + المهام + مهامي) مرة وحدة وبالتوازي
  // وإحنا لسا على شاشة التحميل، حتى ما يحتاج المستخدم يشوف
  // سبينر ثاني ولا ثالث لما يتنقل بين التبويبات.
  async function loadAll() {
    try {
      setLoading(true)
      setError('')

      const [
        meResponse,
        tasksResponse,
        myTasksResponse
      ] = await Promise.all([
        getMe(),
        getTasks(),
        getMyTasks()
      ])

      setUser(meResponse.user)
      setCheckedInToday(meResponse.dailyCheckin.claimedToday)
      setReferral(meResponse.referral)
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

  useEffect(() => {
    initTelegram()
    void loadAll()
  }, [])

  if (loading) {
    return (
      <div className="app-shell">
        <div className="loading-screen">
          <div className="loading-glow" />

          <div className="loading-logo">⚡</div>
          <div className="loading-title">StormGrow</div>
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

        {screen === 'tasks' && (
          <Tasks
            user={user}
            initialTasks={browseTasks}
            initialCompletedIds={completedTaskIds}
            onUserChanged={setUser}
          />
        )}

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
