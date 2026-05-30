<template>
  <div class="page-container">
    <div class="page-header">
      <h2>售后服务工单</h2>
    </div>

    <!-- 视图切换 -->
    <div class="view-toggle" style="margin-bottom: 16px; display: flex; gap: 16px; align-items: center;">
      <el-radio-group v-model="viewMode" @change="handleViewChange">
        <el-radio-button label="all">全部工单</el-radio-button>
        <el-radio-button label="mine">我的工单</el-radio-button>
      </el-radio-group>
      <el-radio-group v-model="quickFilter" @change="handleQuickFilter" size="small">
        <el-radio-button label="">不限</el-radio-button>
        <el-radio-button label="today">今日工单</el-radio-button>
        <el-radio-button label="timeout">超时工单</el-radio-button>
      </el-radio-group>
    </div>

    <!-- 搜索区域 -->
    <el-card class="search-card">
      <el-form :model="searchForm" inline>
        <el-form-item label="工单编号">
          <el-input v-model="searchForm.keyword" placeholder="输入工单编号或客户名称" clearable />
        </el-form-item>
        <el-form-item label="服务类型">
          <el-select v-model="searchForm.type" placeholder="全部" clearable>
            <el-option v-for="t in types" :key="t.value" :label="t.label" :value="t.value" />
          </el-select>
        </el-form-item>
        <el-form-item label="状态">
          <el-select v-model="searchForm.status" placeholder="全部" clearable>
            <el-option v-for="s in statusList" :key="s.value" :label="s.label" :value="s.value" />
          </el-select>
        </el-form-item>
        <el-form-item label="优先级">
          <el-select v-model="searchForm.priority" placeholder="全部" clearable>
            <el-option v-for="p in priorityList" :key="p.value" :label="p.label" :value="p.value" />
          </el-select>
        </el-form-item>
        <el-form-item>
          <el-button type="primary" @click="handleSearch">搜索</el-button>
          <el-button @click="resetSearch">重置</el-button>
        </el-form-item>
      </el-form>
      <el-button type="primary" :icon="Plus" @click="openAddModal" style="margin-left: auto;" v-permission="'service:add'">新建工单</el-button>
    </el-card>

    <!-- 工单列表 -->
    <el-card>
      <div class="toolbar" v-if="isAdmin">
        <el-select v-model="batchAssigneeId" placeholder="选择工程师" style="width: 160px" clearable>
          <el-option v-for="u in engineers" :key="u.id" :label="u.real_name" :value="u.id" />
        </el-select>
        <el-button type="warning" :disabled="selectedServiceRows.length === 0 || !batchAssigneeId" @click="handleBatchAssign">
          批量分配 ({{ selectedServiceRows.length }})
        </el-button>
      </div>
      <el-table v-loading="loading" :data="tableData" stripe border style="width: 100%" :header-cell-style="{ background: 'var(--c-bg)', color: 'var(--c-text)' }"
        @selection-change="handleSelectionChange">
        <el-table-column type="selection" width="50" :selectable="(row) => row.status === 1" />
        <el-table-column prop="order_no" label="工单编号" min-width="140" show-overflow-tooltip />
        <el-table-column prop="customer_name" label="客户名称" min-width="160">
          <template #default="{ row }">
            <el-link v-if="row.customer_id" type="primary" @click="router.push(`/customer/detail/${row.customer_id}`)">{{ row.customer_name }}</el-link>
            <span v-else>{{ row.customer_name }}</span>
          </template>
        </el-table-column>
        <el-table-column prop="type" label="服务类型" width="90">
          <template #default="{ row }">
            <el-tag :type="getTypeTag(row.type)">{{ row.type }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="title" label="工单标题" min-width="180" show-overflow-tooltip />
        <el-table-column prop="priority" label="优先级" width="80">
          <template #default="{ row }">
            <el-tag :type="getPriorityTag(row.priority)">{{ getPriorityText(row.priority) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="status" label="状态" width="90">
          <template #default="{ row }">
            <el-tag :type="getStatusTag(row.status)">{{ getStatusText(row.status) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="assignee_name" label="处理人" width="100" />
        <el-table-column prop="create_time" label="创建时间" width="150" />
        <el-table-column label="操作" width="220" fixed="right">
          <template #default="{ row }">
            <el-button type="primary" link @click="handleView(row)">查看</el-button>
            <el-button v-if="row.status === 1" type="primary" link @click="openEditModal(row)" v-permission="'service:edit'">编辑</el-button>
            <el-button v-if="row.status === 1" type="primary" link @click="handleAssign(row)" v-permission="'service:edit'">分配</el-button>
            <el-button v-if="row.status === 2 || row.status === 3" type="primary" link @click="handleProcess(row)" v-permission="'service:edit'">处理</el-button>
            <el-button v-if="row.status === 4" type="success" link @click="handleConfirm(row)" v-permission="'service:edit'">确认</el-button>
            <el-button v-if="row.status === 1" type="danger" link @click="handleDelete(row)" v-permission="'service:delete'">删除</el-button>
          </template>
        </el-table-column>
      </el-table>

      <el-pagination
        :current-page="pagination.page"
        :page-size="pagination.pageSize"
        :total="pagination.total"
        @size-change="handleSizeChange"
        @current-change="handleCurrentChange"
        layout="total, sizes, prev, pager, next, jumper"
        style="margin-top: 24px; text-align: right;"
      />
    </el-card>

    <!-- 新建工单弹窗 -->
    <el-dialog :title="isEdit ? '编辑工单' : '新建工单'" v-model="addVisible" width="600px">
      <el-form :model="formData" label-width="100px">
        <el-form-item label="客户" required>
          <el-select v-model="formData.customer_id" placeholder="请选择客户">
            <el-option v-for="c in customers" :key="c.id" :label="c.company_name" :value="c.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="关联合同">
          <el-select v-model="formData.contract_id" placeholder="请选择合同（可选）">
            <el-option v-for="c in contracts" :key="c.id" :label="c.contract_no" :value="c.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="服务类型" required>
          <el-select v-model="formData.type" placeholder="请选择服务类型">
            <el-option v-for="t in types" :key="t.value" :label="t.label" :value="t.value" />
          </el-select>
        </el-form-item>
        <el-form-item label="工单标题" required>
          <el-input v-model="formData.title" placeholder="请输入工单标题" />
        </el-form-item>
        <el-form-item label="问题描述">
          <el-input type="textarea" v-model="formData.description" placeholder="请输入问题描述" :rows="4" />
        </el-form-item>
        <el-form-item label="优先级">
          <el-select v-model="formData.priority" placeholder="请选择优先级">
            <el-option v-for="p in priorityList" :key="p.value" :label="p.label" :value="p.value" />
          </el-select>
        </el-form-item>
        <el-form-item label="附件">
          <el-upload
            ref="uploadRef"
            :action="uploadUrl"
            :headers="uploadHeaders"
            :data="{ business_type: 'service_order' }"
            :on-success="handleUploadSuccess"
            :on-remove="handleUploadRemove"
            :on-error="handleUploadError"
            :file-list="uploadFileList"
            multiple
            :limit="9"
            accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.zip,.rar"
          >
            <el-button size="small" type="primary">选择文件</el-button>
            <template #tip><span class="el-upload__tip">支持图片、文档，最多9个文件</span></template>
          </el-upload>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="addVisible = false">取消</el-button>
        <el-button type="primary" :loading="submitting" @click="handleAdd">{{ isEdit ? '保存修改' : '确定' }}</el-button>
      </template>
    </el-dialog>

    <!-- 分配工程师弹窗 -->
    <el-dialog title="分配工程师" v-model="assignVisible" width="400px">
      <el-form :model="assignData" label-width="100px">
        <el-form-item label="工程师" required>
          <el-select v-model="assignData.assignee_id" placeholder="请选择工程师">
            <el-option v-for="u in engineers" :key="u.id" :label="u.real_name" :value="u.id" />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="assignVisible = false">取消</el-button>
        <el-button type="primary" :loading="submitting" @click="handleSubmitAssign">确定</el-button>
      </template>
    </el-dialog>

    <!-- 处理工单弹窗 -->
    <el-dialog title="处理工单" v-model="processVisible" width="600px">
      <el-form :model="processData" label-width="100px">
        <el-form-item label="工单状态">
          <el-select v-model="processData.status" placeholder="请选择状态">
            <el-option :label="statusList.find(s => s.value === 3)?.label" :value="3" />
            <el-option :label="statusList.find(s => s.value === 4)?.label" :value="4" />
          </el-select>
        </el-form-item>
        <el-form-item label="处理结果">
          <el-input type="textarea" v-model="processData.finish_desc" placeholder="请输入处理结果" :rows="5" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="processVisible = false">取消</el-button>
        <el-button type="primary" :loading="submitting" @click="handleSubmitProcess">确定</el-button>
      </template>
    </el-dialog>

    <!-- 客户确认弹窗 -->
    <el-dialog title="确认工单" v-model="confirmVisible" width="400px">
      <div class="confirm-content">
        <p>请对本次服务进行评价：</p>
        <div class="star-rating">
          <el-rate v-model="confirmData.satisfaction" :max="5" allow-half="false" />
        </div>
        <p class="rating-desc">1星-非常不满意 5星-非常满意</p>
      </div>
      <template #footer>
        <el-button @click="confirmVisible = false">取消</el-button>
        <el-button type="primary" :loading="submitting" @click="handleSubmitConfirm">确认完成</el-button>
      </template>
    </el-dialog>

    <!-- 工单详情弹窗 -->
    <el-dialog title="工单详情" v-model="detailVisible" width="800px">
      <div class="detail-content" v-if="detailData">
        <div class="detail-header">
          <div class="detail-title">
            <span class="order-no">{{ detailData.order_no }}</span>
            <el-tag :type="getStatusTag(detailData.status)" style="margin-left: 8px;">{{ getStatusText(detailData.status) }}</el-tag>
            <el-tag :type="getPriorityTag(detailData.priority)" style="margin-left: 8px;">{{ getPriorityText(detailData.priority) }}</el-tag>
          </div>
          <h3>{{ detailData.title }}</h3>
        </div>

        <el-divider />

        <el-row :gutter="24">
          <el-col :span="12">
            <h4>客户信息</h4>
            <div class="info-item"><span class="label">客户名称：</span><el-link v-if="detailData.customer_id" type="primary" @click="router.push(`/customer/detail/${detailData.customer_id}`)">{{ detailData.customer_name }}</el-link><span v-else>{{ detailData.customer_name }}</span></div>
            <div class="info-item"><span class="label">联系人：</span>{{ detailData.customer_contact }}</div>
            <div class="info-item"><span class="label">联系电话：</span>{{ detailData.customer_phone }}</div>
            <div class="info-item"><span class="label">地址：</span>{{ detailData.customer_address }}</div>
          </el-col>
          <el-col :span="12">
            <h4>工单信息</h4>
            <div class="info-item"><span class="label">服务类型：</span>{{ detailData.type }}</div>
            <div class="info-item"><span class="label">关联合同：</span>{{ detailData.contract_no || '-' }}</div>
            <div class="info-item"><span class="label">处理人：</span>{{ detailData.assignee_name || '-' }}</div>
            <div class="info-item"><span class="label">创建人：</span>{{ detailData.create_by_name }}</div>
            <div class="info-item"><span class="label">创建时间：</span>{{ formatTime(detailData.create_time) }}</div>
            <div class="info-item"><span class="label">完成时间：</span>{{ detailData.finish_time ? formatTime(detailData.finish_time) : '-' }}</div>
          </el-col>
        </el-row>

        <el-divider />

        <div>
          <h4>问题描述</h4>
          <p class="desc-text">{{ detailData.description }}</p>
        </div>

        <div v-if="detailData.finish_desc">
          <el-divider />
          <h4>处理结果</h4>
          <p class="desc-text">{{ detailData.finish_desc }}</p>
        </div>

        <div v-if="detailData.satisfaction">
          <el-divider />
          <h4>客户评价</h4>
          <el-rate :value="detailData.satisfaction" :max="5" disabled />
        </div>

        <div v-if="detailData.attachments && detailData.attachments.length > 0">
          <el-divider />
          <h4>附件</h4>
          <div class="attachment-list">
            <div v-for="att in detailData.attachments" :key="att.id" class="attachment-item">
              <template v-if="isImage(att.file_type)">
                <el-image :src="att.file_path" :preview-src-list="imagePaths()" fit="cover" style="width:100px;height:100px;margin:4px" />
              </template>
              <template v-else>
                <el-link :href="att.file_path" target="_blank" type="primary">{{ att.file_name }}</el-link>
              </template>
            </div>
          </div>
        </div>
      </div>
      <template #footer>
        <el-button @click="detailVisible = false">关闭</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus } from '@element-plus/icons-vue'
import request from '@/utils/request'
import { formatTime } from '@/composables/useFormat'

// 上传相关
const uploadUrl = '/api/upload/file'
const uploadHeaders = { Authorization: `Bearer ${localStorage.getItem('token') || ''}` }
const uploadFileList = ref([])
const attachmentIds = ref([])
const uploadRef = ref(null)

const route = useRoute()
const router = useRouter()
const loading = ref(false)
const tableData = ref([])
// [新增] 视图切换：全部/我的工单（非管理员默认显示我的工单）
const userInfo = JSON.parse(localStorage.getItem('userInfo') || '{}')
const currentUserId = userInfo.userId || userInfo.id
const isAdmin = userInfo.roleId === 1 || userInfo.roleId === 2 || userInfo.manageAll
const viewMode = ref(isAdmin ? 'all' : 'mine')
const quickFilter = ref('')
const selectedServiceRows = ref([])
const batchAssigneeId = ref(null)
const types = ref([])
const statusList = ref([])
const priorityList = ref([])
const customers = ref([])
const contracts = ref([])
const engineers = ref([])

const pagination = reactive({
  page: 1,
  pageSize: 10,
  total: 0
})

const searchForm = reactive({
  keyword: '',
  type: '',
  status: '',
  priority: ''
})

const addVisible = ref(false)
// [新增] 编辑模式标识
const isEdit = ref(false)
const editingId = ref(null)
const formData = reactive({
  customer_id: '',
  contract_id: '',
  type: '',
  title: '',
  description: '',
  priority: 3
})

const assignVisible = ref(false)
const assignData = reactive({
  id: '',
  assignee_id: ''
})

const processVisible = ref(false)
const processData = reactive({
  id: '',
  status: 3,
  finish_desc: ''
})

const confirmVisible = ref(false)
const confirmData = reactive({
  id: '',
  satisfaction: 5
})

// [防重复] 提交按钮loading状态
const submitting = ref(false)

const detailVisible = ref(false)
const detailData = ref(null)

onMounted(() => {
  getTypes()
  getStatusList()
  getPriorityList()
  getCustomers()
  getEngineers()
  getContracts()
  getList()
  // 首页快捷按钮带 ?action=add 时自动打开工单弹窗
  if (route.query.action === 'add') openAddModal()
  // 通知深链接：带 ?id 时自动打开对应工单详情
  if (route.query.id) handleView({ id: route.query.id })
})

function getTypes() {
  request.get('/service/types').then(res => {
    if (res.code === 200) {
      types.value = res.data
    }
  })
}

function getStatusList() {
  request.get('/service/status-list').then(res => {
    if (res.code === 200) {
      statusList.value = res.data
    }
  })
}

function getPriorityList() {
  request.get('/service/priority-list').then(res => {
    if (res.code === 200) {
      priorityList.value = res.data
    }
  })
}

function getCustomers() {
  // [修复] axios拦截器已解包，直接使用 res.code 而非 res.data?.code
  request.post('/customer/list', { page: 1, pageSize: 200 }).then(res => {
    if (res.code === 200) customers.value = res.data?.list || []
  }).catch(() => {})
}

function getEngineers() {
  // [修复] 同上
  request.post('/user/list', { pageSize: 200 }).then(res => {
    if (res.code === 200) engineers.value = res.data?.list || []
  }).catch(() => {})
}

function getList() {
  loading.value = true
  const params = {
    page: pagination.page,
    pageSize: pagination.pageSize,
    ...searchForm
  }
  // "我的工单"视图：只查分配给当前用户的工单
  if (viewMode.value === 'mine') {
    params.assignee_id = currentUserId
  }
  // 快捷筛选
  if (quickFilter.value === 'today') {
    params.created_today = true
  } else if (quickFilter.value === 'timeout') {
    params.is_timeout = true
  }
  request.post('/service/list', params).then(res => {
    if (res.code === 200) {
      tableData.value = res.data.list
      pagination.total = res.data.total
    }
  }).finally(() => {
    loading.value = false
  })
}

function handleViewChange() {
  pagination.page = 1
  getList()
}

function handleQuickFilter() {
  pagination.page = 1
  getList()
}

function handleSelectionChange(rows) {
  selectedServiceRows.value = rows
}

function handleBatchAssign() {
  if (selectedServiceRows.value.length === 0 || !batchAssigneeId.value) return
  ElMessageBox.confirm(`确定将 ${selectedServiceRows.value.length} 个工单批量分配给该工程师？`, '批量分配', { type: 'warning' }).then(async () => {
    submitting.value = true
    try {
      const res = await request.post('/service/batch-assign', {
        ids: selectedServiceRows.value.map(r => r.id),
        assignee_id: batchAssigneeId.value
      })
      if (res.code === 200) {
        ElMessage.success(res.message)
        batchAssigneeId.value = null
        selectedServiceRows.value = []
        getList()
      }
    } catch { /* error handled by interceptor */ }
    finally { submitting.value = false }
  }).catch(() => {})
}

function handleSearch() {
  pagination.page = 1
  getList()
}

function resetSearch() {
  searchForm.keyword = ''
  searchForm.type = ''
  searchForm.status = ''
  searchForm.priority = ''
  pagination.page = 1
  getList()
}

function handleSizeChange(val) {
  pagination.pageSize = val
  getList()
}

function handleCurrentChange(val) {
  pagination.page = val
  getList()
}

function openAddModal() {
  isEdit.value = false
  editingId.value = null
  formData.customer_id = ''
  formData.contract_id = ''
  formData.type = ''
  formData.title = ''
  formData.description = ''
  formData.priority = 3
  uploadFileList.value = []
  attachmentIds.value = []
  addVisible.value = true
}

// [新增] 打开编辑对话框，预填当前工单数据
function openEditModal(row) {
  isEdit.value = true
  editingId.value = row.id
  formData.customer_id = row.customer_id
  formData.contract_id = row.contract_id || ''
  formData.type = row.type
  formData.title = row.title
  formData.description = row.description || ''
  formData.priority = row.priority
  addVisible.value = true
}

function handleAdd() {
  if (!formData.customer_id || !formData.type || !formData.title) {
    ElMessage.warning('请填写客户、服务类型和工单标题')
    return
  }

  submitting.value = true
  const data = { ...formData, attachment_ids: [...attachmentIds.value] }
  // 编辑模式：调用update接口
  if (isEdit.value) {
    request.post('/service/update', { id: editingId.value, ...data }).then(res => {
      if (res.code === 200) {
        ElMessage.success('修改工单成功')
        addVisible.value = false
        getList()
      } else {
        ElMessage.error(res.message || '修改失败')
      }
    }).catch(() => ElMessage.error('修改工单失败')).finally(() => { submitting.value = false })
    return
  }

  request.post('/service/add', data).then(res => {
    if (res.code === 200) {
      ElMessage.success('创建工单成功')
      addVisible.value = false
      getList()
    } else {
      ElMessage.error(res.message || '创建失败')
    }
  }).catch(() => ElMessage.error('创建工单失败')).finally(() => { submitting.value = false })
}

function getContracts() {
  request.post('/contract/list', { pageSize: 100 }).then(res => {
    if (res.code === 200) {
      contracts.value = res.data.list
    }
  })
}

function handleView(row) {
  request.get(`/service/detail/${row.id}`).then(res => {
    if (res.code === 200) {
      detailData.value = res.data
      detailVisible.value = true
    }
  })
}

function handleAssign(row) {
  assignData.id = row.id
  assignData.assignee_id = ''
  assignVisible.value = true
}

function handleSubmitAssign() {
  if (!assignData.assignee_id) return
  submitting.value = true
  request.post('/service/assign', { id: assignData.id, assignee_id: assignData.assignee_id }).then(res => {
    if (res.code === 200) {
      assignVisible.value = false
      getList()
    }
  }).finally(() => { submitting.value = false })
}

function handleProcess(row) {
  processData.id = row.id
  processData.status = row.status === 2 ? 3 : row.status
  processData.finish_desc = ''
  processVisible.value = true
}

function handleSubmitProcess() {
  if (processData.status === 4 && !processData.finish_desc) {
    return
  }
  submitting.value = true
  if (processData.status === 3) {
    request.post('/service/start', { id: processData.id }).then(res => {
      if (res.code === 200) {
        processVisible.value = false
        getList()
      }
    }).finally(() => { submitting.value = false })
  } else {
    request.post('/service/finish', { id: processData.id, finish_desc: processData.finish_desc }).then(res => {
      if (res.code === 200) {
        processVisible.value = false
        getList()
      }
    }).finally(() => { submitting.value = false })
  }
}

function handleConfirm(row) {
  confirmData.id = row.id
  confirmData.satisfaction = 5
  confirmVisible.value = true
}

function handleSubmitConfirm() {
  submitting.value = true
  request.post('/service/confirm', { id: confirmData.id, satisfaction: confirmData.satisfaction }).then(res => {
    if (res.code === 200) {
      confirmVisible.value = false
      getList()
    }
  }).finally(() => { submitting.value = false })
}

function handleDelete(row) {
  ElMessageBox.confirm('确定要删除该工单吗？', '提示', { type: 'warning' }).then(() => {
    submitting.value = true
    request.post('/service/delete', { id: row.id }).then(res => {
      if (res.code === 200) {
        ElMessage.success('删除成功')
        getList()
      } else {
        ElMessage.error(res.message || '删除失败')
      }
    }).catch(() => ElMessage.error('删除失败')).finally(() => { submitting.value = false })
  }).catch(() => {})
}

function getStatusText(status) {
  const map = { 1: '待分配', 2: '已分配', 3: '处理中', 4: '待确认', 5: '已完成' }
  return map[status] || status
}

function getStatusTag(status) {
  const map = { 1: 'warning', 2: 'info', 3: 'primary', 4: 'success', 5: 'success' }
  return map[status] || 'info'
}

function getPriorityText(priority) {
  const map = { 1: '紧急', 2: '高', 3: '中', 4: '低' }
  return map[priority] || priority
}

function getPriorityTag(priority) {
  const map = { 1: 'danger', 2: 'warning', 3: 'info', 4: 'success' }
  return map[priority] || 'info'
}

function getTypeTag(type) {
  const map = { '安装': 'success', '维修': 'danger', '保养': 'info', '培训': 'warning', '其他': 'primary' }
  return map[type] || 'info'
}

function handleUploadSuccess(res, file) {
  if (res.code === 200 && res.data) {
    res.data.forEach(item => {
      if (!attachmentIds.value.includes(item.id)) {
        attachmentIds.value.push(item.id)
      }
    })
  } else {
    ElMessage.error(res.message || '上传失败')
  }
}

function handleUploadRemove(file) {
  const res = file.response
  if (res && res.data) {
    res.data.forEach(item => {
      const idx = attachmentIds.value.indexOf(item.id)
      if (idx > -1) attachmentIds.value.splice(idx, 1)
    })
  }
}

function handleUploadError() {
  ElMessage.error('文件上传失败')
}

function isImage(fileType) {
  return fileType && fileType.startsWith('image/')
}

const imagePaths = () => {
  return (detailData.value?.attachments || [])
    .filter(a => isImage(a.file_type))
    .map(a => a.file_path)
}

</script>

<style scoped>
.page-container {
  padding: 24px;
}

.page-header {
  margin-bottom: 24px;
}

.page-header h2 {
  margin: 0;
  font-size: 18px;
  color: var(--c-text);
}

.search-card {
  margin-bottom: 24px;
  display: flex;
  align-items: center;
}

.toolbar {
  margin-bottom: 16px;
  display: flex;
  gap: 8px;
  align-items: center;
}

.detail-header {
  margin-bottom: 16px;
}

.order-no {
  font-size: 16px;
  font-weight: bold;
  color: var(--c-primary);
}

.detail-title h3 {
  margin: 8px 0 0 0;
  font-size: 16px;
}

.info-item {
  margin-bottom: 8px;
}

.info-item .label {
  color: var(--c-text-tertiary);
  margin-right: 8px;
}

.desc-text {
  padding: 8px;
  background: var(--c-bg);
  border-radius: 4px;
  margin: 0;
  line-height: 1.6;
}

.confirm-content {
  text-align: center;
  padding: 24px;
}

.star-rating {
  margin: 20px 0;
  font-size: 32px;
}

.rating-desc {
  color: var(--c-text-tertiary);
  font-size: 12px;
}

.attachment-list {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 8px;
}

.attachment-item {
  display: inline-block;
}
</style>
