<template>
  <div class="customer-detail">
    <!-- 顶部操作栏 -->
    <div class="detail-header">
      <el-button :icon="ArrowLeft" @click="goBack">返回列表</el-button>
      <span class="page-title">客户详情 — {{ customer.company_name }}</span>
      <div class="header-actions">
        <!-- 老板分配负责人 -->
        <template v-if="isBoss && customer.owner_id">
          <span class="assign-label">负责人：</span>
          <el-select
            :model-value="customer.owner_id"
            placeholder="选择负责人"
            size="default"
            style="width: 150px"
            @change="handleAssignOwner"
          >
            <el-option
              v-for="u in salesUsers"
              :key="u.id"
              :label="u.real_name"
              :value="u.id"
            />
          </el-select>
        </template>
        <el-button
          type="primary"
          :icon="EditPen"
          @click="handleEdit"
        >编辑客户</el-button>
        <el-button
          v-if="customer.owner_id && customer.pool_status === 0"
          type="warning"
          :icon="Share"
          @click="handleRelease"
        >释放到公海</el-button>
      </div>
    </div>

    <!-- 客户信息卡片 -->
    <el-card class="info-card" shadow="never" v-loading="loading">
      <template #header>
        <div class="card-header">
          <span class="card-title">{{ customer.company_name }}</span>
          <div class="card-tags">
            <el-tag v-if="customer.pool_status === 1" type="warning" effect="dark" size="large">公海客户</el-tag>
            <el-tag v-else-if="isProtected()" type="success" size="large">
              保护期至 {{ formatTime(customer.protect_until) }}
            </el-tag>
            <el-tag :type="levelTagType(customer.level)" effect="dark" size="large">
              {{ customer.level }}级客户
            </el-tag>
            <el-tag :type="statusTagType(customer.status)" size="large">
              {{ statusMap[customer.status] }}
            </el-tag>
          </div>
        </div>
        <el-alert
          v-if="customer.pool_status === 1"
          type="warning"
          :closable="false"
          show-icon
          style="margin-bottom: 16px"
        >
          该客户目前在公海中，无人负责。可前往
          <router-link to="/customer/pool" style="font-weight: bold;">客户公海</router-link>
          认领该客户。
        </el-alert>
      </template>
      <el-descriptions :column="4" border>
        <el-descriptions-item label="联系人">{{ customer.contact_name || '-' }}</el-descriptions-item>
        <el-descriptions-item label="电话"><a v-if="customer.phone" :href="'tel:' + customer.phone" style="color: var(--el-color-primary); text-decoration: none;">{{ customer.phone }}</a><span v-else>-</span></el-descriptions-item>
        <el-descriptions-item label="邮箱">{{ customer.email || '-' }}</el-descriptions-item>
        <el-descriptions-item label="所属行业">{{ customer.industry || '-' }}</el-descriptions-item>
        <el-descriptions-item label="客户来源">{{ customer.source || '-' }}</el-descriptions-item>
        <el-descriptions-item label="负责销售">{{ customer.owner_name || '-' }}</el-descriptions-item>
        <el-descriptions-item label="创建时间">{{ formatTime(customer.create_time) }}</el-descriptions-item>
        <el-descriptions-item label="更新时间">{{ formatTime(customer.update_time) }}</el-descriptions-item>
        <el-descriptions-item label="地址" :span="2">{{ customer.address || '-' }}</el-descriptions-item>
        <el-descriptions-item label="备注" :span="2">{{ customer.remark || '-' }}</el-descriptions-item>
      </el-descriptions>
    </el-card>

    <!-- 标签页切换 -->
    <el-card class="tab-card" shadow="never">
      <el-tabs v-model="activeTab" type="card">
        <!-- 基本信息 -->
        <el-tab-pane label="基本信息" name="basic">
          <el-empty v-if="!customer.id" description="暂无数据" />
          <el-form v-else label-width="100px" :model="customer">
            <el-row :gutter="24">
              <el-col :span="12">
                <el-form-item label="公司名称">{{ customer.company_name }}</el-form-item>
              </el-col>
              <el-col :span="12">
                <el-form-item label="联系人">{{ customer.contact_name || '-' }}</el-form-item>
              </el-col>
            </el-row>
            <el-row :gutter="24">
              <el-col :span="12">
                <el-form-item label="电话"><a v-if="customer.phone" :href="'tel:' + customer.phone" style="color: var(--el-color-primary); text-decoration: none;">{{ customer.phone }}</a><span v-else>-</span></el-form-item>
              </el-col>
              <el-col :span="12">
                <el-form-item label="邮箱">{{ customer.email || '-' }}</el-form-item>
              </el-col>
            </el-row>
            <el-row :gutter="24">
              <el-col :span="12">
                <el-form-item label="所属行业">{{ customer.industry || '-' }}</el-form-item>
              </el-col>
              <el-col :span="12">
                <el-form-item label="客户来源">{{ customer.source || '-' }}</el-form-item>
              </el-col>
            </el-row>
            <el-row :gutter="24">
              <el-col :span="12">
                <el-form-item label="客户等级">{{ customer.level || '-' }}</el-form-item>
              </el-col>
              <el-col :span="12">
                <el-form-item label="负责销售">{{ customer.owner_name || '-' }}</el-form-item>
              </el-col>
            </el-row>
            <el-form-item label="地址">{{ customer.address || '-' }}</el-form-item>
            <el-form-item label="备注">{{ customer.remark || '-' }}</el-form-item>
          </el-form>
        </el-tab-pane>

        <!-- 联系人 -->
        <el-tab-pane label="联系人" name="contact">
          <div class="tab-toolbar">
            <el-button type="primary" :icon="Plus" @click="handleContactAdd">新增联系人</el-button>
          </div>
          <el-table :data="contacts" stripe border>
            <el-table-column prop="name" label="姓名" width="100" />
            <el-table-column prop="position" label="职位" width="120" />
            <el-table-column prop="phone" label="电话" width="130">
              <template #default="{ row }">
                <a v-if="row.phone" :href="'tel:' + row.phone" style="color: var(--el-color-primary); text-decoration: none;">{{ row.phone }}</a>
                <span v-else>-</span>
              </template>
            </el-table-column>
            <el-table-column prop="email" label="邮箱" min-width="160" />
            <el-table-column prop="wechat" label="微信" width="120" />
            <el-table-column prop="is_decision" label="决策人" width="80" align="center">
              <template #default="{ row }">
                <el-tag :type="row.is_decision ? 'danger' : 'info'" size="small">
                  {{ row.is_decision ? '是' : '否' }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column label="操作" width="150" fixed="right">
              <template #default="{ row }">
                <el-button type="primary" link :icon="Edit" @click="handleContactEdit(row)">编辑</el-button>
                <el-button type="danger" link :icon="Delete" @click="handleContactDelete(row)">删除</el-button>
              </template>
            </el-table-column>
          </el-table>
        </el-tab-pane>

        <!-- 跟进记录 -->
        <el-tab-pane label="跟进记录" name="follow">
          <div class="tab-toolbar">
            <el-button type="primary" :icon="Plus" @click="handleFollowAdd">新增跟进</el-button>
          </div>
          <el-timeline v-if="followRecords.length > 0">
            <el-timeline-item
              v-for="item in followRecords"
              :key="item.id"
              :timestamp="formatTime(item.create_time)"
              placement="top"
              :color="followTypeColor(item.follow_type)"
            >
              <el-card shadow="hover">
                <div class="follow-header">
                  <el-tag :type="followTypeTag(item.follow_type)" size="small">
                    {{ item.follow_type || '电话' }}
                  </el-tag>
                  <span v-if="item.contact_name" class="follow-contact">
                    <el-icon><User /></el-icon> {{ item.contact_name }}
                  </span>
                  <span class="follow-creator">{{ item.creator_name }}</span>
                  <span class="follow-actions">
                    <el-button type="primary" link size="small" :icon="Edit" @click="handleFollowEdit(item)">编辑</el-button>
                    <el-button type="danger" link size="small" :icon="Delete" @click="handleFollowDelete(item)">删除</el-button>
                  </span>
                </div>
                <div class="follow-content">{{ item.content }}</div>
                <div v-if="item.next_time" class="follow-next">
                  <el-icon><Clock /></el-icon>
                  下次跟进: {{ formatTime(item.next_time) }}
                  <span v-if="item.next_content"> — {{ item.next_content }}</span>
                </div>
                <div v-if="item.attachments && item.attachments.length > 0" class="follow-attachments">
                  <template v-for="att in item.attachments" :key="att.id">
                    <el-image v-if="isImage(att.file_type)" :src="att.file_path" :preview-src-list="getImageList(item)" fit="cover" style="width:80px;height:80px;margin:4px;border-radius:4px" />
                    <el-link v-else :href="att.file_path" target="_blank" type="primary" style="margin:4px">{{ att.file_name }}</el-link>
                  </template>
                </div>
              </el-card>
            </el-timeline-item>
          </el-timeline>
          <el-empty v-else description="暂无跟进记录" />
        </el-tab-pane>

        <!-- 商机记录 -->
        <el-tab-pane label="商机记录" name="opportunity">
          <div class="tab-toolbar">
            <el-button type="primary" :icon="Plus" @click="goCreateOpportunity">新增商机</el-button>
          </div>
          <el-table :data="opportunityList" stripe border v-loading="opportunityLoading">
            <el-table-column prop="name" label="商机名称" min-width="160" show-overflow-tooltip />
            <el-table-column prop="expected_amount" label="预期金额" width="130" align="right">
              <template #default="{ row }">¥{{ fmtMoney(row.expected_amount) }}</template>
            </el-table-column>
            <el-table-column prop="stage" label="阶段" width="110" align="center">
              <template #default="{ row }">
                <el-tag :type="stageTagType(row.stage)" size="small">{{ stageMap[row.stage] }}</el-tag>
              </template>
            </el-table-column>
            <el-table-column prop="win_rate" label="赢率" width="100" align="center">
              <template #default="{ row }">
                <el-progress v-if="row.win_rate != null" :percentage="row.win_rate" :stroke-width="14" :show-text="true" style="width:80px" />
                <span v-else>-</span>
              </template>
            </el-table-column>
            <el-table-column prop="owner_name" label="负责人" width="100" />
          </el-table>
          <el-empty v-if="!opportunityLoading && opportunityList.length === 0" description="暂无商机记录" />
        </el-tab-pane>

        <!-- 合同记录 -->
        <el-tab-pane label="合同记录" name="contract">
          <el-table :data="contractList" stripe border v-loading="contractLoading">
            <el-table-column prop="contract_no" label="合同编号" width="160" />
            <el-table-column prop="amount" label="合同金额" width="130" align="right">
              <template #default="{ row }">¥{{ fmtMoney(row.amount) }}</template>
            </el-table-column>
            <el-table-column prop="paid_amount" label="已回款" width="130" align="right">
              <template #default="{ row }">¥{{ fmtMoney(row.paid_amount) }}</template>
            </el-table-column>
            <el-table-column prop="sign_date" label="签订日期" width="110" />
            <el-table-column prop="status" label="状态" width="90" align="center">
              <template #default="{ row }">
                <el-tag :type="contractStatusType(row.status)" size="small">{{ contractStatusMap[row.status] }}</el-tag>
              </template>
            </el-table-column>
          </el-table>
          <el-empty v-if="!contractLoading && contractList.length === 0" description="暂无合同记录" />
        </el-tab-pane>
      </el-tabs>
    </el-card>

    <!-- 联系人新增/编辑弹窗 -->
    <el-dialog
      v-model="contactDialogVisible"
      :title="contactDialogTitle"
      width="500px"
      :close-on-click-modal="false"
      @closed="handleContactDialogClosed"
    >
      <el-form ref="contactFormRef" :model="contactForm" :rules="contactRules" label-width="100px">
        <el-form-item label="姓名" prop="name">
          <el-input v-model="contactForm.name" placeholder="请输入姓名" />
        </el-form-item>
        <el-row :gutter="24">
          <el-col :span="12">
            <el-form-item label="职位">
              <el-input v-model="contactForm.position" placeholder="请输入职位" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="是否决策人">
              <el-switch v-model="contactForm.is_decision" :active-value="1" :inactive-value="0" />
            </el-form-item>
          </el-col>
        </el-row>
        <el-form-item label="电话">
          <el-input v-model="contactForm.phone" placeholder="请输入电话" />
        </el-form-item>
        <el-form-item label="邮箱">
          <el-input v-model="contactForm.email" placeholder="请输入邮箱" />
        </el-form-item>
        <el-form-item label="微信">
          <el-input v-model="contactForm.wechat" placeholder="请输入微信" />
        </el-form-item>
        <el-form-item label="备注">
          <el-input v-model="contactForm.remark" type="textarea" :rows="2" placeholder="请输入备注" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="contactDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="contactSubmitLoading" @click="handleContactSubmit">确定</el-button>
      </template>
    </el-dialog>

    <!-- 新增跟进弹窗 -->
    <el-dialog
      v-model="followDialogVisible"
      :title="isFollowEdit ? '编辑跟进' : '新增跟进'"
      width="550px"
      :close-on-click-modal="false"
      @closed="handleFollowDialogClosed"
    >
      <el-form ref="followFormRef" :model="followForm" :rules="followRules" label-width="100px">
        <el-form-item label="联系人">
          <el-select v-model="followForm.contact_id" placeholder="请选择联系人（可选）" clearable style="width: 100%">
            <el-option
              v-for="c in contacts"
              :key="c.id"
              :label="`${c.name}${c.is_decision ? ' (决策人)' : ''}`"
              :value="c.id"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="跟进方式" prop="follow_type">
          <el-radio-group v-model="followForm.follow_type">
            <el-radio-button v-for="t in followTypes" :key="t" :value="t">{{ t }}</el-radio-button>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="跟进内容" prop="content">
          <el-input v-model="followForm.content" type="textarea" :rows="4" placeholder="请输入跟进内容" />
        </el-form-item>
        <el-form-item label="下次跟进时间">
          <el-date-picker
            v-model="followForm.next_time"
            type="datetime"
            placeholder="选择下次跟进时间（可选）"
            value-format="YYYY-MM-DD HH:mm:ss"
            style="width: 100%"
          />
        </el-form-item>
        <el-form-item label="下次计划">
          <el-input v-model="followForm.next_content" type="textarea" :rows="2" placeholder="下次跟进计划（可选）" />
        </el-form-item>
        <el-form-item label="附件">
          <el-upload
            ref="followUploadRef"
            :action="uploadUrl"
            :headers="uploadHeaders"
            :data="{ business_type: 'follow_up' }"
            :on-success="handleFollowUploadSuccess"
            :on-remove="handleFollowUploadRemove"
            :on-error="handleFollowUploadError"
            :file-list="followUploadList"
            multiple
            :limit="9"
            accept="image/*,.pdf,.doc,.docx,.xls,.xlsx"
          >
            <el-button size="small" type="primary">选择文件</el-button>
            <template #tip><span class="el-upload__tip">支持图片、文档，最多9个</span></template>
          </el-upload>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="followDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="followSubmitLoading" @click="handleFollowSubmit">确定</el-button>
      </template>
    </el-dialog>

    <!-- 编辑客户弹窗 -->
    <el-dialog
      v-model="editDialogVisible"
      title="编辑客户"
      width="600px"
      :close-on-click-modal="false"
      @closed="handleEditDialogClosed"
    >
      <el-form ref="editFormRef" :model="editForm" :rules="editRules" label-width="100px">
        <el-row :gutter="24">
          <el-col :span="24">
            <el-form-item label="公司名称" prop="company_name">
              <el-input v-model="editForm.company_name" placeholder="请输入公司名称" />
            </el-form-item>
          </el-col>
        </el-row>
        <el-row :gutter="24">
          <el-col :span="12">
            <el-form-item label="联系人">
              <el-input v-model="editForm.contact_name" placeholder="请输入联系人" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="电话">
              <el-input v-model="editForm.phone" placeholder="请输入电话" />
            </el-form-item>
          </el-col>
        </el-row>
        <el-row :gutter="24">
          <el-col :span="12">
            <el-form-item label="邮箱">
              <el-input v-model="editForm.email" placeholder="请输入邮箱" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="所属行业">
              <el-input v-model="editForm.industry" placeholder="请输入行业" />
            </el-form-item>
          </el-col>
        </el-row>
        <el-row :gutter="24">
          <el-col :span="12">
            <el-form-item label="客户来源">
              <el-select v-model="editForm.source" placeholder="请选择来源" filterable style="width: 100%">
                <el-option v-for="s in sourceOptions" :key="s" :label="s" :value="s" />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="客户等级">
              <el-select v-model="editForm.level" placeholder="请选择等级" style="width: 100%">
                <el-option label="A级 - 重点客户" value="A" />
                <el-option label="B级 - 意向客户" value="B" />
                <el-option label="C级 - 潜在客户" value="C" />
                <el-option label="D级 - 一般客户" value="D" />
              </el-select>
            </el-form-item>
          </el-col>
        </el-row>
        <el-row :gutter="24">
          <el-col :span="12">
            <el-form-item label="客户状态">
              <el-select v-model="editForm.status" placeholder="请选择状态" style="width: 100%">
                <el-option label="潜在客户" :value="1" />
                <el-option label="成交客户" :value="2" />
                <el-option label="流失客户" :value="3" />
              </el-select>
            </el-form-item>
          </el-col>
        </el-row>
        <el-row :gutter="24">
          <el-col :span="24">
            <el-form-item label="地址">
              <el-input v-model="editForm.address" placeholder="请输入地址" />
            </el-form-item>
          </el-col>
        </el-row>
        <el-row :gutter="24">
          <el-col :span="24">
            <el-form-item label="备注">
              <el-input v-model="editForm.remark" type="textarea" :rows="3" placeholder="请输入备注" />
            </el-form-item>
          </el-col>
        </el-row>
      </el-form>
      <template #footer>
        <el-button @click="editDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="editSubmitLoading" @click="handleEditSubmit">确定</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { ArrowLeft, Plus, Edit, EditPen, Delete, User, Clock, Share } from '@element-plus/icons-vue'
import { post, get as getRequest } from '@/utils/request'
import { formatTime } from '@/composables/useFormat'
import { ALL_SOURCE_VALUES } from '@/constants/source'

const route = useRoute()
const router = useRouter()

const loading = ref(false)

// 老板权限判断
const userInfo = ref({})
const isBoss = ref(false)
const salesUsers = ref([])

try {
  const stored = localStorage.getItem('userInfo')
  if (stored) {
    userInfo.value = JSON.parse(stored)
    isBoss.value = userInfo.value.manageAll === true || userInfo.value.roleId === 1
  }
} catch (e) { /* ignore */ }

const fetchSalesUsers = async () => {
  if (!isBoss.value) return
  try {
    const res = await getRequest('/customer/sales-users')
    if (res.code === 200) salesUsers.value = res.data
  } catch (e) { /* ignore */ }
}

const handleAssignOwner = (newOwnerId) => {
  const target = salesUsers.value.find(u => u.id === newOwnerId)
  ElMessageBox.confirm(`确认将客户分配给「${target?.real_name || newOwnerId}」吗？`, '变更负责人', { type: 'warning' }).then(async () => {
    try {
      const res = await post('/customer/assign', { customer_id: customer.id, to_user_id: newOwnerId, remark: '手动重新分配' })
      if (res.code === 200) { ElMessage.success('负责人已更新'); fetchDetail() }
    } catch { ElMessage.error('分配失败') }
  }).catch(() => {})
}
const activeTab = ref('basic')

const statusMap = {
  1: '潜在客户',
  2: '成交客户',
  3: '流失客户'
}

const levelTagType = (level) => {
  const map = { A: 'danger', B: 'warning', C: 'info', D: '' }
  return map[level] || 'info'
}

const statusTagType = (status) => {
  const map = { 1: 'warning', 2: 'success', 3: 'info' }
  return map[status] || 'info'
}

// 客户基本信息
const customer = reactive({
  id: null,
  company_name: '',
  contact_name: '',
  phone: '',
  email: '',
  address: '',
  industry: '',
  source: '',
  level: '',
  status: 0,
  remark: '',
  owner_name: '',
  create_time: '',
  update_time: ''
})

// 联系人数据
const contacts = ref([])

// 跟进记录数据
const followRecords = ref([])

// 商机数据
const opportunityList = ref([])
const opportunityLoading = ref(false)

// 合同数据
const contractList = ref([])
const contractLoading = ref(false)

const stageMap = { 1: '询盘', 2: '需求确认', 3: '方案报价', 4: '谈判', 5: '成交', 6: '失败' }
const stageTagType = (s) => ({ 1: 'info', 2: '', 3: 'warning', 4: '', 5: 'success', 6: 'danger' }[s] || 'info')
const contractStatusMap = { 1: '待执行', 2: '执行中', 3: '已完成', 4: '已取消' }
const contractStatusType = (s) => ({ 1: 'info', 2: '', 3: 'success', 4: 'danger' }[s] || 'info')
const fmtMoney = (v) => { if (!v && v !== 0) return '0.00'; return parseFloat(v).toLocaleString('zh-CN', { minimumFractionDigits: 2 }) }

// 获取详情
const fetchDetail = async () => {
  const id = route.params.id
  if (!id) {
    ElMessage.error('缺少客户ID')
    goBack()
    return
  }

  loading.value = true
  try {
    const res = await getRequest(`/customer/detail/${id}`)
    if (res.code === 200) {
      Object.assign(customer, res.data.customer)
      contacts.value = res.data.contacts || []
      followRecords.value = res.data.followRecords || []
      fetchOpportunities()
      fetchContracts()
    }
  } catch (error) {
    console.error('获取客户详情失败:', error)
  } finally {
    loading.value = false
  }
}

// 获取关联商机
const fetchOpportunities = async () => {
  const id = customer.id || route.params.id
  if (!id) return
  opportunityLoading.value = true
  try {
    const res = await post('/opportunity/list', { page: 1, pageSize: 100, customer_id: id })
    if (res.code === 200) opportunityList.value = res.data.list || []
  } catch { /* ignore */ }
  finally { opportunityLoading.value = false }
}

// 获取关联合同
const fetchContracts = async () => {
  const id = customer.id || route.params.id
  if (!id) return
  contractLoading.value = true
  try {
    const res = await post('/contract/list', { page: 1, pageSize: 100, customer_id: id })
    if (res.code === 200) contractList.value = res.data.list || []
  } catch { /* ignore */ }
  finally { contractLoading.value = false }
}

// 返回列表
const goBack = () => {
  router.push('/customer/list')
}

const goCreateOpportunity = () => {
  // [修复] customer 是 reactive 对象，不应使用 .value
  router.push({ path: '/opportunity', query: { customer_id: customer.id, customer_name: customer.company_name } })
}

// ============ 编辑客户 ============

const sourceOptions = ALL_SOURCE_VALUES
const editDialogVisible = ref(false)
const editSubmitLoading = ref(false)
const editFormRef = ref(null)

const editForm = reactive({
  company_name: '',
  contact_name: '',
  phone: '',
  email: '',
  industry: '',
  source: '',
  level: '',
  status: 1,
  address: '',
  remark: ''
})

const editRules = {
  company_name: [{ required: true, message: '请输入公司名称', trigger: 'blur' }]
}

const handleEdit = () => {
  Object.assign(editForm, {
    company_name: customer.company_name || '',
    contact_name: customer.contact_name || '',
    phone: customer.phone || '',
    email: customer.email || '',
    industry: customer.industry || '',
    source: customer.source || '',
    level: customer.level || 'C',
    status: customer.status || 1,
    address: customer.address || '',
    remark: customer.remark || ''
  })
  editDialogVisible.value = true
}

const handleEditSubmit = async () => {
  if (!editFormRef.value) return
  await editFormRef.value.validate(async (valid) => {
    if (!valid) return
    editSubmitLoading.value = true
    try {
      const res = await post('/customer/update', {
        id: customer.id,
        ...editForm
      })
      if (res.code === 200) {
        ElMessage.success('修改成功')
        editDialogVisible.value = false
        fetchDetail()
      }
    } catch { ElMessage.error('修改失败') }
    finally { editSubmitLoading.value = false }
  })
}

const handleEditDialogClosed = () => {
  editFormRef.value?.resetFields()
}

// 判断是否在保护期内
const isProtected = () => {
  return customer.protect_until && new Date(customer.protect_until) > new Date()
}

// 释放到公海
const handleRelease = () => {
  ElMessageBox.confirm(
    `确定要将"${customer.company_name}"释放到公海吗？释放后其他销售可以认领该客户。`,
    '释放确认',
    { confirmButtonText: '确定释放', cancelButtonText: '取消', type: 'warning' }
  ).then(async () => {
    try {
      const res = await post('/customer/release', { customer_id: customer.id })
      if (res.code === 200) {
        ElMessage.success('已释放到公海')
        fetchDetail()
      }
    } catch (e) {
      console.error('释放失败:', e)
    }
  }).catch(() => {})
}

// ============ 联系人管理 ============

const contactDialogVisible = ref(false)
const contactDialogTitle = ref('新增联系人')
const isContactEdit = ref(false)
const contactSubmitLoading = ref(false)
const contactFormRef = ref(null)
const contactEditId = ref(null)

const contactForm = reactive({
  name: '',
  position: '',
  phone: '',
  email: '',
  wechat: '',
  is_decision: 0,
  remark: ''
})

const contactRules = {
  name: [{ required: true, message: '请输入姓名', trigger: 'blur' }]
}

const handleContactAdd = () => {
  isContactEdit.value = false
  contactDialogTitle.value = '新增联系人'
  contactEditId.value = null
  contactDialogVisible.value = true
}

const handleContactEdit = (row) => {
  isContactEdit.value = true
  contactDialogTitle.value = '编辑联系人'
  contactEditId.value = row.id
  Object.assign(contactForm, {
    name: row.name || '',
    position: row.position || '',
    phone: row.phone || '',
    email: row.email || '',
    wechat: row.wechat || '',
    is_decision: row.is_decision || 0,
    remark: row.remark || ''
  })
  contactDialogVisible.value = true
}

const handleContactSubmit = async () => {
  if (!contactFormRef.value) return

  await contactFormRef.value.validate(async (valid) => {
    if (!valid) return

    contactSubmitLoading.value = true
    try {
      const data = {
        name: contactForm.name,
        position: contactForm.position,
        phone: contactForm.phone,
        email: contactForm.email,
        wechat: contactForm.wechat,
        is_decision: contactForm.is_decision,
        remark: contactForm.remark
      }

      let res
      if (isContactEdit.value) {
        data.id = contactEditId.value
        res = await post('/customer/contact/update', data)
      } else {
        data.customer_id = customer.id
        res = await post('/customer/contact/add', data)
      }

      if (res.code === 200) {
        ElMessage.success(isContactEdit.value ? '修改成功' : '新增成功')
        contactDialogVisible.value = false
        fetchDetail()
      }
    } catch (error) {
      console.error('提交联系人失败:', error)
    } finally {
      contactSubmitLoading.value = false
    }
  })
}

const handleContactDelete = (row) => {
  ElMessageBox.confirm(
    `确定要删除联系人"${row.name}"吗？`,
    '删除确认',
    { confirmButtonText: '确定', cancelButtonText: '取消', type: 'warning' }
  ).then(async () => {
    try {
      const res = await post('/customer/contact/delete', { id: row.id })
      if (res.code === 200) {
        ElMessage.success('删除成功')
        fetchDetail()
      }
    } catch (error) {
      console.error('删除联系人失败:', error)
    }
  }).catch(() => {})
}

const handleContactDialogClosed = () => {
  contactFormRef.value?.resetFields()
  Object.assign(contactForm, {
    name: '',
    position: '',
    phone: '',
    email: '',
    wechat: '',
    is_decision: 0,
    remark: ''
  })
}

// ============ 跟进管理 ============

const followTypes = ['电话', '拜访', '微信', '邮件', '其他']
const followDialogVisible = ref(false)
const followSubmitLoading = ref(false)
const followFormRef = ref(null)
const isFollowEdit = ref(false)
const followEditId = ref(null)

const followForm = reactive({
  contact_id: null,
  follow_type: '电话',
  content: '',
  next_time: '',
  next_content: ''
})

const followRules = {
  follow_type: [{ required: true, message: '请选择跟进方式', trigger: 'change' }],
  content: [{ required: true, message: '请输入跟进内容', trigger: 'blur' }]
}

const followTypeTag = (type) => {
  const map = { '电话': 'warning', '拜访': '', '微信': 'success', '邮件': 'info', '其他': '' }
  return map[type] || ''
}

const followTypeColor = (type) => {
  const map = { '电话': 'var(--c-primary)', '拜访': 'var(--c-primary)', '微信': 'var(--c-primary)', '邮件': 'var(--c-text-tertiary)', '其他': '#B3B3B3' }
  return map[type] || 'var(--c-primary)'
}

const handleFollowAdd = () => {
  isFollowEdit.value = false
  followEditId.value = null
  followForm.contact_id = null
  followForm.follow_type = '电话'
  followForm.content = ''
  followForm.next_time = ''
  followForm.next_content = ''
  followUploadList.value = []
  followAttachmentIds.value = []
  followDialogVisible.value = true
}

// 跟进附件上传
const uploadUrl = '/api/upload/file'
const uploadHeaders = { Authorization: `Bearer ${localStorage.getItem('token') || ''}` }
const followUploadRef = ref(null)
const followUploadList = ref([])
const followAttachmentIds = ref([])

const handleFollowUploadSuccess = (res) => {
  if (res.code === 200 && res.data) {
    res.data.forEach(item => {
      if (!followAttachmentIds.value.includes(item.id)) {
        followAttachmentIds.value.push(item.id)
      }
    })
  } else {
    ElMessage.error(res.message || '上传失败')
  }
}

const handleFollowUploadRemove = (file) => {
  const res = file.response
  if (res && res.data) {
    res.data.forEach(item => {
      const idx = followAttachmentIds.value.indexOf(item.id)
      if (idx > -1) followAttachmentIds.value.splice(idx, 1)
    })
  }
}

const handleFollowUploadError = () => {
  ElMessage.error('文件上传失败')
}

const isImage = (fileType) => fileType && fileType.startsWith('image/')

const getImageList = (item) => {
  return (item.attachments || []).filter(a => isImage(a.file_type)).map(a => a.file_path)
}

const handleFollowEdit = (item) => {
  isFollowEdit.value = true
  followEditId.value = item.id
  followForm.contact_id = item.contact_id || null
  followForm.follow_type = item.follow_type || '电话'
  followForm.content = item.content || ''
  followForm.next_time = item.next_time ? formatTime(item.next_time) : ''
  followForm.next_content = item.next_content || ''
  followDialogVisible.value = true
}

const handleFollowSubmit = async () => {
  if (!followFormRef.value) return

  await followFormRef.value.validate(async (valid) => {
    if (!valid) return

    followSubmitLoading.value = true
    try {
      let res
      if (isFollowEdit.value) {
        res = await post('/follow-up/update', {
          id: followEditId.value,
          contact_id: followForm.contact_id || null,
          follow_type: followForm.follow_type,
          content: followForm.content,
          next_time: followForm.next_time || null,
          next_content: followForm.next_content || null
        })
      } else {
        res = await post('/follow-up/add', {
          customer_id: customer.id,
          contact_id: followForm.contact_id || null,
          follow_type: followForm.follow_type,
          content: followForm.content,
          next_time: followForm.next_time || null,
          next_content: followForm.next_content || null,
          attachment_ids: [...followAttachmentIds.value]
        })
      }

      if (res.code === 200) {
        ElMessage.success(isFollowEdit.value ? '修改成功' : '跟进记录添加成功')
        followDialogVisible.value = false
        fetchDetail()
      }
    } catch (error) {
      console.error('提交跟进记录失败:', error)
    } finally {
      followSubmitLoading.value = false
    }
  })
}

const handleFollowDelete = (item) => {
  ElMessageBox.confirm('确定要删除该跟进记录吗？', '删除确认', { type: 'warning' }).then(async () => {
    try {
      const res = await post('/follow-up/delete', { id: item.id })
      if (res.code === 200) {
        ElMessage.success('删除成功')
        fetchDetail()
      }
    } catch (error) {
      console.error('删除跟进记录失败:', error)
    }
  }).catch(() => {})
}

const handleFollowDialogClosed = () => {
  followFormRef.value?.resetFields()
  isFollowEdit.value = false
  followEditId.value = null
  followForm.contact_id = null
  followForm.follow_type = '电话'
  followForm.content = ''
  followForm.next_time = ''
  followForm.next_content = ''
  followUploadList.value = []
  followAttachmentIds.value = []
}

onMounted(() => {
  fetchDetail()
  fetchSalesUsers()
})
</script>

<style scoped>
.customer-detail {
  padding: 0;
}

.detail-header {
  display: flex;
  align-items: center;
  margin-bottom: 16px;
}

.header-actions {
  margin-left: auto;
}

.page-title {
  margin-left: 16px;
  font-size: 18px;
  font-weight: bold;
  color: var(--c-text);
}

.info-card {
  margin-bottom: 16px;
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.card-title {
  font-size: 18px;
  font-weight: bold;
}

.card-tags {
  display: flex;
  gap: 8px;
}

.tab-card {
  min-height: 400px;
}

.tab-toolbar {
  margin-bottom: 16px;
}

:deep(.el-descriptions__label) {
  width: 100px;
}

.follow-header {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 8px;
}

.follow-actions {
  margin-left: auto;
}

.follow-contact {
  color: var(--c-text-tertiary);
  font-size: 13px;
  display: flex;
  align-items: center;
  gap: 4px;
}

.follow-creator {
  margin-left: auto;
  color: #c0c4cc;
  font-size: 12px;
}

.follow-content {
  color: var(--c-text);
  line-height: 1.6;
  margin-bottom: 8px;
}

.follow-next {
  color: var(--c-primary);
  font-size: 13px;
  display: flex;
  align-items: center;
  gap: 4px;
  padding-top: 8px;
  border-top: 1px dashed var(--c-border);
}
.follow-attachments {
  margin-top: 8px;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
}
</style>
