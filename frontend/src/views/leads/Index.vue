<template>
  <div class="page-container">
    <div class="page-header"><h2>线索管理</h2><p class="page-desc">潜在客户线索池，跟进后可转化为正式客户</p></div>

    <el-row :gutter="16" class="stats-row">
      <el-col :span="8"><el-card shadow="hover" class="stat-card"><div class="stat-num">{{ stats.total || 0 }}</div><div class="stat-label">线索总数</div></el-card></el-col>
      <el-col :span="8"><el-card shadow="hover" class="stat-card"><div class="stat-num green">{{ stats.week_new || 0 }}</div><div class="stat-label">本周新增</div></el-card></el-col>
      <el-col :span="8"><el-card shadow="hover" class="stat-card"><div class="stat-num blue">{{ stats.month_converted || 0 }}</div><div class="stat-label">近30天转化</div></el-card></el-col>
    </el-row>

    <el-card class="search-card" shadow="never">
      <el-form :model="searchForm" inline @keyup.enter="handleSearch">
        <el-form-item label="公司名称"><el-input v-model="searchForm.company_name" placeholder="搜索" clearable style="width:180px" /></el-form-item>
        <el-form-item label="意向等级"><el-select v-model="searchForm.lead_level" placeholder="全部" clearable style="width:120px"><el-option label="高" value="高" /><el-option label="中" value="中" /><el-option label="低" value="低" /></el-select></el-form-item>
        <el-form-item label="跟进状态"><el-select v-model="searchForm.follow_status" placeholder="全部" clearable style="width:140px"><el-option label="初次联系" value="初次联系" /><el-option label="需求确认" value="需求确认" /><el-option label="报价中" value="报价中" /><el-option label="已流失" value="已流失" /></el-select></el-form-item>
        <el-form-item><el-button type="primary" :icon="Search" @click="handleSearch">搜索</el-button></el-form-item>
      </el-form>
    </el-card>

    <el-card class="table-card" shadow="never">
      <div class="toolbar">
        <el-button type="primary" :icon="Plus" @click="handleAdd" v-permission="'leads'">新增线索</el-button>
        <el-divider direction="vertical" />
        <el-radio-group v-model="viewMode" @change="switchViewMode" size="default">
          <el-radio-button value="pool">线索池</el-radio-button>
          <el-radio-button value="mine">我的线索</el-radio-button>
        </el-radio-group>
        <template v-if="(isBoss || isManager) && selectedRows.length > 0">
          <el-divider direction="vertical" />
          <el-select v-model="batchOwnerId" placeholder="选择负责人" size="default" style="width:150px" clearable @change="handleBatchAssign">
            <el-option v-for="u in salesUsers" :key="u.id" :label="u.real_name" :value="u.id" />
          </el-select>
          <el-tag type="warning" size="default">已选 {{ selectedRows.length }} 项</el-tag>
        </template>
      </div>
      <el-table v-loading="loading" :data="tableData" stripe border @selection-change="onSelectionChange" :header-cell-style="{ background: 'var(--color-bg)', color: 'var(--color-text-secondary)' }">
        <template #empty><el-empty><p>暂无线索</p><el-button type="primary" @click="handleAdd" v-permission="'leads'">新增第一条线索</el-button></el-empty></template>
        <el-table-column v-if="isBoss || isManager" type="selection" width="50" />
        <el-table-column prop="company_name" label="公司名称" min-width="160" show-overflow-tooltip />
        <el-table-column prop="contact_name" label="联系人" width="100" />
        <el-table-column prop="phone" label="电话" width="130" />
        <el-table-column prop="source" label="来源" width="90"><template #default="{ row }"><el-tag v-if="row.source" size="small">{{ row.source }}</el-tag></template></el-table-column>
        <el-table-column prop="lead_level" label="意向等级" width="100" align="center"><template #default="{ row }"><el-tag :type="{高:'danger',中:'warning',低:'info'}[row.lead_level]||'info'" size="small">{{ row.lead_level||'-' }}</el-tag></template></el-table-column>
        <el-table-column prop="follow_status" label="跟进状态" width="110" align="center"><template #default="{ row }"><el-tag :type="{初次联系:'info',需求确认:'warning',报价中:'',已流失:'danger'}[row.follow_status]||'info'" size="small">{{ row.follow_status||'-' }}</el-tag></template></el-table-column>
        <el-table-column prop="last_follow_time" label="下次跟进" width="150"><template #default="{ row }"><el-tooltip v-if="row.last_follow_time" :content="row.last_follow_time"><span>{{ relativeTime(row.last_follow_time) }}</span></el-tooltip><el-tag v-else type="danger" size="small">从未跟进</el-tag></template></el-table-column>
        <el-table-column prop="owner_name" label="负责人" width="100"><template #default="{ row }"><el-tag v-if="!row.owner_id||row.owner_id===1" type="info" size="small">待领取</el-tag><span v-else>{{ row.owner_name }}</span></template></el-table-column>
        <el-table-column label="操作" :width="(isBoss||isManager)?260:240" fixed="right">
          <template #default="{ row }">
            <el-button type="primary" link @click="openDetail(row)">详情</el-button>
            <el-button v-if="!row.owner_id||row.owner_id===1" type="success" size="small" @click="handleClaim(row)" v-permission="'leads'">领取</el-button>
            <template v-else-if="row.owner_id===currentUserId">
              <el-button type="primary" link @click="handleEdit(row)" v-permission="'leads'">编辑</el-button>
              <el-button type="success" size="small" @click="handleConvert(row)" v-permission="'leads'">转客户</el-button>
              <el-button type="danger" link @click="handleMarkLost(row)" v-permission="'leads'">流失</el-button>
            </template>
          </template>
        </el-table-column>
      </el-table>
      <div class="pagination"><el-pagination v-model:current-page="page" v-model:page-size="pageSize" :page-sizes="[10,20,50]" :total="total" layout="total,sizes,prev,pager,next" @size-change="fetchList" @current-change="fetchList" /></div>
    </el-card>

    <!-- 新增/编辑弹窗 -->
    <el-dialog v-model="dialogVisible" :title="isEdit?'编辑线索':'新增线索'" width="520px">
      <el-form ref="formRef" :model="form" :rules="rules" label-width="90px">
        <el-form-item label="公司名称" prop="company_name"><el-input v-model="form.company_name" /></el-form-item>
        <el-row :gutter="16"><el-col :span="12"><el-form-item label="联系人"><el-input v-model="form.contact_name" /></el-form-item></el-col><el-col :span="12"><el-form-item label="手机号"><el-input v-model="form.phone" /></el-form-item></el-col></el-row>
        <el-row :gutter="16"><el-col :span="12"><el-form-item label="来源渠道"><el-select v-model="form.source" filterable style="width:100%"><el-option v-for="s in flatSourceOptions" :key="s.value" :label="s.label" :value="s.value" /></el-select></el-form-item></el-col><el-col :span="12"><el-form-item label="意向等级"><el-select v-model="form.lead_level" style="width:100%"><el-option label="高" value="高" /><el-option label="中" value="中" /><el-option label="低" value="低" /></el-select></el-form-item></el-col></el-row>
        <el-form-item label="跟进状态"><el-select v-model="form.follow_status" style="width:100%"><el-option label="初次联系" value="初次联系" /><el-option label="需求确认" value="需求确认" /><el-option label="报价中" value="报价中" /><el-option label="已流失" value="已流失" /></el-select></el-form-item>
        <el-form-item label="备注"><el-input v-model="form.remark" type="textarea" :rows="2" /></el-form-item>
      </el-form>
      <template #footer><el-button @click="dialogVisible=false">取消</el-button><el-button type="primary" :loading="saveLoading" @click="handleSubmit">保存</el-button></template>
    </el-dialog>

    <!-- 线索详情抽屉 -->
    <el-drawer v-model="drawerVisible" title="线索详情" size="500px" @closed="closeDetail">
      <template v-if="detailLead">
        <el-descriptions :column="1" border size="small">
          <el-descriptions-item label="公司名称">{{ detailLead.company_name }}</el-descriptions-item>
          <el-descriptions-item label="联系人">{{ detailLead.contact_name||'-' }}</el-descriptions-item>
          <el-descriptions-item label="电话">{{ detailLead.phone||'-' }}</el-descriptions-item>
          <el-descriptions-item label="来源">{{ detailLead.source||'-' }}</el-descriptions-item>
          <el-descriptions-item label="意向等级"><el-tag :type="{高:'danger',中:'warning',低:'info'}[detailLead.lead_level]||'info'" size="small">{{ detailLead.lead_level||'-' }}</el-tag></el-descriptions-item>
          <el-descriptions-item label="负责人">{{ detailLead.owner_name||'待领取' }}</el-descriptions-item>
        </el-descriptions>

        <el-divider>修改状态</el-divider>
        <el-select v-model="detailLead.follow_status" @change="updateFollowStatus" style="width:100%">
          <el-option label="初次联系" value="初次联系" /><el-option label="需求确认" value="需求确认" /><el-option label="报价中" value="报价中" /><el-option label="已流失" value="已流失" />
        </el-select>

        <el-divider>跟进记录</el-divider>
        <div v-if="followLoading" v-loading="followLoading" style="height:100px" />
        <div v-else-if="followList.length===0" style="text-align:center;color:#9ca3af;padding:24px">暂无跟进记录</div>
        <div v-for="f in followList" :key="f.id" class="follow-item">
          <div class="follow-meta"><el-tag size="small">{{ f.follow_type }}</el-tag><span class="follow-time">{{ f.create_time?.slice(0,16) }}</span></div>
          <div class="follow-content">{{ f.content }}</div>
          <div v-if="f.next_time" class="follow-next">下次跟进: {{ f.next_time?.slice(0,16) }}</div>
        </div>

        <el-divider>新增跟进</el-divider>
        <el-form :model="followForm" label-width="80px" size="small">
          <el-form-item label="方式"><el-select v-model="followForm.follow_type" style="width:100%"><el-option label="电话" value="电话" /><el-option label="微信" value="微信" /><el-option label="拜访" value="拜访" /><el-option label="邮件" value="邮件" /></el-select></el-form-item>
          <el-form-item label="内容"><el-input v-model="followForm.content" type="textarea" :rows="3" placeholder="跟进内容" /></el-form-item>
          <el-form-item label="下次跟进"><el-date-picker v-model="followForm.next_time" type="datetime" placeholder="下次跟进时间" style="width:100%" value-format="YYYY-MM-DD HH:mm:ss" /></el-form-item>
          <el-form-item><el-button type="primary" :loading="followSaving" @click="addFollow">保存跟进</el-button></el-form-item>
        </el-form>
      </template>
    </el-drawer>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted, onActivated } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus, Search } from '@element-plus/icons-vue'
