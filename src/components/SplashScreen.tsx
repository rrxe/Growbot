import '../styles/splash.css'
import splashBgDark from '../assets/splash-bg-dark.png'
import splashBgLight from '../assets/splash-bg-light.png'
import { getStoredTheme } from '../lib/theme'

type SplashScreenProps = {
  progress: number
  fading?: boolean
}

export default function SplashScreen({
  progress,
  fading = false
}: SplashScreenProps) {
  const clamped = Math.min(100, Math.max(0, progress))
  // نفس صورة اللودينج تتبع اختيار المستخدم (أسود/أبيض) المحفوظ من
  // صفحة حسابه — مو بس خلفية التطبيق
  const splashBg = getStoredTheme() === 'light' ? splashBgLight : splashBgDark

  return (
    <div className={`storm-splash${fading ? ' storm-splash--fading' : ''}`}>
      <img
        src={splashBg}
        alt=""
        className="storm-splash__bg"
        draggable={false}
      />

      <div
        className="storm-splash__bar-track"
        role="progressbar"
        aria-valuenow={Math.round(clamped)}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div
          className="storm-splash__bar-fill"
          style={{ width: `${clamped}%` }}
        />
      </div>
    </div>
  )
}
