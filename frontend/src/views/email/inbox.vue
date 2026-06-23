<template>
  <div class="email-container">
    <!-- 左侧：文件夹 -->
    <div class="email-sidebar">
      <div class="sidebar-header">
        <el-button type="primary" @click="$router.push('/email/compose')" style="width: 100%">
          <el-icon><Edit /></el-icon> 写邮件
        </el-button>
      </div>
      <div class="folder-list">
        <div v-for="f in folders" :key="f.key"
          :class="['folder-item', { active: currentFolder === f.key }]"
          @click="selectFolder(f.key)">
          <span class="folder-name">{{ f.label }}</span>
          <el-badge v-if="f.count > 0" :value="f.count" :max="99" class="folder-badge" />
        </div>
      </div>
      <div class="sidebar-footer">
        <el-button text size="small" @click="$router.push('/email/settings')">
          <el-icon><Setting /></el-icon> 邮箱设置
        </el-button>
      </div>
    </div>

    <!-- 中间：邮件列表 -->
    <div class="email-list">
      <div class="list-header">
        <el-input v-model="keyword" placeholder="搜索邮件..." clearable @keyup.enter="fetchList" size="small">
          <template #prefix><el-icon><Search /></el-icon></template>
        </el-input>
      </div>
      <div class="list-body" v-loading="loading">
        <div v-for="item in emailList" :key="item.id"
          :class="['email-item', { unread: !item.is_read, active: selectedId === item.id }]"
          @click="selectEmail(item)">
          <div class="item-left">
            <div :class="['read-dot', { unread: !item.is_read }]"></div>
            <el-icon class="star-icon" :class="{ starred: item.is_starred }" @click.stop="toggleStar(item)">
              <Star />
            </el-icon>
          </div>
          <div class="item-body">
            <div class="item-sender">{{ item.direction === 'in' ? item.from_address : '已发送' }}</div>
            <div class="item-subject">{{ item.subject || '(无主题)' }}</div>
            <div class="item-time">{{ formatTime(item.received_at || item.sent_at || item.created_at) }}</div>
          </div>
          <el-icon v-if="item.has_attachments" class="attachment-icon"><Paperclip /></el-icon>
        </div>
        <el-empty v-if="!loading && emailList.length === 0" description="暂无邮件" />
      </div>
      <div class="list-footer">
        <el-pagination small layout="prev, pager, next" :total="total" v-model:current-page="page" :page-size="pageSize" @current-change="fetchList" />
      </div>
    </div>

    <!-- 右侧：邮件详情 -->
    <div class="email-detail" v-if="selectedEmail">
      <div class="detail-header">
        <h3 class="detail-subject">{{ selectedEmail.subject }}</h3>
        <div class="detail-meta">
          <div><strong>发件人：</strong>{{ selectedEmail.from_address }}</div>
          <div><strong>收件人：</strong>{{ parseAddresses(selectedEmail.to_addresses) }}</div>
          <div v-if="selectedEmail.cc_addresses"><strong>抄送：</strong>{{ parseAddresses(selectedEmail.cc_addresses) }}</div>
          <div><strong>时间：</strong>{{ formatTime(selectedEmail.received_at || selectedEmail.sent_at) }}</div>
        </div>
        <div class="detail-actions">
          <el-button size="small" @click="handleReply"><el-icon><RefreshRight /></el-icon> 回复</el-button>
          <el-button size="small" @click="showLinkDialog = true"><el-icon><Connection /></el-icon> 关联客户</el-button>
        </div>
        <div v-if="selectedEmail.customer_name" class="linked-customer">
          <el-tag type="info" size="small">关联客户：{{ selectedEmail.customer_name }}</el-tag>
        </div>
      </div>
      <div class="detail-body" v-html="sanitize(selectedEmail.body_html || selectedEmail.body_text || '(无内容)')"></div>
      <div v-if="selectedEmail.attachments?.length" class="detail-attachments">
        <div class="attachment-title">附件 ({{ selectedEmail.attachments.length }})</div>
        <div v-for="att in selectedEmail.attachments" :key="att.id" class="attachment-item">
          <el-icon><Document /></el-icon>
          <span>{{ att.filename }}</span>
          <span class="att-size">{{ formatSize(att.file_size) }}</span>
        </div>
      </div>
    </div>
    <div class="email-detail empty" v-else>
      <el-empty description="选择一封邮件查看" />
    </div>

    <!-- 关联客户弹窗 -->
    <el-dialog v-model="showLinkDialog" title="关联客户" width="400px">
      <el-select v-model="linkCustomerId" filterable remote :remote-method="searchCustomers" placeholder="搜索客户..." style="width: 100%">
        <el-option v-for="c in customerOptions" :key="c.id" :label="c.company_name" :value="c.id" />
      </el-select>
      <template #footer>
        <el-button @click="showLinkDialog = false">取消</el-button>
        <el-button type="primary" @click="linkCustomer">确定</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { Edit, Setting, Search, Star, Paperclip, RefreshRight, Connection, Document } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import request from '@/utils/request'
