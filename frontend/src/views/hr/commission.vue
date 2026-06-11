<template>
  <div class="page-container">
    <div class="page-header"><h2>佣金管理</h2></div>

    <!-- 统计卡片 -->
    <div class="stat-cards">
      <div class="stat-card" v-for="s in statCards" :key="s.key">
        <div class="stat-value">{{ s.value }}</div>
        <div class="stat-label">{{ s.label }}</div>
      </div>
    </div>

    <el-tabs v-model="activeTab">
      <!-- 佣金计算 -->
      <el-tab-pane label="佣金计算" name="calc">
        <el-card shadow="never">
          <div class="toolbar">
            <el-date-picker v-model="calcMonth" type="month" placeholder="选择月份" value-format="YYYY-MM" style="width:160px" />
            <el-button type="primary" :loading="calcLoading" @click="handleCalculate" style="margin-left:8px">计算佣金</el-button>
            <el-button v-if="calcResults.length > 0" type="success" @click="handleBatchConfirm(calcResults.map(r => r.id))" style="margin-left:8px">全部确认</el-button>
          </div>
          <el-table :data="calcResults" stripe border v-if="calcResults.length > 0">
            <el-table-column prop="real_name" label="销售人员" width="120" />
            <el-table-column prop="contract_amount" label="合同金额" width="120" align="right">
              <template #default="{ row }">¥{{ Number(row.contract_amount).toLocaleString() }}</template>
            </el-table-column>
            <el-table-column prop="base_amount" label="计算基数" width="120" align="right">
              <template #default="{ row }">¥{{ Number(row.base_amount).toLocaleString() }}</template>
            </el-table-column>
            <el-table-column prop="rate" label="比例" width="80" align="center">
              <template #default="{ row }">{{ row.rate }}%</template>
            </el-table-column>
            <el-table-column prop="commission_amount" label="佣金金额" width="120" align="right">
              <template #default="{ row }"><span style="color:#059669;font-weight:600">¥{{ Number(row.commission_amount).toLocaleString() }}</span></template>
            </el-table-column>
          </el-table>
          <el-empty v-else description="选择月份后点击计算" :image-size="60" />
        </el-card>
      </el-tab-pane>

      <!-- 佣金记录 -->
      <el-tab-pane label="佣金记录" name="records">
        <el-card shadow="never">
          <div class="toolbar">
            <el-date-picker v-model="recordMonth" type="month" placeholder="月份" value-format="YYYY-MM" clearable style="width:140px" @change="fetchRecords" />
            <el-select v-model="recordStatus" placeholder="状态" clearable style="width:120px;margin-left:8px" @change="fetchRecords">
              <el-option label="已计算" value="calculated" /><el-option label="已确认" value="confirmed" /><el-option label="已发放" value="paid" />
            </el-select>
            <el-button type="success" :disabled="selectedIds.length===0" @click="handleBatchConfirm(selectedIds)" style="margin-left:8px">批量确认</el-button>
            <el-button type="warning" :disabled="selectedIds.length===0" @click="handleBatchPay(selectedIds)" style="margin-left:8px">批量发放</el-button>
          </div>
          <el-table :data="records" stripe border v-loading="recordsLoading" @selection-change="onSelectionChange">
            <el-table-column type="expand">
              <template #default="{ row }">
                <div style="padding: 12px 20px; background: #fafafa;">
                  <el-descriptions :column="3" size="small" border>
                    <el-descriptions-item label="来源类型">{{ row.business_type === 'contract' ? '合同' : '回款' }}</el-descriptions-item>
                    <el-descriptions-item label="来源单据">{{ row.business_no || '-' }}</el-descriptions-item>
                    <el-descriptions-item label="客户名称">{{ row.customer_name || '-' }}</el-descriptions-item>
                    <el-descriptions-item label="基数金额">¥{{ Number(row.base_amount).toLocaleString() }}</el-descriptions-item>
                    <el-descriptions-item label="佣金比例">{{ row.commission_rate }}%</el-descriptions-item>
                    <el-descriptions-item label="计算过程">¥{{ Number(row.base_amount).toLocaleString() }} × {{ row.commission_rate }}% = ¥{{ Number(row.commission_amount).toLocaleString() }}</el-descriptions-item>
                  </el-descriptions>
                </div>
              </template>
            </el-table-column>
            <el-table-column type="selection" width="50" />
            <el-table-column prop="user_name" label="销售人员" width="120" />
            <el-table-column prop="business_type" label="类型" width="80" align="center">
              <template #default="{ row }"><el-tag size="small">{{ row.business_type === 'contract' ? '合同' : '回款' }}</el-tag></template>
            </el-table-column>
            <el-table-column prop="business_no" label="来源单据" width="140" show-overflow-tooltip />
            <el-table-column prop="customer_name" label="客户" min-width="140" show-overflow-tooltip />
            <el-table-column prop="base_amount" label="基数" width="120" align="right">
              <template #default="{ row }">¥{{ Number(row.base_amount).toLocaleString() }}</template>
            </el-table-column>
            <el-table-column prop="commission_rate" label="比例" width="80" align="center">
              <template #default="{ row }">{{ row.commission_rate }}%</template>
            </el-table-column>
            <el-table-column prop="commission_amount" label="佣金" width="120" align="right">
              <template #default="{ row }"><span style="font-weight:600">¥{{ Number(row.commission_amount).toLocaleString() }}</span></template>
            </el-table-column>
            <el-table-column prop="period" label="归属月份" width="100" align="center" />
            <el-table-column prop="status" label="状态" width="90" align="center">
              <template #default="{ row }">
                <el-tag :type="statusTag[row.status]" size="small">{{ statusName[row.status] }}</el-tag>
              </template>
            </el-table-column>
          </el-table>
          <div class="pagination"><el-pagination v-model:current-page="recordPage" :page-size="20" :total="recordTotal" layout="total,prev,pager,next" @current-change="fetchRecords" /></div>
        </el-card>
      </el-tab-pane>

      <!-- 佣金规则 -->
      <el-tab-pane label="佣金规则" name="rules">
        <el-card shadow="never">
          <div class="toolbar"><el-button type="primary" @click="handleCreateRule">新增规则</el-button></div>
          <el-table :data="rules" stripe border>
            <el-table-column prop="name" label="规则名称" min-width="160" />
            <el-table-column prop="rule_type" label="类型" width="100" align="center">
              <template #default="{ row }">{{ {fixed:'固定比例',tiered:'阶梯比例',amount:'固定金额'}[row.rule_type] }}</template>
            </el-table-column>
            <el-table-column prop="apply_to" label="适用" width="80" align="center">
              <template #default="{ row }">{{ row.apply_to === 'contract' ? '合同' : '回款' }}</template>
            </el-table-column>
            <el-table-column label="状态" width="80" align="center">
              <template #default="{ row }"><el-tag :type="row.status?'success':'info'" size="small">{{ row.status?'启用':'禁用' }}</el-tag></template>
            </el-table-column>
            <el-table-column label="操作" width="140">
              <template #default="{ row }">
                <el-button type="primary" link @click="handleEditRule(row)">编辑</el-button>
                <el-button type="danger" link @click="handleDeleteRule(row)">删除</el-button>
              </template>
            </el-table-column>
          </el-table>
        </el-card>
      </el-tab-pane>
    </el-tabs>

    <!-- 规则弹窗 -->
    <el-dialog v-model="ruleDialogVisible" :title="isRuleEdit ? '编辑规则' : '新增规则'" width="500px">
      <el-form :model="ruleForm" label-width="80px">
        <el-form-item label="规则名称"><el-input v-model="ruleForm.name" /></el-form-item>
        <el-form-item label="规则类型">
          <el-select v-model="ruleForm.rule_type" style="width:100%">
            <el-option label="固定比例" value="fixed" /><el-option label="阶梯比例" value="tiered" /><el-option label="固定金额" value="amount" />
          </el-select>
        </el-form-item>
        <el-form-item label="适用对象">
          <el-select v-model="ruleForm.apply_to" style="width:100%">
            <el-option label="合同金额" value="contract" /><el-option label="回款金额" value="payment" />
          </el-select>
        </el-form-item>
        <el-form-item v-if="ruleForm.rule_type === 'fixed'" label="佣金比例%">
          <el-input-number v-model="ruleForm.rate" :min="0" :max="100" :precision="2" style="width:100%" controls-position="right" />
        </el-form-item>
        <el-form-item v-if="ruleForm.rule_type === 'amount'" label="每笔金额">
          <el-input-number v-model="ruleForm.per_unit" :min="0" :precision="2" style="width:100%" controls-position="right" />
        </el-form-item>
        <el-form-item label="备注"><el-input v-model="ruleForm.remark" /></el-form-item>
      </el-form>
      <template #footer><el-button @click="ruleDialogVisible=false">取消</el-button><el-button type="primary" @click="handleSaveRule">保存</el-button></template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import request from '@/utils/request'

