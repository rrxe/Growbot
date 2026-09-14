// عناصر SVG بموضوع القطة، بنفس روح شخصية STORMy وألوان شاشة البداية.
// كل عنصر بياخذ حجمه من props ويستخدم currentColor حيث ينفع حتى يتلون
// حسب مكانه.

export function CatFaceIcon({ size = 26 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M10 6 L16 18 L8 18 Z" fill="var(--storm-blue)" />
      <path d="M38 6 L40 18 L32 18 Z" fill="var(--storm-blue)" />
      <path d="M12 8 L16.5 17 L10.5 17 Z" fill="var(--storm-border)" />
      <path d="M36 8 L37.5 17 L32.5 17 Z" fill="var(--storm-border)" />
      <circle cx="24" cy="26" r="16" fill="#4a5f9e" />
      <circle cx="17.5" cy="24" r="2.4" fill="#eef3ff" />
      <circle cx="30.5" cy="24" r="2.4" fill="#eef3ff" />
      <path d="M22 30 Q24 32 26 30" stroke="#eef3ff" strokeWidth="1.6" strokeLinecap="round" fill="none" />
      <circle cx="24" cy="29" r="1.4" fill="#7fa0ff" />
      <path d="M15 29 L6 27M15 31 L6 32M33 29 L42 27M33 31 L42 32" stroke="#eef3ff" strokeWidth="1.1" strokeLinecap="round" />
    </svg>
  )
}

// أربع وجوه قطط لطيفة مختلفة الشكل — تحل محل شعار الإيموجي (📢/🤖/👥)
// جوا شارة المهمة. الاختيار "عشوائي" بس ثابت لكل مهمة (بالاعتماد على
// معرّفها) حتى ما تتغيّر الأيقونة كل مرة تنعاد فيها الواجهة
const TASK_CAT_VARIANTS = ['happy', 'wink', 'sleepy', 'star'] as const
type TaskCatVariant = typeof TASK_CAT_VARIANTS[number]

function hashSeed(seed: string) {
  let h = 0
  for (let i = 0; i < seed.length; i++) {
    h = (h * 31 + seed.charCodeAt(i)) >>> 0
  }
  return h
}

function TaskCatEyes({ variant }: { variant: TaskCatVariant }) {
  if (variant === 'wink') {
    return (
      <>
        <path d="M15 21 Q18 18.5 21 21" stroke="var(--storm-task-detail)" strokeWidth="2" strokeLinecap="round" fill="none" />
        <circle cx="29" cy="20" r="2.6" fill="var(--storm-task-detail)" />
      </>
    )
  }

  if (variant === 'sleepy') {
    return (
      <>
        <path d="M14.5 20.5 Q18 23 21.5 20.5" stroke="var(--storm-task-detail)" strokeWidth="2" strokeLinecap="round" fill="none" />
        <path d="M26.5 20.5 Q30 23 33.5 20.5" stroke="var(--storm-task-detail)" strokeWidth="2" strokeLinecap="round" fill="none" />
      </>
    )
  }

  if (variant === 'star') {
    return (
      <>
        <path d="M16 15.5 L17 19 L20.5 20 L17 21 L16 24.5 L15 21 L11.5 20 L15 19 Z" fill="var(--storm-task-detail)" />
        <path d="M32 15.5 L33 19 L36.5 20 L33 21 L32 24.5 L31 21 L27.5 20 L31 19 Z" fill="var(--storm-task-detail)" />
      </>
    )
  }

  return (
    <>
      <circle cx="17.5" cy="20" r="2.8" fill="var(--storm-task-detail)" />
      <circle cx="30.5" cy="20" r="2.8" fill="var(--storm-task-detail)" />
      <circle cx="18.3" cy="19" r=".9" fill="var(--storm-task-face)" />
      <circle cx="31.3" cy="19" r=".9" fill="var(--storm-task-face)" />
    </>
  )
}

function TaskCatMouth({ variant }: { variant: TaskCatVariant }) {
  if (variant === 'sleepy') {
    return <path d="M21 27 Q24 26 27 27" stroke="var(--storm-task-detail)" strokeWidth="1.6" strokeLinecap="round" fill="none" />
  }

  if (variant === 'star') {
    return <ellipse cx="24" cy="27.5" rx="3" ry="2.4" fill="var(--storm-task-detail)" />
  }

  return <path d="M19 26 Q24 30.5 29 26" stroke="var(--storm-task-detail)" strokeWidth="1.8" strokeLinecap="round" fill="none" />
}

