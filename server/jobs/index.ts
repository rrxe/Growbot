import { runVerificationJob } from './verification.js'
import { runOwnerReviewAutoApproveJob } from './owner-review.js'

let started = false

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
}
