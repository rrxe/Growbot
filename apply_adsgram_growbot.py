from pathlib import Path
import shutil
import re

ROOT = Path.cwd()
SRC = ROOT / 'src'
SERVER = ROOT / 'server'

if not (ROOT / 'package.json').exists() or not (SRC / 'App.tsx').exists():
    raise SystemExit('شغّل السكربت من جذر مشروع GrowBot الذي يحتوي package.json و src/App.tsx')


def backup(path: Path):
    if not path.exists():
        return
    bak = path.with_suffix(path.suffix + '.adsgram.bak')
    if not bak.exists():
        shutil.copy2(path, bak)
        print(f'BACKUP {bak}')


def write(path: Path, content: str):
    backup(path)
    path.write_text(content.rstrip() + '\n', encoding='utf-8')
    print(f'WRITE  {path}')


def replace_once(path: Path, old: str, new: str):
    backup(path)
    text = path.read_text(encoding='utf-8')
    if old not in text:
        raise SystemExit(f'Pattern not found in {path}: {old[:120]!r}')
    text = text.replace(old, new, 1)
    path.write_text(text, encoding='utf-8')
    print(f'PATCH  {path}')

# ------------------------------------------------------------------
# 1) Shared frontend AdsGram helpers/lock
# ------------------------------------------------------------------
write(SRC / 'lib' / 'adLock.ts', r'''// Global AdsGram surface lock, copied in spirit from SLYMintX.
// Manual/reward ads keep a 12s cooldown; automatic int ads are exempt.
let globalAdLock = false;
let lastAdEndedAt = 0;
let lockAcquiredAt = 0;

export const MIN_GAP_BETWEEN_ADS_MS = 12000;
const ASSUMED_MAX_AD_DURATION_MS = 30000;

export function tryAcquireGlobalAdLock(isAuto = false): boolean {
  const now = Date.now();
  if (globalAdLock) return false;

  if (!isAuto) {
    const elapsed = now - lastAdEndedAt;
    if (lastAdEndedAt > 0 && elapsed < MIN_GAP_BETWEEN_ADS_MS) return false;
  }

  globalAdLock = true;
  lockAcquiredAt = now;
  return true;
}

export function releaseGlobalAdLock(isAuto = false): void {
  globalAdLock = false;
  if (!isAuto) lastAdEndedAt = Date.now();
  lockAcquiredAt = 0;
}

export function getAdLockWaitSeconds(): number {
  const now = Date.now();

  if (globalAdLock) {
    const remaining = ASSUMED_MAX_AD_DURATION_MS - (now - lockAcquiredAt);
    if (remaining > 0) return Math.max(1, Math.ceil(remaining / 1000));
  }

  const remaining = MIN_GAP_BETWEEN_ADS_MS - (now - lastAdEndedAt);
  if (lastAdEndedAt > 0 && remaining > 0) {
    return Math.max(1, Math.ceil(remaining / 1000));
  }

  return 0;
}
''')

