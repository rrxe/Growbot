// Global AdsGram surface lock, copied in spirit from SLYMintX.
// Manual/reward ads keep a 12s cooldown; automatic int ads are exempt.
let globalAdLock = false;
let lastAdEndedAt = 0;
let lockAcquiredAt = 0;

export const MIN_GAP_BETWEEN_ADS_MS = 12000;
const ASSUMED_MAX_AD_DURATION_MS = 30000;

// إذا القفل انعلق (مثلاً controller.show() ما رجعت نتيجة إطلاقًا --
// إعلان محظور، مشكلة شبكة، أو المستخدم سكّر التطبيق ورجع وسط الإعلان)
// كان عم يضل globalAdLock=true للأبد، ووقتها getAdLockWaitSeconds() كانت
// ترجع 0 لأنه lastAdEndedAt ما انحدثت أبدًا. هيك كان يطلع "انتظر 0 ثانية"
// وزر تأكيد ما بيحل شي، وكل ضغطة بعدها كانت تفشل لنفس السبب. الحل: نعتبر
// القفل منتهي الصلاحية تلقائيًا بعد أطول مدة إعلان متوقعة، بدل ما يضل عالق.
function releaseStaleLockIfAny(now: number): void {
  if (
    globalAdLock &&
    lockAcquiredAt > 0 &&
    now - lockAcquiredAt > ASSUMED_MAX_AD_DURATION_MS
  ) {
    globalAdLock = false;
    lastAdEndedAt = now;
    lockAcquiredAt = 0;
  }
}

export function tryAcquireGlobalAdLock(isAuto = false): boolean {
  const now = Date.now();
  releaseStaleLockIfAny(now);
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
  releaseStaleLockIfAny(now);

  if (globalAdLock) {
    const remaining = ASSUMED_MAX_AD_DURATION_MS - (now - lockAcquiredAt);
    if (remaining > 0) return Math.max(1, Math.ceil(remaining / 1000));
    // احتياط: القفل انتهت مدته لتوها بس ما انحررت بعد (سباق نادر جدًا)
    return 1;
  }

  const remaining = MIN_GAP_BETWEEN_ADS_MS - (now - lastAdEndedAt);
  if (lastAdEndedAt > 0 && remaining > 0) {
    return Math.max(1, Math.ceil(remaining / 1000));
  }

  return 0;
}
