<template>
  <div class="page-container" v-loading="loading">
    <div class="page-header">
      <h2>比价详情</h2>
      <el-button @click="goBack">返回</el-button>
    </div>

    <el-card shadow="never" v-if="comparison">
      <template #header>
        <div class="card-header">
          <span class="section-title">{{ comparison.comparison_no }} · {{ comparison.title }}</span>
          <el-tag :type="statusType(comparison.status)" size="small">{{ statusText(comparison.status) }}</el-tag>
        </div>
      </template>
      <el-descriptions :column="3" border>
        <el-descriptions-item label="产品">{{ comparison.product_name || '-' }}</el-descriptions-item>
        <el-descriptions-item label="数量">{{ comparison.quantity || '-' }} {{ comparison.unit }}</el-descriptions-item>
        <el-descriptions-item label="创建人">{{ comparison.created_by_name || '-' }}</el-descriptions-item>
        <el-descriptions-item label="关联申请">{{ comparison.request_title || '-' }}</el-descriptions-item>
        <el-descriptions-item label="选中供应商">{{ comparison.selected_supplier_name || '未选择' }}</el-descriptions-item>
        <el-descriptions-item label="创建时间">{{ comparison.created_at }}</el-descriptions-item>
      </el-descriptions>
    </el-card>

    <el-card shadow="never" style="margin-top: 24px">
      <template #header>
        <div class="card-header">
          <span class="section-title">供应商报价对比</span>
          <el-button v-if="comparison?.status === 'draft'" type="primary" @click="quoteDialogVisible = true">
            添加报价
          </el-button>
        </div>
      </template>

      <el-radio-group v-if="items.length > 0" v-model="selectedSupplierId" style="width: 100%">
        <el-table :data="items" stripe style="width: 100%" :row-class-name="rowClassName">
          <el-table-column width="60" align="center">
            <template #default="{ row }">
              <el-radio :value="row.supplier_id" :disabled="comparison?.status !== 'draft'">
                &nbsp;
              </el-radio>
            </template>
          </el-table-column>
          <el-table-column prop="supplier_name" label="供应商" min-width="160" />
          <el-table-column prop="unit_price" label="单价" width="130" align="right">
            <template #default="{ row }">
              <span>¥{{ formatMoney(row.unit_price) }}</span>
            </template>
          </el-table-column>
          <el-table-column prop="total_price" label="总价" width="140" align="right">
            <template #default="{ row }">
              <span :class="{ 'highlight-price': isLowest(row) }">¥{{ formatMoney(row.total_price) }}</span>
            </template>
          </el-table-column>
          <el-table-column prop="delivery_days" label="交期(天)" width="100" align="center" />
          <el-table-column prop="payment_terms" label="付款条件" min-width="150" show-overflow-tooltip />
          <el-table-column prop="remark" label="备注" min-width="160" show-overflow-tooltip />
        </el-table>
      </el-radio-group>

      <el-empty v-else description="暂无供应商报价" />

      <div v-if="comparison?.status === 'draft' && items.length > 0" class="action-bar">
        <el-button type="success" @click="handleSelectSupplier" :disabled="!selectedSupplierId">
          确认选中供应商
        </el-button>
        <el-button @click="handleAutoSelect">自动选择最优</el-button>
      </div>
    </el-card>

    <!-- 添加报价弹窗 -->
    <el-dialog v-model="quoteDialogVisible" title="添加供应商报价" width="560px">
      <el-form :model="quoteForm" :rules="quoteRules" ref="quoteFormRef" label-width="100px">
        <el-form-item label="供应商" prop="supplier_id">
          <el-select v-model="quoteForm.supplier_id" filterable placeholder="请选择供应商" style="width: 100%">
            <el-option v-for="s in supplierOptions" :key="s.id" :label="s.name" :value="s.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="单价" prop="unit_price">
          <el-input-number v-model="quoteForm.unit_price" :min="0" :precision="2" style="width: 100%" />
        </el-form-item>
        <el-form-item label="总价" prop="total_price">
          <el-input-number v-model="quoteForm.total_price" :min="0" :precision="2" style="width: 100%" />
        </el-form-item>
        <el-form-item label="交期(天)">
          <el-input-number v-model="quoteForm.delivery_days" :min="0" :precision="0" style="width: 100%" />
        </el-form-item>
        <el-form-item label="付款条件">
          <el-input v-model="quoteForm.payment_terms" placeholder="例如：月结30天" />
        </el-form-item>
        <el-form-item label="备注">
          <el-input v-model="quoteForm.remark" type="textarea" :rows="2" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="quoteDialogVisible = false">取消</el-button>
        <el-button type="primary" @click="handleAddQuote" :loading="quoteSubmitting">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { reactive, ref, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import {
  getPurchaseComparisonDetail,
  addPurchaseComparisonQuote,
  selectPurchaseComparisonSupplier
} from '@/api/purchaseComparison'
import { getSupplierList } from '@/api/product'

const route = useRoute()
const router = useRouter()
const loading = ref(false)

const comparison = ref(null)
const items = ref([])
const selectedSupplierId = ref(null)
const supplierOptions = ref([])

const quoteDialogVisible = ref(false)
const quoteSubmitting = ref(false)
const quoteFormRef = ref(null)
const quoteForm = reactive({
  supplier_id: null,
  unit_price: null,
  total_price: null,
  delivery_days: null,
  payment_terms: '',
  remark: ''
})

const quoteRules = {
  supplier_id: [{ required: true, message: '请选择供应商', trigger: 'change' }],
  total_price: [{ required: true, message: '请输入总价', trigger: 'blur' }]
}

const comparisonId = computed(() => route.params.id)

const statusMap = {
  draft: { text: '草稿', type: 'info' },
  completed: { text: '已完成', type: 'success' },
  cancelled: { text: '已取消', type: 'info' }
}
const statusText = (status) => statusMap[status]?.text || status
const statusType = (status) => statusMap[status]?.type || ''

const formatMoney = (value) => {
  if (value === null || value === undefined) return '0.00'
  return Number(value).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

const lowestTotal = computed(() => {
  const totals = items.value.map(i => Number(i.total_price)).filter(v => v > 0)
  return totals.length > 0 ? Math.min(...totals) : null
})

const isLowest = (row) => {
  return lowestTotal.value !== null && Number(row.total_price) === lowestTotal.value
}

const rowClassName = ({ row }) => {
  return isLowest(row) ? 'lowest-row' : ''
}

const fetchSuppliers = async () => {
  try {
    const res = await getSupplierList()
    if (res.code === 200) {
      supplierOptions.value = res.data || []
    }
  } catch (error) {
    console.error('获取供应商失败:', error)
  }
}

const fetchDetail = async () => {
  loading.value = true
  try {
    const res = await getPurchaseComparisonDetail(comparisonId.value)
    if (res.code === 200) {
      comparison.value = res.data.comparison
      items.value = res.data.items || []
      selectedSupplierId.value = comparison.value.selected_supplier_id || null
    }
  } catch (error) {
    console.error('获取比价详情失败:', error)
    ElMessage.error('加载失败')
  } finally {
    loading.value = false
  }
}

const handleAddQuote = async () => {
  const valid = await quoteFormRef.value?.validate().catch(() => false)
  if (!valid) return

  quoteSubmitting.value = true
  try {
    const res = await addPurchaseComparisonQuote(comparisonId.value, quoteForm)
    if (res.code === 200) {
      ElMessage.success('报价已添加')
      quoteDialogVisible.value = false
      quoteFormRef.value?.resetFields()
      fetchDetail()
    }
  } catch (error) {
    console.error('添加报价失败:', error)
    ElMessage.error(error?.response?.data?.message || '添加失败')
  } finally {
    quoteSubmitting.value = false
  }
}

const handleSelectSupplier = async () => {
  try {
    const res = await selectPurchaseComparisonSupplier(comparisonId.value, selectedSupplierId.value)
    if (res.code === 200) {
      ElMessage.success('供应商已选定')
      fetchDetail()
    }
  } catch (error) {
    console.error('选择供应商失败:', error)
    ElMessage.error(error?.response?.data?.message || '选择失败')
  }
}

const handleAutoSelect = async () => {
  try {
    const res = await selectPurchaseComparisonSupplier(comparisonId.value, null)
    if (res.code === 200) {
      ElMessage.success('已自动选择最优供应商')
      fetchDetail()
    }
  } catch (error) {
    console.error('自动选择失败:', error)
    ElMessage.error(error?.response?.data?.message || '选择失败')
  }
}

const goBack = () => {
  router.back()
}

onMounted(() => {
  fetchSuppliers()
  fetchDetail()
})
</script>

<style scoped>
.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.action-bar {
  margin-top: 20px;
  display: flex;
  justify-content: center;
  gap: 12px;
}

.highlight-price {
  color: #d32f2f;
  font-weight: 600;
}

:deep(.lowest-row) {
  background-color: #f0fdf4;
}
</style>
