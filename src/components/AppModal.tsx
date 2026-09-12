import { useEffect, useState } from 'react'
import '../styles/app-modal.css'
import { subscribeModal, type ModalRequest } from '../lib/modal'

export default function AppModal() {
  const [active, setActive] = useState<ModalRequest | null>(null)

  useEffect(() => {
    return subscribeModal((request) => {
      setActive(request)
    })
  }, [])

  if (!active) {
    return null
  }

  function close(result: boolean) {
    if (!active) return

    if (active.type === 'confirm') {
      active.resolve(result)
    } else {
      active.resolve()
    }

    setActive(null)
  }

  return (
    <div
      className="storm-modal-backdrop"
      onClick={() => {
        if (active.type === 'alert') {
          close(true)
        }
      }}
    >
      <div
        className="storm-modal"
        onClick={(event) => event.stopPropagation()}
      >
        <div
          className={`storm-modal-icon${active.type === 'confirm' ? ' storm-modal-icon--confirm' : ''}`}
        >
          {active.type === 'confirm' ? '?' : '!'}
        </div>

        <p className="storm-modal-message">
          {active.message}
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
          >
            تأكيد
          </button>
        </div>
      </div>
    </div>
  )
}