# ------------------------------------------------------------------
# 2) Backend AdsGram route. Reward URL is compatible with the URL the
#    user supplied: /api/auth/me?adsgram_reward=1&secret=...&userid=...
# ------------------------------------------------------------------
write(SERVER / 'routes' / 'adsgram.ts', r'''import { Router } from 'express'
import { authMiddleware } from '../lib/auth.js'
import { supabase } from '../lib/supabase.js'

export const adsgramRouter = Router()

const ADSGRAM_REWARD_BLOCK_ID = '46262'
const ADSGRAM_REWARD_DAILY_LIMIT = 20
const ADSGRAM_REWARD_POINTS = 6
const ADSGRAM_NATIVE_TASK_BLOCK_ID = 'task-46724'
const ADSGRAM_NATIVE_TASK_REWARD = 1

function getBaghdadDay() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Baghdad',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
}

function getRewardSecret(req: any) {
  const expected = process.env.ADSGRAM_REWARD_SECRET || ''
  const provided = String(req.query?.secret || '')
  return Boolean(expected) && provided === expected
}

adsgramRouter.post(
  '/watch/start',
  authMiddleware,
  async (req, res, next) => {
    try {
      const user = req.dbUser
      const { data, error } = await supabase.rpc('start_adsgram_watch_session', {
        p_user_id: user.id,
        p_telegram_id: user.telegram_id,
        p_block_id: ADSGRAM_REWARD_BLOCK_ID,
        p_daily_limit: ADSGRAM_REWARD_DAILY_LIMIT,
        p_reward_points: ADSGRAM_REWARD_POINTS,
      })

      if (error) throw error

      res.json({
        success: true,
        ...data,
        blockId: ADSGRAM_REWARD_BLOCK_ID,
        dailyLimit: ADSGRAM_REWARD_DAILY_LIMIT,
        rewardPoints: ADSGRAM_REWARD_POINTS,
      })
    } catch (error: any) {
      const message = String(error?.message || error)
      if (message.includes('AD_DAILY_LIMIT')) {
        return res.status(429).json({
          success: false,
          error: 'وصلت للحد اليومي: 20 إعلان.',
          code: 'AD_DAILY_LIMIT',
        })
      }
      if (message.includes('AD_SESSION_EXISTS')) {
        return res.status(409).json({
          success: false,
          error: 'هناك إعلان قيد التحقق بالفعل. أكمل الإعلان الحالي أولاً.',
          code: 'AD_SESSION_EXISTS',
        })
      }
      next(error)
    }
  },
)

adsgramRouter.get(
  '/watch/status',
  authMiddleware,
  async (req, res, next) => {
    try {
      const user = req.dbUser
      const { data, error } = await supabase.rpc('get_adsgram_watch_status', {
        p_user_id: user.id,
        p_block_id: ADSGRAM_REWARD_BLOCK_ID,
        p_daily_limit: ADSGRAM_REWARD_DAILY_LIMIT,
      })

      if (error) throw error

      res.json({
        success: true,
        ...data,
        dayKey: getBaghdadDay(),
        blockId: ADSGRAM_REWARD_BLOCK_ID,
        dailyLimit: ADSGRAM_REWARD_DAILY_LIMIT,
        rewardPoints: ADSGRAM_REWARD_POINTS,
      })
    } catch (error) {
      next(error)
    }
  },
)

adsgramRouter.get(
  '/native/status',
  authMiddleware,
  async (req, res, next) => {
    try {
      const { count, error } = await supabase
        .from('adsgram_native_rewards')
        .select('id', { count: 'exact', head: true })
        .eq('telegram_id', req.dbUser.telegram_id)
        .eq('block_id', ADSGRAM_NATIVE_TASK_BLOCK_ID)

      if (error) throw error

      res.json({
        success: true,
        count: Number(count || 0),
        rewardPoints: ADSGRAM_NATIVE_TASK_REWARD,
        blockId: ADSGRAM_NATIVE_TASK_BLOCK_ID,
      })
    } catch (error) {
      next(error)
    }
  },
)

/**
 * AdsGram Reward URL compatibility endpoint.
 * Exact URL format requested by the user:
 * /api/auth/me?adsgram_reward=1&secret=...&userid=[userId]
 * Native task appends: &kind=native_task
 */
export async function handleAdsgramRewardWebhook(req: any, res: any) {
  if (!getRewardSecret(req)) {
    return res.status(401).json({ success: false, error: 'Unauthorized' })
  }

  const telegramIdRaw = req.query?.userid
  const telegramId = Number(telegramIdRaw)
  if (!Number.isSafeInteger(telegramId) || telegramId <= 0) {
    return res.status(400).json({ success: false, error: 'Missing/invalid userid' })
  }

  try {
    const safeQuery = { ...req.query }
    delete safeQuery.secret

    // Optional audit trail. If the table is not installed yet, don't block the reward.
    try {
      await supabase.from('adsgram_reward_log').insert({
        telegram_id: telegramId,
        query: safeQuery,
      })
    } catch (logError) {
      console.warn('[adsgram] reward log insert skipped:', logError)
    }

    if (String(req.query?.kind || '') === 'native_task') {
      const { data, error } = await supabase.rpc('reward_adsgram_native_task', {
        p_telegram_id: telegramId,
        p_block_id: ADSGRAM_NATIVE_TASK_BLOCK_ID,
        p_reward_points: ADSGRAM_NATIVE_TASK_REWARD,
      })

      if (error) throw error

      return res.status(200).json({
        success: true,
        type: 'native_task',
        reward: ADSGRAM_NATIVE_TASK_REWARD,
        ...(data || {}),
      })
    }

    const { data, error } = await supabase.rpc('reward_adsgram_watch_session', {
      p_telegram_id: telegramId,
      p_block_id: ADSGRAM_REWARD_BLOCK_ID,
      p_daily_limit: ADSGRAM_REWARD_DAILY_LIMIT,
    })

    if (error) {
      const message = String(error.message || error)
      if (message.includes('NO_PENDING_AD')) {
        return res.status(200).json({
          success: false,
          error: 'NO_PENDING_AD',
          reward: 0,
        })
      }
      if (message.includes('AD_DAILY_LIMIT')) {
        return res.status(200).json({
          success: false,
          error: 'AD_DAILY_LIMIT',
          reward: 0,
        })
      }
      throw error
    }

    return res.status(200).json({
      success: true,
      type: 'watch_ad',
      reward: ADSGRAM_REWARD_POINTS,
      ...(data || {}),
    })
  } catch (error: any) {
    console.error('[adsgram] reward webhook error:', error)
    return res.status(500).json({
      success: false,
      error: error?.message || 'Internal error',
    })
  }
}
''')

# ------------------------------------------------------------------
# 3) Mount routes + exact /api/auth/me reward endpoint
# ------------------------------------------------------------------
app = SERVER / 'app.ts'
text = app.read_text(encoding='utf-8')
backup(app)
old = "import {\n  paymentsRouter\n} from './routes/payments.js'\n"
new = old + "\nimport {\n  adsgramRouter,\n  handleAdsgramRewardWebhook\n} from './routes/adsgram.js'\n"
if old not in text:
    raise SystemExit('payments import marker missing')
text = text.replace(old, new, 1)
old2 = "app.use(\n  '/api/payments',\n  paymentsRouter\n)\n"
new2 = old2 + "\napp.use(\n  '/api/adsgram',\n  adsgramRouter\n)\n\n// Keep the exact AdsGram Reward URL path requested for this bot.\napp.get(\n  '/api/auth/me',\n  async (req, res) => {\n    if (req.query?.adsgram_reward === '1') {\n      return handleAdsgramRewardWebhook(req, res)\n    }\n\n    return res.status(404).json({ error: 'API route not found' })\n  }\n)\n"
if old2 not in text:
    raise SystemExit('payments route marker missing')
