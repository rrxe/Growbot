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
    'channel' | 'group' | 'bot'
  >('channel')

  const [
    chat,
    setChat
  ] = useState('')

  const [
    botLink,
    setBotLink
  ] = useState('')

  const [
    description,
    setDescription
  ] = useState('')

  const [
    reward,
    setReward
  ] = useState(10)

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
          budget / (type === 'bot' ? reward : 5)
        ),
      [budget, type, reward]
    )

  async function submit() {
    if (type === 'bot') {
      if (!botLink.trim()) {
        showAlert('أدخل رابط إحالة البوت.')

        return
      }

      if (reward < 10 || reward > 20) {
        showAlert('نقاط مهمة البوت يجب أن تكون بين 10 و20.')

        return
      }

      if (budget < reward || budget % reward !== 0) {
        showAlert(`الميزانية يجب أن تكون من مضاعفات ${reward}.`)

        return
      }
    } else if (!chat.trim()) {
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

      await createTask(
        type === 'bot'
          ? {
              type,
              title: title.trim() || undefined,
              budgetPoints: budget,
              botLink: botLink.trim(),
              rewardPoints: reward,
              description: description.trim() || undefined
            }
          : {
              type,
              chat: chat.trim(),
              title: title.trim() || undefined,
              budgetPoints: budget
            }
      )

      setChat('')
      setBotLink('')
      setTitle('')
      setDescription('')

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
            لازم تضيف StormGrow أدمن بالقناة أو الكروب قبل ما تنشر —
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

          <button
            className={
              type === 'bot'
                ? 'active'
                : ''
            }
            onClick={() =>
              setType('bot')
            }
          >
            🤖 Join Bot
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


      {type === 'bot' ? (
        <>
          <div className="field-section">
            <label>
              رابط إحالة البوت
            </label>

            <input
              value={botLink}
              onChange={event =>
                setBotLink(event.target.value)
              }
              placeholder="https://t.me/your_bot?start=ref_xxx"
              dir="ltr"
              maxLength={300}
            />

            <small className="field-help">
              الرابط اللي يفتح البوت المطلوب الانضمام له. المهمة تحتاج مراجعة
              قبل ما تظهر بالسوق.
            </small>
          </div>

          <div className="field-section">
            <label>
              وصف المهمة
            </label>

            <textarea
              value={description}
              onChange={event =>
                setDescription(event.target.value)
              }
              placeholder="مثلاً: افتح البوت واضغط Start، بدون أي اشتراك إضافي"
              maxLength={500}
              rows={3}
            />

            <small className="field-help">
              هاد الوصف بيبين للمستخدم بنافذة تأكيد قبل ما يروح لرابط البوت —
              وضّح فيه بالضبط شو المطلوب منه يسوي.
            </small>
          </div>

          <div className="field-section">
            <label>
              نقاط كل تنفيذ (10 - 20)
            </label>

            <input
              type="number"
              min={10}
              max={20}
              value={reward}
              onChange={event =>
                setReward(
                  Math.max(
                    10,
                    Math.min(
                      20,
                      Number(event.target.value) || 10
                    )
                  )
                )
              }
            />
          </div>
        </>
      ) : (
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
            وتأكد إنه StormGrow أدمن بنفس المكان.
          </small>
        </div>
      )}


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
                maxBudget &&
                (type !== 'bot' || amount % reward === 0)
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
            min={type === 'bot' ? reward : 5}
            step={type === 'bot' ? reward : 5}
            max={maxBudget}
            value={budget}
            onChange={event =>
              setBudget(
                Math.max(
                  type === 'bot' ? reward : 5,
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
              {type === 'bot' ? reward : 5}
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
