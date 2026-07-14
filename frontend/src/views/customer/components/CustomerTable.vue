<template>
  <el-card class="table-card" shadow="never">
    <div class="toolbar">
      <el-button type="primary" :icon="Plus" @click="$emit('add')" v-permission="'customer:add'">新增客户</el-button>
      <el-button type="success" :icon="Upload" @click="$emit('import')" v-permission="'customer:import'">导入Excel</el-button>
      <el-button type="warning" :icon="Download" :loading="exportLoading" @click="$emit('export')" v-permission="'customer:export'">导出Excel</el-button>
      <el-button :icon="DataAnalysis" @click="$emit('quality-check')" v-permission="'data_quality:check'">质量检查</el-button>
      <el-button
        type="success"
        :icon="ChatLineRound"
        :disabled="selectedRows.length === 0"
        @click="$emit('batch-follow')"
        v-permission="'customer:edit'"
      >
        批量跟进 ({{ selectedRows.length }})
      </el-button>
      <el-divider direction="vertical" />
      <el-radio-group :model-value="viewMode" @update:model-value="$emit('update:viewMode', $event); $emit('view-mode-change')" size="default">
        <el-radio-button value="all">全部客户</el-radio-button>
        <el-radio-button value="mine">我的客户</el-radio-button>
        <el-radio-button v-if="isBoss || isManager" value="staff">{{ isManager ? '下属客户' : '职员客户' }}</el-radio-button>
      </el-radio-group>
      <template v-if="(isBoss || isManager) && viewMode === 'staff'">
        <el-select
          :model-value="staffFilterId"
          @update:model-value="$emit('update:staffFilterId', $event); $emit('staff-filter-change')"
          placeholder="选择职员"
          size="default"
          style="width: 150px"
        >
          <el-option v-for="u in staffOptions" :key="u.id" :label="u.real_name" :value="u.id" />
        </el-select>
      </template>
      <template v-if="isBoss || isManager">
        <el-divider direction="vertical" />
        <el-select :model-value="batchNewOwnerId" @update:model-value="$emit('update:batchNewOwnerId', $event)" placeholder="批量更换负责人" size="default" style="width: 160px" clearable>
          <el-option value="" label="回收为待分配" />
          <el-option v-for="u in salesUsers" :key="u.id" :label="u.real_name" :value="u.id" />
        </el-select>
        <el-button type="warning" :disabled="selectedRows.length === 0"
          @click="$emit('batch-assign')"
          v-permission="'customer:assign'"
        >
          批量更换负责人 ({{ selectedRows.length }})
        </el-button>
      </template>
    </div>

    <!-- 批量操作提示条 -->
    <div v-if="selectedRows.length > 0" class="batch-bar">
      <el-icon><Select /></el-icon>
      <span>已选择 <strong>{{ selectedRows.length }}</strong> 项</span>
    </div>

    <!-- 表格 -->
    <el-table
      v-loading="loading"
      ref="tableRef"
      @selection-change="$emit('selection-change', $event)"
      :data="tableData"
      stripe border
      style="width: 100%"
      :row-class-name="rowClassName"
      :header-cell-style="{ background: 'var(--color-bg)', color: 'var(--color-text-secondary)' }"
    >
      <template #empty>
        <el-empty description="">
          <template v-if="viewMode === 'mine'">暂无负责的客户</template>
          <template v-else>暂无客户数据</template>
          <el-button type="primary" @click="$emit('add')" v-permission="'customer:add'">新增第一个客户</el-button>
        </el-empty>
      </template>
      <el-table-column type="selection" width="50" />
      <el-table-column prop="company_name" label="公司名称" min-width="180" show-overflow-tooltip />
      <el-table-column prop="owner_name" label="负责人" width="110">
        <template #default="{ row }">
          <el-tag v-if="row.owner_name" type="success" size="small">{{ row.owner_name }}</el-tag>
          <el-tag v-else type="danger" size="small" effect="plain">待分配</el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="primary_contact_name" label="联系人" width="100" class-name="hide-mobile">
        <template #default="{ row }">
          <span>{{ row.primary_contact_name || '-' }}</span>
        </template>
      </el-table-column>
      <el-table-column prop="primary_contact_phone" label="电话" width="130" class-name="hide-mobile">
        <template #default="{ row }">
          <a v-if="row.primary_contact_phone" :href="'tel:' + row.primary_contact_phone" style="color: var(--el-color-primary); text-decoration: none;">{{ row.primary_contact_phone }}</a>
          <span v-else>-</span>
        </template>
      </el-table-column>
      <el-table-column prop="source" label="客户来源" width="100" class-name="hide-mobile">
        <template #default="{ row }">
          <el-tag v-if="row.source">{{ row.source }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="level" label="客户等级" width="120" align="center">
        <template #default="{ row }">
          <el-tag
            :type="levelTagType(row.level)"
            :color="levelColor(row.level)"
            effect="dark"
            size="large"
            style="font-weight:bold;min-width:60px"
          >
            {{ levelLabel(row.level) }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="status" label="状态" width="100" align="center">
        <template #default="{ row }">
          <el-tag :type="statusTagType(row.status)">
            {{ statusMap[row.status] || '未知' }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column label="标签" width="160">
        <template #default="{ row }">
          <template v-if="row.tags && row.tags.length">
            <el-tag v-for="t in row.tags" :key="t.id" :color="t.color" size="small" effect="dark" style="margin: 1px 2px">{{ t.name }}</el-tag>
          </template>
          <span v-else style="color:#999;font-size:12px">-</span>
        </template>
      </el-table-column>
      <el-table-column label="最后跟进" width="150">
        <template #default="{ row }">
          <el-tooltip v-if="row.last_follow_time" :content="fullTime(row.last_follow_time)" placement="top">
            <span :style="{ color: isOverdue(row.last_follow_time) ? '#e85c5c' : '' }">
              {{ relativeTime(row.last_follow_time) }}
            </span>
          </el-tooltip>
          <el-tag v-else type="danger" size="small">从未跟进</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="距下次跟进" width="140" align="center">
        <template #default="{ row }">
          <el-tooltip v-if="row.next_follow_time" :content="fullTime(row.next_follow_time)" placement="top">
            <span :style="{ color: isNextFollowOverdue(row.next_follow_time) ? '#e85c5c' : '' }">
              {{ relativeNextTime(row.next_follow_time) }}
            </span>
          </el-tooltip>
          <span v-else>-</span>
        </template>
      </el-table-column>
      <el-table-column prop="create_time" label="创建时间" width="150">
        <template #default="{ row }">
          <el-tooltip :content="fullTime(row.create_time)" placement="top">
            <span>{{ relativeTime(row.create_time) }}</span>
          </el-tooltip>
        </template>
      </el-table-column>
      <el-table-column label="操作" :width="isBoss || isManager ? 380 : 300" fixed="right">
        <template #default="{ row }">
          <el-button v-if="viewMode === 'sea' || !row.owner_id" type="success" size="small" :icon="Aim" @click="$emit('claim', row)" v-permission="'customer:pool'">认领</el-button>
          <el-button v-if="isProspectView" type="primary" size="small" :icon="ArrowRight" @click="$emit('convert-to-customer', row)" v-permission="'customer:edit'">转为正式客户</el-button>
          <el-button type="success" size="small" :icon="ChatLineRound" @click="$emit('quick-follow', row)" v-permission="'customer:edit'">跟进</el-button>
          <el-button v-if="isBoss || isManager" type="warning" size="small" @click="$emit('assign', row)" v-permission="'customer:assign'">分配</el-button>
          <el-button v-if="canForward(row)" type="primary" size="small" :icon="ArrowRight" @click="handleForward(row)" v-permission="'customer:edit'">推进</el-button>
          <el-button v-if="canBackward(row)" type="info" size="small" :icon="ArrowLeft" @click="handleBackward(row)" v-permission="'customer:edit'">回退</el-button>
          <el-dropdown trigger="click" @command="(cmd) => handleMoreAction(cmd, row)">
            <el-button size="small">更多</el-button>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item command="view">查看</el-dropdown-item>
                <el-dropdown-item v-if="hasPermissionFromStorage('customer:edit')" command="edit">编辑</el-dropdown-item>
                <el-dropdown-item v-if="hasPermissionFromStorage('customer:delete')" command="delete" divided :style="{ color: 'var(--color-accent)' }">删除</el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
        </template>
      </el-table-column>
    </el-table>

    <!-- 回退原因弹窗 -->
    <el-dialog v-model="backwardDialogVisible" title="回退客户状态" width="440px" :close-on-click-modal="false">
      <p style="font-size:15px;font-weight:bold;text-align:center;padding:8px">{{ backwardTarget?.company_name }}</p>
      <el-form label-width="80px">
        <el-form-item label="回退原因">
          <el-input v-model="backwardReason" type="textarea" :rows="3" placeholder="请输入回退原因（可选）" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="backwardDialogVisible = false">取消</el-button>
        <el-button type="warning" @click="confirmBackward" :loading="backwardLoading">确认回退</el-button>
      </template>
    </el-dialog>
  </el-card>
</template>

<script setup>
import { ref } from 'vue'
import { ElMessage } from 'element-plus'
import { Plus, Upload, Download, DataAnalysis, ChatLineRound, Select, ArrowRight, ArrowLeft, Aim } from '@element-plus/icons-vue'
import { relativeTime, fullTime, relativeNextTime } from '@/composables/useRelativeTime'
import { hasPermissionFromStorage } from '@/utils/permission'
import { forwardCustomer, backwardCustomer } from '@/api/customer'

const props = defineProps({
  loading: { type: Boolean, default: false },
  tableData: { type: Array, default: () => [] },
  isProspectView: { type: Boolean, default: false },
  isBoss: { type: Boolean, default: false },
  isManager: { type: Boolean, default: false },
  selectedRows: { type: Array, default: () => [] },
  salesUsers: { type: Array, default: () => [] },
  staffOptions: { type: Array, default: () => [] },
  viewMode: { type: String, default: 'all' },
  staffFilterId: { type: [Number, String], default: null },
  batchNewOwnerId: { type: [Number, String], default: '' },
  exportLoading: { type: Boolean, default: false }
})

const emit = defineEmits([
  'add', 'import', 'export', 'quality-check', 'batch-follow', 'batch-assign',
  'update:viewMode', 'update:staffFilterId', 'update:batchNewOwnerId',
  'view-mode-change', 'staff-filter-change',
  'selection-change', 'quick-follow', 'assign', 'claim', 'status-change', 'view', 'edit', 'delete',
  'convert-to-customer'
])

const tableRef = ref(null)

const levelTagType = (level) => {
  const map = { A: 'danger', B: 'warning', C: 'info', D: '' }
  return map[level] || 'info'
}

const levelLabel = (level) => {
  const map = { A: 'A级-重点', B: 'B级-意向', C: 'C级-潜在', D: 'D级-冷淡' }
  return map[level] || level || '-'
}

const levelColor = (level) => {
  const map = { A: 'var(--color-accent)', B: 'var(--color-accent)', C: 'var(--color-accent)', D: 'var(--color-text-tertiary)' }
  return map[level]
}

const statusTagType = (status) => {
  const map = {
    sea: 'info',
    following: 'warning',
    quoted: '',
    negotiating: 'primary',
    signed: 'success',
    lost: 'danger',
    paused: 'info'
  }
  return map[status] || 'info'
}

const statusMap = {
  sea: '公海客户',
  following: '跟进中',
  quoted: '已报价',
  negotiating: '谈判中',
  signed: '已签约',
  lost: '已流失',
  paused: '暂停跟进'
}

const overdueDays = 15
const isOverdue = (time) => {
  if (!time) return true
  return (new Date() - new Date(time)) > overdueDays * 24 * 60 * 60 * 1000
}

const isNextFollowOverdue = (time) => {
  if (!time) return false
  return new Date(time).getTime() < Date.now()
}

const rowClassName = ({ row }) => {
  if (isOverdue(row.last_follow_time)) return 'overdue-row'
  return ''
}

const handleMoreAction = (command, row) => {
  if (command === 'view') emit('view', row)
  else if (command === 'edit') emit('edit', row)
  else if (command === 'delete') emit('delete', row)
}

// 状态流转
const PIPELINE = ['sea', 'following', 'quoted', 'negotiating', 'signed']

const canForward = (row) => {
  const idx = PIPELINE.indexOf(row.status)
  return idx !== -1 && idx < PIPELINE.length - 1 && row.status !== 'lost' && row.status !== 'paused'
}

const canBackward = (row) => {
  const idx = PIPELINE.indexOf(row.status)
  return idx > 0 && row.status !== 'lost' && row.status !== 'paused'
}

const handleForward = async (row) => {
  try {
    const res = await forwardCustomer({ customer_id: row.id })
    if (res.code === 200) {
      ElMessage.success(res.message)
      emit('status-change')
    } else {
      ElMessage.error(res.message || '推进失败')
    }
  } catch (error) {
    ElMessage.error('推进失败：' + (error.response?.data?.message || error.message))
  }
}

const backwardDialogVisible = ref(false)
const backwardTarget = ref(null)
const backwardReason = ref('')
const backwardLoading = ref(false)

const handleBackward = (row) => {
  backwardTarget.value = row
  backwardReason.value = ''
  backwardDialogVisible.value = true
}

const confirmBackward = async () => {
  if (!backwardTarget.value) return
  backwardLoading.value = true
  try {
    const res = await backwardCustomer({
      customer_id: backwardTarget.value.id,
      reason: backwardReason.value
    })
    if (res.code === 200) {
      ElMessage.success(res.message)
      backwardDialogVisible.value = false
      emit('status-change')
    } else {
      ElMessage.error(res.message || '回退失败')
    }
  } catch (error) {
    ElMessage.error('回退失败：' + (error.response?.data?.message || error.message))
  } finally {
    backwardLoading.value = false
  }
}

defineExpose({ tableRef })
</script>

<style scoped>
.table-card {
  min-height: 400px;
}

.toolbar {
  margin-bottom: var(--space-4);
  display: flex;
  align-items: center;
  gap: var(--space-3);
  flex-wrap: wrap;
}

.batch-bar {
  margin-bottom: var(--space-3);
  display: flex;
  align-items: center;
  gap: var(--space-2);
  color: var(--color-text-secondary);
  font-size: 13px;
}

:deep(.el-card__body) {
  padding: var(--space-5) var(--space-6);
}

:deep(.el-table) {
  border: none;
  border-radius: var(--radius-lg);
}

:deep(.el-table__header-wrapper th.el-table__cell) {
  background: var(--color-bg);
  color: var(--color-text-secondary);
  font-weight: 500;
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.02em;
  border-bottom: 1px solid var(--color-border-strong);
}

:deep(.el-table__body-wrapper td.el-table__cell) {
  height: 56px;
  border-bottom: 1px solid var(--color-border);
  color: var(--color-text);
}

:deep(.el-table__body tr:hover > td) {
  background: var(--color-bg-secondary);
}

:deep(.el-button--primary) {
  background: var(--color-accent);
  border-color: var(--color-accent);
}
</style>
