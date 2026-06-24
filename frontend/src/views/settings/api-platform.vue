<template>
  <div class="page-container">
    <div class="page-header"><h2>API 开放平台</h2></div>

    <el-tabs v-model="activeTab">
      <!-- API密钥 -->
      <el-tab-pane label="API密钥" name="keys">
        <el-card shadow="never">
          <div class="toolbar"><el-button type="primary" :icon="Plus" @click="handleCreateKey">创建密钥</el-button></div>
          <el-table :data="keys" stripe border>
            <el-table-column prop="name" label="名称" min-width="140" />
            <el-table-column label="API Key" width="240">
              <template #default="{ row }"><code class="key-text">{{ row.api_key.slice(0, 12) }}...{{ row.api_key.slice(-8) }}</code></template>
            </el-table-column>
            <el-table-column label="权限" min-width="160">
              <template #default="{ row }">
                <el-tag v-for="p in parsePerms(row.permissions)" :key="p" size="small" style="margin:2px">{{ p }}</el-tag>
              </template>
            </el-table-column>
            <el-table-column label="状态" width="80" align="center">
              <template #default="{ row }"><el-tag :type="row.status?'success':'info'" size="small">{{ row.status?'启用':'禁用' }}</el-tag></template>
            </el-table-column>
            <el-table-column prop="last_used_at" label="最后使用" width="160">
              <template #default="{ row }">{{ row.last_used_at || '从未使用' }}</template>
            </el-table-column>
            <el-table-column label="操作" width="200" fixed="right">
              <template #default="{ row }">
                <el-button type="primary" link @click="handleEditKey(row)">编辑</el-button>
                <el-button type="warning" link @click="handleRegenerate(row)">重新生成</el-button>
                <el-button type="danger" link @click="handleDeleteKey(row)">删除</el-button>
              </template>
            </el-table-column>
          </el-table>
        </el-card>
      </el-tab-pane>

      <!-- Webhook管理 -->
      <el-tab-pane label="Webhook管理" name="webhooks">
        <el-card shadow="never">
          <div class="toolbar"><el-button type="primary" :icon="Plus" @click="handleCreateWebhook">创建 Webhook</el-button></div>
          <el-table :data="webhooks" stripe border>
            <el-table-column prop="name" label="名称" min-width="140" />
            <el-table-column prop="url" label="回调URL" min-width="200" show-overflow-tooltip />
            <el-table-column label="订阅事件" min-width="200">
              <template #default="{ row }"><el-tag v-for="e in parseEvents(row.events)" :key="e" size="small" style="margin:2px">{{ e }}</el-tag></template>
            </el-table-column>
            <el-table-column label="状态" width="80" align="center">
              <template #default="{ row }"><el-tag :type="row.status?'success':'info'" size="small">{{ row.status?'启用':'禁用' }}</el-tag></template>
            </el-table-column>
            <el-table-column prop="fail_count" label="失败" width="60" align="center">
              <template #default="{ row }"><span v-if="row.fail_count > 0" style="color:#f56c6c">{{ row.fail_count }}</span><span v-else>-</span></template>
            </el-table-column>
            <el-table-column label="操作" width="200" fixed="right">
              <template #default="{ row }">
                <el-button type="primary" link @click="handleTestWebhook(row)">测试</el-button>
                <el-button type="primary" link @click="handleEditWebhook(row)">编辑</el-button>
                <el-button type="danger" link @click="handleDeleteWebhook(row)">删除</el-button>
              </template>
            </el-table-column>
          </el-table>
        </el-card>
      </el-tab-pane>

      <!-- API文档 -->
      <el-tab-pane label="API文档" name="docs">
        <el-card shadow="never">
          <div class="doc-section">
            <h3>认证方式</h3>
            <p>在请求头中添加 <code>X-API-Key: your_api_key</code></p>
            <p>所有API请求都需要携带有效的API Key。</p>

            <h3>请求示例</h3>
            <pre class="code-block">curl -H "X-API-Key: crm_xxxxxxxxxxxx" \
  http://your-server/api/customer/list</pre>

            <h3>可用端点</h3>
            <div v-for="mod in docs.endpoints" :key="mod.module" class="doc-module">
              <h4>{{ mod.module }}</h4>
              <div v-for="ep in mod.endpoints" :key="ep.path" class="doc-endpoint">
                <span class="doc-method" :class="ep.method.toLowerCase()">{{ ep.method }}</span>
                <code class="doc-path">{{ ep.path }}</code>
                <span class="doc-desc">{{ ep.description }}</span>
                <el-tag size="small" type="info">{{ ep.permission }}</el-tag>
              </div>
            </div>

            <h3>频率限制</h3>
            <p>{{ docs.rate_limit }}</p>
          </div>
        </el-card>
      </el-tab-pane>
    </el-tabs>

    <!-- API密钥弹窗 -->
    <el-dialog v-model="keyDialogVisible" :title="isKeyEdit ? '编辑密钥' : '创建密钥'" width="500px">
      <el-form :model="keyForm" label-width="80px">
        <el-form-item label="名称"><el-input v-model="keyForm.name" placeholder="密钥名称" /></el-form-item>
        <el-form-item label="权限">
          <el-checkbox-group v-model="keyForm.permissions">
            <el-checkbox v-for="p in allPermissions" :key="p" :value="p" :label="p" />
          </el-checkbox-group>
        </el-form-item>
        <el-form-item label="限流/时"><el-input-number v-model="keyForm.rate_limit" :min="10" :max="10000" style="width:100%" controls-position="right" /></el-form-item>
      </el-form>
      <template #footer><el-button @click="keyDialogVisible=false">取消</el-button><el-button type="primary" @click="handleSaveKey">保存</el-button></template>
    </el-dialog>

    <!-- 密钥创建成功弹窗 -->
    <el-dialog v-model="keyResultVisible" title="密钥已创建" width="500px">
      <el-alert type="warning" :closable="false" show-icon style="margin-bottom:16px">请妥善保存以下密钥，关闭后将无法再次查看完整密钥。</el-alert>
      <el-form label-width="80px">
        <el-form-item label="API Key"><el-input :model-value="keyResult.api_key" readonly><template #append><el-button @click="copyKey(keyResult.api_key)">复制</el-button></template></el-input></el-form-item>
        <el-form-item label="Secret"><el-input :model-value="keyResult.api_secret" readonly><template #append><el-button @click="copyKey(keyResult.api_secret)">复制</el-button></template></el-input></el-form-item>
      </el-form>
    </el-dialog>

    <!-- Webhook弹窗 -->
    <el-dialog v-model="webhookDialogVisible" :title="isWebhookEdit ? '编辑Webhook' : '创建Webhook'" width="500px">
      <el-form :model="webhookForm" label-width="80px">
        <el-form-item label="名称"><el-input v-model="webhookForm.name" placeholder="Webhook名称" /></el-form-item>
        <el-form-item label="回调URL"><el-input v-model="webhookForm.url" placeholder="https://example.com/webhook" /></el-form-item>
        <el-form-item label="订阅事件">
          <el-checkbox-group v-model="webhookForm.events">
            <el-checkbox v-for="e in allEvents" :key="e" :value="e" :label="e" />
          </el-checkbox-group>
        </el-form-item>
      </el-form>
      <template #footer><el-button @click="webhookDialogVisible=false">取消</el-button><el-button type="primary" @click="handleSaveWebhook">保存</el-button></template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus } from '@element-plus/icons-vue'