import { post, get } from '@/utils/request'
import { ALL_SOURCE_VALUES } from '@/constants/source'
import { relativeTime } from '@/composables/useRelativeTime'

defineOptions({ name: 'Leads' })
const router = useRouter()

const flatSourceOptions = ALL_SOURCE_VALUES.map(v => ({ label: v, value: v }))
const viewMode = ref('pool')
const switchViewMode = () => { page.value = 1; fetchList() }

let currentUserId = null
let isBoss = ref(false)
let isManager = ref(false)
try { const u = JSON.parse(localStorage.getItem('userInfo')||'{}'); currentUserId = u.id; isBoss.value = u.manageAll || u.roleId === 1; isManager.value = u.roleId === 2 } catch {}

const loading = ref(false), tableData = ref([]), total = ref(0), page = ref(1), pageSize = ref(20)
const stats = reactive({ total: 0, week_new: 0, month_converted: 0 })
const searchForm = reactive({ company_name: '', lead_level: '', follow_status: '' })
const dialogVisible = ref(false), isEdit = ref(false), saveLoading = ref(false), formRef = ref(null), editId = ref(null)
const form = reactive({ company_name: '', contact_name: '', phone: '', source: '', lead_level: '中', follow_status: '初次联系', remark: '' })
const rules = { company_name: [{ required: true, message: '请输入公司名称', trigger: 'blur' }] }