text = text.replace(old2, new2, 1)
app.write_text(text, encoding='utf-8')
print(f'PATCH  {app}')

# ------------------------------------------------------------------
# 4) AdsGram SDK preloaded in HTML
# ------------------------------------------------------------------
index = ROOT / 'index.html'
backup(index)
html = index.read_text(encoding='utf-8')
marker = '    <script src="https://telegram.org/js/telegram-web-app.js"></script>\n'
insert = '''    <!-- AdsGram SDK: auto int + Reward 46262 + native task-46724 -->\n    <link rel="preconnect" href="https://sad.adsgram.ai" crossorigin>\n    <link rel="dns-prefetch" href="https://sad.adsgram.ai">\n    <script src="https://sad.adsgram.ai/js/sad.min.js"></script>\n\n'''
if marker not in html:
    raise SystemExit('telegram script marker missing')
html = html.replace(marker, insert + marker, 1)
index.write_text(html, encoding='utf-8')
print(f'PATCH  {index}')

# ------------------------------------------------------------------
# 5) API client additions
# ------------------------------------------------------------------
api = SRC / 'lib' / 'api.ts'
text = api.read_text(encoding='utf-8')
backup(api)
append = r'''

export function startAdsgramWatch() {
  return request<{
    success: boolean
    id: string
    watched: number
    remaining: number
    blockId: string
    dailyLimit: number
    rewardPoints: number
  }>('/api/adsgram/watch/start', {
    method: 'POST'
  })
}

export function getAdsgramWatchStatus() {
  return request<{
    success: boolean
    watched: number
    remaining: number
    pending: boolean
    blockId: string
    dailyLimit: number
    rewardPoints: number
  }>('/api/adsgram/watch/status')
}

export function getAdsgramNativeStatus() {
  return request<{
    success: boolean
    count: number
    rewardPoints: number
    blockId: string
  }>('/api/adsgram/native/status')
}
'''
if 'export function startAdsgramWatch()' not in text:
    text = text.rstrip() + append
api.write_text(text, encoding='utf-8')
print(f'PATCH  {api}')

# ------------------------------------------------------------------
# 6) App.tsx: global SDK init + auto int ad 2s then every 30s
# ------------------------------------------------------------------
appx = SRC / 'App.tsx'
text = appx.read_text(encoding='utf-8')
backup(appx)
text = text.replace("import { useEffect, useState } from 'react'", "import { useEffect, useRef, useState } from 'react'\nimport { tryAcquireGlobalAdLock, releaseGlobalAdLock } from './lib/adLock'")
text = text.replace("import './styles/app.css'", "import './styles/app.css'\n\nconst ADSGRAM_AUTO_BLOCK_ID = 'int-46084'\nconst ADSGRAM_SCRIPT_SRC = 'https://sad.adsgram.ai/js/sad.min.js'\n\ntype AdsgramController = {\n  show: () => Promise<any>\n  addEventListener?: (event: string, callback: () => void) => void\n}\n\ndeclare global {\n  interface Window {\n    Adsgram?: {\n      init: (opts: { blockId: string }) => AdsgramController\n    }\n  }\n}\n")
# Insert auto refs after error state
marker = "  const [error, setError] = useState('')\n"
insert = marker + "  const adsgramAutoRef = useRef<AdsgramController | null>(null)\n  const autoInFlightRef = useRef(false)\n"
if marker not in text:
    raise SystemExit('App state marker missing')
text = text.replace(marker, insert, 1)
# Add effects before loading conditional
marker2 = "  useEffect(() => {\n    initTelegram()\n    void loadAll()\n  }, [])\n\n"
effects = r'''  useEffect(() => {
    if (typeof window === 'undefined') return

    const initAdsgram = () => {
      if (!window.Adsgram) return
      if (!adsgramAutoRef.current) {
        adsgramAutoRef.current = window.Adsgram.init({ blockId: ADSGRAM_AUTO_BLOCK_ID })
        adsgramAutoRef.current.addEventListener?.('onError', () => {
          console.warn('[AdsGram:auto] onError')
        })
        adsgramAutoRef.current.addEventListener?.('onBannerNotFound', () => {
          console.warn('[AdsGram:auto] onBannerNotFound')
        })
      }
    }

    if (window.Adsgram) {
      initAdsgram()
      return
    }

    const existing = document.querySelector<HTMLScriptElement>(
      `script[src="${ADSGRAM_SCRIPT_SRC}"]`
    )
    if (existing) {
      existing.addEventListener('load', initAdsgram, { once: true })
      const poll = window.setInterval(() => {
        if (window.Adsgram) {
          window.clearInterval(poll)
          initAdsgram()
        }
      }, 200)
      const stop = window.setTimeout(() => window.clearInterval(poll), 15000)
      return () => {
        existing.removeEventListener('load', initAdsgram)
        window.clearInterval(poll)
        window.clearTimeout(stop)
      }
    }

    const script = document.createElement('script')
    script.src = ADSGRAM_SCRIPT_SRC
    script.async = true
    script.onload = initAdsgram
    script.onerror = () => console.warn('[AdsGram] SDK load failed')
    document.head.appendChild(script)

    return () => {
      script.onload = null
      script.onerror = null
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    let timer: number | null = null

    const showAutoAd = async () => {
      const controller = adsgramAutoRef.current
      if (!controller || cancelled || autoInFlightRef.current) return
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return
      if (!tryAcquireGlobalAdLock(true)) return

      autoInFlightRef.current = true
      try {
        await controller.show()
      } catch (error) {
        console.warn('[AdsGram:auto] skipped', error)
      } finally {
        autoInFlightRef.current = false
        releaseGlobalAdLock(true)
      }
    }

    const schedule = (delay: number) => {
      timer = window.setTimeout(async () => {
        if (cancelled) return
        await showAutoAd()
        schedule(30000)
      }, delay)
    }

    schedule(2000)

    return () => {
      cancelled = true
      if (timer !== null) window.clearTimeout(timer)
    }
  }, [])

'''
if marker2 not in text:
    raise SystemExit('App useEffect marker missing')
