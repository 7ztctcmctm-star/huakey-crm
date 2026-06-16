<template>
  <div class="page-container">
    <div class="page-header"><h2>员工档案</h2></div>

    <!-- 统计卡片 -->
    <div class="stat-cards">
      <div class="stat-card" v-for="s in statCards" :key="s.key">
        <div class="stat-value">{{ s.value }}</div>
        <div class="stat-label">{{ s.label }}</div>
      </div>
    </div>

    <el-alert v-if="expiringContracts > 0 && !search.contract_expiring" type="warning" :title="`有 ${expiringContracts} 名员工合同将在30天内到期`" show-icon :closable="false" style="margin-bottom:12px">
      <el-button type="warning" link size="small" @click="search.contract_expiring = true; fetchList()">点击查看</el-button>
    </el-alert>

    <!-- 筛选 -->
    <el-card shadow="never" class="search-card">
      <el-form :model="search" inline @keyup.enter="fetchList">
        <el-form-item><el-input v-model="search.keyword" placeholder="姓名/用户名/手机" clearable style="width:180px" /></el-form-item>
        <el-form-item>
          <el-select v-model="search.dept_id" placeholder="全部部门" clearable style="width:140px">
            <el-option v-for="d in deptOptions" :key="d.id" :label="d.name" :value="d.id" />
          </el-select>
        </el-form-item>
        <el-form-item>
          <el-select v-model="search.status" placeholder="全部状态" clearable style="width:100px">
            <el-option label="在职" :value="1" /><el-option label="离职" :value="0" />
          </el-select>
        </el-form-item>
        <el-form-item><el-button type="primary" @click="fetchList">搜索</el-button></el-form-item>
      </el-form>
    </el-card>

    <!-- 列表 -->
    <el-card shadow="never">
      <el-table :data="list" stripe border v-loading="loading">
        <el-table-column prop="real_name" label="姓名" width="100" />
        <el-table-column prop="dept_name" label="部门" width="120" />
        <el-table-column prop="position" label="职位" width="120">
          <template #default="{ row }">{{ row.position || '-' }}</template>
        </el-table-column>
        <el-table-column prop="phone" label="手机" width="130" />
        <el-table-column prop="hire_date" label="入职日期" width="110">
          <template #default="{ row }">{{ row.hire_date ? row.hire_date.split('T')[0] : '-' }}</template>
        </el-table-column>
        <el-table-column label="用工类型" width="100" align="center">
          <template #default="{ row }">
            <el-tag v-if="row.employment_type" size="small" :type="empTypeTag[row.employment_type]">{{ empTypeName[row.employment_type] }}</el-tag>
            <span v-else class="text-muted">-</span>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="80" align="center">
          <template #default="{ row }"><el-tag :type="row.status===1?'success':'info'" size="small">{{ row.status===1?'在职':'离职' }}</el-tag></template>
        </el-table-column>
        <el-table-column label="操作" width="160" fixed="right">
          <template #default="{ row }">
            <el-button type="primary" link @click="handleView(row)">详情</el-button>
            <el-button type="primary" link @click="handleEditProfile(row)">编辑档案</el-button>
          </template>
        </el-table-column>
      </el-table>
      <div class="pagination"><el-pagination v-model:current-page="page" v-model:page-size="pageSize" :total="total" layout="total,prev,pager,next" @current-change="fetchList" /></div>
    </el-card>

    <!-- 员工详情弹窗 -->
    <el-dialog v-model="detailVisible" title="员工详情" width="700px" top="5vh">
      <el-tabs v-model="detailTab">
        <el-tab-pane label="基本信息" name="basic">
          <el-descriptions :column="2" border size="small">
            <el-descriptions-item label="用户名">{{ detail.username }}</el-descriptions-item>
            <el-descriptions-item label="姓名">{{ detail.real_name }}</el-descriptions-item>
            <el-descriptions-item label="手机">{{ detail.phone || '-' }}</el-descriptions-item>
            <el-descriptions-item label="邮箱">{{ detail.email || '-' }}</el-descriptions-item>
            <el-descriptions-item label="部门">{{ detail.dept_name || '-' }}</el-descriptions-item>
            <el-descriptions-item label="角色">{{ detail.role_name || '-' }}</el-descriptions-item>
            <el-descriptions-item label="上级">{{ detail.manager_name || '-' }}</el-descriptions-item>
            <el-descriptions-item label="状态">{{ detail.status === 1 ? '在职' : '离职' }}</el-descriptions-item>
          </el-descriptions>
        </el-tab-pane>
        <el-tab-pane label="档案详情" name="profile">
          <el-descriptions :column="2" border size="small">
            <el-descriptions-item label="性别">{{ {male:'男',female:'女'}[detail.gender] || '-' }}</el-descriptions-item>
            <el-descriptions-item label="出生日期">{{ detail.birth_date || '-' }}</el-descriptions-item>
            <el-descriptions-item label="身份证">{{ detail.id_card || '-' }}</el-descriptions-item>
            <el-descriptions-item label="入职日期">{{ detail.hire_date || '-' }}</el-descriptions-item>
            <el-descriptions-item label="职位">{{ detail.position || '-' }}</el-descriptions-item>
            <el-descriptions-item label="用工类型">{{ empTypeName[detail.employment_type] || '-' }}</el-descriptions-item>
            <el-descriptions-item label="合同起始">{{ detail.contract_start || '-' }}</el-descriptions-item>
            <el-descriptions-item label="合同到期">{{ detail.contract_end || '-' }}</el-descriptions-item>
            <el-descriptions-item label="基本工资">{{ detail.salary_base ? '¥' + Number(detail.salary_base).toLocaleString() : '-' }}</el-descriptions-item>
            <el-descriptions-item label="提成比例">{{ detail.salary_commission_rate || 0 }}%</el-descriptions-item>
            <el-descriptions-item label="开户银行">{{ detail.bank_name || '-' }}</el-descriptions-item>
            <el-descriptions-item label="银行账号">{{ detail.bank_account || '-' }}</el-descriptions-item>
            <el-descriptions-item label="紧急联系人">{{ detail.emergency_contact || '-' }}</el-descriptions-item>
            <el-descriptions-item label="紧急电话">{{ detail.emergency_phone || '-' }}</el-descriptions-item>
            <el-descriptions-item label="学历">{{ detail.education || '-' }}</el-descriptions-item>
            <el-descriptions-item label="毕业院校">{{ detail.university || '-' }}</el-descriptions-item>
            <el-descriptions-item label="住址" :span="2">{{ detail.address || '-' }}</el-descriptions-item>
            <el-descriptions-item label="备注" :span="2">{{ detail.remark || '-' }}</el-descriptions-item>
          </el-descriptions>
        </el-tab-pane>
      </el-tabs>
    </el-dialog>

    <!-- 编辑档案弹窗 -->
    <el-dialog v-model="editVisible" title="编辑档案" width="700px" top="5vh">
      <el-form :model="profileForm" label-width="90px">
        <el-row :gutter="16">
          <el-col :span="12"><el-form-item label="性别"><el-select v-model="profileForm.gender" style="width:100%"><el-option label="男" value="male" /><el-option label="女" value="female" /></el-select></el-form-item></el-col>
          <el-col :span="12"><el-form-item label="出生日期"><el-date-picker v-model="profileForm.birth_date" type="date" style="width:100%" value-format="YYYY-MM-DD" /></el-form-item></el-col>
        </el-row>
        <el-row :gutter="16">
          <el-col :span="12"><el-form-item label="身份证"><el-input v-model="profileForm.id_card" /></el-form-item></el-col>
          <el-col :span="12"><el-form-item label="入职日期"><el-date-picker v-model="profileForm.hire_date" type="date" style="width:100%" value-format="YYYY-MM-DD" /></el-form-item></el-col>
        </el-row>
        <el-row :gutter="16">
          <el-col :span="12"><el-form-item label="职位"><el-input v-model="profileForm.position" /></el-form-item></el-col>
          <el-col :span="12"><el-form-item label="用工类型"><el-select v-model="profileForm.employment_type" style="width:100%"><el-option label="全职" value="fulltime" /><el-option label="兼职" value="parttime" /><el-option label="实习" value="intern" /></el-select></el-form-item></el-col>
        </el-row>
        <el-row :gutter="16">
          <el-col :span="12"><el-form-item label="合同起始"><el-date-picker v-model="profileForm.contract_start" type="date" style="width:100%" value-format="YYYY-MM-DD" /></el-form-item></el-col>
          <el-col :span="12"><el-form-item label="合同到期"><el-date-picker v-model="profileForm.contract_end" type="date" style="width:100%" value-format="YYYY-MM-DD" /></el-form-item></el-col>
        </el-row>
        <el-row :gutter="16">
          <el-col :span="12"><el-form-item label="基本工资"><el-input-number v-model="profileForm.salary_base" :min="0" :precision="2" style="width:100%" controls-position="right" /></el-form-item></el-col>
          <el-col :span="12"><el-form-item label="提成比例%"><el-input-number v-model="profileForm.salary_commission_rate" :min="0" :max="100" :precision="2" style="width:100%" controls-position="right" /></el-form-item></el-col>
        </el-row>
        <el-row :gutter="16">
          <el-col :span="12"><el-form-item label="开户银行"><el-input v-model="profileForm.bank_name" /></el-form-item></el-col>
          <el-col :span="12"><el-form-item label="银行账号"><el-input v-model="profileForm.bank_account" /></el-form-item></el-col>
        </el-row>
        <el-row :gutter="16">
          <el-col :span="12"><el-form-item label="紧急联系人"><el-input v-model="profileForm.emergency_contact" /></el-form-item></el-col>
          <el-col :span="12"><el-form-item label="紧急电话"><el-input v-model="profileForm.emergency_phone" /></el-form-item></el-col>
        </el-row>
        <el-row :gutter="16">
          <el-col :span="8"><el-form-item label="学历"><el-input v-model="profileForm.education" /></el-form-item></el-col>
          <el-col :span="8"><el-form-item label="毕业院校"><el-input v-model="profileForm.university" /></el-form-item></el-col>
          <el-col :span="8"><el-form-item label="专业"><el-input v-model="profileForm.major" /></el-form-item></el-col>
        </el-row>
        <el-form-item label="住址"><el-input v-model="profileForm.address" /></el-form-item>
        <el-form-item label="备注"><el-input v-model="profileForm.remark" type="textarea" :rows="2" /></el-form-item>
      </el-form>
      <template #footer><el-button @click="editVisible=false">取消</el-button><el-button type="primary" :loading="saveLoading" @click="handleSaveProfile">保存</el-button></template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import request from '@/utils/request'