const statusName = { calculated: '已计算', confirmed: '已确认', paid: '已发放' }
const statusTag = { calculated: '', confirmed: 'warning', paid: 'success' }

const activeTab = ref('calc')
const stats = ref({ pending: 0, confirmed: 0, paid: 0, year_total: 0 })
const statCards = computed(() => [
  { key: 'pending', label: '本月待确认', value: '¥' + Number(stats.value.pending).toLocaleString() },
  { key: 'confirmed', label: '本月已确认', value: '¥' + Number(stats.value.confirmed).toLocaleString() },
  { key: 'paid', label: '本月已发放', value: '¥' + Number(stats.value.paid).toLocaleString() },
  { key: 'year', label: '本年佣金', value: '¥' + Number(stats.value.year_total).toLocaleString() }
])

// 计算
const calcMonth = ref('')
const calcLoading = ref(false)
const calcResults = ref([])
const handleCalculate = async () => {
  if (!calcMonth.value) { ElMessage.warning('请选择月份'); return }
  calcLoading.value = true
  try {
    const res = await request.post('/hr/commission/calculate', { period: calcMonth.value })
    if (res.code === 200) { calcResults.value = res.data.results; ElMessage.success(`计算完成，${res.data.count}人`); fetchStats() }
  } finally { calcLoading.value = false }
}