// شارة مهمة على شكل وجه قطة — تحط جوا الدائرة الملوّنة يلي بالكرت
// (colorFrom/colorTo)، فبتصير خلفيتها دايمًا لون زاهي بغض النظر عن
// المظهر الحالي، فألوان الوجه ثابتة (مو مرتبطة بمتغيرات الثيم)
export function TaskCatIcon({ seed, size = 24 }: { seed: string; size?: number }) {
  const variant = TASK_CAT_VARIANTS[hashSeed(seed) % TASK_CAT_VARIANTS.length]

  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M9 8 L16 19 L7 20 Z" fill="var(--storm-task-face)" />
      <path d="M39 8 L41 20 L32 19 Z" fill="var(--storm-task-face)" />
      <path d="M11 11 L15.5 18.5 L9.5 19.2 Z" fill="var(--storm-task-detail)" opacity=".55" />
      <path d="M37 11 L38.5 19.2 L32.5 18.5 Z" fill="var(--storm-task-detail)" opacity=".55" />
      <circle cx="24" cy="24" r="15.5" fill="var(--storm-task-face)" />
      <TaskCatEyes variant={variant} />
      <TaskCatMouth variant={variant} />
      {variant === 'happy' && (
        <path d="M15 24 L8 22.5M15 26 L8 27.5M33 24 L40 22.5M33 26 L40 27.5" stroke="var(--storm-task-detail)" strokeWidth="1" strokeLinecap="round" opacity=".45" />
      )}
    </svg>
  )
}

export function PawPrintIcon({ size = 20, color = 'currentColor' }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
      <ellipse cx="16" cy="21" rx="8.5" ry="7.2" fill={color} />
      <ellipse cx="6.4" cy="12.5" rx="3.4" ry="4.2" fill={color} transform="rotate(-18 6.4 12.5)" />
      <ellipse cx="14" cy="7.5" rx="3.4" ry="4.4" fill={color} transform="rotate(-4 14 7.5)" />
      <ellipse cx="22.4" cy="7.8" rx="3.4" ry="4.4" fill={color} transform="rotate(6 22.4 7.8)" />
      <ellipse cx="27.4" cy="13.4" rx="3.2" ry="4" fill={color} transform="rotate(20 27.4 13.4)" />
    </svg>
  )
}

// إطلالة أذنين قطة صغيرة وهادية فوق حافة الكرت، بمنتصفه بالضبط —
// تفصيلة خفيفة جدًا (opacity منخفضة) حتى ما تشوّش المحتوى ولا توخذ إحساس عطل
export function CatEarsPeek({ color = 'var(--storm-blue)' }: { color?: string }) {
  return (
    <svg
      className="cat-ears-peek"
      width="46"
      height="18"
      viewBox="0 0 46 18"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <path d="M5 18 C5 8 12 1 17 7 C18 11 15 16 11 18 Z" fill={color} opacity=".8" />
      <path d="M41 18 C41 8 34 1 29 7 C28 11 31 16 35 18 Z" fill={color} opacity=".8" />
      <path d="M7.5 16.5 C8 11 12 6.5 14.5 8 C14.5 11 12.5 14.5 10 16.5 Z" fill="var(--storm-border)" opacity=".7" />
      <path d="M38.5 16.5 C38 11 34 6.5 31.5 8 C31.5 11 33.5 14.5 36 16.5 Z" fill="var(--storm-border)" opacity=".7" />
    </svg>
  )
}

export function CloudPuff({ className = '', size = 60 }: { className?: string; size?: number }) {
  return (
    <svg
      className={className}
      width={size}
      height={size * 0.6}
      viewBox="0 0 100 60"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <path
        d="M20 45 Q4 45 4 31 Q4 19 17 18 Q19 6 34 6 Q48 6 51 17 Q66 15 68 29 Q80 30 80 41 Q80 45 75 45 Z"
        fill="#eef3ff"
      />
    </svg>
  )
}

export function SparkleIcon({ size = 14, color = 'var(--storm-blue-deep)' }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path
        d="M12 1 L14.2 9.8 L23 12 L14.2 14.2 L12 23 L9.8 14.2 L1 12 L9.8 9.8 Z"
        fill={color}
      />
    </svg>
  )
}

// فاصل بشكل ذيل قطة متعرّج — يُستخدم بدل الخط العادي بين الأقسام
export function CatTailDivider() {
  return (
    <svg
      className="cat-tail-divider"
      width="100%"
      height="14"
      viewBox="0 0 300 14"
      preserveAspectRatio="none"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <path
        d="M0 7 Q20 0 40 7 T80 7 T120 7 T160 7 T200 7 T240 7 T280 7 T300 7"
        stroke="var(--storm-border)"
        strokeWidth="2"
        strokeLinecap="round"
        fill="none"
      />
    </svg>
  )
}
