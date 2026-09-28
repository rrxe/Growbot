import { useEffect, useMemo, useRef, useState } from 'react'
import {
  cancelWalletAd,
  completeWalletExchangeAd,
  completeWithdrawalUnlockAd,
  createWithdrawal,
  getWallet,
  startWalletExchangeAd,
  startWithdrawalUnlockAd,
  type WalletResponse,
} from '../lib/api'
import { tryAcquireGlobalAdLock, releaseGlobalAdLock, getAdLockWaitSeconds } from '../lib/adLock'
import { hapticError, hapticSuccess, showAlert } from '../lib/telegram'
import type { User } from '../lib/types'
import '../styles/withdrawal.css'

type AdsgramWalletController = {
  show: () => Promise<any>
}

type Props = {
  user: User
  onUserChanged: (user: User) => void
  onOpenLeaderboard: () => void
}

const DEFAULT_BLOCK_ID = '50410'
const DEFAULT_MIN_WITHDRAWAL_USDT = 0.05

function formatUsdt(value: number) {
  return Number(value || 0).toFixed(4)
}

export default function Withdrawal({ user, onUserChanged, onOpenLeaderboard }: Props) {
  const [wallet, setWallet] = useState<WalletResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [exchangeOpen, setExchangeOpen] = useState(false)
  const [exchangeCoins, setExchangeCoins] = useState('1000')
  const [exchangeBusy, setExchangeBusy] = useState(false)
  const [withdrawBusy, setWithdrawBusy] = useState(false)
  const [withdrawAddress, setWithdrawAddress] = useState(user.gram_address || '')
  const [withdrawAmount, setWithdrawAmount] = useState('')
  const [adBusy, setAdBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [exchangeMessage, setExchangeMessage] = useState('')
  const [adMessage, setAdMessage] = useState('')
  const [historyOpen, setHistoryOpen] = useState(false)
  const adControllerRef = useRef<AdsgramWalletController | null>(null)
  const withdrawCardRef = useRef<HTMLElement | null>(null)

  async function refreshWallet(quiet = true) {
    if (quiet) setRefreshing(true)
    else setLoading(true)

    try {
      const result = await getWallet()
      setWallet(result)
      setWithdrawAddress(result.gramAddress || user.gram_address || '')
      if (!withdrawAmount && result.usdtBalance > 0) {
        setWithdrawAmount(result.usdtBalance.toFixed(4))
      }

      onUserChanged({
        ...user,
        coins: result.coins,
        usdt_balance: result.usdtBalance,
        gram_address: result.gramAddress || null,
        withdrawal_ads_watched: result.withdrawalAdsWatched,
      })
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'تعذر تحميل المحفظة.')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  useEffect(() => {
    void refreshWallet(false)
  }, [])

  const exchangeAmount = Math.floor(Number(exchangeCoins || 0))
  const exchangeUsdt = wallet ? exchangeAmount / wallet.coinsPerUsdt : exchangeAmount / 100000
  const withdrawalRemaining = Math.max(
    0,
    (wallet?.withdrawalAdsRequired || 7) - (wallet?.withdrawalAdsWatched || 0)
  )
  const minWithdrawal = wallet?.withdrawalMinUsdt || DEFAULT_MIN_WITHDRAWAL_USDT
  const usdtBalanceNow = wallet?.usdtBalance || 0
  const belowMinimum = usdtBalanceNow < minWithdrawal
  const canWithdraw = Boolean(wallet && !belowMinimum && withdrawalRemaining === 0)
  const coinsPerUsdt = wallet?.coinsPerUsdt || 100000
  const usdtPer1000 = wallet?.usdtPer1000Coins || 0.01
  // كم كوين ناقصك عشان توصل للحد الأدنى للسحب
  const coinsToMinimum = belowMinimum
    ? Math.max(0, Math.ceil((minWithdrawal - usdtBalanceNow) * coinsPerUsdt))
    : 0
  const parsedWithdrawAmount = Number(withdrawAmount || 0)

  const quickExchangeValues = useMemo(() => {
    const coins = wallet?.coins || 0
    const min = wallet?.exchangeMinCoins || 1000
    const candidates = [min, 10000, 50000, 100000]
    return candidates.filter((value, index) => value <= coins && candidates.indexOf(value) === index)
  }, [wallet])

  async function showRewardAd(blockId: string) {
    if (!tryAcquireGlobalAdLock()) {
      throw new Error(`انتظر ${getAdLockWaitSeconds()} ثانية قبل تشغيل إعلان آخر.`)
    }

    try {
      if (!window.Adsgram) {
        throw new Error('إعلان AdsGram غير جاهز بعد. جرّب مرة ثانية.')
      }

      adControllerRef.current = window.Adsgram.init({ blockId: blockId || DEFAULT_BLOCK_ID })
      await adControllerRef.current.show()
    } finally {
      releaseGlobalAdLock()
      adControllerRef.current = null
    }
  }

  async function handleExchange() {
    if (!wallet || exchangeBusy) return
    const amount = Math.floor(Number(exchangeCoins || 0))

    if (!Number.isSafeInteger(amount) || amount < wallet.exchangeMinCoins) {
      setExchangeMessage(`الحد الأدنى للتحويل ${wallet.exchangeMinCoins.toLocaleString('en-US')} كوين.`)
      return
    }

    if (amount > wallet.coins) {
      setExchangeMessage('رصيد الكوينز غير كافٍ.')
      return
    }

    setExchangeBusy(true)
    setExchangeMessage('جاري تجهيز إعلان التحقق...')
    let sessionId = ''

    try {
      const session = await startWalletExchangeAd(amount)
      sessionId = session.sessionId
      setExchangeMessage('شاهد الإعلان كاملًا، وبعده يتم التحويل تلقائيًا.')

      try {
        await showRewardAd(session.blockId)
      } catch (error) {
        await cancelWalletAd(sessionId).catch(() => {})
        throw error
      }

      try {
        const result = await completeWalletExchangeAd()
        setExchangeMessage(`تم تحويل ${amount.toLocaleString('en-US')} كوين إلى +${formatUsdt(result.usdtGained)} USDT ✅`)
      } catch (error) {
        // Reward URL may have completed the transaction slightly before the client callback.
        const latest = await getWallet()
        if (latest.coins <= wallet.coins - amount) {
          setWallet(latest)
          setExchangeMessage(`تم التحويل بنجاح إلى رصيد USDT ✅`)
        } else {
          throw error
        }
      }

      const latest = await getWallet()
      setWallet(latest)
      onUserChanged({
        ...user,
        coins: latest.coins,
        usdt_balance: latest.usdtBalance,
        gram_address: latest.gramAddress || null,
        withdrawal_ads_watched: latest.withdrawalAdsWatched,
      })
      hapticSuccess()
      setExchangeOpen(false)
      setExchangeMessage('')
      showAlert(`تم التحويل بنجاح ✅\n\nتم تحويل ${amount.toLocaleString('en-US')} Coins إلى رصيد USDT.`)
    } catch (error) {
      hapticError()
      setExchangeMessage(error instanceof Error ? error.message : 'تعذر إكمال التحويل.')
    } finally {
      setExchangeBusy(false)
    }
  }

  async function handleWithdrawalAd() {
    if (!wallet || adBusy || withdrawalRemaining <= 0) return
    setAdBusy(true)
    setAdMessage(`جاري تجهيز الإعلان ${wallet.withdrawalAdsWatched + 1}/${wallet.withdrawalAdsRequired}...`)
    let sessionId = ''

    try {
      const session = await startWithdrawalUnlockAd()
      sessionId = session.sessionId

      try {
        await showRewardAd(session.blockId)
      } catch (error) {
        await cancelWalletAd(sessionId).catch(() => {})
        throw error
      }

      try {
        const result = await completeWithdrawalUnlockAd()
        setWallet((current) => current ? {
          ...current,
          withdrawalAdsWatched: result.watched,
        } : current)
        setAdMessage(result.remaining > 0
          ? `تم احتساب الإعلان ✅ باقي ${result.remaining} إعلانات.`
          : 'اكتملت إعلانات فتح السحب ✅')
      } catch (error) {
        const latest = await getWallet()
        if (latest.withdrawalAdsWatched > (wallet.withdrawalAdsWatched || 0)) {
          setWallet(latest)
          setAdMessage(latest.withdrawalAdsRequired - latest.withdrawalAdsWatched > 0
            ? `تم احتساب الإعلان ✅ باقي ${latest.withdrawalAdsRequired - latest.withdrawalAdsWatched} إعلانات.`
            : 'اكتملت إعلانات فتح السحب ✅')
        } else {
          throw error
        }
      }

      const latest = await getWallet()
      setWallet(latest)
      onUserChanged({
        ...user,
        coins: latest.coins,
        usdt_balance: latest.usdtBalance,
        gram_address: latest.gramAddress || null,
        withdrawal_ads_watched: latest.withdrawalAdsWatched,
      })
      hapticSuccess()

      window.dispatchEvent(
        new CustomEvent('stormy:reward-complete')
      )
    } catch (error) {
      hapticError()
      setAdMessage(error instanceof Error ? error.message : 'تعذر احتساب الإعلان.')
    } finally {
      setAdBusy(false)
    }
  }

  async function handleWithdraw() {
    if (!wallet || withdrawBusy) return

    const amount = Number(withdrawAmount || 0)
    const gram = withdrawAddress.trim()

    if (belowMinimum) {
      setMessage(`رصيدك أقل من الحد الأدنى للسحب (${minWithdrawal.toFixed(2)} USDT). حوّل Coins أولًا.`)
      return
    }

    if (!canWithdraw) {
      setMessage(`شاهد ${withdrawalRemaining} إعلانات لفتح السحب.`)
      return
    }

    if (!Number.isFinite(amount) || amount < minWithdrawal) {
      setMessage(`الحد الأدنى للسحب ${minWithdrawal.toFixed(2)} USDT.`)
      return
    }

    if (amount > wallet.usdtBalance) {
      setMessage('المبلغ أكبر من رصيد USDT المتاح.')
      return
    }

    if (!gram) {
      setMessage('أدخل Gram address أولًا.')
      return
    }

    setWithdrawBusy(true)
    setMessage('جاري إرسال طلب السحب...')

    try {
      const result = await createWithdrawal(amount, gram)
      const latest = await getWallet()
      setWallet(latest)
      setWithdrawAmount(latest.usdtBalance > 0 ? latest.usdtBalance.toFixed(4) : '')
      onUserChanged({
        ...user,
        coins: latest.coins,
        usdt_balance: latest.usdtBalance,
        gram_address: gram,
        withdrawal_ads_watched: latest.withdrawalAdsWatched,
      })
      hapticSuccess()
      setMessage(`تم إرسال طلب سحب ${formatUsdt(amount)} USDT إلى Gram ✅`)
      showAlert(`تم إرسال طلب السحب بنجاح.\n\nالمبلغ: ${formatUsdt(amount)} USDT\nالحالة: قيد المراجعة`)
      void result
    } catch (error) {
      hapticError()
      setMessage(error instanceof Error ? error.message : 'تعذر إرسال طلب السحب.')
    } finally {
      setWithdrawBusy(false)
    }
  }

  const setMaxWithdraw = () => {
    if (!wallet) return
    setWithdrawAmount(wallet.usdtBalance.toFixed(4))
  }

  return (
    <section className="page withdrawal-page">
      <div className="page-header">
        <div>
          <span className="eyebrow">المحفظة</span>
          <h1>السحب والتحويل</h1>
        </div>
        <button
          className={`withdrawal-refresh ${refreshing ? 'spinning' : ''}`}
          type="button"
          onClick={() => void refreshWallet(true)}
          aria-label="تحديث"
        >
          ↻
        </button>
      </div>

      <section className="wallet-hero-card">
        <div className="wallet-hero-top">
          <div>
            <span>USDT Balance</span>
            <strong>{formatUsdt(wallet?.usdtBalance || 0)} <em>USDT</em></strong>
          </div>
          <div className="wallet-usdt-badge">USDT</div>
        </div>

        <div className="wallet-stats-grid">
          <div>
            <span>Coins</span>
            <strong>{(wallet?.coins || 0).toLocaleString('en-US')}</strong>
          </div>
          <div>
            <span>السعر</span>
            <strong>1,000 → ${usdtPer1000.toFixed(2)}</strong>
          </div>
          <div>
            <span>إعلانات السحب</span>
            <strong>{wallet?.withdrawalAdsWatched || 0}/{wallet?.withdrawalAdsRequired || 7}</strong>
          </div>
        </div>

        <div className="wallet-action-grid">
          <button className="wallet-action secondary" type="button" onClick={() => {
            setExchangeCoins(String(Math.min(wallet?.coins || 1000, 1000)))
            setExchangeOpen(true)
            setExchangeMessage('')
          }}>
            ↔ <span>تحويل Coins</span>
          </button>
          <button className="wallet-action primary" type="button" onClick={() => {
            if (wallet) setWithdrawAmount(wallet.usdtBalance.toFixed(4))
            setMessage('')
            withdrawCardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
          }}>
            ↓ <span>طلب سحب</span>
          </button>
        </div>

        {belowMinimum && wallet ? (
          <div className="wallet-min-hint">
            الحد الأدنى للسحب <b>{minWithdrawal.toFixed(2)} USDT</b>
            {coinsToMinimum > 0 ? <> — باقي لك <b>{coinsToMinimum.toLocaleString('en-US')}</b> Coins للوصول له.</> : null}
          </div>
        ) : null}
      </section>

      <section className="wallet-exchange-rate-card">
        <div className="wallet-section-icon">◇</div>
        <div>
          <strong>نظام الكوينز</strong>
          <p>كل مهمة قناة أو مجموعة تعطيك 50 Coins، ومهمة البوت تعطيك 80 Coins.</p>
        </div>
        <span>{coinsPerUsdt >= 1000 ? `${Math.round(coinsPerUsdt / 1000)}K` : coinsPerUsdt} = $1</span>
      </section>

      <section className="wallet-unlock-card">
        <div className="wallet-section-head">
          <div>
            <span className="eyebrow">Reward Gate</span>
            <h2>فتح السحب</h2>
          </div>
          <strong className={withdrawalRemaining === 0 ? 'ready' : ''}>
            {withdrawalRemaining === 0 ? 'جاهز ✓' : `${withdrawalRemaining} متبقي`}
          </strong>
        </div>

        <div className="wallet-unlock-progress">
          <span
            style={{
              width: `${Math.min(
                100,
                ((wallet?.withdrawalAdsWatched || 0) /
                  (wallet?.withdrawalAdsRequired || 7)) * 100
              )}%`
            }}
          />
        </div>

        <p>
          شاهد {wallet?.withdrawalAdsRequired || 7} إعلانات Reward من AdsGram لفتح طلب السحب.
        </p>

        {adMessage ? (
          <div className="wallet-message wallet-ad-message">
            {adMessage}
          </div>
        ) : null}

        <button
          className="wallet-watch-button"
          type="button"
          disabled={adBusy || withdrawalRemaining <= 0 || loading}
          onClick={() => void handleWithdrawalAd()}
        >
          {adBusy
            ? 'جاري عرض الإعلان...'
            : withdrawalRemaining > 0
              ? `▶ مشاهدة الإعلان · ${wallet?.withdrawalAdsWatched || 0}/${wallet?.withdrawalAdsRequired || 7}`
              : '✓ تم فتح السحب'}
        </button>
      </section>

      <section className="wallet-withdraw-card" ref={withdrawCardRef}>
        <div className="wallet-section-head">
          <div>
            <span className="eyebrow">Gram</span>
            <h2>طلب سحب USDT</h2>
          </div>
          <span className="wallet-min-pill">Min {minWithdrawal.toFixed(2)} USDT</span>
        </div>

        <label className="wallet-field">
          <span>Gram address</span>
          <input
            dir="ltr"
            value={withdrawAddress}
            onChange={(event) => setWithdrawAddress(event.target.value)}
            placeholder="ضع Gram address هنا"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
          />
        </label>

        <label className="wallet-field">
          <span>مبلغ USDT</span>
          <div className="wallet-input-row">
            <input
              dir="ltr"
              type="number"
              min={minWithdrawal}
              max={wallet?.usdtBalance || 0}
              step="0.0001"
              value={withdrawAmount}
              onChange={(event) => setWithdrawAmount(event.target.value)}
              placeholder="0.0000"
            />
            <button type="button" onClick={setMaxWithdraw}>MAX</button>
          </div>
        </label>

        {message ? <div className="wallet-message">{message}</div> : null}

        <button
          className="wallet-withdraw-button"
          type="button"
          disabled={withdrawBusy || !canWithdraw || loading}
          onClick={() => void handleWithdraw()}
        >
          {withdrawBusy
            ? 'جاري إرسال الطلب...'
            : belowMinimum
              ? `الرصيد أقل من ${minWithdrawal.toFixed(2)} USDT`
              : canWithdraw
                ? 'إرسال طلب السحب إلى Gram'
                : `شاهد ${withdrawalRemaining} إعلانات لفتح السحب`}
        </button>

        <small className="wallet-hint">المعالجة تتم يدويًا من لوحة الإدارة. لا نطلب Binance أو شبكة أخرى.</small>
      </section>

      <button className="wallet-leaderboard-button" type="button" onClick={onOpenLeaderboard}>
        <span>🏆</span>
        <div>
          <strong>لوحة المتصدرين الأسبوعية</strong>
          <small>أكثر من أنجز مهام من الجمعة إلى الخميس</small>
        </div>
        <b>→</b>
      </button>

      <section className="wallet-history-card">
        <button type="button" className="wallet-history-toggle" onClick={() => setHistoryOpen((value) => !value)}>
          <span>سجل طلبات السحب</span>
          <b>{historyOpen ? '⌃' : '⌄'}</b>
        </button>

        {historyOpen && (
          <div className="wallet-history-list">
            {!wallet?.withdrawals.length ? (
              <div className="wallet-empty">لا توجد طلبات سحب حتى الآن.</div>
            ) : wallet.withdrawals.map((item) => (
              <article className="wallet-history-row" key={item.id}>
                <div>
                  <strong>{formatUsdt(item.amountUsdt)} USDT</strong>
                  <span dir="ltr">{item.gramAddress}</span>
                </div>
                <span className={`wallet-status ${item.status}`}>
                  {item.status === 'pending' ? 'قيد المراجعة' : item.status === 'approved' ? 'تمت الموافقة' : 'مرفوض'}
                </span>
              </article>
            ))}
          </div>
        )}
      </section>

      {exchangeOpen && wallet && (
        <div className="modal-backdrop" onClick={() => !exchangeBusy && setExchangeOpen(false)}>
          <div className="buy-modal wallet-exchange-modal" onClick={(event) => event.stopPropagation()}>
            <div className="modal-head">
              <div>
                <span>تحويل الرصيد</span>
                <strong>Coins → USDT</strong>
              </div>
              <button type="button" onClick={() => !exchangeBusy && setExchangeOpen(false)}>×</button>
            </div>

            <div className="wallet-exchange-rate">
              <strong>1,000 Coins</strong>
              <span>= {usdtPer1000.toFixed(4)} USDT</span>
            </div>

            <div className="wallet-quick-amounts">
              {quickExchangeValues.map((value) => (
                <button key={value} type="button" onClick={() => setExchangeCoins(String(value))}>
                  {value.toLocaleString('en-US')}
                </button>
              ))}
              <button type="button" onClick={() => setExchangeCoins(String(wallet.coins))}>الكل</button>
            </div>

            <label className="wallet-field">
              <span>عدد Coins</span>
              <input
                dir="ltr"
                inputMode="numeric"
                value={exchangeCoins}
                onChange={(event) => setExchangeCoins(event.target.value.replace(/[^0-9]/g, ''))}
              />
            </label>

            <div className="wallet-exchange-preview">
              <span>ستحصل على</span>
              <strong>{formatUsdt(exchangeUsdt)} USDT</strong>
            </div>

            <p className="wallet-hint">لمشاهدة إعلان Reward واحد قبل كل عملية تحويل.</p>

            {exchangeMessage ? (
              <div className="wallet-message">{exchangeMessage}</div>
            ) : null}

            <div className="modal-actions">
              <button className="modal-button ghost" type="button" onClick={() => !exchangeBusy && setExchangeOpen(false)}>إلغاء</button>
              <button className="modal-button primary" type="button" disabled={exchangeBusy} onClick={() => void handleExchange()}>
                {exchangeBusy ? 'جاري التحقق...' : 'مشاهدة الإعلان والتحويل'}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}