text = text.replace(marker2, marker2 + effects, 1)
appx.write_text(text, encoding='utf-8')
print(f'PATCH  {appx}')

# ------------------------------------------------------------------
# 7) Home.tsx: add a compact 20/day x 6 pts Reward ad card
# ------------------------------------------------------------------
home = SRC / 'pages' / 'Home.tsx'
text = home.read_text(encoding='utf-8')
backup(home)
text = text.replace("  createStarsInvoice\n", "  createStarsInvoice,\n  getAdsgramWatchStatus,\n  startAdsgramWatch\n")
text = text.replace("  showAlert\n", "  showAlert\n")
# add imports lock
text = text.replace("import {\n  hapticSuccess,", "import {\n  hapticSuccess,")
text = text.replace("import type {\n  User\n", "import {\n  tryAcquireGlobalAdLock,\n  releaseGlobalAdLock,\n  getAdLockWaitSeconds\n} from '../lib/adLock.js'\n\nimport type {\n  User\n")
# Add state after showBuy block
marker = "  ] = useState(false)\n\n"
insert = marker + "  const [adsgramWatched, setAdsgramWatched] = useState(0)\n  const [adsgramRemaining, setAdsgramRemaining] = useState(20)\n  const [adsgramBusy, setAdsgramBusy] = useState(false)\n\n"
if marker not in text:
    raise SystemExit('Home showBuy marker missing')
text = text.replace(marker, insert, 1)
# Add status load after refreshUser function
marker2 = "  async function buyStars(\n"
insert2 = r'''  async function refreshAdsgramStatus() {
    try {
      const result = await getAdsgramWatchStatus()
      setAdsgramWatched(result.watched)
      setAdsgramRemaining(result.remaining)
    } catch {
      // keep current UI if the status endpoint is temporarily unavailable
    }
  }

  useEffect(() => {
    void refreshAdsgramStatus()
  }, [])

  async function watchAdsgramReward() {
    if (adsgramBusy) return
    if (adsgramRemaining <= 0) {
      showAlert('وصلت للحد اليومي. يرجع العداد تلقائيًا عند منتصف الليل بتوقيت بغداد.')
      return
    }
    if (!window.Adsgram) {
      showAlert('إعلان AdsGram غير جاهز بعد. جرّب مرة ثانية.')
      return
    }

    if (!tryAcquireGlobalAdLock()) {
      showAlert(`انتظر ${getAdLockWaitSeconds()} ثانية قبل تشغيل إعلان آخر.`)
      return
    }

    setAdsgramBusy(true)
    try {
      const session = await startAdsgramWatch()
      const controller = window.Adsgram.init({ blockId: session.blockId })
      await controller.show()

      // Reward URL هو مصدر المكافأة الحقيقي. نراقب السيرفر حتى يصل webhook.
      const previousWatched = session.watched
      for (let attempt = 0; attempt < 900; attempt += 1) {
        await new Promise(resolve => window.setTimeout(resolve, 200))
        const status = await getAdsgramWatchStatus()
        setAdsgramWatched(status.watched)
        setAdsgramRemaining(status.remaining)
        if (status.watched > previousWatched || status.watched === session.watched + 1) {
          hapticSuccess()
          try {
            const latest = await getMe()
            onUserChanged(latest.user)
          } catch {}
          return
        }
      }

      showAlert('تم عرض الإعلان، لكن تأكيد المكافأة ما وصل بعد. لا تعيد المشاهدة الآن؛ سيتحدث العداد عند وصول التأكيد.')
    } catch (error) {
      showAlert(error instanceof Error ? error.message : 'تعذر تشغيل الإعلان.')
    } finally {
      releaseGlobalAdLock()
      setAdsgramBusy(false)
      void refreshAdsgramStatus()
    }
  }

'''
if marker2 not in text:
    raise SystemExit('Home buyStars marker missing')
text = text.replace(marker2, insert2 + marker2, 1)
# Insert card after quick actions
marker3 = "      </div>\n\n\n      <section className=\"checkin-card\">\n"
card = r'''      </div>

      <section className="adsgram-reward-card">
        <div className="adsgram-reward-head">
          <div className="adsgram-reward-icon">AD</div>
          <div>
            <strong>شاهد إعلان واربح نقاط</strong>
            <span>+6 نقاط لكل إعلان · 20 إعلان يوميًا</span>
          </div>
          <div className="adsgram-reward-count">
            {adsgramWatched}/20
          </div>
        </div>

        <div className="adsgram-reward-progress">
          <div style={{ width: `${Math.min(100, Math.round((adsgramWatched / 20) * 100))}%` }} />
        </div>

        <button
          className="adsgram-reward-button"
          disabled={adsgramBusy || adsgramRemaining <= 0}
          onClick={() => void watchAdsgramReward()}
        >
          {adsgramBusy
            ? 'جاري التحقق...'
            : adsgramRemaining <= 0
              ? 'اكتملت إعلانات اليوم ✓'
              : `مشاهدة الإعلان · +6 (${adsgramRemaining} متبقي)`}
        </button>

        <small>يتجدد العداد تلقائيًا كل يوم عند 00:00 بتوقيت بغداد.</small>
      </section>

      <section className="checkin-card">
'''
if marker3 not in text:
    raise SystemExit('Home quick-actions marker missing')
