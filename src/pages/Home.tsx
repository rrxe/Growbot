import type { Screen } from '../App'
import type { User } from '../lib/types'
import '../styles/home.css'

interface Props {
  user: User
  onNavigate: (screen: Screen) => void
}

export function Home({
  user,
  onNavigate
}: Props) {
  const members = Math.floor(user.points / 5)

  return (
    <section className="page">
      <header className="topbar">
        <div className="brand">
          <div className="brand-mark">G</div>

          <div>
            <strong>GrowBot</strong>
            <span>نقاط ونمو</span>
          </div>
        </div>

        <button
          className="icon-button"
          onClick={() => onNavigate('profile')}
        >
          ⚙
        </button>
      </header>

      <section className="balance-card">
        <div className="rate-pill">
          $1 = 500 نقطة
        </div>

        <div className="balance-label">
          رصيدك الحالي
        </div>

        <div className="balance-row">
          <strong>
            {user.points.toLocaleString('en-US')}
          </strong>

          <span>نقطة</span>
        </div>

        <div className="balance-sub">
          يكفي حاليًا لـ{' '}
          <b>{members.toLocaleString('en-US')}</b>{' '}
          تنفيذ
        </div>
      </section>

      <div className="quick-actions">
        <button
          className="quick-action"
          onClick={() => alert('سيتم تفعيل الدفع بعد ربط مزود الدفع')}
        >
          <div className="quick-icon green">$</div>
          <span>شحن نقاط</span>
        </button>

        <button
          className="quick-action"
          onClick={() => onNavigate('publish')}
        >
          <div className="quick-icon coral">↗</div>
          <span>نشر مهمة</span>
        </button>

        <button
          className="quick-action"
          onClick={() => onNavigate('profile')}
        >
          <div className="quick-icon purple">👥</div>
          <span>دعوة صديق</span>
        </button>
      </div>

      <div className="section-heading">
        <h2>كيف يعمل GrowBot؟</h2>
      </div>

      <div className="how-card">
        <div className="how-row">
          <div className="how-number">1</div>
          <div>
            <strong>أنشئ مهمة</strong>
            <p>
              أضف قناتك أو مجموعتك وحدد الميزانية.
            </p>
          </div>
        </div>

        <div className="how-row">
          <div className="how-number">2</div>
          <div>
            <strong>المستخدمون ينضمون</strong>
            <p>
              كل تنفيذ صحيح يكلف 5 نقاط.
            </p>
          </div>
        </div>

        <div className="how-row">
          <div className="how-number">3</div>
          <div>
            <strong>نتحقق بعد 10 ساعات</strong>
            <p>
              إذا بقي العضو يحصل على النقاط، وإذا خرج تخصم منه.
            </p>
          </div>
        </div>
      </div>

      <div className="economy-card">
        <div>
          <span>ميزانيتك</span>
          <strong>500 نقطة</strong>
        </div>

        <div className="economy-arrow">
          →
        </div>

        <div>
          <span>تنفيذات</span>
          <strong>100</strong>
        </div>
      </div>
    </section>
  )
}
