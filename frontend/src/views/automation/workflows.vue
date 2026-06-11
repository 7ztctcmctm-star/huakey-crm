<template>
  <div class="page-container">
    <div class="page-header">
      <h2>工作流管理</h2>
      <el-button type="primary" :icon="Plus" @click="handleCreate">新建规则</el-button>
    </div>

    <!-- 统计 -->
    <div class="stat-cards">
      <div class="stat-card"><div class="stat-value">{{ list.length }}</div><div class="stat-label">总规则数</div></div>
      <div class="stat-card"><div class="stat-value">{{ list.filter(r => r.status === 1).length }}</div><div class="stat-label">启用中</div></div>
      <div class="stat-card"><div class="stat-value">{{ list.reduce((s, r) => s + (r.today_runs || 0), 0) }}</div><div class="stat-label">今日执行</div></div>
    </div>

    <!-- 规则列表 -->
    <el-card shadow="never">
      <el-table :data="list" stripe border v-loading="loading">
        <el-table-column prop="name" label="规则名称" min-width="160" show-overflow-tooltip />
        <el-table-column prop="trigger_event" label="触发事件" width="130" align="center">
          <template #default="{ row }"><el-tag :type="eventTag[row.trigger_event]" size="small">{{ eventName[row.trigger_event] }}</el-tag></template>
        </el-table-column>
        <el-table-column label="条件" width="60" align="center">
          <template #default="{ row }">{{ parseArr(row.conditions).length }}</template>
        </el-table-column>
        <el-table-column label="动作" width="60" align="center">
          <template #default="{ row }">{{ parseArr(row.actions).length }}</template>
        </el-table-column>
        <el-table-column label="状态" width="80" align="center">
          <template #default="{ row }"><el-switch v-model="row.status" :active-value="1" :inactive-value="0" @change="handleToggle(row)" /></template>
        </el-table-column>
        <el-table-column prop="run_count" label="执行次数" width="90" align="center" />
        <el-table-column prop="last_run_at" label="最后执行" width="160">
          <template #default="{ row }">{{ row.last_run_at || '-' }}</template>
        </el-table-column>
        <el-table-column label="操作" width="200" fixed="right">
          <template #default="{ row }">
            <el-button type="primary" link @click="handleEdit(row)">编辑</el-button>
            <el-button type="warning" link @click="handleTest(row)">测试</el-button>
            <el-button type="danger" link @click="handleDelete(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <!-- 日志 -->
    <el-card shadow="never" style="margin-top:20px">
      <template #header><span class="card-title">执行日志</span></template>
      <el-table :data="logs" stripe size="small" v-loading="logsLoading">
        <el-table-column prop="rule_name" label="规则" min-width="140" />
        <el-table-column prop="trigger_event" label="事件" width="120" />
        <el-table-column prop="action_type" label="动作" width="100" />
        <el-table-column prop="action_result" label="结果" width="80" align="center">
          <template #default="{ row }"><el-tag :type="row.action_result==='success'?'success':'danger'" size="small">{{ row.action_result }}</el-tag></template>
        </el-table-column>
        <el-table-column prop="action_detail" label="详情" min-width="200" show-overflow-tooltip />
        <el-table-column prop="create_time" label="时间" width="160" />
      </el-table>
    </el-card>

    <!-- 新增/编辑弹窗 -->
    <el-dialog v-model="dialogVisible" :title="isEdit ? '编辑规则' : '新建规则'" width="650px" top="5vh">
      <el-form :model="form" label-width="80px">
        <el-form-item label="规则名称"><el-input v-model="form.name" placeholder="输入规则名称" /></el-form-item>
        <el-form-item label="说明"><el-input v-model="form.description" placeholder="规则说明（可选）" /></el-form-item>
        <el-form-item label="触发事件">
          <el-select v-model="form.trigger_event" style="width:100%">
            <el-option v-for="(v, k) in eventName" :key="k" :label="v" :value="k" />
          </el-select>
        </el-form-item>

        <el-divider>条件配置</el-divider>
        <div v-for="(c, idx) in form.conditions" :key="idx" class="config-row">
          <el-select v-model="c.field" size="small" style="width:140px" placeholder="字段">
            <el-option v-for="f in conditionFields" :key="f.value" :label="f.label" :value="f.value" />
          </el-select>
          <el-select v-model="c.operator" size="small" style="width:120px">
            <el-option label="等于" value="equals" /><el-option label="不等于" value="not_equals" /><el-option label="大于" value="greater_than" /><el-option label="小于" value="less_than" />
          </el-select>
          <el-input v-model="c.value" size="small" style="width:140px" placeholder="值" />
          <el-button :icon="Delete" size="small" type="danger" link @click="form.conditions.splice(idx,1)" />
        </div>
        <el-button size="small" @click="form.conditions.push({field:'',operator:'equals',value:''})">添加条件</el-button>

        <el-divider>动作配置</el-divider>
        <div v-for="(a, idx) in form.actions" :key="'a'+idx" class="config-row">
          <el-select v-model="a.type" size="small" style="width:120px" placeholder="动作类型">
            <el-option label="分配给" value="assign" /><el-option label="发通知" value="notify" /><el-option label="添加标签" value="tag" /><el-option label="更新字段" value="update_field" /><el-option label="创建跟进" value="create_followup" />
          </el-select>
          <el-input v-model="a.params_str" size="small" style="width:300px" placeholder='参数JSON，如 {"user_id":5}' />
          <el-button :icon="Delete" size="small" type="danger" link @click="form.actions.splice(idx,1)" />
        </div>
        <el-button size="small" @click="addAction">添加动作</el-button>
      </el-form>
      <template #footer><el-button @click="dialogVisible=false">取消</el-button><el-button type="primary" :loading="saveLoading" @click="handleSave">保存</el-button></template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus, Delete } from '@element-plus/icons-vue'
