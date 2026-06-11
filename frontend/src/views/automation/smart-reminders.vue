<template>
  <div class="page-container">
    <div class="page-header">
      <h2>智能提醒</h2>
      <el-button type="primary" :loading="scanLoading" @click="handleScan">立即扫描</el-button>
    </div>

    <!-- 统计 -->
    <div class="stat-cards">
      <div class="stat-card"><div class="stat-value">{{ pendingCount }}</div><div class="stat-label">待处理提醒</div></div>
      <div class="stat-card"><div class="stat-value">{{ rules.length }}</div><div class="stat-label">提醒规则</div></div>
    </div>

    <el-tabs v-model="activeTab">
      <!-- 提醒规则 -->
      <el-tab-pane label="提醒规则" name="rules">
        <el-card shadow="never">
          <div class="toolbar"><el-button type="primary" :icon="Plus" @click="handleCreateRule">新增规则</el-button></div>
          <el-table :data="rules" stripe border>
            <el-table-column prop="name" label="规则名称" min-width="160" />
            <el-table-column prop="reminder_type" label="类型" width="120" align="center">
              <template #default="{ row }"><el-tag :type="typeTag[row.reminder_type]" size="small">{{ typeName[row.reminder_type] }}</el-tag></template>
            </el-table-column>
            <el-table-column label="配置" min-width="160">
              <template #default="{ row }">{{ formatConfig(row.reminder_type, row.config) }}</template>
            </el-table-column>
            <el-table-column prop="notify_to" label="通知对象" width="80" align="center">
              <template #default="{ row }">{{ {owner:'负责人',all:'管理员',boss:'老板'}[row.notify_to] }}</template>
            </el-table-column>
            <el-table-column label="状态" width="80" align="center">
              <template #default="{ row }"><el-tag :type="row.status?'success':'info'" size="small">{{ row.status?'启用':'禁用' }}</el-tag></template>
            </el-table-column>
            <el-table-column prop="last_run_at" label="最后执行" width="160">
              <template #default="{ row }">{{ row.last_run_at || '-' }}</template>
            </el-table-column>
            <el-table-column label="操作" width="140" fixed="right">
              <template #default="{ row }">
                <el-button type="primary" link @click="handleEditRule(row)">编辑</el-button>
                <el-button type="danger" link @click="handleDeleteRule(row)">删除</el-button>
              </template>
            </el-table-column>
          </el-table>
        </el-card>
      </el-tab-pane>

      <!-- 待处理提醒 -->
      <el-tab-pane label="待处理提醒" name="pending">
        <el-card shadow="never">
          <el-table :data="pendingList" stripe border v-loading="pendingLoading">
            <el-table-column prop="rule_name" label="规则" width="140" />
            <el-table-column prop="reminder_type" label="类型" width="120" align="center">
              <template #default="{ row }"><el-tag :type="typeTag[row.reminder_type]" size="small">{{ typeName[row.reminder_type] }}</el-tag></template>
            </el-table-column>
            <el-table-column prop="target_type" label="目标" width="80" />
            <el-table-column prop="target_id" label="ID" width="60" />
            <el-table-column prop="remind_date" label="提醒日期" width="110" />
            <el-table-column label="操作" width="100" fixed="right">
              <template #default="{ row }">
                <el-button type="primary" link @click="handleSeen(row)">标记已读</el-button>
              </template>
            </el-table-column>
          </el-table>
          <el-empty v-if="!pendingLoading && pendingList.length === 0" description="暂无待处理提醒" :image-size="60" />
        </el-card>
      </el-tab-pane>
    </el-tabs>

    <!-- 规则弹窗 -->
    <el-dialog v-model="ruleDialogVisible" :title="isRuleEdit ? '编辑规则' : '新增规则'" width="500px">
      <el-form :model="ruleForm" label-width="80px">
        <el-form-item label="规则名称"><el-input v-model="ruleForm.name" /></el-form-item>
        <el-form-item label="提醒类型">
          <el-select v-model="ruleForm.reminder_type" style="width:100%" @change="onTypeChange">
            <el-option v-for="(v, k) in typeName" :key="k" :label="v" :value="k" />
          </el-select>
        </el-form-item>
        <el-form-item v-if="ruleForm.reminder_type === 'followup_gap'" label="间隔天数">
          <el-input-number v-model="configForm.days" :min="1" style="width:100%" controls-position="right" />
        </el-form-item>
        <el-form-item v-if="ruleForm.reminder_type === 'contract_expire'" label="提前天数">
          <el-input-number v-model="configForm.days_before" :min="1" style="width:100%" controls-position="right" />
        </el-form-item>
        <el-form-item v-if="ruleForm.reminder_type === 'payment_due'" label="提前天数">
          <el-input-number v-model="configForm.days_before" :min="1" style="width:100%" controls-position="right" />
        </el-form-item>
        <el-form-item v-if="ruleForm.reminder_type === 'inactive'" label="沉默天数">
          <el-input-number v-model="configForm.days_no_contact" :min="1" style="width:100%" controls-position="right" />
        </el-form-item>
        <el-form-item label="通知对象">
          <el-select v-model="ruleForm.notify_to" style="width:100%">
            <el-option label="负责人" value="owner" /><el-option label="管理员" value="all" /><el-option label="老板" value="boss" />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer><el-button @click="ruleDialogVisible=false">取消</el-button><el-button type="primary" @click="handleSaveRule">保存</el-button></template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus } from '@element-plus/icons-vue'
