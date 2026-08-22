import {
  useEffect,
  useState
} from 'react'
import { getMe } from '../lib/api'
import { showAlert } from '../lib/telegram'
import type { User } from '../lib/types'
import '../styles/profile.css'

interface Props {
  user: User
}

export function Profile({
  user
}: Props) {
  const [referral, setReferral] = useState<{
    code: string
    link: string | null
    completed_tasks: number
    required_tasks: number
    reward_points: number
    rewarded: boolean
  } | null>(null)

  useEffect(() => {
    void getMe()
      .then((response) => {
        setReferral(response.referral)
      })
      .catch(() => {
        setReferral(null)
      })
  }, [])

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