import request from '@/utils/request'
import { getApiKeys, saveApiKey, getWebhooks, saveWebhook, getApiDocs, regenerateApiKey, deleteApiKey, testWebhook, deleteWebhook } from '@/api/system'

const activeTab = ref('keys')
const allPermissions = ['customer:read', 'customer:write', 'contract:read', 'contract:write', 'opportunity:read', 'product:read', 'payment:read']
const allEvents = ['customer.created', 'customer.updated', 'contract.signed', 'contract.completed', 'payment.received', 'opportunity.won', 'opportunity.lost']

const parsePerms = (v) => { try { return JSON.parse(v || '[]') } catch { return [] } }
const parseEvents = (v) => { try { return JSON.parse(v || '[]') } catch { return [] } }

// API密钥
const keys = ref([])
const keyDialogVisible = ref(false)
const isKeyEdit = ref(false)
const keyEditId = ref(null)
const keyForm = reactive({ name: '', permissions: ['customer:read'], rate_limit: 100 })
const keyResultVisible = ref(false)
const keyResult = reactive({ api_key: '', api_secret: '' })

const fetchKeys = async () => {
  try { const res = await getApiKeys(); if (res.code === 200) keys.value = res.data } catch (e) { /* */ }
}

const handleCreateKey = () => {
  isKeyEdit.value = false; keyEditId.value = null
  Object.assign(keyForm, { name: '', permissions: ['customer:read'], rate_limit: 100 })
  keyDialogVisible.value = true
}

const handleEditKey = (row) => {
  isKeyEdit.value = true; keyEditId.value = row.id
  Object.assign(keyForm, { name: row.name, permissions: parsePerms(row.permissions), rate_limit: row.rate_limit || 100 })
  keyDialogVisible.value = true
}

const handleSaveKey = async () => {
  if (!keyForm.name) { ElMessage.warning('请输入名称'); return }
  try {
    const data = { ...keyForm }
    let res
    if (isKeyEdit.value) res = await saveApiKey(data, keyEditId.value)
    else res = await saveApiKey(data)
    if (res.code === 200) {
      ElMessage.success('保存成功')
      keyDialogVisible.value = false
      if (!isKeyEdit.value && res.data.api_key) {
        Object.assign(keyResult, { api_key: res.data.api_key, api_secret: res.data.api_secret })
        keyResultVisible.value = true
      }
      fetchKeys()
    }
  } catch (e) { /* */ }
}