// 记录
const recordMonth = ref('')
const recordStatus = ref('')
const records = ref([])
const recordTotal = ref(0)
const recordPage = ref(1)
const recordsLoading = ref(false)
const selectedIds = ref([])

const fetchRecords = async () => {
  recordsLoading.value = true
  try {
    const params = { page: recordPage.value, page_size: 20 }
    if (recordMonth.value) params.period = recordMonth.value
    if (recordStatus.value) params.status = recordStatus.value
    const res = await request.get('/hr/commission/records', { params })
    if (res.code === 200) { records.value = res.data.list; recordTotal.value = res.data.total }
  } catch (e) { /* */ }
  finally { recordsLoading.value = false }
}

const onSelectionChange = (rows) => { selectedIds.value = rows.map(r => r.id) }

const handleBatchConfirm = async (ids) => {
  if (ids.length === 0) return
  try {
    const res = await request.post('/hr/commission/records/batch-confirm', { ids })
    if (res.code === 200) { ElMessage.success('确认成功'); fetchRecords(); fetchStats() }
  } catch (e) { /* */ }
}

const handleBatchPay = async (ids) => {
  if (ids.length === 0) return
  try {
    const res = await request.post('/hr/commission/records/batch-pay', { ids })
    if (res.code === 200) { ElMessage.success('发放成功'); fetchRecords(); fetchStats() }
  } catch (e) { /* */ }
}

// 规则
const rules = ref([])
const ruleDialogVisible = ref(false)
const isRuleEdit = ref(false)
const ruleEditId = ref(null)
const ruleForm = reactive({ name: '', rule_type: 'fixed', apply_to: 'contract', rate: 3, per_unit: 500, remark: '' })

const fetchRules = async () => {
  try { const res = await request.get('/hr/commission/rules'); if (res.code === 200) rules.value = res.data } catch (e) { /* */ }
}

const handleCreateRule = () => {
  isRuleEdit.value = false; ruleEditId.value = null
  Object.assign(ruleForm, { name: '', rule_type: 'fixed', apply_to: 'contract', rate: 3, per_unit: 500, remark: '' })
  ruleDialogVisible.value = true
}

const handleEditRule = (row) => {
  isRuleEdit.value = true; ruleEditId.value = row.id
  let rate = 3, per_unit = 500
  try { const c = JSON.parse(row.config); rate = c.rate || 3; per_unit = c.per_unit || 500 } catch { /* */ }
  Object.assign(ruleForm, { name: row.name, rule_type: row.rule_type, apply_to: row.apply_to, rate, per_unit, remark: row.remark || '' })
  ruleDialogVisible.value = true
}

const handleSaveRule = async () => {
  let config
  if (ruleForm.rule_type === 'fixed') config = JSON.stringify({ rate: ruleForm.rate })
  else if (ruleForm.rule_type === 'amount') config = JSON.stringify({ per_unit: ruleForm.per_unit })
  else config = JSON.stringify({ tiers: [] })

  const data = { name: ruleForm.name, rule_type: ruleForm.rule_type, apply_to: ruleForm.apply_to, config, remark: ruleForm.remark }
  try {
    let res
    if (isRuleEdit.value) res = await request.put(`/hr/commission/rules/${ruleEditId.value}`, data)
    else res = await request.post('/hr/commission/rules', data)
    if (res.code === 200) { ElMessage.success('保存成功'); ruleDialogVisible.value = false; fetchRules() }
  } catch (e) { /* */ }
}

const handleDeleteRule = (row) => {
  ElMessageBox.confirm(`确定删除规则"${row.name}"？`, '提示', { type: 'warning' }).then(async () => {
    const res = await request.delete(`/hr/commission/rules/${row.id}`)
    if (res.code === 200) { ElMessage.success('已删除'); fetchRules() }
  }).catch(() => {})
}

const fetchStats = async () => {
  try { const res = await request.get('/hr/commission/stats'); if (res.code === 200) stats.value = res.data } catch (e) { /* */ }
}

onMounted(() => { fetchStats(); fetchRecords(); fetchRules() })
</script>

<style scoped>
.page-container { padding: 0; }
.page-header { margin-bottom: var(--space-4); }
.page-header h2 { margin: 0; font-size: 28px; font-weight: 600; color: var(--color-text); }
.stat-cards { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; margin-bottom: var(--space-4); }
.stat-card { background: #fff; border-radius: 16px; padding: 24px; box-shadow: 0 2px 12px rgba(0,0,0,0.06); text-align: center; }
.stat-value { font-size: 24px; font-weight: 700; color: var(--color-text); }
.stat-label { font-size: 13px; color: var(--color-text-tertiary); margin-top: 4px; }
.toolbar { display: flex; align-items: center; margin-bottom: var(--space-4); }
.pagination { display: flex; justify-content: flex-end; margin-top: var(--space-4); }
</style>
