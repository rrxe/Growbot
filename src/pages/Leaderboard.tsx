import { useEffect, useState } from 'react'
import { getWeeklyLeaderboard, type WeeklyLeaderboardResponse } from '../lib/api'
import '../styles/leaderboard.css'

type Props = {
  onBack: () => void
}

export default function Leaderboard({ onBack }: Props) {
  const [data, setData] = useState<WeeklyLeaderboardResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  async function load(quiet = false) {
    if (quiet) setRefreshing(true)
    else setLoading(true)

    try {
      setData(await getWeeklyLeaderboard())
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  return (
    <section className="page leaderboard-page">
      <div className="page-header">
        <div>
          <span className="eyebrow">Weekly Ranking</span>
          <h1>لوحة المتصدرين</h1>
        </div>
        <div className="leaderboard-head-actions">
          <button className={`withdrawal-refresh ${refreshing ? 'spinning' : ''}`} type="button" onClick={() => void load(true)}>↻</button>
          <button className="leaderboard-back" type="button" onClick={onBack}>رجوع</button>
        </div>
      </div>

      <section className="leaderboard-hero-card">
        <div className="leaderboard-crown">🏆</div>
        <div>
          <span>الأسبوع الحالي</span>
          <strong>من الجمعة إلى الخميس</strong>
          <small>{data?.weekStart ? `بدأ في ${data.weekStart}` : 'جاري الحساب...'}</small>
        </div>
      </section>

      {data?.me ? (
        <section className="leaderboard-me-card">
          <span>ترتيبك الحالي</span>
          <strong>#{data.me.rank}</strong>
          <div>
            <b>{data.me.name}</b>
            <small>{data.me.tasks} مهام هذا الأسبوع</small>
          </div>
        </section>
      ) : null}

      <section className="leaderboard-list-card">
        <div className="leaderboard-section-head">
          <div>
            <span className="eyebrow">Top 50</span>
            <h2>أكثر المستخدمين إنجازًا</h2>
          </div>
          <small>Reset كل جمعة</small>
        </div>

        {loading ? (
          <div className="leaderboard-empty">جاري تحميل النتائج...</div>
        ) : !data?.list.length ? (
          <div className="leaderboard-empty">لسا ما في نتائج لهذا الأسبوع.</div>
        ) : (
          <div className="leaderboard-list">
            {data.list.map((item) => (
              <article className={`leaderboard-row ${item.isMe ? 'me' : ''}`} key={item.telegramId}>
                <div className={`leaderboard-rank rank-${item.rank}`}>
                  {item.rank <= 3 ? ['🥇', '🥈', '🥉'][item.rank - 1] : `#${item.rank}`}
                </div>
                <div className="leaderboard-avatar">{item.name.replace('@', '').charAt(0).toUpperCase()}</div>
                <div className="leaderboard-user">
                  <strong>{item.name}</strong>
                  <span>{item.isMe ? 'أنت' : 'مشارك هذا الأسبوع'}</span>
                </div>
                <div className="leaderboard-tasks">
                  <strong>{item.tasks}</strong>
                  <span>مهمة</span>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      <div className="leaderboard-note">
        الإنجاز يُحسب عند إضافة مكافأة المهمة، وإذا انعكست المهمة بسبب مغادرة المستخدم يُخصم الإنجاز أيضًا.
      </div>
    </section>
  )
}
