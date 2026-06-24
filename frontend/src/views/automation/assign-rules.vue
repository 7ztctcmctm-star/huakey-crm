<template>
  <div class="page-container">
    <div class="page-header">
      <h2>自动分配规则</h2>
      <div>
        <el-button type="success" @click="handleApply">手动分配</el-button>
        <el-button type="primary" :icon="Plus" @click="handleCreate">新建规则</el-button>
      </div>
    </div>

    <el-card shadow="never">
      <el-table :data="list" stripe border v-loading="loading">
        <el-table-column prop="rule_name" label="规则名称" min-width="160" />
        <el-table-column prop="assign_type" label="分配方式" width="100" align="center">
          <template #default="{ row }"><el-tag :type="typeTag[row.assign_type]" size="small">{{ typeName[row.assign_type] }}</el-tag></template>
        </el-table-column>
        <el-table-column label="适用条件" min-width="140">
          <template #default="{ row }">
            <span v-if="row.assign_type === 'by_source'">来源 = {{ row.source_value }}</span>
            <span v-else-if="row.assign_type === 'by_region'">地区含 {{ row.region_value }}</span>
            <span v-else>全部客户</span>
          </template>
        </el-table-column>
        <el-table-column label="分配人员" min-width="200">
          <template #default="{ row }">{{ formatUsers(row.user_ids) }}</template>
        </el-table-column>
        <el-table-column prop="priority" label="优先级" width="80" align="center" />
        <el-table-column label="状态" width="80" align="center">
          <template #default="{ row }"><el-tag :type="row.is_active?'success':'info'" size="small">{{ row.is_active?'启用':'禁用' }}</el-tag></template>
        </el-table-column>
        <el-table-column label="操作" width="140" fixed="right">
          <template #default="{ row }">
            <el-button type="primary" link @click="handleEdit(row)">编辑</el-button>
            <el-button type="danger" link @click="handleDelete(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <!-- 新增/编辑弹窗 -->
    <el-dialog v-model="dialogVisible" :title="isEdit ? '编辑规则' : '新建规则'" width="550px">
      <el-form :model="form" label-width="80px">
        <el-form-item label="规则名称"><el-input v-model="form.rule_name" /></el-form-item>
        <el-form-item label="分配方式">
          <el-select v-model="form.assign_type" style="width:100%">
            <el-option label="轮询（依次分配）" value="round_robin" />
            <el-option label="按来源" value="by_source" />
            <el-option label="按区域" value="by_region" />
          </el-select>
        </el-form-item>
        <el-form-item v-if="form.assign_type === 'by_source'" label="来源值"><el-input v-model="form.source_value" placeholder="如：展会、官网" /></el-form-item>
        <el-form-item v-if="form.assign_type === 'by_region'" label="区域值"><el-input v-model="form.region_value" placeholder="如：华东、广东" /></el-form-item>
        <el-form-item label="分配人员">
          <el-select v-model="form.user_ids" multiple style="width:100%" placeholder="选择销售人员">
            <el-option v-for="u in userOptions" :key="u.id" :label="u.real_name" :value="u.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="优先级"><el-input-number v-model="form.priority" :min="0" style="width:100%" controls-position="right" /></el-form-item>
      </el-form>
      <template #footer><el-button @click="dialogVisible=false">取消</el-button><el-button type="primary" :loading="saveLoading" @click="handleSave">保存</el-button></template>
    </el-dialog>

    <!-- 手动分配弹窗 -->
    <el-dialog v-model="applyVisible" title="手动分配" width="400px">
      <el-form label-width="80px">
        <el-form-item label="选择客户">
          <el-select v-model="applyCustomerIds" multiple filterable style="width:100%" placeholder="选择要分配的客户">
            <el-option v-for="c in customerOptions" :key="c.id" :label="c.company_name" :value="c.id" />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer><el-button @click="applyVisible=false">取消</el-button><el-button type="primary" :loading="applyLoading" @click="handleApplySubmit">分配</el-button></template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus } from '@element-plus/icons-vue'