const handleRegenerate = (row) => {
  ElMessageBox.confirm(`确定重新生成"${row.name}"的密钥？旧密钥将立即失效。`, '确认', { type: 'warning' }).then(async () => {
    const res = await regenerateApiKey(row.id)
    if (res.code === 200) {
      Object.assign(keyResult, { api_key: res.data.api_key, api_secret: res.data.api_secret })
      keyResultVisible.value = true
      fetchKeys()
    }
  }).catch(() => {})
}

const handleDeleteKey = (row) => {
  ElMessageBox.confirm(`确定删除密钥"${row.name}"？`, '提示', { type: 'warning' }).then(async () => {
    const res = await deleteApiKey(row.id)
    if (res.code === 200) { ElMessage.success('已删除'); fetchKeys() }
  }).catch(() => {})
}

const copyKey = async (text) => {
  try { await navigator.clipboard.writeText(text); ElMessage.success('已复制') } catch { ElMessage.error('复制失败') }
}

// Webhook
const webhooks = ref([])
const webhookDialogVisible = ref(false)
const isWebhookEdit = ref(false)
const webhookEditId = ref(null)
const webhookForm = reactive({ name: '', url: '', events: [] })

const fetchWebhooks = async () => {
  try { const res = await getWebhooks(); if (res.code === 200) webhooks.value = res.data } catch (e) { /* */ }
}

const handleCreateWebhook = () => {
  isWebhookEdit.value = false; webhookEditId.value = null
  Object.assign(webhookForm, { name: '', url: '', events: [] })
  webhookDialogVisible.value = true
}

const handleEditWebhook = (row) => {
  isWebhookEdit.value = true; webhookEditId.value = row.id
  Object.assign(webhookForm, { name: row.name, url: row.url, events: parseEvents(row.events) })
  webhookDialogVisible.value = true
}

const handleSaveWebhook = async () => {
  if (!webhookForm.name || !webhookForm.url) { ElMessage.warning('请填写名称和URL'); return }
  try {
    const data = { ...webhookForm }
    let res
    if (isWebhookEdit.value) res = await saveWebhook(data, webhookEditId.value)
    else res = await saveWebhook(data)
    if (res.code === 200) { ElMessage.success('保存成功'); webhookDialogVisible.value = false; fetchWebhooks() }
  } catch (e) { /* */ }
}

const handleTestWebhook = async (row) => {
  try {
    const res = await testWebhook(row.id)
    if (res.code === 200) {
      if (res.data.ok) ElMessage.success('测试成功')
      else ElMessage.warning(`测试返回 ${res.data.status}`)
    }
  } catch (e) { ElMessage.error('测试失败') }
}

const handleDeleteWebhook = (row) => {
  ElMessageBox.confirm(`确定删除"${row.name}"？`, '提示', { type: 'warning' }).then(async () => {
    const res = await deleteWebhook(row.id)
    if (res.code === 200) { ElMessage.success('已删除'); fetchWebhooks() }
  }).catch(() => {})
}

// API文档
const docs = ref({ auth: {}, endpoints: [], rate_limit: '' })
const fetchDocs = async () => {
  try { const res = await getApiDocs(); if (res.code === 200) docs.value = res.data } catch (e) { /* */ }
}

onMounted(() => { fetchKeys(); fetchWebhooks(); fetchDocs() })
</script>

<style scoped>
.page-container { padding: 0; }
.page-header { margin-bottom: var(--space-4); }
.page-header h2 { margin: 0; font-size: 28px; font-weight: 600; color: var(--color-text); }
.toolbar { margin-bottom: var(--space-4); }
.key-text { font-family: monospace; font-size: 13px; background: var(--color-bg-secondary); padding: 2px 6px; border-radius: 4px; }

/* API文档 */
.doc-section h3 { font-size: 18px; font-weight: 600; margin: 24px 0 8px; }
.doc-section h4 { font-size: 15px; font-weight: 600; margin: 16px 0 8px; }
.doc-section p { font-size: 14px; color: var(--color-text-secondary); margin-bottom: 8px; }
.code-block { background: #1d1d1f; color: #f5f5f7; padding: 16px; border-radius: 12px; font-family: monospace; font-size: 13px; overflow-x: auto; }
.doc-module { margin-bottom: 16px; }
.doc-endpoint { display: flex; align-items: center; gap: 8px; padding: 6px 0; border-bottom: 1px solid var(--color-border); }
.doc-method { display: inline-block; width: 50px; text-align: center; font-size: 12px; font-weight: 600; padding: 2px 0; border-radius: 4px; color: #fff; }
.doc-method.get { background: #34c759; }
.doc-method.post { background: #0071e3; }
.doc-method.put { background: #ff9500; }
.doc-method.delete { background: #f56c6c; }
.doc-path { font-family: monospace; font-size: 13px; }
.doc-desc { font-size: 13px; color: var(--color-text-secondary); flex: 1; }
</style>