import { getEmailList, getEmailStats, markEmailRead, getEmailDetail, toggleEmailStar, linkCustomerToEmail } from '@/api/email'
import { getCustomerList } from '@/api/customer'
import DOMPurify from 'dompurify'

const sanitize = (html) => DOMPurify.sanitize(html, { ADD_ATTR: ['target'] })

const router = useRouter()
const loading = ref(false)
const emailList = ref([])
const total = ref(0)
const page = ref(1)
const pageSize = ref(20)
const keyword = ref('')
const currentFolder = ref('inbox')
const selectedId = ref(null)
const selectedEmail = ref(null)
const stats = ref({})

const showLinkDialog = ref(false)
const linkCustomerId = ref(null)
const customerOptions = ref([])

const folders = computed(() => [
  { key: 'inbox', label: '收件箱', count: stats.value.folders?.inbox || 0 },
  { key: 'sent', label: '已发送', count: stats.value.folders?.sent || 0 },
  { key: 'starred', label: '星标', count: stats.value.starred || 0 },
  { key: 'trash', label: '垃圾箱', count: stats.value.folders?.trash || 0 },
])

const selectFolder = (key) => {
  currentFolder.value = key
  page.value = 1
  fetchList()
}

const fetchList = async () => {
  loading.value = true
  try {
    const params = { folder: currentFolder.value, page: page.value, page_size: pageSize.value }
    if (keyword.value) params.keyword = keyword.value
    const res = await getEmailList(params)
    if (res.code === 200) {
      emailList.value = res.data.list
      total.value = res.data.total
    }
  } finally {
    loading.value = false
  }
}

const fetchStats = async () => {
  const res = await getEmailStats()
  if (res.code === 200) stats.value = res.data
}

const selectEmail = async (item) => {
  selectedId.value = item.id
  if (!item.is_read) {
    await markEmailRead(item.id)
    item.is_read = 1
    if (stats.value.unread > 0) stats.value.unread--
  }
  const res = await getEmailDetail(item.id)
  if (res.code === 200) selectedEmail.value = res.data
}

const toggleStar = async (item) => {
  const res = await toggleEmailStar(item.id)
  if (res.code === 200) {
    item.is_starred = res.data.is_starred
    fetchStats()
  }
}

const handleReply = () => {
  router.push({ path: '/email/compose', query: { reply_to: selectedEmail.value.id, to: selectedEmail.value.from_address, subject: `Re: ${selectedEmail.value.subject}` } })
}

const searchCustomers = async (query) => {
  if (!query) return
  const res = await getCustomerList({ keyword: query, pageSize: 10 })
  if (res.code === 200) customerOptions.value = res.data.list
}

const linkCustomer = async () => {
  if (!linkCustomerId.value) return
  const res = await linkCustomerToEmail(selectedEmail.value.id, linkCustomerId.value)
  if (res.code === 200) {
    ElMessage.success('关联成功')
    showLinkDialog.value = false
    selectEmail(selectedEmail.value)
  }
}

