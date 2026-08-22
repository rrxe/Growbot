import {
  useEffect,
  useMemo,
  useState
} from 'react'
import { createTask } from '../lib/api'
import { showAlert } from '../lib/telegram'
import type { User } from '../lib/types'
import '../styles/publish.css'

interface Props {
  user: User
  onPublished: () => Promise<void>
}

export function Publish({
  user,
  onPublished
}: Props) {
  const [type, setType] = useState<'channel' | 'group'>('channel')
  const [chat, setChat] = useState('')
  const [title, setTitle] = useState('')
  const [budget, setBudget] = useState(100)
  const [busy, setBusy] = useState(false)

  const members = useMemo(
    () => Math.floor(budget / 5),
    [budget]
  )

  useEffect(() => {
    if (budget < 5) {
      setBudget(5)
    }
  }, [budget])

  async function submit() {
    if (!chat.trim()) {
      showAlert(
        'أدخل يوزر القناة أو المجموعة.'
      )
      return
    }

    if (budget < 5) {
      showAlert(
        'الحد الأدنى 5 نقاط.'
      )
      return
    }

    if (user.points < budget) {
      showAlert(
        `رصيدك غير كافٍ.\n\nتحتاج ${budget} نقطة ولديك ${user.points}.`
      )
      return
    }

    try {
      setBusy(true)

      await createTask({
        type,
        chat: chat.trim(),
        title: title.trim() || undefined,
        budgetPoints: budget
      })

      setChat('')
      setTitle('')

      showAlert(
        'تم إنشاء المهمة بنجاح.'
      )

      await onPublished()
    } catch (error) {
      showAlert(
        error instanceof Error
          ? error.message
          : 'تعذر إنشاء المهمة'
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="page">
      <div className="page-header">
        <div>
          <span className="eyebrow">حملة جديدة</span>
          <h1>انشر مهمة</h1>
        </div>

        <div className="points-badge">
          {user.points.toLocaleString('en-US')}
        </div>
      </div>

      <div className="publish-info">
        <strong>قبل النشر</strong>

        <p>
          يجب أن يكون GrowBot مسؤولًا في القناة أو المجموعة حتى
          يستطيع التحقق من عضوية المستخدمين.
        </p>
      </div>

      <div className="field-section">
        <label>نوع المكان</label>

        <div className="segmented">
          <button
            className={type === 'channel' ? 'active' : ''}
            onClick={() => setType('channel')}
          >
            قناة
          </button>

          <button
            className={type === 'group' ? 'active' : ''}
            onClick={() => setType('group')}
          >
            مجموعة
          </button>
        </div>
      </div>

      <div className="field-section">
        <label>اسم المهمة</label>

        <input
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="مثلاً: قناة أخبار التقنية"
          maxLength={80}
        />
      </div>

      <div className="field-section">
        <label>
          يوزر القناة أو المجموعة
        </label>

        <input
          value={chat}
          onChange={(event) => setChat(event.target.value)}
          placeholder="@your_channel"
          dir="ltr"
          maxLength={100}
        />
      </div>

      <div className="budget-card">
        <div className="budget-head">
          <div>
            <span>ميزانية المهمة</span>
            <strong>
              {budget.toLocaleString('en-US')} نقطة
            </strong>
          </div>

          <div className="budget-result">
            <span>التنفيذات</span>
            <strong>
              {members.toLocaleString('en-US')}
            </strong>
          </div>
        </div>

        <input
          type="range"
          min="5"
          max={Math.max(
            5000,
            Math.floor(user.points / 5) * 5
          )}
          step="5"
          value={budget}
          onChange={(event) =>
            setBudget(
              Number(event.target.value)
            )
          }
        />

        <div className="range-labels">
          <span>5</span>
          <span>
            كل تنفيذ = 5 نقاط
          </span>
          <span>
            {Math.max(
              5000,
              Math.floor(user.points / 5) * 5
            ).toLocaleString('en-US')}
          </span>
        </div>
      </div>

      <button
        className="publish-submit"
        disabled={busy}
        onClick={() => void submit()}
      >
        {busy
          ? 'جاري التحقق والنشر...'
          : `انشر المهمة — ${budget.toLocaleString('en-US')} نقطة`}
      </button>
    </section>
  )
}
