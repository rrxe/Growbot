import {
  useMemo,
  useState
} from 'react'

import {
  createTask
} from '../lib/api.js'

import {
  showAlert
} from '../lib/telegram.js'

import type {
  User
} from '../lib/types.js'

import '../styles/publish.css'

interface Props {
  user: User
  onPublished: () => Promise<void>
}

const PRESETS = [
  50,
  100,
  250,
  500,
  1000,
  2500
]

export function Publish({
  user,
  onPublished
}: Props) {
  const [
    type,
    setType
  ] = useState<
    'channel' | 'group'
  >('channel')

  const [
    chat,
    setChat
  ] = useState('')

  const [
    title,
    setTitle
  ] = useState('')

  const [
    budget,
    setBudget
  ] = useState(
    Math.min(
      500,
      Math.floor(
        user.points / 5
      ) * 5
    )
  )

  const [
    busy,
    setBusy
  ] = useState(false)

  const maxBudget =
    Math.floor(
      user.points / 5
    ) * 5

  const members =
    useMemo(
      () =>
        Math.floor(
          budget / 5
        ),
      [budget]
    )

  async function submit() {
    if (!chat.trim()) {
      showAlert(
        'أدخل رابط القناة أو المجموعة.'
      )

      return
    }

    if (
      budget <
      5
    ) {
      showAlert(
        'الحد الأدنى 5 نقاط.'
      )

      return
    }

    if (
      user.points <
      budget
    ) {
      showAlert(
        'رصيدك غير كافٍ.'
      )

      return
    }

    try {
      setBusy(
        true
      )

      await createTask({
        type,
        chat:
          chat.trim(),
        title:
          title.trim() ||
          undefined,
        budgetPoints:
          budget
      })

      setChat('')
      setTitle('')

      showAlert(
        '✅ تم نشر المهمة.'
      )

      await onPublished()
    } catch (
      error
    ) {
      showAlert(
        error instanceof Error
          ? error.message
          : 'تعذر نشر المهمة.'
      )
    } finally {
      setBusy(
        false
      )
    }
  }

  const useMax =
    () => {
      if (
        maxBudget >
        0
      ) {
        setBudget(
          maxBudget
        )
      }
    }

  return (
    <section className="page">

      <div className="page-header">
        <div>
          <span className="eyebrow">
            حملة جديدة
          </span>

          <h1>
            انشر مهمة
          </h1>
        </div>

        <div className="points-badge">
          {user.points.toLocaleString(
            'en-US'
          )}
        </div>
      </div>


      <div className="publish-warning">

        <div className="warning-icon">
          !
        </div>

        <div>
          <strong>
            مهم قبل النشر
          </strong>

          <p>
            لازم تضيف GrowBot أدمن بالقناة أو الكروب قبل ما تنشر —
            من دون هالصلاحية ما فينا نتحقق من الأعضاء
            والمهمة رح تنرفض.
          </p>
        </div>

      </div>


      <div className="field-section">
        <label>
          النوع
        </label>

        <div className="segmented">
          <button
            className={
              type ===
              'channel'
                ? 'active'
                : ''
            }
            onClick={() =>
              setType(
                'channel'
              )
            }
          >
            📢 قناة
          </button>

          <button
            className={
              type ===
              'group'
                ? 'active'
                : ''
            }
            onClick={() =>
              setType(
                'group'
              )
            }
          >
            👥 مجموعة
          </button>
        </div>
      </div>


      <div className="field-section">
        <label>
          اسم المهمة
        </label>

        <input
          value={title}
          onChange={event =>
            setTitle(
              event.target.value
            )
          }
          placeholder="مثلاً: قناة أخبار التقنية"
          maxLength={80}
        />
      </div>


      <div className="field-section">
        <label>
          رابط القناة أو المجموعة
        </label>

        <input
          value={chat}
          onChange={event =>
            setChat(
              event.target.value
            )
          }
          placeholder="https://t.me/your_channel أو @your_channel"
          dir="ltr"
          maxLength={200}
        />

        <small className="field-help">
          حط رابط تيليجرام أو @username،
          وتأكد إنه GrowBot أدمن بنفس المكان.
        </small>
      </div>


      <div className="budget-card">

        <div className="budget-head">

          <div>
            <span>
              ميزانية المهمة
            </span>

            <strong>
              {budget.toLocaleString(
                'en-US'
              )}{' '}
              نقطة
            </strong>
          </div>

          <button
            className="max-button"
            onClick={
              useMax
            }
          >
            MAX
          </button>

        </div>


        <div className="preset-row">

          {PRESETS
            .filter(
              amount =>
                amount <=
                maxBudget
            )
            .map(
              amount => (
                <button
                  key={amount}
                  className={
                    amount ===
                    budget
                      ? 'active'
                      : ''
                  }
                  onClick={() =>
                    setBudget(
                      amount
                    )
                  }
                >
                  {amount}
                </button>
              )
            )}

        </div>


        <div className="custom-budget">
          <input
            type="number"
            min="5"
            step="5"
            max={maxBudget}
            value={budget}
            onChange={event =>
              setBudget(
                Math.max(
                  5,
                  Math.min(
                    maxBudget ||
                      5,
                    Number(
                      event.target
                        .value
                    ) || 5
                  )
                )
              )
            }
          />

          <span>
            نقطة
          </span>
        </div>


        <div className="budget-result">

          <div>
            <span>
              التنفيذات
            </span>

            <strong>
              {members.toLocaleString(
                'en-US'
              )}
            </strong>
          </div>

          <div>
            <span>
              تكلفة التنفيذ
            </span>

            <strong>
              5
            </strong>
          </div>

        </div>

      </div>


      <button
        className="publish-submit"
        disabled={
          busy ||
          maxBudget < 5
        }
        onClick={() =>
          void submit()
        }
      >
        {busy
          ? 'جاري النشر...'
          : maxBudget < 5
            ? 'رصيد غير كافٍ'
            : `نشر المهمة — ${budget.toLocaleString('en-US')} نقطة`}
      </button>

    </section>
  )
}