const parseAddresses = (addr) => {
  try { return JSON.parse(addr || '[]').join(', ') } catch { return addr || '-' }
}

const formatTime = (t) => {
  if (!t) return '-'
  const d = new Date(t)
  const now = new Date()
  const isToday = d.toDateString() === now.toDateString()
  return isToday ? `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}` : `${d.getMonth() + 1}/${d.getDate()} ${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`
}

const formatSize = (bytes) => {
  if (!bytes) return ''
  if (bytes < 1024) return bytes + 'B'
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + 'KB'
  return (bytes / 1048576).toFixed(1) + 'MB'
}

onMounted(() => {
  fetchList()
  fetchStats()
})
</script>

<style scoped>
.email-container { display: flex; height: calc(100vh - 120px); background: #fff; border-radius: 8px; overflow: hidden; }
.email-sidebar { width: 200px; border-right: 1px solid #ebeef5; display: flex; flex-direction: column; }
.sidebar-header { padding: 16px; }
.folder-list { flex: 1; overflow-y: auto; }
.folder-item { display: flex; align-items: center; justify-content: space-between; padding: 10px 16px; cursor: pointer; transition: background 0.2s; }
.folder-item:hover { background: #f5f7fa; }
.folder-item.active { background: #ecf5ff; color: #409eff; }
.folder-name { font-size: 14px; }
.sidebar-footer { padding: 12px 16px; border-top: 1px solid #ebeef5; }
.email-list { width: 320px; border-right: 1px solid #ebeef5; display: flex; flex-direction: column; }
.list-header { padding: 12px; border-bottom: 1px solid #ebeef5; }
.list-body { flex: 1; overflow-y: auto; }
.email-item { display: flex; align-items: center; padding: 12px; cursor: pointer; border-bottom: 1px solid #f5f7fa; transition: background 0.2s; gap: 8px; }
.email-item:hover { background: #f5f7fa; }
.email-item.active { background: #ecf5ff; }
.email-item.unread { background: #fafbfc; }
.item-left { display: flex; flex-direction: column; align-items: center; gap: 4px; }
.read-dot { width: 8px; height: 8px; border-radius: 50%; background: #c0c4cc; }
.read-dot.unread { background: #409eff; }
.star-icon { color: #c0c4cc; cursor: pointer; font-size: 14px; }
.star-icon.starred { color: #f7ba2a; }
.item-body { flex: 1; min-width: 0; }
.item-sender { font-size: 13px; color: #303133; margin-bottom: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.email-item.unread .item-sender { font-weight: 600; }
.item-subject { font-size: 12px; color: #909399; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.item-time { font-size: 11px; color: #c0c4cc; margin-top: 2px; }
.attachment-icon { color: #909399; font-size: 14px; }
.list-footer { padding: 8px 12px; border-top: 1px solid #ebeef5; display: flex; justify-content: center; }
.email-detail { flex: 1; display: flex; flex-direction: column; overflow: hidden; }
.email-detail.empty { display: flex; align-items: center; justify-content: center; }
.detail-header { padding: 20px; border-bottom: 1px solid #ebeef5; }
.detail-subject { font-size: 18px; font-weight: 600; color: #1d1d1f; margin: 0 0 12px 0; }
.detail-meta { font-size: 13px; color: #606266; line-height: 1.8; }
.detail-actions { margin-top: 12px; display: flex; gap: 8px; }
.linked-customer { margin-top: 8px; }
.detail-body { flex: 1; padding: 20px; overflow-y: auto; font-size: 14px; line-height: 1.8; color: #303133; }
.detail-attachments { padding: 12px 20px; border-top: 1px solid #ebeef5; }
.attachment-title { font-size: 13px; color: #909399; margin-bottom: 8px; }
.attachment-item { display: flex; align-items: center; gap: 6px; font-size: 13px; padding: 4px 0; }
.att-size { color: #c0c4cc; margin-left: auto; }
</style>