text = text.replace(marker3, card, 1)
# Need useEffect import
text = text.replace("import {\n  useState\n}", "import {\n  useEffect,\n  useState\n}")
home.write_text(text, encoding='utf-8')
print(f'PATCH  {home}')

# ------------------------------------------------------------------
# 8) Tasks.tsx: add native AdsGram task on top, reward via webhook count
# ------------------------------------------------------------------
tasks = SRC / 'pages' / 'Tasks.tsx'
text = tasks.read_text(encoding='utf-8')
backup(tasks)
text = text.replace("import { useEffect, useRef, useState } from 'react'", "import { useEffect, useRef, useState } from 'react'\nimport { tryAcquireGlobalAdLock, releaseGlobalAdLock, getAdLockWaitSeconds } from '../lib/adLock.js'")
text = text.replace("import { completeTask, completeTaskWithScreenshot, getTasks } from '../lib/api'", "import { completeTask, completeTaskWithScreenshot, getTasks, getMe, getAdsgramNativeStatus } from '../lib/api.js'")
text = text.replace("import { completeTask, completeTaskWithScreenshot, getTasks } from '../lib/api.js'", "import { completeTask, completeTaskWithScreenshot, getTasks, getMe, getAdsgramNativeStatus } from '../lib/api.js'")
# Insert native types after Filter
marker = "type Filter = 'all' | 'channel' | 'group' | 'bot'\n"
insert = marker + "\nconst ADSGRAM_NATIVE_TASK_BLOCK_ID = 'task-46724'\nconst ADSGRAM_NATIVE_TASK_REWARD = 1\n\n"
if marker not in text:
    raise SystemExit('Tasks filter marker missing')
text = text.replace(marker, insert, 1)
# Add native state after isMountRender
marker2 = "  const isMountRender = useRef(true)\n"
insert2 = marker2 + "  const nativeTaskElRef = useRef<HTMLElement | null>(null)\n  const nativeRewardCountRef = useRef(0)\n  const nativePollTimerRef = useRef<number | null>(null)\n  const [nativeTaskAvailable, setNativeTaskAvailable] = useState(true)\n  const [nativeTaskReady, setNativeTaskReady] = useState(false)\n  const [nativeTaskBusy, setNativeTaskBusy] = useState(false)\n"
if marker2 not in text:
    raise SystemExit('Tasks mount ref marker missing')
text = text.replace(marker2, insert2, 1)
# Add native effect before handleJoinBot comment
marker3 = "  // خطوة 1 (بوت): يعرض وصف المهمة بنافذة تأكيد تيليجرام الأصلية، وبعد\n"
native_effect = r'''  useEffect(() => {
    let cancelled = false

    const loadNativeCount = async () => {
      try {
        const result = await getAdsgramNativeStatus()
        nativeRewardCountRef.current = result.count
        setNativeTaskReady(true)
      } catch {
        setNativeTaskReady(true)
        // keep zero as fallback; the webhook confirmation can still arrive later
      }
    }

    void loadNativeCount()

    const el = nativeTaskElRef.current
    if (!el) return

    const onReward = async () => {
      if (nativeTaskBusy || cancelled) return
      const before = nativeRewardCountRef.current
      setNativeTaskBusy(true)

      if (!tryAcquireGlobalAdLock()) {
        setNativeTaskBusy(false)
        showAlert(`انتظر ${getAdLockWaitSeconds()} ثانية قبل تشغيل إعلان آخر.`)
        return
      }

      try {
        // الحدث من الويب كومبوننت مجرد trigger. المكافأة الحقيقية تأتي من Reward URL.
        for (let attempt = 0; attempt < 900; attempt += 1) {
          await new Promise(resolve => window.setTimeout(resolve, 200))
          const result = await getAdsgramNativeStatus()
          nativeRewardCountRef.current = result.count

          if (result.count > before) {
            try {
              const latest = await getMe()
              onUserChanged(latest.user)
            } catch {}
            hapticSuccess()
            showAlert(`+${ADSGRAM_NATIVE_TASK_REWARD} نقطة ✅`)
            return
          }
        }

        showAlert('تم إنهاء المهمة، لكن تأكيد المكافأة ما وصل بعد. لا تضغط مرة ثانية؛ سيتحدث الرصيد عند وصول التأكيد.')
      } catch (error) {
        showAlert(error instanceof Error ? error.message : 'تعذر تأكيد مكافأة الإعلان.')
      } finally {
        releaseGlobalAdLock()
        setNativeTaskBusy(false)
      }
    }

    const onNotFound = () => setNativeTaskAvailable(false)
    el.addEventListener('reward', onReward)
    el.addEventListener('onBannerNotFound', onNotFound)

    return () => {
      cancelled = true
      el.removeEventListener('reward', onReward)
      el.removeEventListener('onBannerNotFound', onNotFound)
      if (nativePollTimerRef.current !== null) {
        window.clearTimeout(nativePollTimerRef.current)
      }
    }
  }, [nativeTaskBusy, nativeTaskReady, onUserChanged])

'''
if marker3 not in text:
    raise SystemExit('Tasks handle marker missing')