import { getAutomationAssignRules, saveAutomationAssignRule, applyAutomationAssignRule, deleteAutomationAssignRule } from '@/api/tools'
import { getSalesUsers, getCustomerList } from '@/api/customer'

const typeName = { round_robin: '轮询', by_source: '按来源', by_region: '按区域' }
const typeTag = { round_robin: '', by_source: 'success', by_region: 'warning' }

const loading = ref(false)
const list = ref([])
const userOptions = ref([])
const customerOptions = ref([])

const dialogVisible = ref(false)
const isEdit = ref(false)
const editId = ref(null)
const saveLoading = ref(false)
const form = reactive({ rule_name: '', assign_type: 'round_robin', source_value: '', region_value: '', user_ids: [], priority: 0 })

const applyVisible = ref(false)
const applyCustomerIds = ref([])
const applyLoading = ref(false)

const formatUsers = (v) => {
  try { const ids = JSON.parse(v || '[]'); return ids.map(id => { const u = userOptions.value.find(u => u.id === id); return u ? u.real_name : `ID:${id}`; }).join('、 ') } catch { return '-' }
}

const fetchList = async () => {
  loading.value = true
  try { const res = await getAutomationAssignRules(); if (res.code === 200) list.value = res.data } catch (e) { /* */ }
  finally { loading.value = false }
}

const fetchUsers = async () => {
  try { const res = await getSalesUsers(); if (res.code === 200) userOptions.value = res.data } catch (e) { /* */ }
}

const fetchCustomers = async () => {
  try { const res = await getCustomerList({ page: 1, pageSize: 200 }); if (res.code === 200) customerOptions.value = res.data.list } catch (e) { /* */ }
}

const handleCreate = () => {
  isEdit.value = false; editId.value = null
  Object.assign(form, { rule_name: '', assign_type: 'round_robin', source_value: '', region_value: '', user_ids: [], priority: 0 })
  dialogVisible.value = true
}

const handleEdit = (row) => {
  isEdit.value = true; editId.value = row.id
  let userIds = []
  try { userIds = JSON.parse(row.user_ids || '[]') } catch { /* */ }
  Object.assign(form, { rule_name: row.rule_name, assign_type: row.assign_type, source_value: row.source_value || '', region_value: row.region_value || '', user_ids: userIds, priority: row.priority || 0 })
  dialogVisible.value = true
}

const handleSave = async () => {
  if (!form.rule_name) { ElMessage.warning('请输入规则名称'); return }
  saveLoading.value = true
  try {
    const data = { ...form, user_ids: JSON.stringify(form.user_ids) }
    let res
    if (isEdit.value) res = await saveAutomationAssignRule({ id: editId.value, ...data })
    else res = await saveAutomationAssignRule(data)
    if (res.code === 200) { ElMessage.success('保存成功'); dialogVisible.value = false; fetchList() }
  } finally { saveLoading.value = false }
}

const handleDelete = (row) => {
  ElMessageBox.confirm(`确定删除规则"${row.rule_name}"？`, '提示', { type: 'warning' }).then(async () => {
    const res = await deleteAutomationAssignRule(row.id)
    if (res.code === 200) { ElMessage.success('已删除'); fetchList() }
  }).catch(() => {})
}

const handleApply = () => { applyCustomerIds.value = []; applyVisible.value = true }
const handleApplySubmit = async () => {
  if (applyCustomerIds.value.length === 0) { ElMessage.warning('请选择客户'); return }
  applyLoading.value = true
  try {
    const res = await applyAutomationAssignRule(applyCustomerIds.value)
    if (res.code === 200) { ElMessage.success('分配完成'); applyVisible.value = false }
  } finally { applyLoading.value = false }
}

onMounted(() => { fetchList(); fetchUsers(); fetchCustomers() })
</script>

<style scoped>
.page-container { padding: 0; }
.page-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: var(--space-4); }
.page-header h2 { margin: 0; font-size: 28px; font-weight: 600; color: var(--color-text); }
</style>