import request from '@/utils/request'

const typeName = { followup_gap: '跟进间隔', contract_expire: '合同到期', payment_due: '回款到期', birthday: '生日', inactive: '沉默客户' }
const typeTag = { followup_gap: '', contract_expire: 'warning', payment_due: 'danger', birthday: 'success', inactive: 'info' }

const activeTab = ref('rules')
const scanLoading = ref(false)
const rules = ref([])
const pendingList = ref([])
const pendingCount = ref(0)
const pendingLoading = ref(false)

const ruleDialogVisible = ref(false)
const isRuleEdit = ref(false)
const ruleEditId = ref(null)
const ruleForm = reactive({ name: '', reminder_type: 'followup_gap', notify_to: 'owner' })
const configForm = reactive({ days: 7, days_before: 30, days_no_contact: 30 })

const formatConfig = (type, configStr) => {
  try {
    const c = JSON.parse(configStr || '{}')
    if (type === 'followup_gap') return `超过${c.days}天未跟进`
    if (type === 'contract_expire') return `到期前${c.days_before}天`
    if (type === 'payment_due') return `到期前${c.days_before}天`
    if (type === 'inactive') return `${c.days_no_contact}天无联系`
    return configStr
  } catch { return configStr }
}

const onTypeChange = () => {
  Object.assign(configForm, { days: 7, days_before: 30, days_no_contact: 30 })
}

const fetchRules = async () => {
  try { const res = await request.get('/automation/smart-reminders'); if (res.code === 200) rules.value = res.data } catch (e) { /* */ }
}

const fetchPending = async () => {
  pendingLoading.value = true
  try {
    const res = await request.get('/automation/smart-reminders/pending')
    if (res.code === 200) { pendingList.value = res.data; pendingCount.value = res.data.length }
  } catch (e) { /* */ }
  finally { pendingLoading.value = false }
}

const handleCreateRule = () => {
  isRuleEdit.value = false; ruleEditId.value = null
  Object.assign(ruleForm, { name: '', reminder_type: 'followup_gap', notify_to: 'owner' })
  Object.assign(configForm, { days: 7, days_before: 30, days_no_contact: 30 })
  ruleDialogVisible.value = true
}

const handleEditRule = (row) => {
  isRuleEdit.value = true; ruleEditId.value = row.id
  Object.assign(ruleForm, { name: row.name, reminder_type: row.reminder_type, notify_to: row.notify_to || 'owner' })
  try { Object.assign(configForm, JSON.parse(row.config || '{}')) } catch { /* */ }
  ruleDialogVisible.value = true
}

const handleSaveRule = async () => {
  if (!ruleForm.name) { ElMessage.warning('请输入规则名称'); return }
  const config = { ...configForm }
  const data = { ...ruleForm, config: JSON.stringify(config) }
  try {
    let res
    if (isRuleEdit.value) res = await request.put(`/automation/smart-reminders/${ruleEditId.value}`, data)
    else res = await request.post('/automation/smart-reminders', data)
    if (res.code === 200) { ElMessage.success('保存成功'); ruleDialogVisible.value = false; fetchRules() }
  } catch (e) { /* */ }
}

const handleDeleteRule = (row) => {
  ElMessageBox.confirm(`确定删除规则"${row.name}"？`, '提示', { type: 'warning' }).then(async () => {
    const res = await request.delete(`/automation/smart-reminders/${row.id}`)
    if (res.code === 200) { ElMessage.success('已删除'); fetchRules() }
  }).catch(() => {})
}

const handleScan = async () => {
  scanLoading.value = true
  try {
    const res = await request.post('/automation/smart-reminders/run')
    if (res.code === 200) { ElMessage.success(res.message); fetchPending() }
  } finally { scanLoading.value = false }
}

const handleSeen = async (row) => {
  try {
    const res = await request.put(`/automation/smart-reminders/log/${row.id}/seen`)
    if (res.code === 200) { fetchPending() }
  } catch (e) { /* */ }
}

onMounted(() => { fetchRules(); fetchPending() })
</script>

<style scoped>
.page-container { padding: 0; }
.page-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: var(--space-4); }
.page-header h2 { margin: 0; font-size: 28px; font-weight: 600; color: var(--color-text); }
.stat-cards { display: grid; grid-template-columns: repeat(2, 1fr); gap: 16px; margin-bottom: var(--space-4); }
.stat-card { background: #fff; border-radius: 16px; padding: 24px; box-shadow: 0 2px 12px rgba(0,0,0,0.06); text-align: center; }
.stat-value { font-size: 28px; font-weight: 700; color: var(--color-text); }
.stat-label { font-size: 13px; color: var(--color-text-tertiary); margin-top: 4px; }
.toolbar { margin-bottom: var(--space-4); }
</style>
