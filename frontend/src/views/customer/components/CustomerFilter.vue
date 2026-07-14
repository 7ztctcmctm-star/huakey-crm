<template>
  <!-- 快捷Tab -->
  <el-card shadow="never" style="margin-bottom: 12px;">
    <el-radio-group :model-value="activeQuickTab" @update:model-value="$emit('quick-tab-change', $event)">
      <el-radio-button value="mine">我的客户</el-radio-button>
      <el-radio-button value="all">全部客户</el-radio-button>
      <el-radio-button value="unassigned">公海/待分配</el-radio-button>
      <el-radio-button value="overdue_follow">久未跟进</el-radio-button>
    </el-radio-group>
  </el-card>

  <!-- 搜索区域 -->
  <el-card class="search-card" shadow="never">
    <el-form :model="searchForm" inline @keyup.enter="$emit('search')">
      <el-form-item label="公司名称">
        <el-input v-model="searchForm.company_name" placeholder="请输入公司名称" clearable />
      </el-form-item>
      <el-form-item label="联系人">
        <el-input v-model="searchForm.contact_name" placeholder="请输入联系人" clearable />
      </el-form-item>
      <el-form-item label="电话">
        <el-input v-model="searchForm.phone" placeholder="请输入电话" clearable />
      </el-form-item>
      <el-form-item label="客户来源">
        <el-select v-model="searchForm.source" placeholder="全部来源" clearable style="width: 160px">
          <template v-for="item in sourceSearchOptions" :key="item.value || item.label">
            <el-option-group v-if="item.options" :label="item.label">
              <el-option v-for="child in item.options" :key="child.value" :label="child.label" :value="child.value" />
            </el-option-group>
            <el-option v-else :label="item.label" :value="item.value" />
          </template>
        </el-select>
      </el-form-item>
      <el-form-item label="客户等级">
        <el-select v-model="searchForm.level" placeholder="请选择等级" clearable>
          <el-option v-for="item in levelOptions" :key="item.value" :label="item.label" :value="item.value" />
        </el-select>
      </el-form-item>
      <el-form-item label="状态">
        <el-select v-model="searchForm.status" placeholder="请选择状态" clearable>
          <el-option v-for="item in statusOptions" :key="item.value" :label="item.label" :value="item.value" />
        </el-select>
      </el-form-item>
      <el-form-item label="标签">
        <el-select v-model="searchForm.tag_id" placeholder="全部标签" clearable style="width:140px" @change="$emit('search')">
          <el-option v-for="t in tagOptions" :key="t.id" :label="t.name" :value="t.id" />
        </el-select>
      </el-form-item>
      <el-form-item label="创建时间">
        <el-date-picker v-model="searchForm.dateRange" type="daterange" start-placeholder="开始日期" end-placeholder="结束日期" value-format="YYYY-MM-DD" style="width: 240px" />
      </el-form-item>
      <el-form-item label="排序">
        <el-select v-model="searchForm.sort" placeholder="默认排序" clearable style="width: 180px" @change="$emit('search')">
          <el-option label="最后跟进 ↑ 久未跟进优先" value="last_follow_time_asc" />
          <el-option label="最后跟进 ↓ 最近跟进优先" value="last_follow_time_desc" />
          <el-option label="创建时间 ↓ 最新优先" value="create_time_desc" />
        </el-select>
      </el-form-item>
      <el-form-item>
        <el-button type="primary" :icon="Search" @click="$emit('search')">搜索</el-button>
        <el-button :icon="Refresh" @click="$emit('reset')">重置</el-button>
      </el-form-item>
    </el-form>
  </el-card>

  <!-- 逾期跟进提示 -->
  <el-alert
    v-if="overdueMode"
    title="当前显示逾期未跟进客户"
    type="warning"
    show-icon
    :closable="false"
    style="margin-bottom: 12px"
  >
    <template #default>
      超过 {{ overdueDays }} 天未跟进的客户。
      <el-button type="primary" link @click="$emit('clear-overdue')">查看全部客户</el-button>
    </template>
  </el-alert>

  <!-- 状态筛选 Tabs -->
  <el-card class="tab-card" shadow="never" style="margin-bottom: 12px;">
    <el-tabs :model-value="activeTab" @tab-change="$emit('tab-change', $event)">
      <el-tab-pane label="全部" name="all" />
      <el-tab-pane label="公海" name="sea" />
      <el-tab-pane label="跟进中" name="following" />
      <el-tab-pane label="已报价" name="quoted" />
      <el-tab-pane label="谈判中" name="negotiating" />
      <el-tab-pane label="已签约" name="signed" />
      <el-tab-pane label="已流失" name="lost" />
      <el-tab-pane label="暂停跟进" name="paused" />
    </el-tabs>
  </el-card>
</template>

<script setup>
import { Search, Refresh } from '@element-plus/icons-vue'
import { ref, onMounted } from 'vue'
import { getTagList } from '@/api/system'
import { get } from '@/utils/request'

const props = defineProps({
  searchForm: { type: Object, required: true },
  sourceSearchOptions: { type: Array, default: () => [] },
  levelOptions: { type: Array, default: () => [] },
  statusOptions: { type: Array, default: () => [] },
  activeTab: { type: String, default: 'all' },
  activeQuickTab: { type: String, default: 'mine' },
  overdueMode: { type: Boolean, default: false }
})

const emit = defineEmits(['search', 'reset', 'tab-change', 'quick-tab-change', 'clear-overdue'])

const tagOptions = ref([])
const overdueDays = ref(15)

const fetchTags = async () => {
  try {
    const res = await getTagList()
    if (res.code === 200) tagOptions.value = res.data
  } catch {}
}

const fetchOverdueDays = async () => {
  try {
    const res = await get('/config/overdue-days')
    if (res.code === 200) overdueDays.value = res.data.overdue_days
  } catch { /* 使用默认值 */ }
}

onMounted(() => {
  fetchTags()
  fetchOverdueDays()
})
</script>

<style scoped>
.search-card {
  margin-bottom: var(--space-4);
}

.search-card .el-form-item {
  margin-bottom: var(--space-2);
}
</style>