text = text.replace(marker3, native_effect + marker3, 1)
# Insert native task card before filter-tabs
marker4 = "      <div className=\"filter-tabs\">\n"
card = r'''      {nativeTaskAvailable && nativeTaskReady && (
        <article className="adsgram-native-task-card">
          <div className="adsgram-native-task-badge">AD</div>
          <div className="adsgram-native-task-copy">
            <strong>مهمة AdsGram</strong>
            <span>نفّذ الإعلان واربح +1 نقطة</span>
          </div>
          <div className="adsgram-native-task-host">
            <adsgram-task-host ref={nativeTaskElRef} data-block-id={ADSGRAM_NATIVE_TASK_BLOCK_ID}>
              <span slot="reward">+1</span>
              <span slot="button">{nativeTaskBusy ? 'جاري التحقق...' : 'فتح الإعلان'}</span>
              <span slot="claim">استلام +1</span>
              <span slot="done">تمت المهمة ✓</span>
            </adsgram-task-host>
          </div>
        </article>
      )}

      <div className="filter-tabs">
'''
# use a custom tag that is mounted as a real web component only after effect. But AdsGram expects adsgram-task exactly,
# so we actually insert the real tag below. This placeholder replacement will be changed immediately.
if marker4 not in text:
    raise SystemExit('Tasks filter div marker missing')
text = text.replace(marker4, card, 1)
text = text.replace('<adsgram-task-host ref={nativeTaskElRef} data-block-id={ADSGRAM_NATIVE_TASK_BLOCK_ID}>', '<adsgram-task ref={nativeTaskElRef} data-block-id={ADSGRAM_NATIVE_TASK_BLOCK_ID} data-debug="false">')
text = text.replace('</adsgram-task-host>', '</adsgram-task>')
# Add module-scoped JSX intrinsic through a local type escape at bottom by JSX augmentation in module.
text = text.rstrip() + r'''


declare global {
  namespace JSX {
    interface IntrinsicElements {
      'adsgram-task': React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement> & {
        'data-block-id'?: string
        'data-debug'?: string
      }
    }
  }
}
'''
# The above needs React namespace import; instead use imported types without namespace. Replace with a simpler ambient block using any.
text = text.replace("'adsgram-task': React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement> & {", "'adsgram-task': any")
# But stray data fields after any make invalid. Replace full block manually.
text = re.sub(r"declare global \{\n  namespace JSX \{\n    interface IntrinsicElements \{\n      'adsgram-task': any\n        'data-block-id'\?: string\n        'data-debug'\?: string\n      \}\n    \}\n  \}\n\}\n?", "", text)
# Better: module augmentation of React's JSX is fragile with current setup. We use createElement alias instead by replacing card JSX.
# Convert just custom tag segment to React.createElement would require import. Simpler use @ts-ignore before opening tag.
text = text.replace('            <adsgram-task ref={nativeTaskElRef}', '            {/* @ts-expect-error AdsGram web component */}\n            <adsgram-task ref={nativeTaskElRef}')
# remove any leftover malformed declaration
text = re.sub(r"\n\ndeclare global[\s\S]*?\n\}\n\}?\n$", "\n", text)
tasks.write_text(text, encoding='utf-8')
print(f'PATCH  {tasks}')

# ------------------------------------------------------------------
# 9) CSS for new Home reward card + native task. Avoid changing old theme.
# ------------------------------------------------------------------
homecss = SRC / 'styles' / 'home.css'
backup(homecss)
text = homecss.read_text(encoding='utf-8')
text += r'''

.adsgram-reward-card {
  margin-top: 14px;
  padding: 15px;
  border-radius: 18px;
  background:
    radial-gradient(100% 120% at 0% 0%, rgba(212,255,61,.09), transparent 55%),
    #17152a;
  border: 1px solid rgba(212,255,61,.18);
  box-shadow: 0 6px 18px rgba(0,0,0,.14);
}

.adsgram-reward-head {
  display: flex;
  align-items: center;
  gap: 10px;
}

.adsgram-reward-icon {
  width: 42px;
  height: 42px;
  border-radius: 13px;
  display: grid;
  place-items: center;
  flex: 0 0 42px;
  background: rgba(212,255,61,.1);
  border: 1px solid rgba(212,255,61,.22);
  color: #d4ff3d;
  font-family: ui-monospace, monospace;
  font-size: 11px;
  font-weight: 900;
}

.adsgram-reward-head strong,
.adsgram-reward-head span {
  display: block;
}

.adsgram-reward-head strong {
  font-size: 12px;
}

.adsgram-reward-head span {
  margin-top: 3px;
  color: #8b87a8;
  font-size: 9.5px;
}

.adsgram-reward-count {
  margin-inline-start: auto;
  color: #d4ff3d;
  font-family: ui-monospace, monospace;
  font-size: 11px;
  font-weight: 900;
}

.adsgram-reward-progress {
  height: 5px;
  margin-top: 12px;
  background: #252238;
  border-radius: 999px;
  overflow: hidden;
}

.adsgram-reward-progress > div {
  height: 100%;
  border-radius: inherit;
  background: linear-gradient(90deg, #5aa7ff, #d4ff3d);
}

.adsgram-reward-button {
  width: 100%;
  border: 0;
  margin-top: 11px;
  border-radius: 11px;
  padding: 10px 12px;
  background: #d4ff3d;
  color: #0f0e1b;
  font-size: 10.5px;
  font-weight: 900;
}

.adsgram-reward-button:disabled {
  opacity: .52;
}

.adsgram-reward-card small {
  display: block;
  margin-top: 8px;
  color: #6e6a88;
  font-size: 8.5px;
  line-height: 1.5;
}
'''
homecss.write_text(text, encoding='utf-8')
print(f'PATCH  {homecss}')

