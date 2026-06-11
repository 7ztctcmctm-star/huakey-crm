<template>
  <div class="page-container" v-loading="loading">
    <div class="page-header">
      <div>
        <el-button text :icon="ArrowLeft" @click="$router.push('/procurement/plan')">返回</el-button>
        <span class="page-title">{{ plan.plan_no }}</span>
        <el-tag :type="statusTag[plan.status]" size="small" style="margin-left:8px">{{ statusName[plan.status] }}</el-tag>
      </div>
      <div>
        <el-button v-if="plan.status==='draft'" type="success" @click="handleSubmit">提交审批</el-button>
        <el-button v-if="plan.status==='submitted'" type="warning" @click="handleApprove">批准</el-button>
        <el-button v-if="plan.status==='approved'" type="primary" @click="handleConvert">转采购单</el-button>
      </div>
    </div>

    <!-- 基本信息 -->
    <el-card shadow="never" style="margin-bottom:20px">
      <template #header><span class="card-title">基本信息</span></template>
      <el-descriptions :column="3" border>
        <el-descriptions-item label="计划编号">{{ plan.plan_no }}</el-descriptions-item>
        <el-descriptions-item label="计划名称">{{ plan.name }}</el-descriptions-item>
        <el-descriptions-item label="状态">{{ statusName[plan.status] }}</el-descriptions-item>
        <el-descriptions-item label="总金额">¥{{ Number(plan.total_amount || 0).toLocaleString() }}</el-descriptions-item>
        <el-descriptions-item label="创建人">{{ plan.create_by_name }}</el-descriptions-item>
        <el-descriptions-item label="创建时间">{{ plan.create_time }}</el-descriptions-item>
        <el-descriptions-item label="审批人">{{ plan.approved_by_name || '-' }}</el-descriptions-item>
        <el-descriptions-item label="审批时间">{{ plan.approved_at || '-' }}</el-descriptions-item>
        <el-descriptions-item label="备注">{{ plan.remark || '-' }}</el-descriptions-item>
      </el-descriptions>
    </el-card>

    <!-- 计划明细 -->
    <el-card shadow="never">
      <template #header><span class="card-title">计划明细（{{ (plan.items || []).length }} 项）</span></template>
      <el-table :data="plan.items || []" stripe border>
        <el-table-column prop="product_name" label="产品名称" min-width="160" />
        <el-table-column prop="product_code" label="编码" width="120" />
        <el-table-column prop="supplier_name" label="建议供应商" width="140">
          <template #default="{ row }">{{ row.supplier_name || '-' }}</template>
        </el-table-column>
        <el-table-column prop="quantity" label="数量" width="80" align="center" />
        <el-table-column prop="unit" label="单位" width="60" align="center" />
        <el-table-column label="预估单价" width="110" align="right">
          <template #default="{ row }">¥{{ Number(row.unit_price || 0).toFixed(2) }}</template>
        </el-table-column>
        <el-table-column label="预估金额" width="110" align="right">
          <template #default="{ row }">¥{{ Number(row.amount || 0).toLocaleString() }}</template>
        </el-table-column>
        <el-table-column prop="reason" label="采购原因" min-width="160" show-overflow-tooltip />
        <el-table-column prop="status" label="状态" width="90" align="center">
          <template #default="{ row }"><el-tag :type="itemStatusTag[row.status]" size="small">{{ itemStatusName[row.status] }}</el-tag></template>
        </el-table-column>
      </el-table>
    </el-card>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { ArrowLeft } from '@element-plus/icons-vue'
import request from '@/utils/request'

const route = useRoute()
const router = useRouter()
const statusName = { draft: '草稿', submitted: '待审批', approved: '已批准', ordered: '已下单', completed: '已完成', cancelled: '已取消' }
const statusTag = { draft: 'info', submitted: 'warning', approved: 'success', ordered: '', completed: 'success', cancelled: 'danger' }
const itemStatusName = { pending: '待采购', ordered: '已下单', done: '已完成' }
const itemStatusTag = { pending: 'info', ordered: 'warning', done: 'success' }

const loading = ref(false)
const plan = ref({})

const fetchDetail = async () => {
  loading.value = true
  try {
    const res = await request.get(`/procurement-plan/detail/${route.params.id}`)
    if (res.code === 200) plan.value = res.data
  } catch (e) { /* */ }
  finally { loading.value = false }
}

const handleSubmit = () => {
  ElMessageBox.confirm('确定提交审批？', '确认', { type: 'info' }).then(async () => {
    const res = await request.post(`/procurement-plan/${route.params.id}/submit`)
    if (res.code === 200) { ElMessage.success('已提交'); fetchDetail() }
  }).catch(() => {})
}

const handleApprove = () => {
  ElMessageBox.confirm('确定批准该计划？', '确认', { type: 'success' }).then(async () => {
    const res = await request.post(`/procurement-plan/${route.params.id}/approve`)
    if (res.code === 200) { ElMessage.success('已批准'); fetchDetail() }
  }).catch(() => {})
}

const handleConvert = () => {
  ElMessageBox.confirm('确定将该计划转为采购单？将按供应商自动生成采购单。', '转采购单', { type: 'info' }).then(async () => {
    const res = await request.post(`/procurement-plan/${route.params.id}/convert-to-purchase`)
    if (res.code === 200) {
      ElMessage.success(res.message)
      router.push('/purchase/list')
    }
  }).catch(() => {})
}

onMounted(() => { fetchDetail() })
</script>

<style scoped>
.page-container { padding: 0; }
.page-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: var(--space-4); }
.page-title { font-size: 20px; font-weight: 600; color: var(--color-text); margin-left: 8px; }
.card-title { font-size: 15px; font-weight: 600; }
</style>
