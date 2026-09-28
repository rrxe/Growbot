// إدارة اختيار المظهر (داكن/فاتح). الافتراضي دايمًا داكن لأي مستخدم
// جديد — الفاتح خيار يقدر يفعّله بنفسه من صفحة حسابه، ومحفوظ محليًا
// حتى يضل نفس الاختيار بالمرة الجاية.

export type ThemeMode = 'dark' | 'light'

const STORAGE_KEY = 'storm-theme'

export function getStoredTheme(): ThemeMode {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    return saved === 'light' ? 'light' : 'dark'
  } catch {
    return 'dark'
  }
}

export function applyTheme(mode: ThemeMode) {
  document.documentElement.setAttribute('data-theme', mode)

  try {
    localStorage.setItem(STORAGE_KEY, mode)
  } catch {
    // تجاهل — لو التخزين المحلي مو متاح (وضع خاص مثلاً)، بس ما توقف التطبيق
  }
}
