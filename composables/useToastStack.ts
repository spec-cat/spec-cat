import type { ToastType } from '~/types/app'

export function useToastStack() {
  const toasts = ref<Array<{ id: number; type: ToastType; message: string }>>([])
  const timers = new Map<number, ReturnType<typeof setTimeout>>()
  let nextId = 0

  function dismissToast(id: number) {
    const timer = timers.get(id)
    if (timer) clearTimeout(timer)
    timers.delete(id)
    toasts.value = toasts.value.filter((toast) => toast.id !== id)
  }

  function pushToast(type: ToastType, message: string, duration = 3500) {
    const id = ++nextId
    toasts.value = [...toasts.value, { id, type, message }]
    timers.set(id, setTimeout(() => dismissToast(id), duration))
  }

  function disposeToasts() {
    for (const timer of timers.values()) clearTimeout(timer)
    timers.clear()
  }

  return { toasts, pushToast, dismissToast, disposeToasts }
}