const empTypeName = { fulltime: '全职', parttime: '兼职', intern: '实习' }
const empTypeTag = { fulltime: 'success', parttime: 'warning', intern: 'info' }

const loading = ref(false)
const list = ref([])
const total = ref(0)
const page = ref(1)
const pageSize = ref(20)
const search = reactive({ keyword: '', dept_id: '', status: '', contract_expiring: false })
const expiringContracts = ref(0)
const deptOptions = ref([])
const stats = ref({ total: 0, active: 0, inactive: 0, new_hire: 0, new_leave: 0, dept_distribution: [] })

const statCards = computed(() => [
  { key: 'total', label: '总人数', value: stats.value.total },
  { key: 'active', label: '在职', value: stats.value.active },
  { key: 'inactive', label: '离职', value: stats.value.inactive },
  { key: 'new', label: '本月新入职', value: stats.value.new_hire }
])

const detailVisible = ref(false)
const detailTab = ref('basic')
const detail = ref({})

const editVisible = ref(false)
const editUserId = ref(null)
const saveLoading = ref(false)
const profileForm = reactive({
  gender: '', birth_date: '', id_card: '', hire_date: '', position: '',
  employment_type: 'fulltime', contract_start: '', contract_end: '',
  salary_base: null, salary_commission_rate: 0,
  bank_name: '', bank_account: '', emergency_contact: '', emergency_phone: '',
  address: '', education: '', university: '', major: '', remark: ''
})

