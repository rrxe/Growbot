import { runVerificationJob } from './verification.js'

let started = false

export function startJobs() {
  if (started) {
    return
  }

  started = true

  void runVerificationJob()

  setInterval(
    () => {
      void runVerificationJob()
    },
    60 * 1000
  )
}