// 批量分配
const selectedRows = ref([])
const batchOwnerId = ref(null)
const salesUsers = ref([])
const onSelectionChange = (rows) => { selectedRows.value = rows }
const fetchSalesUsers = async () => { if (!isBoss.value) return; try { const r = await get('/customer/sales-users'); if (r.code===200) salesUsers.value = r.data } catch{} }

const handleBatchAssign = async (ownerId) => {
  if (!ownerId || selectedRows.value.length===0) return
  try {
    const r = await post('/customer/batch-assign', { customer_ids: selectedRows.value.map(r=>r.id), to_user_id: ownerId, remark: '线索批量分配' })
    if (r.code===200) { ElMessage.success(`已分配 ${selectedRows.value.length} 条线索`); batchOwnerId.value = null; selectedRows.value = []; fetchList(); fetchStats() }
  } catch { ElMessage.error('批量分配失败') }
}

// 详情抽屉
const drawerVisible = ref(false)
const detailLead = ref(null)
const followList = ref([])
const followLoading = ref(false)
const followSaving = ref(false)
const followForm = reactive({ follow_type: '电话', content: '', next_time: '' })

const openDetail = async (row) => {
  drawerVisible.value = true
  try { const r = await get(`/customer/detail/${row.id}`); if (r.code===200) { detailLead.value = r.data.customer || r.data; followList.value = r.data.followRecords || [] } } catch { ElMessage.error('加载详情失败') }
}

