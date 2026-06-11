<template>
  <div class="page-container">
    <div class="page-header">
      <h2>日程管理</h2>
      <div class="header-actions">
        <el-button-group>
          <el-button :type="viewMode==='month'?'primary':''" @click="viewMode='month'">月</el-button>
          <el-button :type="viewMode==='week'?'primary':''" @click="viewMode='week'">周</el-button>
          <el-button :type="viewMode==='day'?'primary':''" @click="viewMode='day'">日</el-button>
        </el-button-group>
        <el-button @click="goToday">今天</el-button>
        <el-button :icon="ArrowLeft" text @click="goPrev" />
        <el-button :icon="ArrowRight" text @click="goNext" />
        <span class="header-date">{{ headerLabel }}</span>
        <el-button type="primary" :icon="Plus" @click="handleCreate">新建日程</el-button>
      </div>
    </div>

    <el-row :gutter="16">
      <!-- 日历主体 -->
      <el-col :span="18">
        <el-card shadow="never" class="calendar-card">
          <!-- 月视图 -->
          <div v-if="viewMode === 'month'" class="month-grid">
            <div class="month-header" v-for="d in weekDays" :key="d">{{ d }}</div>
            <div v-for="(day, idx) in monthDays" :key="idx" class="month-cell" :class="{ today: day.isToday, other: day.otherMonth }" @click="selectDate(day)">
              <div class="cell-date">{{ day.day }}</div>
              <div v-for="evt in day.events.slice(0, 3)" :key="evt.id" class="cell-event" :style="{ background: evt.color }" @click.stop="handleView(evt)">
                {{ evt.title }}
              </div>
              <div v-if="day.events.length > 3" class="cell-more">+{{ day.events.length - 3 }} 更多</div>
            </div>
          </div>

          <!-- 周/日视图 -->
          <div v-else class="time-grid">
            <div class="time-header">
              <div class="time-gutter"></div>
              <div v-for="d in weekViewDays" :key="d.date" class="time-day-header" :class="{ today: d.isToday }">
                <div>{{ d.label }}</div>
              </div>
            </div>
            <div class="time-body">
              <div v-for="hour in hours" :key="hour" class="time-row">
                <div class="time-gutter">{{ hour }}:00</div>
                <div v-for="d in weekViewDays" :key="d.date + hour" class="time-cell" @click="handleCreateAt(d.date, hour)">
                  <div v-for="evt in getEventsAt(d.date, hour)" :key="evt.id" class="time-event" :style="{ background: evt.color }" @click.stop="handleView(evt)">
                    {{ evt.title }}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </el-card>
      </el-col>

      <!-- 右侧面板 -->
      <el-col :span="6">
        <el-card shadow="never">
          <template #header><span class="card-title">{{ selectedDateLabel }}</span></template>
          <div v-if="selectedEvents.length > 0">
            <div v-for="evt in selectedEvents" :key="evt.id" class="side-event" @click="handleView(evt)">
              <div class="side-event-time">{{ formatTime(evt.start_time).slice(11, 16) }}</div>
              <div class="side-event-title">{{ evt.title }}</div>
              <el-tag :type="eventTypeTag[evt.event_type]" size="small">{{ eventTypeName[evt.event_type] }}</el-tag>
            </div>
          </div>
          <el-empty v-else description="当天无日程" :image-size="60" />
        </el-card>
      </el-col>
    </el-row>

    <!-- 新建/编辑弹窗 -->
    <el-dialog v-model="dialogVisible" :title="isEdit ? '编辑日程' : '新建日程'" width="550px">
      <el-form :model="form" label-width="80px">
        <el-form-item label="标题"><el-input v-model="form.title" placeholder="日程标题" /></el-form-item>
        <el-form-item label="类型">
          <el-select v-model="form.event_type" style="width:100%">
            <el-option v-for="(v, k) in eventTypeName" :key="k" :label="v" :value="k" />
          </el-select>
        </el-form-item>
        <el-row :gutter="12">
          <el-col :span="12"><el-form-item label="开始时间"><el-date-picker v-model="form.start_time" type="datetime" style="width:100%" value-format="YYYY-MM-DD HH:mm:ss" /></el-form-item></el-col>
          <el-col :span="12"><el-form-item label="结束时间"><el-date-picker v-model="form.end_time" type="datetime" style="width:100%" value-format="YYYY-MM-DD HH:mm:ss" /></el-form-item></el-col>
        </el-row>
        <el-form-item label="地点"><el-input v-model="form.location" placeholder="地点（可选）" /></el-form-item>
        <el-form-item label="关联客户">
          <el-select v-model="form.customer_id" filterable clearable placeholder="选择客户（可选）" style="width:100%">
            <el-option v-for="c in customerOptions" :key="c.id" :label="c.company_name" :value="c.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="描述"><el-input v-model="form.description" type="textarea" :rows="3" /></el-form-item>
        <el-form-item label="颜色">
          <el-color-picker v-model="form.color" :predefine="presetColors" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button v-if="isEdit" type="danger" @click="handleDelete" style="margin-right:auto">删除</el-button>
        <el-button @click="dialogVisible=false">取消</el-button>
        <el-button type="primary" :loading="saveLoading" @click="handleSave">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus, ArrowLeft, ArrowRight } from '@element-plus/icons-vue'
