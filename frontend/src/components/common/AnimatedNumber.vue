<template>
  <span>{{ formattedValue }}</span>
</template>

<script setup>
import { computed } from 'vue'
import { useCountUp } from '@/composables/useCountUp'

const props = defineProps({
  value: { type: [Number, String], default: 0 },
  duration: { type: Number, default: 800 },
  prefix: { type: String, default: '' },
  suffix: { type: String, default: '' },
  decimals: { type: Number, default: 0 },
  formatter: { type: Function, default: null }
})

const numericValue = computed(() => {
  const v = Number(props.value)
  return isNaN(v) ? 0 : v
})

const { display } = useCountUp(numericValue, props.duration)

const formattedValue = computed(() => {
  const n = display.value
  let text
  if (props.formatter) {
    text = props.formatter(n)
  } else if (props.decimals > 0) {
    text = n.toLocaleString('zh-CN', { minimumFractionDigits: props.decimals, maximumFractionDigits: props.decimals })
  } else {
    text = n.toLocaleString('zh-CN')
  }
  return `${props.prefix}${text}${props.suffix}`
})
</script>
