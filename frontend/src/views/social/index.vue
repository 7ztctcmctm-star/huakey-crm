<template>
  <div class="page-container">
    <div class="page-header">
      <h2>社媒沟通记录</h2>
      <el-button type="primary" :icon="Plus" @click="handleCreate">新增记录</el-button>
    </div>

    <!-- 统计 -->
    <div class="stat-cards">
      <div class="stat-card"><div class="stat-value">{{ stats.total }}</div><div class="stat-label">总记录数</div></div>
      <div class="stat-card"><div class="stat-value">{{ stats.week_new }}</div><div class="stat-label">本周新增</div></div>
      <div v-for="p in stats.platform_dist?.slice(0, 3)" :key="p.platform" class="stat-card">
        <div class="stat-value">{{ p.count }}</div>
        <div class="stat-label">{{ platformName[p.platform] || p.platform }}</div>
      </div>
    </div>

    <!-- 筛选 -->
    <el-card shadow="never" class="search-card">
      <el-form :model="search" inline @keyup.enter="fetchList">
        <el-form-item>
          <el-select v-model="search.customer_id" filterable clearable placeholder="选择客户" style="width:200px">
            <el-option v-for="c in customerOptions" :key="c.id" :label="c.company_name" :value="c.id" />
          </el-select>
        </el-form-item>
        <el-form-item>
          <el-select v-model="search.platform" placeholder="全部平台" clearable style="width:120px">
            <el-option v-for="(v, k) in platformName" :key="k" :label="v" :value="k" />
          </el-select>
        </el-form-item>
        <el-form-item><el-button type="primary" @click="fetchList">搜索</el-button></el-form-item>
      </el-form>
    </el-card>

    <!-- 列表 -->
    <el-card shadow="never">
      <el-table :data="list" stripe border v-loading="loading">
        <el-table-column prop="customer_name" label="客户" min-width="140" show-overflow-tooltip />
        <el-table-column prop="contact_name" label="联系人" width="100" />
        <el-table-column prop="platform" label="平台" width="100" align="center">
          <template #default="{ row }">
            <span class="platform-badge" :style="{ background: platformColor[row.platform] }">{{ platformName[row.platform] || row.platform }}</span>
          </template>
        </el-table-column>
        <el-table-column prop="direction" label="方向" width="60" align="center">
          <template #default="{ row }">
            <span :style="{ color: row.direction === 'in' ? '#34c759' : '#0071e3' }">{{ row.direction === 'in' ? '← 收' : '→ 发' }}</span>
          </template>
        </el-table-column>
        <el-table-column prop="content" label="内容摘要" min-width="200" show-overflow-tooltip />
        <el-table-column prop="message_time" label="消息时间" width="160">
          <template #default="{ row }">{{ row.message_time || '-' }}</template>
        </el-table-column>
        <el-table-column prop="create_by_name" label="操作人" width="90" />
        <el-table-column label="操作" width="100" fixed="right">
          <template #default="{ row }">
            <el-button type="danger" link size="small" @click="handleDelete(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
      <div class="pagination"><el-pagination v-model:current-page="page" v-model:page-size="pageSize" :total="total" layout="total,prev,pager,next" @current-change="fetchList" /></div>
    </el-card>

    <!-- 新增弹窗 -->
    <el-dialog v-model="dialogVisible" title="新增沟通记录" width="500px">
      <el-form :model="form" label-width="80px">
        <el-form-item label="客户">
          <el-select v-model="form.customer_id" filterable placeholder="选择客户" style="width:100%">
            <el-option v-for="c in customerOptions" :key="c.id" :label="c.company_name" :value="c.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="平台">
          <el-select v-model="form.platform" style="width:100%">
            <el-option v-for="(v, k) in platformName" :key="k" :label="v" :value="k" />
          </el-select>
        </el-form-item>
        <el-form-item label="方向">
          <el-radio-group v-model="form.direction">
            <el-radio value="in">收到</el-radio>
            <el-radio value="out">发出</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="内容"><el-input v-model="form.content" type="textarea" :rows="4" placeholder="沟通内容摘要" /></el-form-item>
        <el-form-item label="消息时间"><el-date-picker v-model="form.message_time" type="datetime" style="width:100%" value-format="YYYY-MM-DD HH:mm:ss" /></el-form-item>
      </el-form>
      <template #footer><el-button @click="dialogVisible=false">取消</el-button><el-button type="primary" :loading="saveLoading" @click="handleSave">保存</el-button></template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus } from '@element-plus/icons-vue'