const fetchList = async () => {
  loading.value = true
  try {
    const res = await request.get('/hr/employees', { params: { page: page.value, page_size: pageSize.value, ...search } })
    if (res.code === 200) { list.value = res.data.list; total.value = res.data.total; expiringContracts.value = res.data.expiring_contracts || 0 }
  } catch (e) { /* */ }
  finally { loading.value = false }
}

const fetchStats = async () => {
  try { const res = await request.get('/hr/employees/stats'); if (res.code === 200) stats.value = res.data } catch (e) { /* */ }
}

const fetchDepts = async () => {
  try { const res = await request.post('/dept/list', {}); if (res.code === 200) deptOptions.value = res.data.list || [] } catch (e) { /* */ }
}

const handleView = async (row) => {
  try {
    const res = await request.get(`/hr/employees/${row.id}`)
    if (res.code === 200) { detail.value = res.data; detailTab.value = 'basic'; detailVisible.value = true }
  } catch (e) { /* */ }
}

const handleEditProfile = async (row) => {
  editUserId.value = row.id
  try {
    const res = await request.get(`/hr/employees/${row.id}`)
    if (res.code === 200) {
      const d = res.data
      Object.assign(profileForm, {
        gender: d.gender || '', birth_date: d.birth_date || '', id_card: d.id_card || '',
        hire_date: d.hire_date || '', position: d.position || '',
        employment_type: d.employment_type || 'fulltime',
        contract_start: d.contract_start || '', contract_end: d.contract_end || '',
        salary_base: d.salary_base, salary_commission_rate: d.salary_commission_rate || 0,
        bank_name: d.bank_name || '', bank_account: d.bank_account || '',
        emergency_contact: d.emergency_contact || '', emergency_phone: d.emergency_phone || '',
        address: d.address || '', education: d.education || '', university: d.university || '',
        major: d.major || '', remark: d.remark || ''
      })
      editVisible.value = true
    }
  } catch (e) { /* */ }
}