import request from '@/utils/request'
import { formatTime } from '@/composables/useFormat'

const eventTypeName = { meeting: '会议', followup: '跟进', task: '任务', reminder: '提醒' }
const eventTypeTag = { meeting: '', followup: 'success', task: 'warning', reminder: 'info' }
const presetColors = ['#2563EB', '#059669', '#D97706', '#DC2626', '#7C3AED', '#0891B2']
const weekDays = ['日', '一', '二', '三', '四', '五', '六']
const hours = Array.from({ length: 12 }, (_, i) => i + 8)

const viewMode = ref('month')
const currentDate = ref(new Date())
const events = ref([])
const selectedDate = ref(new Date())
const dialogVisible = ref(false)
const isEdit = ref(false)
const editId = ref(null)
const saveLoading = ref(false)
const customerOptions = ref([])

const form = reactive({ title: '', event_type: 'meeting', description: '', start_time: '', end_time: '', location: '', customer_id: null, color: '#2563EB' })

const headerLabel = computed(() => {
  const d = currentDate.value
  if (viewMode.value === 'month') return `${d.getFullYear()}年${d.getMonth() + 1}月`
  if (viewMode.value === 'week') return `${d.getFullYear()}年${d.getMonth() + 1}月 第${Math.ceil(d.getDate() / 7)}周`
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`
})

const selectedDateLabel = computed(() => {
  const d = selectedDate.value
  return `${d.getMonth() + 1}月${d.getDate()}日 ${weekDays[d.getDay()]}`
})

const selectedEvents = computed(() => {
  const ds = selectedDate.value.toISOString().slice(0, 10)
  return events.value.filter(e => e.start_time && e.start_time.slice(0, 10) === ds)
})

// 月视图日期计算
const monthDays = computed(() => {
  const d = currentDate.value
  const year = d.getFullYear(), month = d.getMonth()
  const firstDay = new Date(year, month, 1)
  const lastDay = new Date(year, month + 1, 0)
  const days = []
  const today = new Date().toISOString().slice(0, 10)

  // 填充上月
  for (let i = firstDay.getDay() - 1; i >= 0; i--) {
    const date = new Date(year, month, -i)
    days.push({ day: date.getDate(), date: date.toISOString().slice(0, 10), isToday: false, otherMonth: true, events: [] })
  }

  // 本月
  for (let i = 1; i <= lastDay.getDate(); i++) {
    const date = new Date(year, month, i)
    const ds = date.toISOString().slice(0, 10)
    days.push({ day: i, date: ds, isToday: ds === today, otherMonth: false, events: events.value.filter(e => e.start_time && e.start_time.slice(0, 10) === ds) })
  }

  // 填充下月
  const remaining = 42 - days.length
  for (let i = 1; i <= remaining; i++) {
    const date = new Date(year, month + 1, i)
    days.push({ day: i, date: date.toISOString().slice(0, 10), isToday: false, otherMonth: true, events: [] })
  }

  return days
})

// 周视图
const weekViewDays = computed(() => {
  const d = currentDate.value
  const start = new Date(d)
  start.setDate(start.getDate() - start.getDay())
  const today = new Date().toISOString().slice(0, 10)
  return Array.from({ length: viewMode.value === 'day' ? 1 : 7 }, (_, i) => {
    const date = new Date(start)
    date.setDate(date.getDate() + (viewMode.value === 'day' ? d.getDay() : i))
    const ds = date.toISOString().slice(0, 10)
    return { date: ds, label: `${date.getMonth() + 1}/${date.getDate()} ${weekDays[date.getDay()]}`, isToday: ds === today }
  })
})

const getEventsAt = (date, hour) => {
  return events.value.filter(e => {
    if (!e.start_time || !e.start_time.startsWith(date)) return false
    const h = parseInt(e.start_time.slice(11, 13))
    return h === hour
  })
}

const selectDate = (day) => { selectedDate.value = new Date(day.date + 'T00:00:00') }
const goToday = () => { currentDate.value = new Date(); selectedDate.value = new Date() }
const goPrev = () => {
  const d = new Date(currentDate.value)
  if (viewMode.value === 'month') d.setMonth(d.getMonth() - 1)
  else if (viewMode.value === 'week') d.setDate(d.getDate() - 7)
  else d.setDate(d.getDate() - 1)
  currentDate.value = d
}
const goNext = () => {
  const d = new Date(currentDate.value)
  if (viewMode.value === 'month') d.setMonth(d.getMonth() + 1)
  else if (viewMode.value === 'week') d.setDate(d.getDate() + 7)
  else d.setDate(d.getDate() + 1)
  currentDate.value = d
}

const fetchEvents = async () => {
  const d = currentDate.value
  let start, end
  if (viewMode.value === 'month') {
    start = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
    end = new Date(d.getFullYear(), d.getMonth() + 1, 0).toISOString().slice(0, 10)
  } else if (viewMode.value === 'week') {
    const s = new Date(d); s.setDate(s.getDate() - s.getDay())
    const e = new Date(s); e.setDate(e.getDate() + 6)
    start = s.toISOString().slice(0, 10); end = e.toISOString().slice(0, 10)
  } else {
    start = end = d.toISOString().slice(0, 10)
  }
  try {
    const res = await request.get('/calendar/events', { params: { start_date: start, end_date: end } })
    if (res.code === 200) events.value = res.data
  } catch (e) { /* */ }
}

const fetchCustomers = async () => {
  try { const res = await request.post('/customer/list', { page: 1, pageSize: 200 }); if (res.code === 200) customerOptions.value = res.data.list } catch (e) { /* */ }
}

const handleCreate = () => {
  isEdit.value = false; editId.value = null
  const now = new Date()
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours() + 1, 0)
  Object.assign(form, { title: '', event_type: 'meeting', description: '', start_time: start.toISOString().slice(0, 19).replace('T', ' '), end_time: '', location: '', customer_id: null, color: '#2563EB' })
  dialogVisible.value = true
}

const handleCreateAt = (date, hour) => {
  isEdit.value = false; editId.value = null
  Object.assign(form, { title: '', event_type: 'meeting', description: '', start_time: `${date} ${String(hour).padStart(2, '0')}:00:00`, end_time: '', location: '', customer_id: null, color: '#2563EB' })
  dialogVisible.value = true
}

const handleView = (evt) => {
  isEdit.value = true; editId.value = evt.id
  Object.assign(form, { title: evt.title, event_type: evt.event_type, description: evt.description || '', start_time: evt.start_time, end_time: evt.end_time || '', location: evt.location || '', customer_id: evt.customer_id, color: evt.color || '#2563EB' })
  dialogVisible.value = true
}

const handleSave = async () => {
  if (!form.title) { ElMessage.warning('请输入标题'); return }
  saveLoading.value = true
  try {
    let res
    if (isEdit.value) res = await request.put(`/calendar/events/${editId.value}`, form)
    else res = await request.post('/calendar/events', form)
    if (res.code === 200) { ElMessage.success('保存成功'); dialogVisible.value = false; fetchEvents() }
  } finally { saveLoading.value = false }
}

const handleDelete = () => {
  ElMessageBox.confirm('确定删除该日程？', '提示', { type: 'warning' }).then(async () => {
    const res = await request.delete(`/calendar/events/${editId.value}`)
    if (res.code === 200) { ElMessage.success('已删除'); dialogVisible.value = false; fetchEvents() }
  }).catch(() => {})
}

watch([viewMode, currentDate], () => { fetchEvents() })
onMounted(() => { fetchEvents(); fetchCustomers() })
</script>

<style scoped>
.page-container { padding: 0; }
.page-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: var(--space-4); }
.page-header h2 { margin: 0; font-size: 28px; font-weight: 600; color: var(--color-text); }
.header-actions { display: flex; align-items: center; gap: 8px; }
.header-date { font-size: 16px; font-weight: 600; color: var(--color-text); min-width: 140px; text-align: center; }
.card-title { font-size: 15px; font-weight: 600; }

/* 月视图 */
.month-grid { display: grid; grid-template-columns: repeat(7, 1fr); border: 1px solid var(--color-border); }
.month-header { padding: 8px; text-align: center; font-size: 12px; font-weight: 600; color: var(--color-text-tertiary); background: var(--color-bg-secondary); }
.month-cell { min-height: 90px; padding: 4px; border: 1px solid var(--color-border); cursor: pointer; transition: background 0.15s; }
.month-cell:hover { background: var(--color-bg-secondary); }
.month-cell.today { background: #f0f7ff; }
.month-cell.other { opacity: 0.4; }
.cell-date { font-size: 13px; font-weight: 600; margin-bottom: 2px; }
.cell-event { font-size: 11px; color: #fff; padding: 1px 4px; border-radius: 3px; margin-bottom: 2px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; cursor: pointer; }
.cell-more { font-size: 11px; color: var(--color-text-tertiary); text-align: center; }

/* 周/日视图 */
.time-grid { font-size: 12px; }
.time-header { display: flex; border-bottom: 1px solid var(--color-border); }
.time-gutter { width: 50px; flex-shrink: 0; padding: 8px 4px; text-align: center; color: var(--color-text-tertiary); }
.time-day-header { flex: 1; padding: 8px; text-align: center; font-weight: 600; }
.time-day-header.today { color: var(--color-accent); }
.time-body { max-height: 600px; overflow-y: auto; }
.time-row { display: flex; border-bottom: 1px solid var(--color-border); min-height: 40px; }
.time-cell { flex: 1; border-left: 1px solid var(--color-border); padding: 2px; cursor: pointer; min-height: 40px; }
.time-cell:hover { background: var(--color-bg-secondary); }
.time-event { font-size: 11px; color: #fff; padding: 2px 4px; border-radius: 3px; margin-bottom: 2px; cursor: pointer; }

/* 右侧面板 */
.side-event { padding: 8px 0; border-bottom: 1px solid var(--color-border); cursor: pointer; }
.side-event:hover { background: var(--color-bg-secondary); margin: 0 -20px; padding: 8px 20px; }
.side-event:last-child { border-bottom: none; }
.side-event-time { font-size: 12px; color: var(--color-text-tertiary); }
.side-event-title { font-size: 14px; font-weight: 500; color: var(--color-text); margin: 2px 0; }
</style>
