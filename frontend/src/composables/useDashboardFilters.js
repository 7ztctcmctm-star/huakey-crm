import { reactive, ref, computed } from 'vue'
import { useUser } from '@/composables/useUser'

/**
 * 首页 Dashboard 顶栏筛选（PRD R-05 §4.1）
 *
 * 为什么用模块级单例：首页由「角色分发壳 + 多个自取数的面板」组成
 * （StatsCards / SalesChart / SalesAnalytics 各自发请求），
 * 用一份共享状态 + revision 计数，比逐层 prop drilling 更简单可靠。
 *
 * ⚠️ 前端筛选**不是权限边界**：ownerId 的合法性由后端
 *    buildOwnerOverrideFilter 强制（仅 all 范围、或同部门 dept 生效）。
 */
const state = reactive({
  startDate: '',
  endDate: '',
  ownerId: null
})

/** 任何筛选变化都自增，供各面板 watch 后重取数 */
const revision = ref(0)

export function useDashboardFilters() {
  const { canViewAll } = useUser()

  const hasRange = computed(() => !!(state.startDate && state.endDate))
  /** 仅具备全局查看能力（老板/超管）时提供「团队筛选」 */
  const ownerFilterEnabled = computed(() => canViewAll.value === true)

  /** 动态标签：未选范围=「本月」，选本月=「本月」，否则显示区间 */
  const rangeLabel = computed(() => {
    if (!hasRange.value) return '本月'
    const [sy, sm] = state.startDate.split('-')
    const [ey, em] = state.endDate.split('-')
    const now = new Date()
    const isThisMonth = sy === ey
      && Number(sm) === now.getMonth() + 1
      && Number(sy) === now.getFullYear()
    return isThisMonth ? '本月' : `${state.startDate} ~ ${state.endDate}`
  })

  /** 请求参数：空值不下发（避免后端把空串当日期解析） */
  function query() {
    const q = {}
    if (hasRange.value) {
      q.startDate = state.startDate
      q.endDate = state.endDate
    }
    if (ownerFilterEnabled.value && state.ownerId) q.ownerId = state.ownerId
    return q
  }

  function setRange(val) {
    if (!val || val.length !== 2 || !val[0] || !val[1]) {
      state.startDate = ''
      state.endDate = ''
    } else {
      state.startDate = val[0]
      state.endDate = val[1]
    }
    revision.value++
  }

  function setOwner(id) {
    state.ownerId = id || null
    revision.value++
  }

  function reset() {
    state.startDate = ''
    state.endDate = ''
    state.ownerId = null
    revision.value++
  }

  return {
    filters: state,
    revision,
    hasRange,
    ownerFilterEnabled,
    rangeLabel,
    query,
    setRange,
    setOwner,
    reset
  }
}
