import { Router } from 'express'

import { authMiddleware } from '../lib/auth.js'
import { supabase } from '../lib/supabase.js'

export const walletRouter = Router()

const DEFAULT_BLOCK_ID = '50410'
const DEFAULT_EXCHANGE_MIN_COINS = 1000
const DEFAULT_WITHDRAWAL_ADS = 7
const DEFAULT_MIN_WITHDRAWAL_USDT = 0.05
const DEFAULT_COINS_PER_USDT = 100000

async function getWalletSettings() {
  const { data, error } = await supabase
    .from('app_settings')
    .select('key,value')
    .in('key', [
      'wallet_reward_ads_block_id',
      'wallet_exchange_min_coins',
      'wallet_withdrawal_ads_required',
      'wallet_withdrawal_min_usdt',
      'coins_per_usdt',
      'usdt_per_1000_coins',
    ])

  if (error) throw error

  const map: Record<string, string> = {}
  for (const row of data || []) map[row.key] = row.value

  return {
    blockId: String(map.wallet_reward_ads_block_id || DEFAULT_BLOCK_ID),
    exchangeMinCoins: Math.max(1, Number(map.wallet_exchange_min_coins || DEFAULT_EXCHANGE_MIN_COINS)),
    withdrawalAdsRequired: Math.max(1, Number(map.wallet_withdrawal_ads_required || DEFAULT_WITHDRAWAL_ADS)),
    withdrawalMinUsdt: Math.max(0.000001, Number(map.wallet_withdrawal_min_usdt || DEFAULT_MIN_WITHDRAWAL_USDT)),
    coinsPerUsdt: Math.max(1, Number(map.coins_per_usdt || DEFAULT_COINS_PER_USDT)),
    usdtPer1000Coins: Number(map.usdt_per_1000_coins || '0.01'),
  }
}

function normalizeError(message: string) {
  if (message.includes('EXCHANGE_MIN_COINS')) return 'الحد الأدنى للتحويل هو 1,000 كوين.'
  if (message.includes('INVALID_EXCHANGE_COINS')) return 'قيمة الكوينز غير صحيحة.'
  if (message.includes('WALLET_AD_SESSION_EXISTS')) return 'يوجد إعلان قيد التحقق. أكمل الإعلان الحالي أولًا.'
  if (message.includes('WITHDRAWAL_ADS_COMPLETE')) return 'اكتملت إعلانات فتح السحب بالفعل.'
  if (message.includes('NO_PENDING_WALLET_AD')) return 'لا يوجد إعلان قيد التحقق. ابدأ الإعلان من جديد.'
  if (message.includes('INSUFFICIENT_COINS')) return 'رصيد الكوينز غير كافٍ.'
  if (message.includes('INVALID_GRAM_ADDRESS')) return 'أدخل Gram address صحيحًا.'
  if (message.includes('MIN_WITHDRAWAL')) return 'مبلغ السحب أقل من الحد الأدنى.'
  if (message.includes('WITHDRAWAL_ADS_REQUIRED')) return 'يجب مشاهدة 7 إعلانات قبل السحب.'
  if (message.includes('PENDING_WITHDRAWAL_EXISTS')) return 'لديك طلب سحب قيد المعالجة بالفعل.'
  if (message.includes('INSUFFICIENT_USDT')) return 'رصيد USDT غير كافٍ.'
  if (message.includes('USER_BANNED')) return 'حسابك محظور.'
  if (message.includes('WITHDRAWAL_NOT_FOUND')) return 'طلب السحب غير موجود.'
  if (message.includes('WITHDRAWAL_NOT_PENDING')) return 'طلب السحب لم يعد قيد الانتظار.'
  return message || 'حدث خطأ غير متوقع.'
}

