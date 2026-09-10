import { useState } from 'react'
import type { RequiredChannel } from '../lib/types'
import '../styles/required-subscription.css'

type Props = {
  channels: RequiredChannel[]
  loading?: boolean
  onVerify: () => Promise<void>
  onOpen: (url: string) => void
}

function LockIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="5" y="10" width="14" height="10" rx="2.5" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <path d="M8 10V7.5a4 4 0 0 1 8 0V10" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <circle cx="12" cy="15" r="1" fill="currentColor" />
    </svg>
  )
}

function ChannelIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M3 11.5 19.5 4l-3 16-6-4.2L7.5 18l-.6-5.3L3 11.5Z" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" strokeLinecap="round" />
      <path d="m9.9 12.7 9.6-8.7" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  )
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 12.5 9.5 18 20 6" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export default function RequiredSubscription({ channels, loading = false, onVerify, onOpen }: Props) {
  const [checking, setChecking] = useState(false)
  const allJoined = channels.length > 0 && channels.every((channel) => channel.joined)

  async function verify() {
    if (checking) return
    setChecking(true)
    try {
      await onVerify()
    } finally {
      setChecking(false)
    }
  }

  return (
    <div className="required-subscription-page">
      <div className="required-subscription-card">
        <div className="required-subscription-lock"><LockIcon /></div>
        <div className="required-subscription-kicker">STORM ACCESS</div>
        <h1>الاشتراك مطلوب</h1>
        <p>انضم إلى القنوات الرسمية التالية حتى تتمكن من استخدام التطبيق.</p>

        <div className="required-subscription-list">
          {channels.map((channel) => (
            <div key={channel.id} className={`required-subscription-channel ${channel.joined ? 'joined' : ''}`}>
              <div className="required-subscription-channel-info">
                <div className="required-subscription-channel-icon"><ChannelIcon /></div>
                <strong>{channel.title}</strong>
              </div>
              <button
                type="button"
                className="required-subscription-join"
                disabled={channel.joined}
                onClick={() => onOpen(channel.url)}
              >
                {channel.joined ? 'تم الاشتراك' : 'انضمام'}
              </button>
            </div>
          ))}
        </div>

        <button
          type="button"
          className="required-subscription-verify"
          onClick={() => void verify()}
          disabled={checking}
        >
          {checking || loading ? (
            <>جارٍ التحقق...</>
          ) : allJoined ? (
            <><CheckIcon /> تم التحقق</>
          ) : (
            <><CheckIcon /> تحقق من الاشتراك</>
          )}
        </button>

        <small>يتم التحقق من عضويتك مباشرة عبر Telegram عند فتح التطبيق وكلما طلبت إعادة التحقق.</small>
      </div>
    </div>
  )
}
