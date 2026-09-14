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

type Listener = (request: ModalRequest) => void

let listener: Listener | null = null

export function subscribeModal(fn: Listener) {
  listener = fn

  return () => {
    if (listener === fn) {
      listener = null
    }
  }
}

export function requestAlert(message: string): Promise<void> {
  return new Promise((resolve) => {
    if (!listener) {
      window.alert(message)
      resolve()

      return
    }

    listener({
      type: 'alert',
      message,
      resolve
    })
  })
}

export function requestConfirm(message: string): Promise<boolean> {
  return new Promise((resolve) => {
    if (!listener) {
      resolve(window.confirm(message))

      return
    }

    listener({
      type: 'confirm',
      message,
      resolve
    })
  })
}
