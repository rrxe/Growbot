import '../styles/splash.css'

type SplashScreenProps = { progress: number; fading?: boolean }

export default function SplashScreen({ progress, fading = false }: SplashScreenProps) {
  const value = Math.max(0, Math.min(100, progress))
  const phase = value < 28 ? 'بدء التشغيل' : value < 56 ? 'مزامنة البيانات' : value < 84 ? 'تجهيز التطبيق' : 'جاهز'
  return (
    <div className={`gx-splash${fading ? ' fading' : ''}`} dir="rtl">
      <div className="gx-splash-noise" /><div className="gx-splash-grid" />
      <div className="gx-splash-glow gx-splash-glow-a" /><div className="gx-splash-glow gx-splash-glow-b" />
      <div className="gx-splash-top"><span>STORMY</span><span>التطبيق المصغر</span></div>
      <div className="gx-splash-side"><span>جلسة آمنة</span><span>الشبكة جاهزة</span></div>
      <main className="gx-splash-center">
        <div className="gx-loader-mark" aria-hidden="true"><div className="gx-x x-one"/><div className="gx-x x-two"/><div className="gx-ring ring-one"/><div className="gx-ring ring-two"/><div className="gx-dot dot-one"/><div className="gx-dot dot-two"/><span>S<span>y</span></span></div>
        <div className="gx-splash-wordmark">Storm<span>y</span></div><p>اكسب · نفّذ · اجمع</p>
        <div className="gx-splash-readout"><span>{phase}</span><strong>{String(Math.round(value)).padStart(3, '0')}%</strong></div>
        <div className="gx-splash-rail" role="progressbar" aria-valuenow={Math.round(value)} aria-valuemin={0} aria-valuemax={100}><i style={{width:`${value}%`}}/><b style={{insetInlineStart:`calc(${value}% - 4px)`}}/></div>
      </main>
      <div className="gx-splash-bottom"><span>STORMY</span><span>نسخة مستقرة</span><span>النظام جاهز</span></div>
    </div>
  )
}
