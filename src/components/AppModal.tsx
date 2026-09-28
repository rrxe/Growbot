import { useEffect, useState } from 'react'
import '../styles/app-modal.css'
import {
  dismissModal,
  subscribeModal,
  type ModalRequest
} from '../lib/modal'

type Tone = 'success' | 'error' | 'info' | 'confirm'

// نحدد شكل النافذة (أيقونة + لون) من نص الرسالة نفسه،
// عشان ما نغير كل استدعاءات showAlert الموجودة بالتطبيق.
function detectTone(request: ModalRequest): Tone {
  if (request.type === 'confirm') return 'confirm'

  const text = request.message

  if (/✅|🎉|☀️|^تم\s|^تمت\s|بنجاح|نجاح/.test(text)) return 'success'

  if (/❌|⚠️|تعذر|تعذرت|فشل|خطأ|لا يمكن|غير كاف|غير متاح|انتهت|أدخل|اكتب|انتظر/.test(text)) {
    return 'error'
  }

  return 'info'
}

const ICONS: Record<Tone, string> = {
  success: '✓',
  error: '!',
  info: 'i',
  confirm: '?'
}

// أول سطر قصير + باقي النص → عنوان + تفاصيل (أوضح بكثير من فقرة وحدة)
function splitMessage(message: string) {
  const trimmed = message.trim()
  const breakIndex = trimmed.indexOf('\n')

  if (breakIndex === -1) {
    return { title: '', body: trimmed }
  }

  const first = trimmed.slice(0, breakIndex).trim()
  const rest = trimmed.slice(breakIndex + 1).trim()

  if (first && rest && first.length <= 42) {
    return { title: first, body: rest }
  }

  return { title: '', body: trimmed }
}

export default function AppModal() {
  const [active, setActive] = useState<ModalRequest | null>(null)

  useEffect(() => {
    return subscribeModal((request) => {
      setActive(request)
    })
  }, [])

  function close(result: boolean) {
    if (!active) return

    if (active.type === 'confirm') {
      active.resolve(result)
    } else {
      active.resolve()
    }

    dismissModal()
  }

  useEffect(() => {
    if (!active) return

    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        if (active?.type === 'confirm') {
          active.resolve(false)
        } else {
          active?.resolve()
        }

        dismissModal()
      }
    }

    window.addEventListener('keydown', onKey)

    return () => window.removeEventListener('keydown', onKey)
  }, [active])

  if (!active) {
    return null
  }

  const tone = detectTone(active)
  const { title, body } = splitMessage(active.message)

  return (
    <div
      className="storm-modal-backdrop"
      role="presentation"
      onClick={() => {
        if (active.type === 'alert') {
          close(true)
        }
      }}
    >
      <div
        className={`storm-modal storm-modal--${tone}`}
        role="dialog"
        aria-modal="true"
        onClick={(event) => event.stopPropagation()}
      >
        <div
          className={`storm-modal-icon storm-modal-icon--${tone}`}
          aria-hidden="true"
        >
          {ICONS[tone]}
        </div>

        {title ? (
          <h3 className="storm-modal-title">{title}</h3>
        ) : null}

        <p className="storm-modal-message">
          {body}
        </p>

        <div className="storm-modal-actions">
          {active.type === 'confirm' && (
            <button
              className="storm-modal-btn storm-modal-btn-secondary"
              onClick={() => close(false)}
            >
              إلغاء
            </button>
          )}

          <button
            className="storm-modal-btn storm-modal-btn-primary"
            onClick={() => close(true)}
            autoFocus
          >
            {active.type === 'confirm' ? 'تأكيد' : 'حسنًا'}
          </button>
        </div>
      </div>
    </div>
  )
}
