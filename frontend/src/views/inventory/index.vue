<template>
  <div class="page-container">
    <div class="page-header">
      <h2>库存管理</h2>
      <el-button @click="$router.push('/inventory/movements')">变动记录</el-button>
    </div>

    <!-- 统计卡片 -->
    <div class="stat-cards">
      <div class="stat-card" v-for="s in statCards" :key="s.key" :class="{ clickable: s.key === 'alert' }" @click="s.key === 'alert' && filterAlertProducts()">
        <div class="stat-value" :style="s.key === 'alert' && alertCount > 0 ? 'color: #dc2626' : ''">{{ s.value }}</div>
        <div class="stat-label">{{ s.label }}</div>
      </div>
    </div>
    <el-alert v-if="alertCount > 0" type="warning" :title="`有 ${alertCount} 个产品库存低于预警值`" show-icon :closable="false" style="margin: 12px 0;">
      <el-button type="warning" size="small" @click="handleAutoGenerate" :loading="autoGenLoading" style="margin-left: 12px;">自动生成采购计划</el-button>
    </el-alert>

    <!-- 筛选 -->
    <el-card shadow="never" class="search-card">
      <el-form :model="search" inline @keyup.enter="fetchList">
        <el-form-item><el-input v-model="search.keyword" placeholder="产品名称/编码" clearable style="width:180px" /></el-form-item>
        <el-form-item>
          <el-select v-model="search.category" placeholder="全部分类" clearable style="width:120px">
            <el-option v-for="c in categories" :key="c" :label="c" :value="c" />
          </el-select>
        </el-form-item>
        <el-form-item>
          <el-select v-model="search.stock_status" placeholder="库存状态" clearable style="width:120px">
            <el-option label="正常" value="normal" /><el-option label="偏低" value="low" /><el-option label="偏高" value="high" />
          </el-select>
        </el-form-item>
        <el-form-item><el-button type="primary" @click="fetchList">搜索</el-button></el-form-item>
      </el-form>
    </el-card>

    <!-- 列表 -->
    <el-card shadow="never">
      <el-table :data="list" stripe border v-loading="loading">
        <el-table-column prop="name" label="产品名称" min-width="160" show-overflow-tooltip />
        <el-table-column prop="code" label="编码" width="120" />
        <el-table-column prop="category" label="分类" width="100" />
        <el-table-column prop="unit" label="单位" width="60" align="center" />
        <el-table-column prop="stock" label="当前库存" width="100" align="center">
          <template #default="{ row }"><span class="stock-value">{{ row.stock }}</span></template>
        </el-table-column>
        <el-table-column label="预警阈值" width="140" align="center">
          <template #default="{ row }">
            <span v-if="row.alert_enabled">{{ row.min_qty }} ~ {{ row.max_qty }}</span>
            <span v-else class="text-muted">未配置</span>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="80" align="center">
          <template #default="{ row }">
            <el-tag :type="statusTag[row.stock_status]" size="small">{{ statusName[row.stock_status] }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="240" fixed="right">
          <template #default="{ row }">
            <el-button type="success" link size="small" @click="openDialog('in', row)">入库</el-button>
            <el-button type="warning" link size="small" @click="openDialog('out', row)">出库</el-button>
            <el-button type="primary" link size="small" @click="openDialog('adjust', row)">调整</el-button>
            <el-button type="info" link size="small" @click="openAlertConfig(row)">预警</el-button>
          </template>
        </el-table-column>
      </el-table>
      <div class="pagination"><el-pagination v-model:current-page="page" v-model:page-size="pageSize" :total="total" :page-sizes="[20,50,100]" layout="total,sizes,prev,pager,next" @size-change="fetchList" @current-change="fetchList" /></div>
    </el-card>

    <!-- 入库/出库/调整弹窗 -->
    <el-dialog v-model="moveVisible" :title="moveTitle" width="400px">
      <el-form :model="moveForm" label-width="80px">
        <el-form-item label="产品"><span>{{ moveProduct.name }}</span></el-form-item>
        <el-form-item label="当前库存"><span>{{ moveProduct.stock }}</span></el-form-item>
        <el-form-item :label="moveType === 'adjust' ? '新库存' : '数量'">
          <el-input-number v-model="moveForm.quantity" :min="moveType === 'out' ? 1 : 0" style="width:100%" controls-position="right" />
        </el-form-item>
        <el-form-item label="备注"><el-input v-model="moveForm.remark" placeholder="备注（可选）" /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="moveVisible=false">取消</el-button>
        <el-button type="primary" :loading="moveLoading" @click="handleMove">确认</el-button>
      </template>
    </el-dialog>

    <!-- 预警配置弹窗 -->
    <el-dialog v-model="alertVisible" title="预警配置" width="400px">
      <el-form :model="alertForm" label-width="80px">
        <el-form-item label="产品"><span>{{ alertProduct.name }}</span></el-form-item>
        <el-form-item label="最低库存"><el-input-number v-model="alertForm.min_qty" :min="0" style="width:100%" controls-position="right" /></el-form-item>
        <el-form-item label="最高库存"><el-input-number v-model="alertForm.max_qty" :min="0" style="width:100%" controls-position="right" /></el-form-item>
        <el-form-item label="启用预警"><el-switch v-model="alertForm.alert_enabled" :active-value="1" :inactive-value="0" /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="alertVisible=false">取消</el-button>
        <el-button type="primary" :loading="alertLoading" @click="handleAlertConfig">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import request from '@/utils/request'
import { getInventoryList, updateInventory, addInventoryMovement, getInventoryStats, getInventoryCategories } from '@/api/product'

const router = useRouter()

const statusName = { normal: '正常', low: '偏低', high: '偏高' }
const statusTag = { normal: 'success', low: 'warning', high: '' }

const loading = ref(false)
const list = ref([])
const total = ref(0)
const page = ref(1)
const pageSize = ref(20)
const categories = ref([])
const search = reactive({ keyword: '', category: '', stock_status: '' })
const stats = ref({ sku_count: 0, total_stock: 0, total_value: 0, low_count: 0, high_count: 0 })

const statCards = computed(() => [
  { key: 'sku', label: '总SKU数', value: stats.value.sku_count },
  { key: 'stock', label: '总库存量', value: stats.value.total_stock },
  { key: 'value', label: '库存价值', value: '¥' + Number(stats.value.total_value).toLocaleString() },
  { key: 'alert', label: '预警数量', value: stats.value.low_count + stats.value.high_count }
])
const alertCount = computed(() => stats.value.low_count + stats.value.high_count)
const autoGenLoading = ref(false)

const filterAlertProducts = () => {
  search.stock_status = 'low'
  fetchList()
}

const handleAutoGenerate = async () => {
  autoGenLoading.value = true
  try {
    const res = await autoGeneratePlan()
    if (res.code === 200) {
      ElMessage.success(res.message || '已生成采购计划')
      router.push('/procurement/plan')
    }
  } catch { /* */ }
  finally { autoGenLoading.value = false }
}

const moveVisible = ref(false)
const moveType = ref('in')
const moveProduct = ref({})
const moveLoading = ref(false)
const moveForm = reactive({ quantity: 1, remark: '' })
const moveTitle = computed(() => ({ in: '入库', out: '出库', adjust: '库存调整' }[moveType.value]))

const alertVisible = ref(false)
const alertProduct = ref({})
const alertLoading = ref(false)
const alertForm = reactive({ min_qty: 0, max_qty: 9999, alert_enabled: 1 })

const fetchList = async () => {
  loading.value = true
  try {
    const res = await getInventoryList({ page: page.value, page_size: pageSize.value, ...search })
    if (res.code === 200) { list.value = res.data.list; total.value = res.data.total }
  } catch (e) { /* */ }
  finally { loading.value = false }
}

const fetchStats = async () => {
  try { const res = await getInventoryStats(); if (res.code === 200) stats.value = res.data } catch (e) { /* */ }
}

const fetchCategories = async () => {
  try { const res = await getInventoryCategories(); if (res.code === 200) categories.value = res.data } catch (e) { /* */ }
}

const openDialog = (type, row) => {
  moveType.value = type; moveProduct.value = row
  moveForm.quantity = type === 'adjust' ? row.stock : 1; moveForm.remark = ''
  moveVisible.value = true
}

const handleMove = async () => {
  moveLoading.value = true
  try {
    const data = { product_id: moveProduct.value.id, quantity: moveForm.quantity, remark: moveForm.remark, movement_type: moveType.value }
    if (moveType.value === 'adjust') { data.new_qty = moveForm.quantity; delete data.quantity }
    const res = await addInventoryMovement(data)
    if (res.code === 200) { ElMessage.success('操作成功'); moveVisible.value = false; fetchList(); fetchStats() }
  } finally { moveLoading.value = false }
}

const openAlertConfig = (row) => {
  alertProduct.value = row
  Object.assign(alertForm, { min_qty: row.min_qty || 0, max_qty: row.max_qty || 9999, alert_enabled: row.alert_enabled ?? 1 })
  alertVisible.value = true
}

const handleAlertConfig = async () => {
  alertLoading.value = true
  try {
    const res = await updateInventory({ id: alertProduct.value.id, ...alertForm })
    if (res.code === 200) { ElMessage.success('配置成功'); alertVisible.value = false; fetchList() }
  } finally { alertLoading.value = false }
}

onMounted(() => { fetchList(); fetchStats(); fetchCategories() })
</script>

<style scoped>
.page-container { padding: 0; }
.page-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: var(--space-4); }
.page-header h2 { margin: 0; font-size: 28px; font-weight: 600; color: var(--color-text); }
.stat-cards { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; margin-bottom: var(--space-4); }
.stat-card { background: #fff; border-radius: 16px; padding: 24px; box-shadow: 0 2px 12px rgba(0,0,0,0.06); text-align: center; }
.stat-value { font-size: 28px; font-weight: 700; color: var(--color-text); }
.stat-label { font-size: 13px; color: var(--color-text-tertiary); margin-top: 4px; }
.search-card { margin-bottom: var(--space-4); }
.search-card .el-form-item { margin-bottom: 0; }
.stock-value { font-size: 16px; font-weight: 700; }
.text-muted { color: var(--color-text-tertiary); font-size: 12px; }
.pagination { display: flex; justify-content: flex-end; margin-top: var(--space-4); }
</style>
