import { runVerificationJob } from './verification.js'
import { runOwnerReviewAutoApproveJob } from './owner-review.js'
import { runTaskReminderJob } from './task-reminder.js'

let started = false

const REMINDER_INTERVAL_MS = 3 * 60 * 60 * 1000

export function startJobs() {
  if (started) {
    return
  }

  started = true

  void runVerificationJob()
  void runOwnerReviewAutoApproveJob()

  setInterval(
    () => {
      void runVerificationJob()
    },
    60 * 1000
  )

  setInterval(
    () => {
      void runOwnerReviewAutoApproveJob()
    },
    60 * 1000
  )

  // تذكير دوري كل ساعة لكل الأعضاء بوجود مهام متاحة (ما يرسل شي إذا ما في مهام نشطة)
  setInterval(
    () => {
      void runTaskReminderJob()
    },
    REMINDER_INTERVAL_MS
  )
}
