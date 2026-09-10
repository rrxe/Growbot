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
        showAlert('أدخل رابط البوت.')

        return
      }

      if (reward < 10 || reward > 20) {
        showAlert('مكافأة مهمة البوت يجب أن تكون بين 10 و20 نقطة.')

        return
      }

      if (budget < reward || budget % reward !== 0) {
        showAlert(`الميزانية يجب أن تكون من مضاعفات ${reward}.`)

        return
      }
    } else if (!chat.trim()) {
      showAlert(
        'أدخل رابط القناة أو المجموعة التي تريد الترويج لها.'
      )

      return
    }

    if (
      budget <
      5
    ) {
      showAlert(
        'الحد الأدنى لميزانية الحملة هو 5 نقاط.'
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
        '✅ تم إنشاء الحملة بنجاح.'
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
            إنشاء حملة
          </span>

          <h1>
            نشر حملة
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
            قبل إطلاق الحملة
          </strong>

          <p>
            تأكد من إضافة بوت STORM كمشرف في القناة أو المجموعة قبل النشر.
            هذه الصلاحية ضرورية للتحقق من تنفيذ المهمة.
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
            قناة
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
            مجموعة
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
            بوت
          </button>
        </div>
      </div>


      <div className="field-section">
        <label>
          عنوان الحملة
        </label>

        <input
          value={title}
          onChange={event =>
            setTitle(
              event.target.value
            )
          }
          placeholder="مثال: قناة أخبار التقنية"
          maxLength={80}
        />
      </div>


      {type === 'bot' ? (
        <>
          <div className="field-section">
            <label>
              رابط البوت
            </label>

            <input
              value={botLink}
              onChange={event =>
                setBotLink(event.target.value)
              }
              placeholder="https://t.me/example_bot"
              dir="ltr"
              maxLength={300}
            />

            <small className="field-help">
              الرابط الذي سيفتحه المستخدم لتنفيذ المهمة. 
              مهام البوت تمر بمراجعة قبل نشرها.
            </small>
          </div>

          <div className="field-section">
            <label>
              تعليمات التنفيذ
            </label>

            <textarea
              value={description}
              onChange={event =>
                setDescription(event.target.value)
              }
              placeholder="مثال: افتح البوت واضغط Start ثم أكمل الخطوة المطلوبة."
              maxLength={500}
              rows={3}
            />

            <small className="field-help">
              تظهر هذه التعليمات للمستخدم قبل فتح الرابط، لذلك اجعلها مختصرة وواضحة وتحدد الإجراء المطلوب.
            </small>
          </div>

          <div className="field-section">
            <label>
              مكافأة كل تنفيذ (10 - 20)
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
            placeholder="https://t.me/example أو @example"
            dir="ltr"
            maxLength={200}
          />

          <small className="field-help">
            أدخل رابط Telegram أو @username، وتأكد أن بوت STORM مشرف في الوجهة حتى يتم التحقق من الانضمام.
          </small>
        </div>
      )}


      <div className="budget-card">

        <div className="budget-head">

          <div>
            <span>
              ميزانية الحملة
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
              عدد التنفيذات
            </span>

            <strong>
              {members.toLocaleString(
                'en-US'
              )}
            </strong>
          </div>

          <div>
            <span>
              المكافأة لكل تنفيذ
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
          ? 'جاري إنشاء الحملة...'
          : maxBudget < 5
            ? 'رصيد غير كافٍ'
            : `إطلاق الحملة — ${budget.toLocaleString('en-US')} نقطة`}
      </button>

    </section>
  )
}
