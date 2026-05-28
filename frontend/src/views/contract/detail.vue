<template>
  <div class="contract-detail">
    <div class="detail-header">
      <el-button :icon="ArrowLeft" @click="goBack">返回列表</el-button>
      <span class="page-title">合同详情 — {{ detail.contract_no }}</span>
    </div>

    <el-card shadow="never" v-loading="loading">
      <el-descriptions :column="2" border>
        <el-descriptions-item label="合同编号">{{ detail.contract_no }}</el-descriptions-item>
        <el-descriptions-item label="客户">{{ detail.customer_name }}</el-descriptions-item>
        <el-descriptions-item label="合同金额">¥{{ fmt(detail.amount) }}</el-descriptions-item>
        <el-descriptions-item label="已回款">¥{{ fmt(detail.paid_amount || 0) }}</el-descriptions-item>
        <el-descriptions-item label="签订日期">{{ detail.sign_date || '-' }}</el-descriptions-item>
        <el-descriptions-item label="交付日期">{{ detail.delivery_date || '-' }}</el-descriptions-item>
        <el-descriptions-item label="状态">
          <el-tag :type="statusType(detail.status)" size="small">{{ statusText(detail.status) }}</el-tag>
        </el-descriptions-item>
        <el-descriptions-item label="付款条款">{{ detail.payment_terms || '-' }}</el-descriptions-item>
        <el-descriptions-item label="备注" :span="2">{{ detail.remark || '-' }}</el-descriptions-item>
      </el-descriptions>
    </el-card>

    <el-card shadow="never" style="margin-top: 16px">
      <template #header><span class="card-title">回款计划</span></template>
      <el-table :data="detail.plans || []" border size="small">
        <el-table-column prop="plan_date" label="计划日期" width="120" />
        <el-table-column prop="plan_amount" label="计划金额" width="130" align="right">
          <template #default="{ row }">¥{{ fmt(row.plan_amount) }}</template>
        </el-table-column>
        <el-table-column prop="paid_amount" label="已回金额" width="130" align="right">
          <template #default="{ row }">¥{{ fmt(row.paid_amount) }}</template>
        </el-table-column>
        <el-table-column prop="status" label="状态" width="100" align="center">
          <template #default="{ row }">
            <el-tag :type="planStatusType(row.status)" size="small">{{ planStatusText(row.status) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="overdue_days" label="逾期天数" width="100" align="center">
          <template #default="{ row }">
            <span v-if="row.overdue_days > 0" style="color: #f56c6c">{{ row.overdue_days }}天</span>
            <span v-else>-</span>
          </template>
        </el-table-column>
        <el-table-column prop="remark" label="备注" />
      </el-table>
      <el-empty v-if="!detail.plans || detail.plans.length === 0" description="暂无回款计划" :image-size="60" />
      <div v-if="detail.plans && detail.plans.length > 0" class="plan-summary">
        <span>总计划: ¥{{ fmt(planTotal) }}</span>
        <span>总已回: ¥{{ fmt(planPaid) }}</span>
        <span>剩余: ¥{{ fmt(planTotal - planPaid) }}</span>
        <span>完成率: <el-tag :type="planRate >= 100 ? 'success' : planRate >= 60 ? 'warning' : 'danger'" size="small">{{ planRate }}%</el-tag></span>
      </div>
    </el-card>

    <el-card shadow="never" style="margin-top: 16px">
      <template #header>
        <div class="card-header">
          <span class="card-title">回款记录</span>
          <el-button type="primary" size="small" :icon="Plus" @click="showAddPayment = true">登记回款</el-button>
        </div>
      </template>
      <el-table :data="detail.payments || []" border size="small">
        <el-table-column prop="pay_date" label="回款日期" width="120" />
        <el-table-column prop="pay_amount" label="回款金额" width="130" align="right">
          <template #default="{ row }">¥{{ fmt(row.pay_amount) }}</template>
        </el-table-column>
        <el-table-column prop="pay_method" label="方式" width="100" />
        <el-table-column label="关联计划" width="120">
          <template #default="{ row }">{{ row.plan_date ? row.plan_date + ' / ¥' + fmt(row.plan_amount) : '-' }}</template>
        </el-table-column>
        <el-table-column prop="remark" label="备注" />
        <el-table-column label="操作" width="80">
          <template #default="{ row }">
            <el-button type="danger" link size="small" @click="deletePayment(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
      <el-empty v-if="!detail.payments || detail.payments.length === 0" description="暂无回款记录" :image-size="60" />
    </el-card>

    <!-- 登记回款 -->
    <el-dialog v-model="showAddPayment" title="登记回款" width="450px">
      <el-form ref="payFormRef" :model="payForm" :rules="payRules" label-width="90px">
        <el-form-item label="回款日期" prop="pay_date">
          <el-date-picker v-model="payForm.pay_date" type="date" placeholder="日期" style="width:100%" value-format="YYYY-MM-DD" />
        </el-form-item>
        <el-form-item label="回款金额" prop="pay_amount">
          <el-input-number v-model="payForm.pay_amount" :min="0" :precision="2" style="width:100%" controls-position="right" />
        </el-form-item>
        <el-form-item label="付款方式">
          <el-input v-model="payForm.pay_method" placeholder="如：银行转账" />
        </el-form-item>
        <el-form-item label="备注">
          <el-input v-model="payForm.remark" placeholder="备注" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showAddPayment = false">取消</el-button>
        <el-button type="primary" :loading="payLoading" @click="submitPayment">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { ArrowLeft, Plus } from '@element-plus/icons-vue'
import request from '@/utils/request'
import { recordVisit } from '@/composables/useRecentVisit'

const route = useRoute()
const router = useRouter()

const loading = ref(false)
const detail = ref({})
const showAddPayment = ref(false)
const payLoading = ref(false)
const payFormRef = ref(null)
const payForm = reactive({ pay_date: '', pay_amount: 0, pay_method: '', remark: '' })
const payRules = {
  pay_date: [{ required: true, message: '请选择日期', trigger: 'change' }],
  pay_amount: [{ required: true, message: '请输入金额', trigger: 'blur' }]
}

const fmt = (v) => {
  if (!v && v !== 0) return '0.00'
  return parseFloat(v).toLocaleString('zh-CN', { minimumFractionDigits: 2 })
}
const statusType = (s) => ({ 1: 'info', 2: '', 3: 'success', 4: 'danger' }[s] || 'info')
const statusText = (s) => ({ 1: '待执行', 2: '执行中', 3: '已完成', 4: '已取消' }[s] || '未知')
const planStatusType = (s) => ({ pending: 'info', partial: 'warning', completed: 'success', overdue: 'danger' }[s] || 'info')
const planStatusText = (s) => ({ pending: '待回款', partial: '部分回款', completed: '已完成', overdue: '已逾期' }[s] || '未知')

const planTotal = computed(() => (detail.value.plans || []).reduce((s, p) => s + parseFloat(p.plan_amount || 0), 0))
const planPaid = computed(() => (detail.value.plans || []).reduce((s, p) => s + parseFloat(p.paid_amount || 0), 0))
const planRate = computed(() => planTotal.value > 0 ? Math.round((planPaid.value / planTotal.value) * 100) : 0)

const goBack = () => router.push('/contract')

const fetchDetail = async () => {
  loading.value = true
  try {
    const r = await request.get(`/contract/detail/${route.params.id}`)
    if (r.code === 200) {
      detail.value = r.data
      // 记录最近访问
      recordVisit('contract', parseInt(route.params.id), r.data.contract_no || `合同#${route.params.id}`)
    }
  } catch {
    ElMessage.error('加载详情失败')
  } finally {
    loading.value = false
  }
}

const submitPayment = async () => {
  if (!payFormRef.value) return
  await payFormRef.value.validate(async (valid) => {
    if (!valid) return
    payLoading.value = true
    try {
      const r = await request.post('/contract/payment/add', { contract_id: detail.value.id, ...payForm })
      if (r.code === 200) {
        ElMessage.success('登记成功')
        showAddPayment.value = false
        Object.assign(payForm, { pay_date: '', pay_amount: 0, pay_method: '', remark: '' })
        fetchDetail()
      } else {
        ElMessage.error(r.message || '登记失败')
      }
    } catch {
      ElMessage.error('登记失败')
    } finally {
      payLoading.value = false
    }
  })
}

const deletePayment = (row) => {
  ElMessageBox.confirm('确定删除该回款记录吗？', '提示', { type: 'warning' }).then(async () => {
    const r = await request.post('/contract/payment/delete', { id: row.id })
    if (r.code === 200) { ElMessage.success('已删除'); fetchDetail() }
    else { ElMessage.error(r.message || '删除失败') }
  }).catch(() => {})
}

onMounted(() => { fetchDetail() })
</script>

<style scoped>
.contract-detail { padding: 24px; }
.detail-header { display: flex; align-items: center; margin-bottom: 24px; gap: 16px; }
.page-title { font-size: 18px; font-weight: 500; color: var(--c-text); }
.card-title { font-weight: 500; }
.card-header { display: flex; justify-content: space-between; align-items: center; }
.plan-summary { display: flex; gap: 24px; margin-top: 12px; padding: 12px; background: #fafafa; border-radius: 4px; font-size: 14px; color: var(--c-text-secondary); }
.plan-summary span { white-space: nowrap; }
</style>