const closeDetail = () => { detailLead.value = null; followList.value = [] }

const updateFollowStatus = async (val) => {
  try { const r = await post('/customer/update', { id: detailLead.value.id, follow_status: val }); if (r.code===200) { ElMessage.success('状态已更新'); fetchList(); fetchStats() } } catch { ElMessage.error('更新失败') }
}

const addFollow = async () => {
  if (!followForm.content) return ElMessage.warning('请填写跟进内容')
  followSaving.value = true
  try {
    const r = await post('/follow-up/add', { customer_id: detailLead.value.id, follow_type: followForm.follow_type, content: followForm.content, next_time: followForm.next_time || null })
    if (r.code===200) {
      ElMessage.success('跟进记录已保存')
      followForm.content = ''; followForm.next_time = ''
      // 刷新详情和列表
      const r2 = await get(`/customer/detail/${detailLead.value.id}`)
      if (r2.code===200) { detailLead.value = r2.data.customer || r2.data; followList.value = r2.data.followRecords || [] }
      fetchList(); fetchStats()
    }
  } catch { ElMessage.error('保存失败') }
  finally { followSaving.value = false }
}

const fetchStats = async () => { try { const r = await get('/customer/leads/stats'); if (r.code===200) Object.assign(stats, r.data) } catch{} }

const fetchList = async () => {
  loading.value = true
  try {
    const params = { page: page.value, pageSize: pageSize.value, ...searchForm }
    if (viewMode.value==='mine' && currentUserId) params.owner_id = currentUserId
    const r = await post('/customer/leads/list', params)
    if (r.code===200) { tableData.value = r.data.list; total.value = r.data.total }
  } finally { loading.value = false }
}