import request from '@/utils/request'

const eventName = { customer_created: '新客户创建', contract_expiring: '合同即将到期', followup_overdue: '跟进超期', payment_overdue: '回款逾期', opportunity_stale: '商机停滞' }
const eventTag = { customer_created: '', contract_expiring: 'warning', followup_overdue: 'danger', payment_overdue: '', opportunity_stale: 'info' }

const conditionFieldsMap = {
  customer_created: [{ label: '来源', value: 'source' }, { label: '行业', value: 'industry' }, { label: '地区', value: 'address' }],
  contract_expiring: [{ label: '剩余天数', value: 'days_left' }],
  followup_overdue: [{ label: '逾期天数', value: 'days_overdue' }],
  payment_overdue: [{ label: '逾期天数', value: 'days_overdue' }],
  opportunity_stale: [{ label: '停滞天数', value: 'days_stale' }]
}
const conditionFields = computed(() => conditionFieldsMap[form.trigger_event] || [])

const parseArr = (v) => { try { const a = typeof v === 'string' ? JSON.parse(v) : v; return Array.isArray(a) ? a : [] } catch { return [] } }

const loading = ref(false)
const list = ref([])
const logs = ref([])
const logsLoading = ref(false)
const dialogVisible = ref(false)
const isEdit = ref(false)
const editId = ref(null)
const saveLoading = ref(false)
const form = reactive({ name: '', description: '', trigger_event: 'customer_created', conditions: [], actions: [] })

const fetchList = async () => {
  loading.value = true
  try { const res = await request.get('/automation/workflows'); if (res.code === 200) list.value = res.data } catch (e) { /* */ }
  finally { loading.value = false }
}

const fetchLogs = async () => {
  logsLoading.value = true
  try { const res = await request.get('/automation/workflows/logs', { params: { page: 1, page_size: 20 } }); if (res.code === 200) logs.value = res.data.list } catch (e) { /* */ }
  finally { logsLoading.value = false }
}

const addAction = () => { form.actions.push({ type: 'notify', params_str: '{"title":"通知","content":"内容"}' }) }

const handleCreate = () => {
  isEdit.value = false; editId.value = null
  Object.assign(form, { name: '', description: '', trigger_event: 'customer_created', conditions: [], actions: [{ type: 'notify', params_str: '{"title":"通知","content":"内容"}' }] })
  dialogVisible.value = true
}

const handleEdit = (row) => {
  isEdit.value = true; editId.value = row.id
  Object.assign(form, {
    name: row.name, description: row.description || '', trigger_event: row.trigger_event,
    conditions: parseArr(row.conditions).map(c => ({ ...c, value: String(c.value || '') })),
    actions: parseArr(row.actions).map(a => ({ type: a.type, params_str: JSON.stringify(a.params || {}) }))
  })
  dialogVisible.value = true
}

const handleSave = async () => {
  if (!form.name) { ElMessage.warning('请输入规则名称'); return }
  saveLoading.value = true
  try {
    const actions = form.actions.map(a => ({ type: a.type, params: JSON.parse(a.params_str || '{}') }))
    const data = { ...form, actions, conditions: form.conditions.filter(c => c.field) }
    let res
    if (isEdit.value) res = await request.put(`/automation/workflows/${editId.value}`, data)
    else res = await request.post('/automation/workflows', data)
    if (res.code === 200) { ElMessage.success('保存成功'); dialogVisible.value = false; fetchList() }
  } catch (e) { ElMessage.error('参数格式错误') }
  finally { saveLoading.value = false }
}

const handleToggle = async (row) => {
  try { await request.post(`/automation/workflows/${row.id}/toggle`) } catch { row.status = row.status === 1 ? 0 : 1 }
}

const handleDelete = (row) => {
  ElMessageBox.confirm(`确定删除规则"${row.name}"？`, '提示', { type: 'warning' }).then(async () => {
    const res = await request.delete(`/automation/workflows/${row.id}`)
    if (res.code === 200) { ElMessage.success('已删除'); fetchList() }
  }).catch(() => {})
}

const handleTest = (row) => {
  ElMessageBox.prompt('输入目标客户ID', '手动执行', { inputPattern: /^\d+$/, inputErrorMessage: '请输入数字' }).then(async ({ value }) => {
    const res = await request.post('/automation/workflows/execute', { rule_id: row.id, target_type: 'customer', target_id: parseInt(value) })
    if (res.code === 200) { ElMessage.success('执行完成'); fetchLogs() }
  }).catch(() => {})
}

onMounted(() => { fetchList(); fetchLogs() })
</script>

<style scoped>
.page-container { padding: 0; }
.page-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: var(--space-4); }
.page-header h2 { margin: 0; font-size: 28px; font-weight: 600; color: var(--color-text); }
.stat-cards { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; margin-bottom: var(--space-4); }
.stat-card { background: #fff; border-radius: 16px; padding: 24px; box-shadow: 0 2px 12px rgba(0,0,0,0.06); text-align: center; }
.stat-value { font-size: 28px; font-weight: 700; color: var(--color-text); }
.stat-label { font-size: 13px; color: var(--color-text-tertiary); margin-top: 4px; }
.card-title { font-size: 15px; font-weight: 600; }
.config-row { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }
</style>