const handleSaveProfile = async () => {
  saveLoading.value = true
  try {
    const res = await request.post(`/hr/employees/${editUserId.value}/profile`, profileForm)
    if (res.code === 200) { ElMessage.success('保存成功'); editVisible.value = false; fetchList() }
  } finally { saveLoading.value = false }
}

onMounted(() => { fetchList(); fetchStats(); fetchDepts() })
</script>

<style scoped>
.page-container { padding: 0; }
.page-header { margin-bottom: var(--space-4); }
.page-header h2 { margin: 0; font-size: 28px; font-weight: 600; color: var(--color-text); }
.stat-cards { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; margin-bottom: var(--space-4); }
.stat-card { background: #fff; border-radius: 16px; padding: 24px; box-shadow: 0 2px 12px rgba(0,0,0,0.06); text-align: center; }
.stat-value { font-size: 28px; font-weight: 700; color: var(--color-text); }
.stat-label { font-size: 13px; color: var(--color-text-tertiary); margin-top: 4px; }
.search-card { margin-bottom: var(--space-4); }
.search-card .el-form-item { margin-bottom: 0; }
.text-muted { color: var(--color-text-tertiary); font-size: 12px; }
.pagination { display: flex; justify-content: flex-end; margin-top: var(--space-4); }
</style>
