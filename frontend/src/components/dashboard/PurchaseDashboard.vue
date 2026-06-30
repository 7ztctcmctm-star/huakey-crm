<template>
  <div class="purchase-dashboard">
    <el-row :gutter="24">
      <el-col :span="8">
        <el-card shadow="hover" class="stat-card">
          <div class="stat-body">
            <div class="stat-icon" style="background: var(--color-bg-secondary); color: var(--color-accent)">
              <el-icon :size="28"><Goods /></el-icon>
            </div>
            <div class="stat-info">
              <div class="stat-value">¥{{ formatAmount(statistics.totalAmount) }}</div>
              <div class="stat-label">累计采购额</div>
            </div>
          </div>
        </el-card>
      </el-col>
      <el-col :span="8">
        <el-card shadow="hover" class="stat-card" @click="router.push('/purchase/request')">
          <div class="stat-body">
            <div class="stat-icon" style="background: var(--color-bg-secondary); color: var(--color-warning)">
              <el-icon :size="28"><Document /></el-icon>
            </div>
            <div class="stat-info">
              <div class="stat-value">{{ pendingCount }}</div>
              <div class="stat-label">待审批申请</div>
            </div>
          </div>
        </el-card>
      </el-col>
      <el-col :span="8">
        <el-card shadow="hover" class="stat-card" @click="router.push('/inventory')">
          <div class="stat-body">
            <div class="stat-icon" style="background: var(--color-bg-secondary); color: var(--color-danger)">
              <el-icon :size="28"><Warning /></el-icon>
            </div>
            <div class="stat-info">
              <div class="stat-value">{{ stockAlerts.length }}</div>
              <div class="stat-label">库存预警</div>
            </div>
          </div>
        </el-card>
      </el-col>
    </el-row>

    <el-row :gutter="24" style="margin-top: 24px">
      <el-col :span="12">
        <el-card shadow="never">
          <template #header>
            <div class="section-header">
              <span class="section-title">
                <el-icon><DocumentChecked /></el-icon> 待审批采购申请
              </span>
              <el-button type="primary" link @click="router.push('/purchase/request')">查看全部</el-button>
            </div>
          </template>
          <el-table :data="pendingRequests" stripe size="small" v-loading="loadingPending">
            <el-table-column prop="request_no" label="申请单号" min-width="120" />
            <el-table-column prop="title" label="标题" min-width="120" show-overflow-tooltip />
            <el-table-column prop="expected_amount" label="预计金额" width="110" align="right">
              <template #default="{ row }">¥{{ formatAmount(row.expected_amount) }}</template>
            </el-table-column>
            <el-table-column prop="create_time" label="提交时间" width="150">
              <template #default="{ row }">{{ formatTime(row.create_time) }}</template>
            </el-table-column>
          </el-table>
        </el-card>
      </el-col>
      <el-col :span="12">
        <el-card shadow="never">
          <template #header>
            <div class="section-header">
              <span class="section-title">
                <el-icon><ShoppingCart /></el-icon> 最近采购订单
              </span>
              <el-button type="primary" link @click="router.push('/purchase')">查看全部</el-button>
            </div>
          </template>
          <el-table :data="recentPurchases" stripe size="small" v-loading="loadingPurchases">
            <el-table-column prop="order_no" label="订单号" min-width="120" />
            <el-table-column prop="supplier_name" label="供应商" min-width="120" show-overflow-tooltip />
            <el-table-column prop="total_with_tax" label="金额" width="110" align="right">
              <template #default="{ row }">¥{{ formatAmount(row.total_with_tax) }}</template>
            </el-table-column>
            <el-table-column prop="status" label="状态" width="90">
              <template #default="{ row }">
                <el-tag size="small" :type="purchaseStatusType(row.status)">{{ row.status }}</el-tag>
              </template>
            </el-table-column>
          </el-table>
        </el-card>
      </el-col>
    </el-row>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted, onActivated } from 'vue'
import { useRouter } from 'vue-router'
import { Goods, Document, Warning, DocumentChecked, ShoppingCart } from '@element-plus/icons-vue'
import { formatAmount, formatTime } from '@/composables/useFormat'
import { getPurchaseStatistics, getPurchaseList } from '@/api/product'
import { getPurchaseRequestList } from '@/api/purchaseRequest'
import { getInventoryAlerts } from '@/api/product'

const router = useRouter()

const statistics = reactive({ totalAmount: 0, totalOrders: 0, pendingApprove: 0 })
const pendingRequests = ref([])
const pendingCount = ref(0)
const recentPurchases = ref([])
const stockAlerts = ref([])
const loadingPending = ref(false)
const loadingPurchases = ref(false)

const purchaseStatusType = (status) => {
  const map = { '待审核': 'warning', '已确认': 'primary', '已完成': 'success', '已取消': 'info' }
  return map[status] || ''
}

const fetchStatistics = async () => {
  try {
    const res = await getPurchaseStatistics()
    if (res.code === 200) Object.assign(statistics, res.data.summary)
  } catch (e) { console.error('获取采购统计失败:', e) }
}

const fetchPendingRequests = async () => {
  loadingPending.value = true
  try {
    const res = await getPurchaseRequestList({ page: 1, pageSize: 5, status: 'pending' })
    if (res.code === 200) {
      pendingRequests.value = res.data.list || []
      pendingCount.value = res.data.total || 0
    }
  } catch (e) { console.error('获取待审批申请失败:', e) }
  finally { loadingPending.value = false }
}

const fetchRecentPurchases = async () => {
  loadingPurchases.value = true
  try {
    const res = await getPurchaseList({ page: 1, pageSize: 5 })
    if (res.code === 200) recentPurchases.value = res.data.list || []
  } catch (e) { console.error('获取最近采购失败:', e) }
  finally { loadingPurchases.value = false }
}

const fetchStockAlerts = async () => {
  try {
    const res = await getInventoryAlerts()
    if (res.code === 200) stockAlerts.value = res.data || []
  } catch (e) { console.error('获取库存预警失败:', e) }
}

const load = () => {
  fetchStatistics()
  fetchPendingRequests()
  fetchRecentPurchases()
  fetchStockAlerts()
}

onMounted(() => load())
onActivated(() => load())
</script>

<style scoped>
.stat-card { cursor: pointer; transition: transform 0.2s var(--ease-out); }
.stat-card:hover { transform: translateY(-2px); }
.stat-body {
  display: flex;
  align-items: center;
  gap: 16px;
}
.stat-icon {
  width: 52px;
  height: 52px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
}
.stat-value {
  font-size: 22px;
  font-weight: 600;
  color: var(--color-text);
  line-height: 1.2;
}
.stat-label {
  font-size: 13px;
  color: var(--color-text-secondary);
  margin-top: 4px;
}
.section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.section-title {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  font-size: 17px;
  font-weight: 600;
  color: var(--color-text);
}
</style>
