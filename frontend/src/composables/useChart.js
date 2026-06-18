import { ref, onMounted, onUnmounted } from 'vue'
import echarts from '@/composables/useECharts'

/**
 * ECharts 生命周期管理 composable
 * @param  {...string} names - 图表名称列表
 * @returns { refs, echarts, initChart, getChart, handleResize }
 *
 * 用法：
 *   const { refs, initChart, handleResize } = useChart('trend', 'source', 'funnel')
 *   // 模板中 <div ref="refs.trend">
 *   // 初始化: initChart('trend', option)
 */
export function useChart(...names) {
  const refs = {}
  const charts = {}

  for (const name of names) {
    refs[name] = ref(null)
    charts[name] = null
  }

  function initChart(name, option) {
    const el = refs[name]?.value
    if (!el || !echarts) return null
    charts[name]?.dispose()
    charts[name] = echarts.init(el)
    if (option) charts[name].setOption(option)
    return charts[name]
  }

  function getChart(name) {
    return charts[name]
  }

  function handleResize() {
    for (const name of names) {
      charts[name]?.resize()
    }
  }

  function disposeAll() {
    for (const name of names) {
      charts[name]?.dispose()
      charts[name] = null
    }
  }

  onMounted(() => {
    window.addEventListener('resize', handleResize)
  })

  onUnmounted(() => {
    window.removeEventListener('resize', handleResize)
    disposeAll()
  })

  return { refs, echarts, initChart, getChart, handleResize, disposeAll }
}
