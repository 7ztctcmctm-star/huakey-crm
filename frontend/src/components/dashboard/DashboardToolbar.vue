<template>
  <el-card class="dashboard-toolbar" shadow="never">
    <div class="toolbar-inner">
      <div class="welcome">
        <span class="greeting">{{ greeting }}，{{ userName }}</span>
        <span class="today">{{ today }}</span>
      </div>

      <div class="filters">
        <el-date-picker
          v-model="range"
          type="daterange"
          unlink-panels
          range-separator="~"
          start-placeholder="开始日期"
          end-placeholder="结束日期"
          value-format="YYYY-MM-DD"
          style="width: 260px"
          @change="onRangeChange"
        />

        <el-select
          v-if="ownerFilterEnabled"
          v-model="ownerId"
          placeholder="全部成员"
          clearable
          filterable
          style="width: 180px"
          @change="onOwnerChange"
        >
          <el-option
            v-for="m in members"
            :key="m.id"
            :label="m.real_name || m.username"
            :value="m.id"
          />
        </el-select>

        <el-button v-if="hasRange || ownerId" text type="primary" @click="onReset">重置</el-button>
        <el-tooltip content="时间范围作用于 KPI 卡与图表；待办/逾期为「当下」指标，不随时间范围变化" placement="bottom">
          <el-icon class="hint"><QuestionFilled /></el-icon>
        </el-tooltip>
      </div>
    </div>
  </el-card>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { QuestionFilled } from '@element-plus/icons-vue'
import { useUser } from '@/composables/useUser'
import { useDashboardFilters } from '@/composables/useDashboardFilters'
import { getUserList } from '@/api/system'
import { reportWarn } from '@/utils/error'

const { userInfo } = useUser()
const { filters, hasRange, ownerFilterEnabled, setRange, setOwner, reset } = useDashboardFilters()

const range = ref(filters.startDate && filters.endDate ? [filters.startDate, filters.endDate] : null)
const ownerId = ref(filters.ownerId)
const members = ref([])

const userName = computed(() => userInfo.value?.real_name || userInfo.value?.username || '')
const greeting = computed(() => {
  const h = new Date().getHours()
  if (h < 6) return '凌晨好'
  if (h < 12) return '早上好'
  if (h < 14) return '中午好'
  if (h < 18) return '下午好'
  return '晚上好'
})
const today = computed(() => {
  const d = new Date()
  const week = ['日', '一', '二', '三', '四', '五', '六'][d.getDay()]
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} 周${week}`
})

function onRangeChange(val) {
  setRange(val)
}
function onOwnerChange(val) {
  setOwner(val)
}
function onReset() {
  range.value = null
  ownerId.value = null
  reset()
}

async function fetchMembers() {
  if (!ownerFilterEnabled.value) return
  try {
    const res = await getUserList({ page: 1, pageSize: 200, status: 1 })
    if (res.code === 200) {
      const list = res.data?.list || res.data || []
      members.value = Array.isArray(list) ? list : []
    }
  } catch (e) {
    // 成员列表失败不影响仪表盘主体，仅记录（P1-11：不允许空 catch 静默吞掉）
    reportWarn('获取成员列表失败:', e)
  }
}

onMounted(fetchMembers)
</script>

<style scoped>
.dashboard-toolbar {
  margin-bottom: var(--space-4);
}
.toolbar-inner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
}
.welcome {
  display: flex;
  align-items: baseline;
  gap: 12px;
}
.greeting {
  font-size: 16px;
  font-weight: 600;
  color: var(--color-text);
}
.today {
  font-size: 13px;
  color: var(--color-text-secondary);
}
.filters {
  display: flex;
  align-items: center;
  gap: 12px;
}
.hint {
  color: var(--color-text-secondary);
  cursor: help;
}
</style>
