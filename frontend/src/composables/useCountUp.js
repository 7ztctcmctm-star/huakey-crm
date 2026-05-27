import { ref, watch, onUnmounted } from 'vue'

export function useCountUp(targetRef, duration = 800) {
  const display = ref(0)
  let timer = null

  function animate(from, to) {
    clearInterval(timer)
    const start = performance.now()
    const diff = to - from
    timer = setInterval(() => {
      const elapsed = performance.now() - start
      const progress = Math.min(elapsed / duration, 1)
      const eased = 1 - Math.pow(1 - progress, 3)
      display.value = Math.round(from + diff * eased)
      if (progress >= 1) {
        display.value = to
        clearInterval(timer)
      }
    }, 16)
  }

  watch(targetRef, (val) => {
    if (val == null) return
    animate(display.value, Number(val))
  }, { immediate: true })

  onUnmounted(() => clearInterval(timer))

  return { display }
}