taskcss = SRC / 'styles' / 'tasks.css'
backup(taskcss)
text = taskcss.read_text(encoding='utf-8')
text += r'''

.adsgram-native-task-card {
  display: grid;
  grid-template-columns: 38px minmax(0, 1fr);
  gap: 9px 10px;
  align-items: center;
  margin-top: 15px;
  margin-bottom: 14px;
  padding: 12px;
  border-radius: 17px;
  background:
    radial-gradient(110% 130% at 100% 0%, rgba(90,167,255,.08), transparent 55%),
    #17152a;
  border: 1px solid #2a2745;
  box-shadow: 0 6px 18px rgba(0,0,0,.14);
}

.adsgram-native-task-badge {
  width: 38px;
  height: 38px;
  border-radius: 12px;
  display: grid;
  place-items: center;
  background: rgba(90,167,255,.1);
  border: 1px solid rgba(90,167,255,.18);
  color: #5aa7ff;
  font-family: ui-monospace, monospace;
  font-size: 9px;
  font-weight: 900;
}

.adsgram-native-task-copy strong,
.adsgram-native-task-copy span {
  display: block;
}

.adsgram-native-task-copy strong {
  font-size: 12px;
}

.adsgram-native-task-copy span {
  margin-top: 3px;
  color: #8b87a8;
  font-size: 9px;
}

.adsgram-native-task-host {
  grid-column: 1 / -1;
  min-height: 54px;
  border-radius: 13px;
  overflow: hidden;
}

.adsgram-native-task-host adsgram-task {
  display: block;
  width: 100%;
  --adsgram-task-font-size: 12px;
  --adsgram-task-icon-size: 30px;
  --adsgram-task-icon-title-gap: 8px;
  --adsgram-task-icon-border-radius: 8px;
}
'''
taskcss.write_text(text, encoding='utf-8')
print(f'PATCH  {taskcss}')