import { getSocialRecords, saveSocialRecord, getSocialStats, deleteSocialRecord } from '@/api/tools'
import { getCustomerList } from '@/api/customer'
import request from '@/utils/request'

const platformName = { wechat: '微信', whatsapp: 'WhatsApp', telegram: 'Telegram', email: '邮件', linkedin: 'LinkedIn', facebook: 'Facebook', instagram: 'Instagram' }
const platformColor = { wechat: '#07C160', whatsapp: '#25D366', telegram: '#0088cc', email: '#636363', linkedin: '#0A66C2', facebook: '#1877F2', instagram: '#E4405F' }

const loading = ref(false)
const list = ref([])
const total = ref(0)
const page = ref(1)
const pageSize = ref(20)
const search = reactive({ customer_id: '', platform: '' })
const stats = ref({ total: 0, week_new: 0, platform_dist: [] })
const customerOptions = ref([])

const dialogVisible = ref(false)
const saveLoading = ref(false)
const form = reactive({ customer_id: null, platform: 'wechat', direction: 'out', content: '', message_time: '' })

const fetchList = async () => {
  loading.value = true
  try {
    const params = { page: page.value, page_size: pageSize.value }
    if (search.customer_id) params.customer_id = search.customer_id
    if (search.platform) params.platform = search.platform
    const res = await getSocialRecords(params)
    if (res.code === 200) { list.value = res.data.list; total.value = res.data.total }
  } catch (e) { /* */ }
  finally { loading.value = false }
}

const fetchStats = async () => {
  try { const res = await getSocialStats(); if (res.code === 200) stats.value = res.data } catch (e) { /* */ }
}

const fetchCustomers = async () => {
  try { const res = await getCustomerList({ page: 1, pageSize: 200 }); if (res.code === 200) customerOptions.value = res.data.list } catch (e) { /* */ }
}

const handleCreate = () => {
  Object.assign(form, { customer_id: null, platform: 'wechat', direction: 'out', content: '', message_time: '' })
  dialogVisible.value = true
}

const handleSave = async () => {
  if (!form.platform || !form.direction) { ElMessage.warning('请选择平台和方向'); return }
  saveLoading.value = true
  try {
    const res = await saveSocialRecord(form)
    if (res.code === 200) { ElMessage.success('创建成功'); dialogVisible.value = false; fetchList(); fetchStats() }
  } finally { saveLoading.value = false }
}

const handleDelete = (row) => {
  ElMessageBox.confirm('确定删除该记录？', '提示', { type: 'warning' }).then(async () => {
    const res = await deleteSocialRecord(row.id)
    if (res.code === 200) { ElMessage.success('已删除'); fetchList(); fetchStats() }
  }).catch(() => {})
}

onMounted(() => { fetchList(); fetchStats(); fetchCustomers() })
</script>

<style scoped>
.page-container { padding: 0; }
.page-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: var(--space-4); }
.page-header h2 { margin: 0; font-size: 28px; font-weight: 600; color: var(--color-text); }
.stat-cards { display: flex; gap: 16px; margin-bottom: var(--space-4); }
.stat-card { background: #fff; border-radius: 16px; padding: 20px 24px; box-shadow: 0 2px 12px rgba(0,0,0,0.06); text-align: center; min-width: 120px; }
.stat-value { font-size: 24px; font-weight: 700; color: var(--color-text); }
.stat-label { font-size: 12px; color: var(--color-text-tertiary); margin-top: 4px; }
.search-card { margin-bottom: var(--space-4); }
.search-card .el-form-item { margin-bottom: 0; }
.platform-badge { display: inline-block; padding: 2px 8px; border-radius: 4px; color: #fff; font-size: 12px; font-weight: 500; }
.pagination { display: flex; justify-content: flex-end; margin-top: var(--space-4); }
</style>
