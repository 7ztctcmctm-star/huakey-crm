<template>
  <div class="pool-list">
    <!-- 筛选区 -->
    <el-card class="filter-card">
      <el-form :model="searchForm" inline @submit.prevent="handleSearch">
        <el-form-item label="公司名称">
          <el-input v-model="searchForm.company_name" placeholder="搜索公司名称" clearable style="width: 180px" @keyup.enter="handleSearch" />
        </el-form-item>
        <el-form-item label="联系人">
          <el-input v-model="searchForm.contact_name" placeholder="搜索联系人" clearable style="width: 150px" @keyup.enter="handleSearch" />
        </el-form-item>
        <el-form-item label="电话">
          <el-input v-model="searchForm.phone" placeholder="搜索电话" clearable style="width: 150px" @keyup.enter="handleSearch" />
        </el-form-item>
        <el-form-item label="等级">
          <el-select v-model="searchForm.level" placeholder="全部等级" clearable style="width: 120px">
            <el-option v-for="opt in levelOptions" :key="opt.value" :label="opt.label" :value="opt.value" />
          </el-select>
        </el-form-item>
        <el-form-item label="业务状态">
          <el-select v-model="searchForm.business_status" placeholder="全部状态" clearable style="width: 120px">
            <el-option label="跟进中" value="following" />
            <el-option label="已报价" value="quoted" />
            <el-option label="谈判中" value="negotiating" />
            <el-option label="已签约" value="signed" />
          </el-select>
        </el-form-item>
        <el-form-item label="查看范围">
          <!-- 客户总览：一个页面两半 —— 「待认领」即原公海池（owner_id 为空），
               「全部客户」用于老板看清客户在谁手上、进行到哪个阶段 -->
          <el-radio-group v-model="scope" @change="handleScopeChange">
            <el-radio-button value="pending">待认领</el-radio-button>
            <el-radio-button value="all">全部客户</el-radio-button>
          </el-radio-group>
        </el-form-item>
        <el-form-item>
          <el-button type="primary" @click="handleSearch">搜索</el-button>
          <el-button @click="handleReset">重置</el-button>
        </el-form-item>
      </el-form>
    </el-card>

    <!-- 表格区 -->
    <el-card class="table-card">
      <template #header>
        <div class="card-header">
          <span>客户总览（共 {{ total }} 条）</span>
          <el-button link disabled v-if="total === 0">
            {{ scope === 'pending' ? '暂无待认领客户' : '暂无客户' }}
          </el-button>
        </div>
      </template>

      <TableSkeleton v-if="loading" :rows="8" :cols="8" />
      <el-table
        v-show="!loading"
        :data="tableData"
        stripe
        border
        style="width: 100%"
      >
        <el-table-column prop="company_name" label="公司名称" min-width="200" show-overflow-tooltip>
          <template #default="{ row }">
            <el-link type="primary" @click="goDetail(row)">{{ row.company_name }}</el-link>
          </template>
        </el-table-column>
        <el-table-column prop="contact_name" label="联系人" width="100" />
        <el-table-column prop="phone" label="电话" width="140" />
        <el-table-column prop="level" label="等级" width="80" align="center">
          <template #default="{ row }">
            <el-tag :type="levelTagType(row.level)" size="small">{{ row.level || '-' }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="business_status" label="业务状态" width="100" align="center">
          <template #default="{ row }">
            <el-tag :type="statusTagType(row.business_status)" size="small">{{ statusLabel(row.business_status) }}</el-tag>
          </template>
        </el-table-column>
        <!-- 客户总览核心：负责人。老板据此一眼看清「客户在谁手上」 -->
        <el-table-column prop="owner_name" label="负责人" width="110" align="center">
          <template #default="{ row }">
            <span v-if="row.owner_name">{{ row.owner_name }}</span>
            <el-tag v-else type="warning" size="small">待认领</el-tag>
          </template>
        </el-table-column>
        <!-- 释放人 / 释放时间仅「待认领」视图有意义 -->
        <el-table-column v-if="scope === 'pending'" prop="released_by_name" label="释放人" width="100" />
        <el-table-column v-if="scope === 'pending'" prop="released_at" label="释放时间" width="160" />
        <el-table-column label="操作" width="170" fixed="right">
          <template #default="{ row }">
            <el-button
              v-if="!row.owner_id"
              type="success"
              link
              size="small"
              @click="handleClaim(row)"
              v-permission="'pool:claim'"
            >认领</el-button>
            <el-button
              v-else
              type="primary"
              link
              size="small"
              @click="handleTransfer(row)"
              v-permission="'customer:transfer'"
            >转移</el-button>
            <el-button type="info" link size="small" @click="goDetail(row)">详情</el-button>
          </template>
        </el-table-column>
      </el-table>

      <!-- 分页 -->
      <div class="pagination-wrap">
        <el-pagination
          v-model:current-page="searchForm.page"
          v-model:page-size="searchForm.pageSize"
          :total="total"
          :page-sizes="[20, 50, 100]"
          layout="total, sizes, prev, pager, next, jumper"
          @size-change="handleSizeChange"
          @current-change="handlePageChange"
        />
      </div>
    </el-card>

    <!-- 客户转移弹窗（双方同意制：需接收人同意才生效，不可撤回，超 3 天自动回流） -->
    <el-dialog v-model="transferDialogVisible" title="转移客户" width="480px" :close-on-click-modal="false">
      <el-alert
        type="info"
        :closable="false"
        show-icon
        title="转移需对方同意后才生效；对方 3 天内未处理将自动失效。"
        style="margin-bottom: 16px"
      />
      <el-form label-width="80px">
        <el-form-item label="客户">
          <span>{{ transferRow.company_name }}</span>
        </el-form-item>
        <el-form-item label="接收人">
          <el-select v-model="transferForm.to_user_id" placeholder="请选择接收人" style="width: 100%" filterable>
            <el-option
              v-for="u in candidates"
              :key="u.id"
              :label="u.real_name || u.username"
              :value="u.id"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="转移原因">
          <el-input v-model="transferForm.reason" type="textarea" :rows="3" maxlength="500" show-word-limit placeholder="请说明转移原因（选填）" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="transferDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="transferSubmitting" @click="submitTransfer">发出转移申请</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { reportError, reportWarn } from '@/utils/error'
import { ref, reactive, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import TableSkeleton from '@/components/common/TableSkeleton.vue'
import { getPoolList, claimPoolCustomer, createTransfer, getTransferCandidates } from '@/api/pool'
import { getCustomerList } from '@/api/customer'

const router = useRouter()

// 查看范围：pending = 待认领（原「公海池」语义）；all = 全部客户（老板看归属用）
const scope = ref('pending')

const levelOptions = [
  { label: 'A级 - 重点客户', value: 'A' },
  { label: 'B级 - 意向客户', value: 'B' },
  { label: 'C级 - 潜在客户', value: 'C' },
  { label: 'D级 - 非意向客户', value: 'D' }
]

const searchForm = reactive({
  company_name: '',
  contact_name: '',
  phone: '',
  level: '',
  business_status: '',
  page: 1,
  pageSize: 20
})

const tableData = ref([])
const total = ref(0)
const loading = ref(false)

const levelTagType = (level) => {
  const map = { A: 'danger', B: 'warning', C: 'info', D: '' }
  return map[level] || ''
}

const statusLabel = (status) => {
  const map = {
    following: '跟进中',
    quoted: '已报价',
    negotiating: '谈判中',
    signed: '已签约',
    lost: '已流失'
  }
  return map[status] || status || '-'
}

const statusTagType = (status) => {
  const map = {
    following: '',
    quoted: 'info',
    negotiating: 'warning',
    signed: 'success',
    lost: 'danger'
  }
  return map[status] || ''
}

const fetchList = async () => {
  loading.value = true
  try {
    const params = {
      page: searchForm.page,
      pageSize: searchForm.pageSize
    }
    if (searchForm.company_name) params.company_name = searchForm.company_name
    if (searchForm.contact_name) params.contact_name = searchForm.contact_name
    if (searchForm.phone) params.phone = searchForm.phone
    if (searchForm.level) params.level = searchForm.level
    if (searchForm.business_status) params.business_status = searchForm.business_status

    // 两种视图走不同接口（均已带后端数据范围控制）：
    //   pending → /pool：只返回无负责人客户（原「公海池」）
    //   all     → /customers/list：返回全量客户，含 owner_name，供老板看清归属
    const res = scope.value === 'pending' ? await getPoolList(params) : await getCustomerList(params)

    if (res.code === 200) {
      tableData.value = res.data.list || []
      total.value = res.data.total || 0
    }
  } catch (error) {
    const label = scope.value === 'pending' ? '待认领客户' : '客户'
    ElMessage.error(`加载${label}列表失败`)
    reportError(`获取${label}列表失败:`, error)
  } finally {
    loading.value = false
  }
}

/** 切换查看范围时回到第 1 页重新拉取 */
const handleScopeChange = () => {
  searchForm.page = 1
  fetchList()
}

// ==================== 客户转移（双方同意制） ====================
const transferDialogVisible = ref(false)
const transferRow = ref({})
const transferSubmitting = ref(false)
const candidates = ref([])
const transferForm = reactive({ to_user_id: null, reason: '' })

/** 打开转移弹窗并加载接收人候选 */
const handleTransfer = async (row) => {
  transferRow.value = row
  transferForm.to_user_id = null
  transferForm.reason = ''
  transferDialogVisible.value = true
  try {
    const res = await getTransferCandidates()
    if (res.code === 200) candidates.value = res.data || []
  } catch (error) {
    reportWarn('获取接收人候选失败:', error)
  }
}

/** 提交转移申请 */
const submitTransfer = async () => {
  if (!transferForm.to_user_id) {
    ElMessage.warning('请选择接收人')
    return
  }
  transferSubmitting.value = true
  try {
    const res = await createTransfer({
      customer_id: transferRow.value.id,
      to_user_id: transferForm.to_user_id,
      reason: transferForm.reason
    })
    if (res.code === 200) {
      ElMessage.success(res.message || '转移申请已发出，等待对方同意')
      transferDialogVisible.value = false
    }
  } catch (error) {
    ElMessage.error('发起转移失败')
    reportError('发起客户转移失败:', error)
  } finally {
    transferSubmitting.value = false
  }
}

const handleSearch = () => {
  searchForm.page = 1
  fetchList()
}

const handleReset = () => {
  searchForm.company_name = ''
  searchForm.contact_name = ''
  searchForm.phone = ''
  searchForm.level = ''
  searchForm.business_status = ''
  searchForm.page = 1
  fetchList()
}

const handleSizeChange = () => {
  searchForm.page = 1
  fetchList()
}

const handlePageChange = () => {
  fetchList()
}

const goDetail = (row) => {
  router.push(`/customer/detail/${row.id}`)
}

const handleClaim = async (row) => {
  try {
    await ElMessageBox.confirm(
      `确定认领「${row.company_name}」吗？认领后该客户将归您跟进，享有7天保护期。`,
      '认领确认',
      { type: 'warning', confirmButtonText: '确定认领', cancelButtonText: '取消' }
    )
    const res = await claimPoolCustomer(row.id)
    if (res.code === 200) {
      ElMessage.success('认领成功，该客户已归您跟进')
      fetchList()
    } else {
      ElMessage.error(res.message || '认领失败')
    }
  } catch (e) {
    if (e !== 'cancel') ElMessage.error('认领失败')
  }
}

onMounted(() => {
  fetchList()
})
</script>

<style scoped>
.pool-list {
  padding: 0;
}
.filter-card {
  margin-bottom: 12px;
}
.filter-card :deep(.el-card__body) {
  padding-bottom: 2px;
}
.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.pagination-wrap {
  display: flex;
  justify-content: flex-end;
  margin-top: 16px;
}
</style>
