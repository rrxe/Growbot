import {
  useEffect,
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

const MIN_TASKS_TO_PUBLISH = 3

// الحد الأدنى لميزانية الحملة حسب النوع — يضمن على الأقل 3 تنفيذات لمهمة البوت
// و10 تنفيذات لمهمة القناة/المجموعة
const MIN_BOT_BUDGET = 60
const MIN_CHAT_BUDGET = 50

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

  // مكافأة مهمة البوت أصبحت ثابتة (20 نقطة لكل تنفيذ) وما عادت قابلة للتعديل
  const reward = 20

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

  const minBudget =
    type === 'bot'
      ? MIN_BOT_BUDGET
      : MIN_CHAT_BUDGET

  // المطلوب مو "3 مهام مدى الحياة" بل "3 مهام جديدة بعد آخر حملة نشرتها" —
  // وحساب الـ owner معفي من هذا الشرط بالكامل
  const tasksSinceLastPublish =
    user.is_owner
      ? MIN_TASKS_TO_PUBLISH
      : user.completed_tasks - (user.tasks_at_last_publish || 0)

  // كل ما تغيّر نوع الحملة، نصحّح الميزانية عشان تضل تحترم الحد الأدنى الجديد
  // ومضاعفات المكافأة (بدل ما تضل عالقة على قيمة صالحة للنوع القديم بس).
  useEffect(() => {
    const step = type === 'bot' ? reward : 5

    setBudget((current) => {
      const target = Math.max(minBudget, Math.min(maxBudget || minBudget, current))

      return Math.ceil(target / step) * step
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type])

  const members =
    useMemo(
      () =>
        Math.floor(
          budget / (type === 'bot' ? reward : 5)
        ),
      [budget, type, reward]
    )

  async function submit() {
    if (tasksSinceLastPublish < MIN_TASKS_TO_PUBLISH) {
      showAlert(
        `يجب إتمام ${MIN_TASKS_TO_PUBLISH} مهام جديدة بعد آخر حملة نشرتها. رصيدك الحالي: ${tasksSinceLastPublish}.`
      )

      return
    }

    if (type === 'bot') {
      if (!botLink.trim()) {
        showAlert('أدخل رابط البوت.')

        return
      }

      if (reward !== 20) {
        showAlert('مكافأة مهمة البوت ثابتة عند 20 نقطة.')

        return
      }

      if (budget < MIN_BOT_BUDGET || budget % reward !== 0) {
        showAlert(`الحد الأدنى لميزانية حملة البوت هو ${MIN_BOT_BUDGET} نقطة (3 تنفيذات على الأقل)، ويجب أن تكون من مضاعفات ${reward}.`)

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
      minBudget
    ) {
      showAlert(
        `الحد الأدنى لميزانية الحملة هو ${minBudget} نقطة.`
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


      {tasksSinceLastPublish < MIN_TASKS_TO_PUBLISH && (
        <div className="publish-warning">

          <div className="warning-icon">
            !
          </div>

          <div>
            <strong>
              النشر غير متاح بعد
            </strong>

            <p>
              يجب إتمام {MIN_TASKS_TO_PUBLISH} مهام جديدة بعد آخر حملة نشرتها.
              رصيدك الحالي: {tasksSinceLastPublish} من {MIN_TASKS_TO_PUBLISH}.
            </p>
          </div>

        </div>
      )}


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
              مكافأة كل تنفيذ
            </label>

            <div className="field-static-value">
              20 نقطة (ثابتة)
            </div>

            <small className="field-help">
              تكلفة تنفيذ مهمة البوت أصبحت ثابتة عند 20 نقطة لكل مُنفّذ.
            </small>
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
                amount >= minBudget &&
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
            min={minBudget}
            step={type === 'bot' ? reward : 5}
            max={maxBudget}
            value={budget}
            onChange={event =>
              setBudget(
                Math.max(
                  minBudget,
                  Math.min(
                    maxBudget ||
                      minBudget,
                    Number(
                      event.target
                        .value
                    ) || minBudget
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
          maxBudget < minBudget ||
          tasksSinceLastPublish < MIN_TASKS_TO_PUBLISH
        }
        onClick={() =>
          void submit()
        }
      >
        {busy
          ? 'جاري إنشاء الحملة...'
          : tasksSinceLastPublish < MIN_TASKS_TO_PUBLISH
            ? `يلزم ${MIN_TASKS_TO_PUBLISH} مهام للنشر`
            : maxBudget < minBudget
              ? `رصيد غير كافٍ (الحد الأدنى ${minBudget} نقطة)`
              : `إطلاق الحملة — ${budget.toLocaleString('en-US')} نقطة`}
      </button>

    </section>
  )
}