const handleSearch = () => { page.value = 1; fetchList() }
const handleAdd = () => { isEdit.value = false; editId.value = null; Object.assign(form, { company_name:'',contact_name:'',phone:'',source:'',lead_level:'中',follow_status:'初次联系',remark:'' }); dialogVisible.value = true }
const handleEdit = (row) => { isEdit.value = true; editId.value = row.id; Object.assign(form, { company_name:row.company_name||'',contact_name:row.contact_name||'',phone:row.phone||'',source:row.source||'',lead_level:row.lead_level||'中',follow_status:row.follow_status||'初次联系',remark:row.remark||'' }); dialogVisible.value = true }
const handleClaim = async (row) => { const r = await post('/customer/leads/claim', { id: row.id }); if (r.code===200) { ElMessage.success('领取成功'); tableData.value = tableData.value.filter(t=>t.id!==row.id); fetchStats() } }
const handleConvert = (row) => {
  ElMessageBox.confirm(`确定将「${row.company_name}」转化为正式客户吗？`, '转化确认', { type: 'warning' })
    .then(async () => {
      const r = await post('/customer/leads/convert', { id: row.id })
      if (r.code === 200) {
        ElMessageBox.alert(
          `客户「${row.company_name}」已成功转化为正式客户`,
          '转化成功',
          {
            confirmButtonText: '查看详情',
            cancelButtonText: '留在线索页',
            showCancelButton: true,
            type: 'success',
            callback: (action) => {
              if (action === 'confirm') {
                router.push(`/customer/detail/${row.id}`)
              }
            }
          }
        )
        tableData.value = tableData.value.filter(t => t.id !== row.id)
        fetchStats()
      }
    })
    .catch(() => {})
}
const handleMarkLost = (row) => { ElMessageBox.confirm(`确定标记为已流失吗？`, '确认', { type: 'warning' }).then(async () => { const r = await post('/customer/leads/mark-lost', { id: row.id }); if (r.code===200) { ElMessage.success('已标记'); fetchList(); fetchStats() } }).catch(()=>{}) }
const handleSubmit = async () => { if (!formRef.value) return; await formRef.value.validate(async (valid) => { if (!valid) return; saveLoading.value = true; try { const data = { ...form, status: 1 }; if (isEdit.value) data.id = editId.value; const r = await post(isEdit.value?'/customer/update':'/customer/add', data); if (r.code===200) { ElMessage.success(isEdit.value?'修改成功':'新增成功'); dialogVisible.value = false; fetchList(); fetchStats() } } finally { saveLoading.value = false } }) }

onMounted(() => { fetchList(); fetchStats(); fetchSalesUsers() })
onActivated(() => { fetchList(); fetchStats() })
</script>

<style scoped>
.page-container { padding: 0; }
.page-header { margin-bottom: var(--space-4); }
.page-header h2 { margin: 0; font-size: 28px; font-weight: 600; color: var(--color-text); letter-spacing: -0.02em; }
.page-desc { margin: var(--space-1) 0 0; font-size: 13px; color: var(--color-text-tertiary); }
.stats-row { margin-bottom: var(--space-4); }
.stat-card { text-align: center; }
.stat-num { font-size: 26px; font-weight: 700; color: var(--color-text); }
.stat-num.green { color: var(--color-success); }
.stat-num.blue { color: var(--color-accent); }
.stat-label { font-size: 13px; color: var(--color-text-tertiary); margin-top: 2px; }
.search-card { margin-bottom: var(--space-4); }
.search-card .el-form-item { margin-bottom: 0; }
.table-card { min-height: 200px; }
.toolbar { margin-bottom: var(--space-4); display: flex; align-items: center; gap: var(--space-2); flex-wrap: wrap; }
.pagination { display: flex; justify-content: flex-end; margin-top: var(--space-5); }
.follow-item { padding: var(--space-2) 0; border-bottom: 1px solid var(--color-border); }
.follow-item:last-child { border-bottom: none; }
.follow-meta { display: flex; align-items: center; gap: var(--space-2); margin-bottom: var(--space-1); }
.follow-time { font-size: 12px; color: var(--color-text-tertiary); }
.follow-content { font-size: 14px; color: var(--color-text); line-height: 1.5; }
.follow-next { font-size: 12px; color: var(--color-text-secondary); margin-top: 2px; }
</style>
