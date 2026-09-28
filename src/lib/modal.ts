export type ModalRequest =
  | {
      type: 'alert'
      message: string
      resolve: () => void
    }
  | {
      type: 'confirm'
      message: string
      resolve: (value: boolean) => void
    }

type Listener = (request: ModalRequest | null) => void

let listener: Listener | null = null

// طابور النوافذ: إذا انفتحت أكثر من نافذة بنفس الوقت (مثلًا تنبيه + تأكيد)
// ما تضيع وحدة منهم، تظهر وحدة ورا الثانية بالترتيب.
const queue: ModalRequest[] = []

function notify() {
  listener?.(queue[0] ?? null)
}

export function subscribeModal(fn: Listener) {
  listener = fn

  // لو في نافذة منتظرة قبل ما ينركّب المكوّن، اعرضها فورًا
  fn(queue[0] ?? null)

  return () => {
    if (listener === fn) {
      listener = null
    }
  }
}

// يشيل النافذة الحالية من الطابور ويعرض التالية (إن وجدت)
export function dismissModal() {
  queue.shift()
  notify()
}

export function requestAlert(message: string): Promise<void> {
  return new Promise((resolve) => {
    if (!listener) {
      window.alert(message)
      resolve()

      return
    }

    queue.push({
      type: 'alert',
      message,
      resolve
    })

    notify()
  })
}

export function requestConfirm(message: string): Promise<boolean> {
  return new Promise((resolve) => {
    if (!listener) {
      resolve(window.confirm(message))

      return
    }

    queue.push({
      type: 'confirm',
      message,
      resolve
    })

    notify()
  })
}
