import '../styles/balance-bar.css'
import type { User } from '../lib/types'

type Props = {
  user: User
  onOpenWallet?: () => void
}

function compact(value: number) {
  const n = Number(value || 0)

  if (Math.abs(n) >= 1_000_000) {
    return `${(n / 1_000_000).toFixed(2).replace(/\.?0+$/, '')}M`
  }

  return n.toLocaleString('en-US')
}

// شريط علوي ثابت يوضح رصيدك دايمًا بكل الصفحات: النقاط + Coins + USDT
export default function BalanceBar({ user, onOpenWallet }: Props) {
  return (
    <>
    <div className="balance-bar-spacer" aria-hidden="true" />
    <div className="balance-bar" dir="rtl">
      <button
        type="button"
        className="balance-bar-inner"
        onClick={onOpenWallet}
        aria-label="رصيدك"
      >
        <div className="balance-chip balance-chip--points">
          <span>النقاط</span>
          <strong>{compact(user.points)}</strong>
        </div>

        <div className="balance-chip balance-chip--coins">
          <span>Coins</span>
          <strong>{compact(Number(user.coins || 0))}</strong>
        </div>

        <div className="balance-chip balance-chip--usdt">
          <span>USDT</span>
          <strong>{Number(user.usdt_balance || 0).toFixed(4)}</strong>
        </div>
      </button>
    </div>
    </>
  )
}