# ------------------------------------------------------------------
# 10) Supabase migration: server-side 20/day, 6 pts, native +1.
# ------------------------------------------------------------------
sql = ROOT / 'supabase_adsgram_growbot.sql'
write(sql, r'''-- AdsGram integration for GrowBot / STORM
-- Watch Reward block: 46262 -> +6 points, max 20 rewards per Baghdad day.
-- Native Task block: task-46724 -> +1 point each completed native task.

create table if not exists public.ad_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  telegram_id bigint not null,
  block_id text not null,
  day_key date not null default ((now() at time zone 'Asia/Baghdad')::date),
  status text not null default 'pending',
  started_at timestamptz not null default now(),
  rewarded_at timestamptz,
  reward_points integer not null default 6,
  check (status in ('pending', 'rewarded', 'expired')),
  check (reward_points > 0)
);

create index if not exists idx_ad_sessions_user_day_block
on public.ad_sessions(user_id, day_key, block_id, status);

create index if not exists idx_ad_sessions_pending_adsgram
on public.ad_sessions(telegram_id, block_id, status, started_at);

create table if not exists public.adsgram_native_rewards (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  telegram_id bigint not null,
  block_id text not null,
  reward_points integer not null default 1,
  created_at timestamptz not null default now()
);

create index if not exists idx_adsgram_native_rewards_user
on public.adsgram_native_rewards(telegram_id, block_id, created_at desc);

create table if not exists public.adsgram_reward_log (
  id bigint generated by default as identity primary key,
  telegram_id bigint not null,
  query jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_adsgram_reward_log_telegram
on public.adsgram_reward_log(telegram_id, created_at desc);

insert into public.app_settings(key, value)
values
  ('adsgram_reward_block_id', '46262'),
  ('ads_daily_limit', '20'),
  ('ads_reward_points', '6'),
  ('adsgram_native_task_block_id', 'task-46724'),
  ('adsgram_native_task_reward_points', '1')
on conflict (key) do update set value = excluded.value;

create or replace function public.start_adsgram_watch_session(
  p_user_id uuid,
  p_telegram_id bigint,
  p_block_id text,
  p_daily_limit integer,
  p_reward_points integer
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_day date := ((now() at time zone 'Asia/Baghdad')::date);
  v_count integer;
  v_session public.ad_sessions%rowtype;
begin
  perform pg_advisory_xact_lock(p_telegram_id);

  select count(*) into v_count
  from public.ad_sessions
  where user_id = p_user_id
    and day_key = v_day
    and block_id = p_block_id
    and status = 'rewarded';

  if v_count >= p_daily_limit then
    raise exception 'AD_DAILY_LIMIT';
  end if;

  -- Expire stale pending rows for this user/block so a failed WebView
  -- cannot lock the next ad forever.
  update public.ad_sessions
  set status = 'expired'
  where user_id = p_user_id
    and block_id = p_block_id
    and status = 'pending'
    and started_at <= now() - interval '15 minutes';

  if exists (
    select 1
    from public.ad_sessions
    where user_id = p_user_id
      and block_id = p_block_id
      and status = 'pending'
      and started_at > now() - interval '15 minutes'
  ) then
    raise exception 'AD_SESSION_EXISTS';
  end if;

  insert into public.ad_sessions(
    user_id, telegram_id, block_id, day_key, status, reward_points
  )
  values(
    p_user_id, p_telegram_id, p_block_id, v_day, 'pending', p_reward_points
  )
  returning * into v_session;

  return jsonb_build_object(
    'id', v_session.id,
    'watched', v_count,
    'remaining', greatest(0, p_daily_limit - v_count)
  );
end;
$$;

create or replace function public.reward_adsgram_watch_session(
  p_telegram_id bigint,
  p_block_id text,
  p_daily_limit integer
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_day date := ((now() at time zone 'Asia/Baghdad')::date);
  v_session public.ad_sessions%rowtype;
  v_balance bigint;
  v_count integer;
begin
  perform pg_advisory_xact_lock(p_telegram_id);

  select * into v_session
  from public.ad_sessions
  where telegram_id = p_telegram_id
    and block_id = p_block_id
    and day_key = v_day
    and status = 'pending'
    and started_at > now() - interval '15 minutes'
  order by started_at desc
  limit 1
  for update;

  if not found then
    raise exception 'NO_PENDING_AD';
  end if;

  select count(*) into v_count
  from public.ad_sessions
  where telegram_id = p_telegram_id
    and block_id = p_block_id
    and day_key = v_day
    and status = 'rewarded';

  if v_count >= p_daily_limit then
    raise exception 'AD_DAILY_LIMIT';
  end if;

  update public.ad_sessions
  set status = 'rewarded', rewarded_at = now()
  where id = v_session.id;

  select public.adjust_user_points(
    v_session.user_id,
    v_session.reward_points,
    'adsgram_reward',
    v_session.id,
    'مكافأة مشاهدة إعلان AdsGram'
  ) into v_balance;

  v_count := v_count + 1;

  return jsonb_build_object(
    'rewarded', true,
    'points', v_session.reward_points,
    'balance', v_balance,
    'watched', v_count,
    'remaining', greatest(0, p_daily_limit - v_count)
  );
end;
$$;

create or replace function public.get_adsgram_watch_status(
  p_user_id uuid,
  p_block_id text,
  p_daily_limit integer
)
returns jsonb
language sql
security definer
set search_path = public
as $$
  with day_rows as (
    select status
    from public.ad_sessions
    where user_id = p_user_id
      and block_id = p_block_id
      and day_key = ((now() at time zone 'Asia/Baghdad')::date)
  ),
  counts as (
    select
      count(*) filter (where status = 'rewarded')::integer as watched,
      exists(select 1 from day_rows where status = 'pending') as pending
    from day_rows
  )
  select jsonb_build_object(
    'watched', watched,
    'remaining', greatest(0, p_daily_limit - watched),
    'pending', pending
  )
  from counts;
$$;

create or replace function public.reward_adsgram_native_task(
  p_telegram_id bigint,
  p_block_id text,
  p_reward_points integer
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user public.users%rowtype;
  v_reward public.adsgram_native_rewards%rowtype;
  v_balance bigint;
  v_count bigint;
begin
  select * into v_user
  from public.users
  where telegram_id = p_telegram_id
  limit 1
  for update;

  if not found then
    raise exception 'USER_NOT_FOUND';
  end if;

  insert into public.adsgram_native_rewards(
    user_id, telegram_id, block_id, reward_points
  )
  values(
    v_user.id, p_telegram_id, p_block_id, p_reward_points
  )
  returning * into v_reward;

  select public.adjust_user_points(
    v_user.id,
    p_reward_points,
    'adsgram_native_task',
    v_reward.id,
    'مكافأة AdsGram Native Task'
  ) into v_balance;

  select count(*) into v_count
  from public.adsgram_native_rewards
  where telegram_id = p_telegram_id
    and block_id = p_block_id;

  return jsonb_build_object(
    'rewarded', true,
    'points', p_reward_points,
    'balance', v_balance,
    'count', v_count
  );
end;
$$;

create or replace function public.expire_stale_adsgram_sessions()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  update public.ad_sessions
  set status = 'expired'
  where status = 'pending'
    and started_at <= now() - interval '15 minutes';
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;
''')

# ------------------------------------------------------------------
# 11) .env.example secret guidance
# ------------------------------------------------------------------
env = ROOT / '.env.example'
backup(env)
text = env.read_text(encoding='utf-8')
if 'ADSGRAM_REWARD_SECRET' not in text:
    text = text.rstrip() + '\n\n# AdsGram Reward URL verification secret\nADSGRAM_REWARD_SECRET=change_me\n'
env.write_text(text, encoding='utf-8')
print(f'PATCH  {env}')

# Put the real AdsGram webhook secret in the local .env without overwriting
# other project secrets. .env is already ignored by .gitignore.
DOTENV = ROOT / '.env'
secret = '7f3a9c2e8b41d6f0a5c8e2b7913f4d0a'
lines = DOTENV.read_text(encoding='utf-8').splitlines() if DOTENV.exists() else []
filtered = [line for line in lines if not line.startswith('ADSGRAM_REWARD_SECRET=')]
filtered.append(f'ADSGRAM_REWARD_SECRET={secret}')
DOTENV.write_text('\n'.join(filtered).rstrip() + '\n', encoding='utf-8')
print(f'PATCH  {DOTENV} (ADSGRAM_REWARD_SECRET)')

print('\nDONE: AdsGram GrowBot integration files written.')
