<template>
  <div class="opportunity-list">
    <!-- 销售漏斗统计 -->
    <div class="funnel-section">
      <h3 class="section-title">销售漏斗</h3>
      <div class="funnel-cards">
        <div
          v-for="(item, index) in funnelData"
          :key="item.stage"
          class="funnel-card"
          :class="`funnel-stage-${item.stage}`"
          :style="{ flex: item.count > 0 ? 1 : 0.5 }"
        >
          <div class="funnel-tag">{{ item.stage_name }}</div>
          <div class="funnel-count">{{ item.count }}</div>
          <div class="funnel-label">个商机</div>
          <div class="funnel-amount">¥{{ formatAmount(item.amount) }}</div>
          <div class="funnel-arrow" v-if="index < funnelData.length - 1">
            <span class="arrow-icon">→</span>
            <span class="arrow-text">{{ item.count > 0 && funnelData[index + 1].count > 0 ? Math.round(funnelData[index + 1].count / item.count * 100) : 0 }}%</span>
          </div>
        </div>
      </div>
      <div class="funnel-summary">
        <span>商机总数: <b>{{ funnelTotal.count }}</b></span>
        <span>总金额: <b>¥{{ formatAmount(funnelTotal.amount) }}</b></span>
        <span class="failed-info" v-if="funnelFailed.count > 0">失败: {{ funnelFailed.count }}个 / ¥{{ formatAmount(funnelFailed.amount) }}</span>
      </div>
    </div>

    <!-- 搜索区域 -->
    <el-card class="search-card" shadow="never">
      <el-form :model="searchForm" inline @keyup.enter="handleSearch">
        <el-form-item label="商机名称">
          <el-input v-model="searchForm.name" placeholder="请输入商机名称" clearable />
        </el-form-item>
        <el-form-item label="客户名称">
          <el-input v-model="searchForm.customer_name" placeholder="请输入客户名称" clearable />
        </el-form-item>
        <el-form-item label="阶段">
          <el-select v-model="searchForm.stage" placeholder="请选择阶段" clearable>
            <el-option v-for="item in stageOptions" :key="item.value" :label="item.label" :value="item.value" />
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
      <div class="toolbar">
        <el-button type="primary" :icon="Plus" @click="handleAdd" v-permission="'opportunity:add'">新增商机</el-button>
      </div>

      <el-table
        v-loading="loading"
        :data="tableData"
        stripe
        border
        style="width: 100%"
        :header-cell-style="{ background: 'var(--c-bg)', color: 'var(--c-text)' }"
      >
        <el-table-column prop="name" label="商机名称" min-width="180" show-overflow-tooltip />
        <el-table-column prop="customer_name" label="客户名称" min-width="160" show-overflow-tooltip />
        <el-table-column prop="expected_amount" label="预计金额" width="130" align="right">
          <template #default="{ row }">
            <span class="amount">¥{{ formatAmount(row.expected_amount) }}</span>
          </template>
        </el-table-column>
        <el-table-column prop="expected_date" label="预计成交日" width="120" align="center">
          <template #default="{ row }">
            {{ formatDate(row.expected_date) }}
          </template>
        </el-table-column>
        <el-table-column prop="stage" label="阶段" width="110" align="center">
          <template #default="{ row }">
            <el-tag :type="stageTagType(row.stage)" effect="dark" size="default">
              {{ stageMap[row.stage] || '未知' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="win_rate" label="赢单率" width="90" align="center">
          <template #default="{ row }">
            <el-progress
              :percentage="row.win_rate"
              :stroke-width="6"
              :show-text="true"
              :color="winRateColor(row.win_rate)"
              style="width: 70px; display: inline-block"
            />
          </template>
        </el-table-column>
        <el-table-column prop="owner_name" label="负责人" width="100" />
        <el-table-column prop="stagnant_days" label="停留天数" width="100" align="center" sortable>
          <template #default="{ row }">
            <el-tag
              v-if="row.stage < 5"
              :type="stagnantTagType(row.stagnant_days)"
              effect="dark"
              size="default"
            >
              {{ row.stagnant_days }}天
            </el-tag>
            <span v-else>-</span>
          </template>
        </el-table-column>
        <el-table-column prop="update_time" label="更新时间" width="170">
          <template #default="{ row }">
            {{ formatTime(row.update_time) }}
          </template>
        </el-table-column>
        <el-table-column label="操作" width="280" fixed="right">
          <template #default="{ row }">
            <el-button type="primary" link :icon="View" @click="handleViewDetail(row)">详情</el-button>
            <el-button v-if="row.stage < 5" type="success" link :icon="ArrowUp" @click="handlePushStage(row)" v-permission="'opportunity:edit'">推进</el-button>
            <el-button type="primary" link :icon="Edit" @click="handleEdit(row)" v-permission="'opportunity:edit'">编辑</el-button>
            <el-button type="danger" link :icon="Delete" @click="handleDelete(row)" v-permission="'opportunity:delete'">删除</el-button>
          </template>
        </el-table-column>
      </el-table>

      <div class="pagination">
        <el-pagination
          v-model:current-page="searchForm.page"
          v-model:page-size="searchForm.pageSize"
          :page-sizes="[10, 20, 50, 100]"
          :total="total"
          layout="total, sizes, prev, pager, next, jumper"
          @size-change="handleSearch"
          @current-change="handleSearch"
        />
      </div>
    </el-card>

    <!-- 新增/编辑弹窗 -->
    <el-dialog
      v-model="dialogVisible"
      :title="dialogTitle"
      width="600px"
      :close-on-click-modal="false"
      @closed="handleDialogClosed"
    >
      <el-form ref="formRef" :model="formData" :rules="formRules" label-width="100px">
        <el-form-item label="所属客户" prop="customer_id">
          <el-select
            v-model="formData.customer_id"
            placeholder="请选择客户"
            filterable
            remote
            :remote-method="searchCustomers"
            :loading="customerLoading"
            style="width: 100%"
          >
            <el-option
              v-for="item in customerOptions"
              :key="item.id"
              :label="item.company_name"
              :value="item.id"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="商机名称" prop="name">
          <el-input v-model="formData.name" placeholder="请输入商机名称" />
        </el-form-item>
        <el-row :gutter="24">
          <el-col :span="12">
            <el-form-item label="预计金额" prop="expected_amount">
              <el-input-number
                v-model="formData.expected_amount"
                :min="0"
                :step="10000"
                :precision="2"
                :controls="false"
                placeholder="请输入金额"
                style="width: 100%"
              />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="预计成交日" prop="expected_date">
              <el-date-picker
                v-model="formData.expected_date"
                type="date"
                placeholder="请选择日期"
                value-format="YYYY-MM-DD"
                style="width: 100%"
              />
            </el-form-item>
          </el-col>
        </el-row>
        <el-row :gutter="24">
          <el-col :span="12">
            <el-form-item label="阶段" prop="stage">
              <el-select v-model="formData.stage" placeholder="请选择阶段" style="width: 100%">
                <el-option v-for="item in stageOptions" :key="item.value" :label="item.label" :value="item.value" />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="赢单率" prop="win_rate">
              <el-input-number
                v-model="formData.win_rate"
                :min="0"
                :max="100"
                :step="5"
                placeholder="%"
                style="width: 100%"
              />
            </el-form-item>
          </el-col>
        </el-row>
        <el-form-item label="负责人" prop="owner_id" v-if="isEdit">
          <el-select
            v-model="formData.owner_id"
            placeholder="请选择负责人"
            filterable
            style="width: 100%"
          >
            <el-option
              v-for="item in userOptions"
              :key="item.id"
              :label="item.real_name || item.username"
              :value="item.id"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="备注" prop="remark">
          <el-input v-model="formData.remark" type="textarea" :rows="3" placeholder="请输入备注" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="submitLoading" @click="handleSubmit">确定</el-button>
      </template>
    </el-dialog>

    <!-- 推进阶段弹窗 -->
    <el-dialog v-model="pushDialogVisible" title="推进阶段" width="450px" :close-on-click-modal="false">
      <el-form label-width="80px">
        <el-form-item label="当前阶段">
          <el-tag :type="stageTagType(pushRow.stage)" effect="dark">
            {{ stageMap[pushRow.stage] || '未知' }}
          </el-tag>
        </el-form-item>
        <el-form-item label="目标阶段">
          <el-select v-model="pushTargetStage" placeholder="请选择目标阶段" style="width: 100%">
            <el-option
              v-for="item in pushStageOptions"
              :key="item.value"
              :label="item.label"
              :value="item.value"
            />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="pushDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="pushLoading" @click="handlePushConfirm">确定推进</el-button>
      </template>
    </el-dialog>

    <!-- 详情抽屉 -->
    <el-drawer v-model="drawerVisible" title="商机详情" size="500px" direction="rtl">
      <div v-if="drawerData" v-loading="drawerLoading">
        <div style="margin-bottom: 16px; display: flex; gap: 8px;">
          <el-button type="primary" size="small" @click="createQuoteFromOpportunity(drawerData)" v-permission="'quotation:add'">创建报价</el-button>
          <el-button type="success" size="small" @click="createContractFromOpportunity(drawerData)" v-permission="'contract:add'">创建合同</el-button>
        </div>
        <el-descriptions :column="2" border>
          <el-descriptions-item label="商机名称" :span="2">{{ drawerData.name }}</el-descriptions-item>
          <el-descriptions-item label="客户">{{ drawerData.customer_name }}</el-descriptions-item>
          <el-descriptions-item label="负责人">{{ drawerData.owner_name }}</el-descriptions-item>
          <el-descriptions-item label="预计金额">¥{{ formatAmount(drawerData.expected_amount) }}</el-descriptions-item>
          <el-descriptions-item label="预计成交日">{{ formatDate(drawerData.expected_date) }}</el-descriptions-item>
          <el-descriptions-item label="当前阶段">
            <el-tag :type="stageTagType(drawerData.stage)" effect="dark" size="small">{{ stageMap[drawerData.stage] }}</el-tag>
          </el-descriptions-item>
          <el-descriptions-item label="赢单率">{{ drawerData.win_rate }}%</el-descriptions-item>
          <el-descriptions-item label="创建时间" :span="2">{{ formatTime(drawerData.create_time) }}</el-descriptions-item>
          <el-descriptions-item label="备注" :span="2">{{ drawerData.remark || '-' }}</el-descriptions-item>
        </el-descriptions>

        <el-divider>阶段变更记录</el-divider>
        <el-timeline v-if="stageLogs.length > 0">
          <el-timeline-item
            v-for="log in stageLogs"
            :key="log.id"
            :timestamp="formatTime(log.changed_at)"
            placement="top"
          >
            <el-tag size="small" :type="stageTagType(log.from_stage)">{{ stageMap[log.from_stage] || '初始' }}</el-tag>
            <span style="margin: 0 8px; color: var(--c-text-tertiary)">→</span>
            <el-tag size="small" :type="stageTagType(log.to_stage)">{{ stageMap[log.to_stage] }}</el-tag>
            <div style="margin-top: 4px; color: var(--c-text-tertiary); font-size: 12px">
              <span>{{ log.changed_by_name }}</span>
              <span v-if="log.hours_in_stage"> · 停留 {{ formatHours(log.hours_in_stage) }}</span>
            </div>
            <div v-if="log.change_reason" style="margin-top: 2px; color: #666; font-size: 13px">
              原因：{{ log.change_reason }}
            </div>
          </el-timeline-item>
        </el-timeline>
        <el-empty v-else description="暂无阶段变更记录" />
      </div>
    </el-drawer>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Search, Refresh, Plus, Edit, Delete, ArrowUp, View } from '@element-plus/icons-vue'
import { post, get } from '@/utils/request'
import { formatTime, formatAmount } from '@/composables/useFormat'

const route = useRoute()
const router = useRouter()

const STAGE_MAP = {
  1: '询盘',
  2: '需求确认',
  3: '方案报价',
  4: '谈判',
  5: '成交',
  6: '失败'
}

const stageMap = STAGE_MAP

const stageOptions = [
  { label: '询盘', value: 1 },
  { label: '需求确认', value: 2 },
  { label: '方案报价', value: 3 },
  { label: '谈判', value: 4 },
  { label: '成交', value: 5 },
  { label: '失败', value: 6 }
]

const stageTagType = (stage) => {
  const map = { 1: 'info', 2: 'warning', 3: '', 4: 'danger', 5: 'success', 6: 'info' }
  return map[stage] || 'info'
}

const winRateColor = (rate) => {
  if (rate >= 70) return 'var(--c-primary)'
  if (rate >= 40) return 'var(--c-primary)'
  return 'var(--c-accent)'
}

// P0-2: 商机停滞天数颜色预警
const stagnantTagType = (days) => {
  if (days === null || days === undefined) return 'info'
  if (days > 15) return 'danger'     // 红色：超过15天
  if (days > 7) return 'warning'     // 黄色：超过7天
  if (days > 3) return ''            // 蓝色：超过3天
  return 'success'                    // 绿色：3天内
}

const formatDate = (date) => {
  if (!date) return '-'
  const d = new Date(date)
  return d.toLocaleDateString('zh-CN')
}

const formatHours = (hours) => {
  if (!hours && hours !== 0) return '-'
  if (hours < 24) return `${hours}小时`
  const days = Math.floor(hours / 24)
  const remainHours = hours % 24
  return remainHours > 0 ? `${days}天${remainHours}小时` : `${days}天`
}

// 搜索表单
const searchForm = reactive({
  name: '',
  customer_name: '',
  stage: '',
  page: 1,
  pageSize: 10
})

// 漏斗数据
const funnelData = ref([])
const funnelTotal = ref({ count: 0, amount: 0 })
const funnelFailed = ref({ count: 0, amount: 0 })

// 表格数据
const tableData = ref([])
const total = ref(0)
const loading = ref(false)

// 弹窗
const dialogVisible = ref(false)
const dialogTitle = ref('新增商机')
const isEdit = ref(false)
const submitLoading = ref(false)
const formRef = ref(null)
const currentId = ref(null)

const formData = reactive({
  customer_id: '',
  name: '',
  expected_amount: undefined,
  expected_date: '',
  stage: 1,
  win_rate: 10,
  remark: '',
  owner_id: ''
})

const formRules = {
  customer_id: [{ required: true, message: '请选择客户', trigger: 'change' }],
  name: [{ required: true, message: '请输入商机名称', trigger: 'blur' }]
}

const customerOptions = ref([])
const customerLoading = ref(false)
const userOptions = ref([])

// 推进弹窗
const pushDialogVisible = ref(false)
const pushRow = ref({})
const pushTargetStage = ref(null)
const pushLoading = ref(false)

// 详情抽屉
const drawerVisible = ref(false)
const drawerData = ref(null)
const drawerLoading = ref(false)
const stageLogs = ref([])

const handleViewDetail = async (row) => {
  drawerVisible.value = true
  drawerLoading.value = true
  drawerData.value = null
  stageLogs.value = []
  try {
    const [detailRes, logRes] = await Promise.all([
      get(`/opportunity/detail/${row.id}`),
      get(`/opportunity/stage-log/${row.id}`)
    ])
    if (detailRes.code === 200) drawerData.value = detailRes.data
    if (logRes.code === 200) stageLogs.value = logRes.data
  } catch { ElMessage.error('加载详情失败') }
  finally { drawerLoading.value = false }
}

const pushStageOptions = computed(() => {
  return stageOptions.filter(
    item => item.value > pushRow.value.stage && item.value !== 6
  )
})

// 获取销售漏斗
const fetchFunnel = async () => {
  try {
    const res = await get('/opportunity/funnel')
    if (res.code === 200) {
      funnelData.value = res.data.funnel
      funnelTotal.value = { count: res.data.total_count, amount: res.data.total_amount }
      funnelFailed.value = res.data.failed
    }
  } catch (error) {
    console.error('获取漏斗失败:', error)
  }
}

// 获取商机列表
const fetchList = async () => {
  loading.value = true
  try {
    const params = {
      page: searchForm.page,
      pageSize: searchForm.pageSize
    }
    if (searchForm.name) params.name = searchForm.name
    if (searchForm.customer_name) params.customer_name = searchForm.customer_name
    if (searchForm.stage !== '' && searchForm.stage !== null) params.stage = searchForm.stage

    const res = await post('/opportunity/list', params)
    if (res.code === 200) {
      tableData.value = res.data.list
      total.value = res.data.total
    }
  } catch (error) {
    ElMessage.error('加载商机列表失败'); console.error('获取商机列表失败:', error)
  } finally {
    loading.value = false
  }
}

const handleSearch = () => {
  searchForm.page = 1
  fetchList()
}

const handleReset = () => {
  searchForm.name = ''
  searchForm.customer_name = ''
  searchForm.stage = ''
  searchForm.page = 1
  fetchList()
}

const searchCustomers = async (query) => {
  if (!query) {
    customerOptions.value = []
    return
  }
  customerLoading.value = true
  try {
    const res = await post('/customer/list', { company_name: query, pageSize: 20 })
    if (res.code === 200) {
      customerOptions.value = res.data.list
    }
  } catch (error) {
    console.error('搜索客户失败:', error)
  } finally {
    customerLoading.value = false
  }
}

const fetchUsers = async () => {
  try {
    const res = await post('/user/list', { pageSize: 100 })
    if (res.code === 200) {
      userOptions.value = res.data.list
    }
  } catch (error) {
    console.error('获取用户列表失败:', error)
  }
}

const handleAdd = async (prefillCustomerId, prefillCustomerName) => {
  isEdit.value = false
  dialogTitle.value = '新增商机'
  currentId.value = null
  formData.customer_id = ''
  formData.name = ''
  formData.expected_amount = undefined
  formData.expected_date = ''
  formData.stage = 1
  formData.win_rate = 10
  formData.remark = ''
  formData.owner_id = ''
  if (prefillCustomerId) {
    customerOptions.value = [{ id: prefillCustomerId, company_name: prefillCustomerName || '' }]
    formData.customer_id = prefillCustomerId
  } else {
    customerOptions.value = []
  }
  await fetchUsers()
  dialogVisible.value = true
}

const handleEdit = async (row) => {
  isEdit.value = true
  dialogTitle.value = '编辑商机'
  currentId.value = row.id
  Object.assign(formData, {
    customer_id: row.customer_id,
    name: row.name || '',
    expected_amount: row.expected_amount,
    expected_date: row.expected_date || '',
    stage: row.stage,
    win_rate: row.win_rate,
    remark: row.remark || '',
    owner_id: row.owner_id || ''
  })
  customerOptions.value = [{ id: row.customer_id, company_name: row.customer_name }]
  await fetchUsers()
  dialogVisible.value = true
}

const handleDialogClosed = () => {
  formRef.value?.resetFields()
  Object.assign(formData, {
    customer_id: '',
    name: '',
    expected_amount: undefined,
    expected_date: '',
    stage: 1,
    win_rate: 10,
    remark: '',
    owner_id: ''
  })
  customerOptions.value = []
}

const handleSubmit = async () => {
  if (!formRef.value) return

  await formRef.value.validate(async (valid) => {
    if (!valid) return

    submitLoading.value = true
    try {
      const data = {
        customer_id: formData.customer_id,
        name: formData.name,
        expected_amount: formData.expected_amount,
        expected_date: formData.expected_date || null,
        stage: formData.stage,
        win_rate: formData.win_rate,
        remark: formData.remark
      }

      let res
      if (isEdit.value) {
        data.id = currentId.value
        if (formData.owner_id) data.owner_id = formData.owner_id
        res = await post('/opportunity/update', data)
      } else {
        res = await post('/opportunity/add', data)
      }

      if (res.code === 200) {
        ElMessage.success(isEdit.value ? '修改成功' : '新增成功')
        dialogVisible.value = false
        fetchList()
        fetchFunnel()
      }
    } catch (error) {
      console.error('提交失败:', error)
    } finally {
      submitLoading.value = false
    }
  })
}

const handlePushStage = (row) => {
  pushRow.value = row
  const nextStage = row.stage + 1
  const validOptions = stageOptions.filter(item => item.value > row.stage && item.value !== 6)
  pushTargetStage.value = validOptions.some(o => o.value === nextStage) ? nextStage : null
  pushDialogVisible.value = true
}

const handlePushConfirm = async () => {
  if (!pushTargetStage.value) {
    ElMessage.warning('请选择目标阶段')
    return
  }

  const targetLabel = stageOptions.find(s => s.value === pushTargetStage.value)?.label || pushTargetStage.value
  try {
    await ElMessageBox.confirm(
      `确定将商机"${pushRow.value.name}"推进到【${targetLabel}】阶段？`,
      '推进确认',
      { confirmButtonText: '确定', cancelButtonText: '取消', type: 'warning' }
    )
  } catch {
    return
  }

  pushLoading.value = true
  try {
    const res = await post('/opportunity/update-stage', {
      id: pushRow.value.id,
      stage: pushTargetStage.value
    })
    if (res.code === 200) {
      ElMessage.success(res.message)
      pushDialogVisible.value = false
      fetchList()
      fetchFunnel()
    }
  } catch (error) {
    console.error('推进失败:', error)
  } finally {
    pushLoading.value = false
  }
}

const handleDelete = (row) => {
  ElMessageBox.confirm(
    `确定要删除商机"${row.name}"吗？删除后数据不可恢复。`,
    '删除确认',
    {
      confirmButtonText: '确定删除',
      cancelButtonText: '取消',
      type: 'warning'
    }
  ).then(async () => {
    try {
      const res = await post('/opportunity/delete', { id: row.id })
      if (res.code === 200) {
        ElMessage.success('删除成功')
        fetchList()
        fetchFunnel()
      }
    } catch (error) {
      console.error('删除失败:', error)
    }
  })
}

const createQuoteFromOpportunity = (data) => {
  drawerVisible.value = false
  // [修复] 传递 opportunity_id 以建立商机→报价关联
  router.push({
    path: '/quotation/edit',
    query: { customer_id: data.customer_id, customer_name: data.customer_name, opportunity_id: data.id }
  })
}

const createContractFromOpportunity = (data) => {
  drawerVisible.value = false
  router.push({
    path: '/contract',
    query: { customer_id: data.customer_id, opportunity_id: data.id, customer_name: data.customer_name }
  })
}

onMounted(() => {
  fetchFunnel()
  fetchList()
  if (route.query.customer_id) {
    handleAdd(parseInt(route.query.customer_id), route.query.customer_name)
  } else if (route.query.action === 'add') {
    handleAdd()
  }
})
</script>

<style scoped>
.opportunity-list {
  padding: 0;
}

.funnel-section {
  background: #fff;
  border-radius: 8px;
  padding: 24px;
  margin-bottom: 16px;
}

.section-title {
  margin: 0 0 16px 0;
  font-size: 16px;
  color: var(--c-text);
}

.funnel-cards {
  display: flex;
  gap: 8px;
  align-items: stretch;
}

.funnel-card {
  background: var(--c-bg);
  border-radius: 8px;
  padding: 16px 12px;
  text-align: center;
  position: relative;
  min-width: 100px;
}

.funnel-card.funnel-stage-1 { border-top: 3px solid var(--c-text-tertiary); }
.funnel-card.funnel-stage-2 { border-top: 3px solid var(--c-primary); }
.funnel-card.funnel-stage-3 { border-top: 3px solid var(--c-primary); }
.funnel-card.funnel-stage-4 { border-top: 3px solid var(--c-accent); }
.funnel-card.funnel-stage-5 { border-top: 3px solid var(--c-primary); }

.funnel-tag {
  font-size: 12px;
  color: var(--c-text-tertiary);
  margin-bottom: 8px;
}

.funnel-count {
  font-size: 28px;
  font-weight: 700;
  color: var(--c-text);
  line-height: 1.2;
}

.funnel-label {
  font-size: 12px;
  color: var(--c-text-tertiary);
  margin-bottom: 8px;
}

.funnel-amount {
  font-size: 13px;
  color: var(--c-text-secondary);
  font-weight: 500;
}

.funnel-arrow {
  position: absolute;
  right: -8px;
  top: 50%;
  z-index: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
}

.arrow-icon {
  font-size: 12px;
  color: #c0c4cc;
}

.arrow-text {
  font-size: 10px;
  color: var(--c-text-tertiary);
}

.funnel-summary {
  margin-top: 16px;
  display: flex;
  gap: 24px;
  font-size: 14px;
  color: var(--c-text-secondary);
}

.funnel-summary b {
  color: var(--c-text);
}

.failed-info {
  color: var(--c-accent);
}

.search-card {
  margin-bottom: 16px;
}

.table-card {
  margin-bottom: 16px;
}

.toolbar {
  margin-bottom: 16px;
}

.amount {
  font-weight: 600;
  color: var(--c-text);
}

.pagination {
  margin-top: 16px;
  display: flex;
  justify-content: flex-end;
}
</style>