walletRouter.get('/', authMiddleware, async (req, res, next) => {
  try {
    const settings = await getWalletSettings()
    const user = req.dbUser
    const today = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Baghdad' }))
      .toISOString()
      .slice(0, 10)

    let withdrawalAdsWatched = Number(user.withdrawal_ads_watched || 0)
    if (user.withdrawal_ads_date !== today) withdrawalAdsWatched = 0

    const { data: history, error: historyError } = await supabase
      .from('withdrawal_requests')
      .select('id,amount_usdt,gram_address,status,admin_note,created_at,updated_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(10)

    if (historyError) throw historyError

    res.json({
      success: true,
      coins: Number(user.coins || 0),
      usdtBalance: Number(user.usdt_balance || 0),
      gramAddress: user.gram_address || '',
      withdrawalAdsWatched,
      withdrawalAdsRequired: settings.withdrawalAdsRequired,
      exchangeMinCoins: settings.exchangeMinCoins,
      coinsPerUsdt: settings.coinsPerUsdt,
      usdtPer1000Coins: settings.usdtPer1000Coins,
      rewardBlockId: settings.blockId,
      withdrawalMinUsdt: settings.withdrawalMinUsdt,
      withdrawals: (history || []).map((item) => ({
        id: item.id,
        amountUsdt: Number(item.amount_usdt || 0),
        gramAddress: item.gram_address,
        status: item.status,
        adminNote: item.admin_note,
        createdAt: item.created_at,
        updatedAt: item.updated_at,
      })),
    })
  } catch (error) {
    next(error)
  }
})

walletRouter.post('/exchange/start', authMiddleware, async (req, res, next) => {
  try {
    const settings = await getWalletSettings()
    const amountCoins = Math.floor(Number(req.body?.amountCoins))

    if (!Number.isSafeInteger(amountCoins) || amountCoins < settings.exchangeMinCoins) {
      return res.status(400).json({ error: `الحد الأدنى للتحويل هو ${settings.exchangeMinCoins.toLocaleString('en-US')} كوين.` })
    }

    if (amountCoins > Number(req.dbUser.coins || 0)) {
      return res.status(400).json({ error: 'رصيد الكوينز غير كافٍ.' })
    }

    const { data, error } = await supabase.rpc('start_wallet_ad_session', {
      p_user_id: req.dbUser.id,
      p_telegram_id: req.dbUser.telegram_id,
      p_purpose: 'exchange',
      p_block_id: settings.blockId,
      p_exchange_coins: amountCoins,
    })

    if (error) throw error

    res.json({
      success: true,
      sessionId: data?.id,
      blockId: settings.blockId,
      amountCoins,
      usdtGained: amountCoins / settings.coinsPerUsdt,
    })
  } catch (error) {
    const message = String((error as any)?.message || error)
    const status = message.includes('WALLET_AD_SESSION_EXISTS') || message.includes('EXCHANGE_MIN_COINS') ? 409 : 500
    res.status(status).json({ error: normalizeError(message) })
  }
})

walletRouter.post('/exchange/complete', authMiddleware, async (req, res, next) => {
  try {
    const settings = await getWalletSettings()
    const { data, error } = await supabase.rpc('complete_wallet_exchange_ad', {
      p_telegram_id: req.dbUser.telegram_id,
      p_block_id: settings.blockId,
    })

    if (error) throw error
    res.json(data || { success: true })
  } catch (error) {
    const message = String((error as any)?.message || error)
    res.status(400).json({ error: normalizeError(message) })
  }
})

walletRouter.post('/withdrawal-ad/start', authMiddleware, async (req, res, next) => {
  try {
    const settings = await getWalletSettings()
    await supabase
      .from('wallet_ad_sessions')
      .update({ status: 'expired' })
      .eq('user_id', req.dbUser.id)
      .eq('purpose', 'withdrawal')
      .eq('status', 'pending')

    const { data, error } = await supabase.rpc('start_wallet_ad_session', {
      p_user_id: req.dbUser.id,
      p_telegram_id: req.dbUser.telegram_id,
      p_purpose: 'withdrawal',
      p_block_id: settings.blockId,
      p_exchange_coins: null,
    })

    if (error) throw error

    const watched = Number(req.dbUser.withdrawal_ads_watched || 0)
    res.json({
      success: true,
      sessionId: data?.id,
      blockId: settings.blockId,
      watched,
      required: settings.withdrawalAdsRequired,
    })
  } catch (error) {
    const message = String((error as any)?.message || error)
    const status = message.includes('WALLET_AD_SESSION_EXISTS') || message.includes('WITHDRAWAL_ADS_COMPLETE') ? 409 : 500
    res.status(status).json({ error: normalizeError(message) })
  }
})

walletRouter.post('/withdrawal-ad/complete', authMiddleware, async (req, res, next) => {
  try {
    const settings = await getWalletSettings()
    const { data, error } = await supabase.rpc('complete_wallet_withdrawal_ad', {
      p_telegram_id: req.dbUser.telegram_id,
      p_block_id: settings.blockId,
    })

    if (error) throw error
    res.json(data || { success: true })
  } catch (error) {
    const message = String((error as any)?.message || error)
    res.status(400).json({ error: normalizeError(message) })
  }
})

walletRouter.post('/ad/cancel', authMiddleware, async (req, res, next) => {
  try {
    const sessionId = typeof req.body?.sessionId === 'string' ? req.body.sessionId : ''
    if (!sessionId) return res.status(400).json({ error: 'Session ID is required.' })

    const { data, error } = await supabase.rpc('cancel_wallet_ad_session', {
      p_user_id: req.dbUser.id,
      p_session_id: sessionId,
    })

    if (error) throw error
    res.json({ success: Boolean(data) })
  } catch (error) {
    next(error)
  }
})

walletRouter.post('/withdraw', authMiddleware, async (req, res, next) => {
  try {
    const settings = await getWalletSettings()
    const amountUsdt = Number(req.body?.amountUsdt)
    const gramAddress = typeof req.body?.gramAddress === 'string' ? req.body.gramAddress.trim() : ''

    if (!Number.isFinite(amountUsdt) || amountUsdt <= 0) {
      return res.status(400).json({ error: 'أدخل مبلغ USDT صحيح.' })
    }

    const { data, error } = await supabase.rpc('create_withdrawal_request_atomic', {
      p_user_id: req.dbUser.id,
      p_telegram_id: req.dbUser.telegram_id,
      p_amount_usdt: Number(amountUsdt.toFixed(6)),
      p_gram_address: gramAddress,
    })

    if (error) throw error

    res.json(data || { success: true })
  } catch (error) {
    const message = String((error as any)?.message || error)
    res.status(400).json({ error: normalizeError(message) })
  }
})
