// أيقونات هندسية محايدة متوافقة مع الواجهة القديمة.
// الأسماء القديمة محفوظة حتى لا تتأثر المكونات الأخرى.

export function CatFaceIcon({ size = 26 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <rect x="5" y="5" width="38" height="38" rx="12" fill="currentColor" opacity=".10" />
      <path d="M15 17.5h18M15 24h10M15 30.5h14" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
      <path d="M34 27.5l-5 5-3-3" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export function TaskCatIcon({ seed: _seed, size = 24 }: { seed: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <circle cx="24" cy="24" r="17" stroke="currentColor" strokeWidth="2.2" opacity=".55" />
      <path d="M16 24.5l5 5L32 18.5" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export function PawPrintIcon({ size = 20, color = 'currentColor' }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <circle cx="16" cy="16" r="11" stroke={color} strokeWidth="2.2" />
      <path d="M11.5 16.5 14.5 19.5 21 13" stroke={color} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export function CatEarsPeek({ color = 'var(--accent)' }: { color?: string }) {
  return <div className="cat-ears-peek" style={{ background: `linear-gradient(90deg, transparent, ${color}, transparent)` }} aria-hidden="true" />
}

export function CloudPuff({ className = '', size = 60 }: { className?: string; size?: number }) {
  return <svg className={className} width={size} height={size * 0.6} viewBox="0 0 100 60" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M20 45Q4 45 4 31Q4 19 17 18Q19 6 34 6Q48 6 51 17Q66 15 68 29Q80 30 80 41Q80 45 75 45Z" fill="currentColor" opacity=".12" /></svg>
}

export function SparkleIcon({ size = 14, color = 'var(--accent)' }: { size?: number; color?: string }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M12 2l2.1 7.9L22 12l-7.9 2.1L12 22l-2.1-7.9L2 12l7.9-2.1Z" fill={color} /></svg>
}

export function CatTailDivider() {
  return <svg className="cat-tail-divider" width="100%" height="12" viewBox="0 0 300 12" preserveAspectRatio="none" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M0 6H300" stroke="var(--line)" strokeWidth="1.2" /></svg>
}
