import { useEffect, useState } from 'react'
import { Home } from './pages/Home'
import { Tasks } from './pages/Tasks'
import { Publish } from './pages/Publish'
import { Profile } from './pages/Profile'
import { initTelegram } from './lib/telegram'
import { getMe } from './lib/api'
import type { User } from './lib/types'
import './styles/app.css'

export type Screen =
  | 'home'
  | 'tasks'
  | 'publish'
  | 'profile'

export default function App() {
  const [screen, setScreen] = useState<Screen>('home')
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  async function loadUser() {
    try {
      setLoading(true)
      setError('')

      const response = await getMe()

      setUser(response.user)
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
    void loadUser()
  }, [])

  if (loading) {
    return (
      <div className="app-shell">
        <div className="loading-screen">
          <div className="loading-logo">G</div>
          <div className="loading-title">GrowBot</div>
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
            onClick={() => void loadUser()}
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
            onNavigate={setScreen}
            onUserChanged={setUser}
          />
        )}

        {screen === 'tasks' && (
          <Tasks
            user={user}
            onUserChanged={setUser}
          />
        )}

        {screen === 'publish' && (
          <Publish
            user={user}
            onPublished={loadUser}
          />
        )}

        {screen === 'profile' && (
          <Profile
            user={user}
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
