<template>
  <div class="pool-page">
    <div class="page-header">
      <h2>客户公海</h2>
      <p class="page-desc">无负责人的客户统一归入公海，所有成员可见。销售可认领到个人名下，认领后享有 7 天保护期。</p>
    </div>

    <!-- 统计卡片 -->
    <el-row :gutter="16" class="stats-row">
      <el-col :span="6">
        <el-card shadow="hover" class="stat-card">
          <div class="stat-num">{{ stats.total }}</div>
          <div class="stat-label">公海客户总数</div>
        </el-card>
      </el-col>
      <el-col :span="6">
        <el-card shadow="hover" class="stat-card">
          <div class="stat-num green">{{ stats.claimable }}</div>
          <div class="stat-label">可认领</div>
        </el-card>
      </el-col>
      <el-col :span="6">
        <el-card shadow="hover" class="stat-card">
          <div class="stat-num orange">{{ stats.protected }}</div>
          <div class="stat-label">保护期内</div>
        </el-card>
      </el-col>
      <el-col :span="6">
        <el-card shadow="hover" class="stat-card">
          <div class="stat-num blue">{{ stats.myClaims }}</div>
          <div class="stat-label">我认领的</div>
        </el-card>
      </el-col>
    </el-row>

    <!-- 搜索区域 -->
    <el-card class="search-card" shadow="never">
      <el-form :model="searchForm" inline @keyup.enter="handleSearch">
        <el-form-item label="公司名称">
          <el-input v-model="searchForm.company_name" placeholder="搜索公司名称" clearable style="width: 200px" />
        </el-form-item>
        <el-form-item label="等级">
          <el-select v-model="searchForm.level" placeholder="全部等级" clearable style="width: 140px">
            <el-option v-for="l in levelOptions" :key="l.value" :label="l.label" :value="l.value" />
          </el-select>
        </el-form-item>
        <el-form-item label="来源">
          <el-select v-model="searchForm.source" placeholder="全部来源" clearable style="width: 160px">
            <template v-for="item in sourceSearchOptions" :key="item.value || item.label">
              <el-option-group v-if="item.options" :label="item.label">
                <el-option v-for="child in item.options" :key="child.value" :label="child.label" :value="child.value" />
              </el-option-group>
              <el-option v-else :label="item.label" :value="item.value" />
            </template>
          </el-select>
        </el-form-item>
        <el-form-item label="池类型">
          <el-select v-model="searchForm.pool_type" placeholder="全部" clearable style="width: 140px">
            <el-option label="公共池" value="public" />
            <el-option label="私有池" value="private" />
          </el-select>
        </el-form-item>
        <el-form-item>
          <el-button type="primary" :icon="Search" @click="handleSearch">搜索</el-button>
          <el-button :icon="Refresh" @click="handleReset">重置</el-button>
        </el-form-item>
      </el-form>
    </el-card>

    <!-- 表格 -->
    <el-card class="table-card" shadow="never">
      <!-- 老板工具栏 -->
      <div class="toolbar" v-if="isBoss">
        <el-select v-model="batchNewOwnerId" placeholder="选择负责人" size="default" style="width: 160px" clearable>
          <el-option v-for="u in salesUsers" :key="u.id" :label="u.real_name + ' (' + u.dept_name + ')'" :value="u.id" />
        </el-select>
        <el-button type="warning" :disabled="selectedRows.length === 0 || !batchNewOwnerId" @click="handleBatchAssign">
          批量分配 ({{ selectedRows.length }})
        </el-button>
        <el-button type="primary" @click="handleAutoAssign" style="margin-left: auto;">
          轮询自动分配
        </el-button>
      </div>

      <el-table
        v-loading="loading" :data="tableData" ref="poolTableRef" stripe border
        @selection-change="handlePoolSelectionChange"
        :header-cell-style="{ background: 'var(--c-bg)', color: 'var(--c-text-secondary)' }">
        <template #empty>
          <el-empty description="公海暂无客户">
            客户超过30天未跟进或手动释放后将掉入公海
          </el-empty>
        </template>
        <el-table-column v-if="isBoss" type="selection" width="50" />
        <el-table-column prop="company_name" label="公司名称" min-width="160" show-overflow-tooltip />
        <el-table-column prop="owner_name" label="原负责人" width="100">
          <template #default="{ row }">
            <span v-if="row.owner_name">{{ row.owner_name }}</span>
            <el-tag v-else type="info" size="small">无</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="contact_name" label="联系人" width="100" />
        <el-table-column prop="phone" label="电话" width="130" />
        <el-table-column prop="source" label="来源" width="80">
          <template #default="{ row }">
            <el-tag v-if="row.source" size="small">{{ row.source }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="池类型" width="90" align="center">
          <template #default="{ row }">
            <el-tag :type="row.pool_type === 'private' ? 'warning' : 'success'" size="small">
              {{ row.pool_type === 'private' ? '私有池' : '公共池' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="level" label="等级" width="120" align="center">
          <template #default="{ row }">
            <el-tag :type="levelTagType(row.level)" :color="levelColor(row.level)"
              effect="dark" size="large" style="font-weight:bold;min-width:60px">
              {{ levelLabel(row.level) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="保护期" width="140" align="center">
          <template #default="{ row }">
            <template v-if="row.protect_until && new Date(row.protect_until) > new Date()">
              <el-tag type="warning" size="small">至 {{ formatDate(row.protect_until) }}</el-tag>
            </template>
            <el-tag v-else type="success" size="small">可认领</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="在公海天数" width="100" align="center">
          <template #default="{ row }">{{ getPoolDays(row) }}天</template>
        </el-table-column>
        <el-table-column label="操作" :width="isBoss ? 200 : 100" fixed="right" align="center">
          <template #default="{ row }">
            <template v-if="isBoss">
              <el-button type="warning" size="small" @click="quickAssign(row)">分配</el-button>
              <el-button type="success" size="small" @click="handleClaim(row)">认领</el-button>
            </template>
            <template v-else-if="canClaim">
              <el-button
                type="success" size="small" :icon="Aim"
                :disabled="row.protect_until && new Date(row.protect_until) > new Date()"
                @click="handleClaim(row)"
              >{{ row.protect_until && new Date(row.protect_until) > new Date() ? '保护中' : '认领' }}</el-button>
            </template>
            <el-tag v-else type="info" size="small">仅查看</el-tag>
          </template>
        </el-table-column>
      </el-table>

      <div class="pagination">
        <el-pagination
          v-model:current-page="searchForm.page" v-model:page-size="searchForm.pageSize"
          :page-sizes="[10, 20, 50, 100]" :total="total"
          layout="total, sizes, prev, pager, next, jumper"
          @size-change="fetchList" @current-change="fetchList"
        />
      </div>
    </el-card>

    <!-- 分配弹窗（老板） -->
    <el-dialog v-model="assignDialogVisible" title="分配客户" width="400px">
      <p v-if="assignCustomer"><strong>{{ assignCustomer.company_name }}</strong></p>
      <el-select v-model="assignUserId" placeholder="选择负责人" style="width:100%">
        <el-option v-for="u in salesUsers" :key="u.id" :label="u.real_name + ' (' + u.dept_name + ')'" :value="u.id" />
      </el-select>
      <template #footer>
        <el-button @click="assignDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="assignLoading" @click="confirmAssign">确认分配</el-button>
      </template>
    </el-dialog>

    <!-- 认领弹窗 -->
    <el-dialog v-model="claimDialogVisible" title="认领客户" width="450px">
      <div v-if="claimCustomer" class="claim-info">
        <p><strong>公司名称：</strong>{{ claimCustomer.company_name }}</p>
        <p><strong>原负责人：</strong>{{ claimCustomer.owner_name || '无' }}</p>
        <el-alert type="info" :closable="false" show-icon>
          认领后您将成为该客户的负责人，享有 <strong>7天</strong> 保护期。
          保护期内其他销售不可抢走，保护期后若超过 30 天未跟进将自动掉回公海。
        </el-alert>
      </div>
      <template #footer>
        <el-button @click="claimDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="claimLoading" @click="confirmClaim">确认认领</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted, computed } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Search, Refresh, Aim } from '@element-plus/icons-vue'
import { post, get } from '@/utils/request'
import { formatTime } from '@/composables/useFormat'
import { SOURCE_SEARCH_OPTIONS } from '@/constants/source'

const router = useRouter()
const loading = ref(false)

// 用户信息
const userInfo = ref({})
const isBoss = ref(false)
const canClaim = computed(() => {
  const rid = userInfo.value.roleId
  return [1, 2, 3].includes(rid) // 老板、经理、销售可以认领
})

// 公海统计
const stats = reactive({ total: 0, claimable: 0, protected: 0, myClaims: 0 })

try {
  const stored = localStorage.getItem('userInfo')
  if (stored) {
    userInfo.value = JSON.parse(stored)
    isBoss.value = userInfo.value.manageAll === true || userInfo.value.roleId === 1
  }
} catch (e) { /* ignore */ }

const selectedRows = ref([])
const batchNewOwnerId = ref(null)
const salesUsers = ref([])
const poolTableRef = ref(null)

const fetchSalesUsers = async () => {
  if (!isBoss.value) return
  try { const res = await get('/customer/sales-users'); if (res.code === 200) salesUsers.value = res.data } catch (e) { /* */ }
}

const fetchStats = async () => {
  try {
    const res = await post('/customer/pool', { page: 1, pageSize: 1 })
    if (res.code === 200) {
      stats.total = res.data.total
      stats.claimable = res.data.total
    }
  } catch (e) { /* */ }
}

const handlePoolSelectionChange = (rows) => { selectedRows.value = rows }

const handleBatchAssign = async () => {
  if (selectedRows.value.length === 0 || !batchNewOwnerId.value) return
  try {
    const res = await post('/customer/batch-assign', {
      customer_ids: selectedRows.value.map(r => r.id),
      to_user_id: batchNewOwnerId.value,
      remark: '公海批量分配'
    })
    if (res.code === 200) {
      ElMessage.success(res.message)
      batchNewOwnerId.value = null; selectedRows.value = []
      fetchList()
    }
  } catch (e) { ElMessage.error('批量分配失败') }
}

const handleAutoAssign = async () => {
  try {
    await ElMessageBox.confirm(
      '将公海中所有可分配的客户按轮询方式均匀分配给销售团队，确定执行？',
      '轮询自动分配',
      { confirmButtonText: '确定分配', cancelButtonText: '取消', type: 'warning' }
    )
    const res = await post('/customer/auto-assign')
    if (res.code === 200) {
      ElMessage.success(res.message)
      fetchList()
      fetchStats()
    }
  } catch (e) { /* cancel or error */ }
}

// 单个分配
const assignDialogVisible = ref(false)
const assignCustomer = ref(null)
const assignUserId = ref(null)
const assignLoading = ref(false)

const quickAssign = (row) => { assignCustomer.value = row; assignUserId.value = null; assignDialogVisible.value = true }

const confirmAssign = async () => {
  if (!assignUserId.value) return ElMessage.warning('请选择负责人')
  assignLoading.value = true
  try {
    const res = await post('/customer/assign', {
      customer_id: assignCustomer.value.id, to_user_id: assignUserId.value, remark: '公海分配'
    })
    if (res.code === 200) { ElMessage.success('分配成功'); assignDialogVisible.value = false; fetchList() }
  } catch (e) { ElMessage.error('分配失败') }
  finally { assignLoading.value = false }
}

// 表格数据
const tableData = ref([])
const total = ref(0)

const searchForm = reactive({ company_name: '', source: '', level: '', pool_type: '', page: 1, pageSize: 10 })
const sourceSearchOptions = SOURCE_SEARCH_OPTIONS
const levelOptions = [
  { label: 'A级 - 重点客户', value: 'A' }, { label: 'B级 - 意向客户', value: 'B' },
  { label: 'C级 - 潜在客户', value: 'C' }, { label: 'D级 - 非意向客户', value: 'D' }
]

const levelTagType = (l) => ({ A: 'danger', B: 'warning', C: 'info', D: '' }[l] || 'info')
const levelLabel = (l) => ({ A: 'A级-重点', B: 'B级-意向', C: 'C级-潜在', D: 'D级-冷淡' }[l] || l || '-')
const levelColor = (l) => ({ A: 'var(--c-accent)', B: 'var(--c-primary)', C: 'var(--c-primary)', D: 'var(--c-text-tertiary)' }[l])

const formatDate = (t) => {
  if (!t) return '-'
  return new Date(t).toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' })
}
const getPoolDays = (row) => {
  const ref = row.last_follow_time || row.create_time
  if (!ref) return '?'
  return Math.floor((new Date() - new Date(ref)) / (1000 * 60 * 60 * 24))
}

const fetchList = async () => {
  loading.value = true
  try {
    const res = await post('/customer/pool', {
      page: searchForm.page, pageSize: searchForm.pageSize,
      company_name: searchForm.company_name || undefined,
      source: searchForm.source || undefined,
      level: searchForm.level || undefined,
      pool_type: searchForm.pool_type || undefined
    })
    if (res.code === 200) {
      tableData.value = res.data.list
      total.value = res.data.total
    }
  } catch (e) { ElMessage.error('加载失败'); console.error(e) }
  finally { loading.value = false }
}

const handleSearch = () => { searchForm.page = 1; fetchList() }
const handleReset = () => { searchForm.company_name = ''; searchForm.source = ''; searchForm.level = ''; searchForm.pool_type = ''; handleSearch() }

// 认领
const claimDialogVisible = ref(false)
const claimCustomer = ref(null)
const claimLoading = ref(false)

const handleClaim = (row) => { claimCustomer.value = row; claimDialogVisible.value = true }

const confirmClaim = async () => {
  claimLoading.value = true
  try {
    const customerId = claimCustomer.value.id
    const res = await post('/customer/claim', { customer_id: customerId })
    if (res.code === 200) {
      ElMessage.success('认领成功！该客户已归您负责，保护期7天')
      tableData.value = tableData.value.filter(r => r.id !== customerId)
      claimDialogVisible.value = false
      fetchList()
      router.push(`/customer/detail/${customerId}`)
    }
  } catch (e) { ElMessage.error('加载失败'); console.error(e) }
  finally { claimLoading.value = false }
}

onMounted(() => { fetchList(); fetchSalesUsers() })
</script>

<style scoped>
.pool-page { padding: 0; }
.page-header { margin-bottom: 16px; }
.page-header h2 { margin: 0 0 4px; font-size: 18px; color: var(--c-text); }
.page-desc { margin: 0; font-size: 13px; color: var(--c-text-tertiary); }

.stats-row { margin-bottom: 16px; }
.stat-card { text-align: center; cursor: default; }
.stat-num { font-size: 28px; font-weight: bold; color: var(--c-text); }
.stat-num.green { color: var(--c-primary); }
.stat-num.orange { color: var(--c-primary); }
.stat-num.blue { color: var(--c-primary); }
.stat-label { font-size: 13px; color: var(--c-text-tertiary); margin-top: 4px; }

.search-card { margin-bottom: 16px; }
.search-card .el-form-item { margin-bottom: 0; }
.toolbar { margin-bottom: 16px; display: flex; gap: 8px; align-items: center; }
.table-card { min-height: 300px; }
.pagination { display: flex; justify-content: flex-end; margin-top: 16px; }
.claim-info p { margin: 8px 0; }
</style>
