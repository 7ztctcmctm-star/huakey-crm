<template>
  <div class="settings-page">
    <div class="page-header">
      <h2>系统设置</h2>
      <p class="page-desc">查看系统运行状态和基本配置</p>
    </div>

    <el-row :gutter="24">
      <!-- 系统信息 -->
      <el-col :span="12">
        <el-card shadow="never">
          <template #header><span class="card-title">系统信息</span></template>
          <el-descriptions :column="1" border>
            <el-descriptions-item label="系统名称">铧旗CRM系统</el-descriptions-item>
            <el-descriptions-item label="版本号">v{{ appVersion }}</el-descriptions-item>
            <el-descriptions-item label="前端框架">Vue 3 + Element Plus + Vite</el-descriptions-item>
            <el-descriptions-item label="后端框架">Node.js + Express {{ health.expressVersion || '4.x' }}</el-descriptions-item>
            <el-descriptions-item label="数据库">{{ health.mysqlVersion || 'MySQL' }}</el-descriptions-item>
            <el-descriptions-item label="运行模式">
              <el-tag size="small" :type="health.nodeEnv === 'production' ? 'danger' : 'success'">
                {{ health.nodeEnv === 'production' ? '生产模式' : '开发模式' }}
              </el-tag>
            </el-descriptions-item>
          </el-descriptions>
        </el-card>
      </el-col>

      <!-- 服务状态 -->
      <el-col :span="12">
        <el-card shadow="never">
          <template #header><span class="card-title">服务状态</span></template>
          <el-descriptions :column="1" border>
            <el-descriptions-item label="API 服务">
              <el-tag :type="health.api ? 'success' : 'danger'" size="small">
                {{ health.api ? '正常运行' : '异常' }}
              </el-tag>
            </el-descriptions-item>
            <el-descriptions-item label="数据库连接">
              <el-tag :type="health.db ? 'success' : 'danger'" size="small">
                {{ health.db ? '已连接' : '未连接' }}
              </el-tag>
            </el-descriptions-item>
            <el-descriptions-item label="Redis 缓存">
              <el-tag :type="health.redis ? 'success' : 'info'" size="small">
                {{ health.redis ? '已启用' : '未启用（可选）' }}
              </el-tag>
            </el-descriptions-item>
            <el-descriptions-item label="服务时间">
              {{ health.timestamp || '-' }}
            </el-descriptions-item>
          </el-descriptions>
        </el-card>
      </el-col>
    </el-row>

    <el-row :gutter="24" style="margin-top: 24px;">
      <!-- 统计概览 -->
      <el-col :span="8">
        <el-card shadow="never" v-loading="statsLoading">
          <template #header><span class="card-title">数据概览</span></template>
          <el-descriptions :column="1" border>
            <el-descriptions-item label="用户总数">{{ stats.userCount }}</el-descriptions-item>
            <el-descriptions-item label="客户总数">{{ stats.customerCount }}</el-descriptions-item>
            <el-descriptions-item label="活跃商机数">{{ stats.opportunityCount }}</el-descriptions-item>
            <el-descriptions-item label="合同总数">{{ stats.contractCount }}</el-descriptions-item>
            <el-descriptions-item label="服务工单数">{{ stats.serviceCount }}</el-descriptions-item>
          </el-descriptions>
        </el-card>
      </el-col>

      <!-- 业务设置 -->
      <el-col :span="8">
        <el-card shadow="never" v-loading="configLoading">
          <template #header>
            <div class="card-header-row">
              <span class="card-title">业务设置</span>
              <el-button v-if="isAdmin" type="primary" size="small" :loading="configSaving" @click="saveConfig">保存</el-button>
            </div>
          </template>
          <el-form label-width="140px">
            <el-form-item label="逾期跟进天数">
              <el-input-number v-model="overdueDays" :min="1" :max="90" :disabled="!isAdmin" />
              <div class="form-tip">客户超过该天数未跟进将触发逾期提醒</div>
            </el-form-item>
          </el-form>
        </el-card>
      </el-col>

      <!-- 关于 -->
      <el-col :span="8">
        <el-card shadow="never">
          <template #header><span class="card-title">关于</span></template>
          <div class="about-section">
            <p>铧旗CRM系统是一款面向中小企业的客户关系管理系统，支持客户管理、商机跟踪、报价、合同、售后服务等全流程管理。</p>
            <el-divider />
            <p><strong>功能模块：</strong></p>
            <el-tag class="module-tag" size="small">客户管理</el-tag>
            <el-tag class="module-tag" size="small" type="success">商机管理</el-tag>
            <el-tag class="module-tag" size="small" type="warning">产品管理</el-tag>
            <el-tag class="module-tag" size="small">报价管理</el-tag>
            <el-tag class="module-tag" size="small" type="success">合同管理</el-tag>
            <el-tag class="module-tag" size="small" type="warning">售后服务</el-tag>
            <el-tag class="module-tag" size="small" type="danger">数据报表</el-tag>
            <el-tag class="module-tag" size="small">团队看板</el-tag>
            <el-tag class="module-tag" size="small" type="success">智能提醒</el-tag>
          </div>
        </el-card>
      </el-col>
    </el-row>

    <!-- 消息通知 -->
    <el-row :gutter="24" style="margin-top: 24px;">
      <el-col :span="24">
        <el-card shadow="never">
          <template #header><span class="card-title">消息通知</span></template>
          <el-descriptions :column="2" border size="small">
            <el-descriptions-item label="企业微信通知">
              <el-tag type="success" size="small">已配置</el-tag>
            </el-descriptions-item>
            <el-descriptions-item label="通知类型">
              <span style="color: var(--color-text-secondary); font-size: 13px;">跟进提醒、回款逾期、商机提醒</span>
            </el-descriptions-item>
          </el-descriptions>
          <el-button type="primary" :loading="testLoading" style="margin-top: 16px" @click="handleTestNotification">
            发送测试消息
          </el-button>
        </el-card>
      </el-col>
    </el-row>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import request from '@/utils/request'
import { getConfigList, updateConfig, testNotification, getHealth } from '@/api/system'
import { getUserList } from '@/api/system'
import { getCustomerList } from '@/api/customer'
import { getOpportunityList } from '@/api/customer'
import { getContractList } from '@/api/contract'
import { getServiceList } from '@/api/system'
import { version as appVersion } from '../../../package.json'
import { useUser } from '@/composables/useUser'

const { userInfo } = useUser()

const health = reactive({ api: false, db: false, redis: false, timestamp: '', nodeEnv: '', expressVersion: '', mysqlVersion: '' })
const stats = reactive({ userCount: 0, customerCount: 0, opportunityCount: 0, contractCount: 0, serviceCount: 0 })
const statsLoading = ref(false)

// 业务配置
const isAdmin = computed(() => userInfo.value?.roleId === 1 || userInfo.value?.roleId === 2)
const configLoading = ref(false)
const configSaving = ref(false)
const overdueDays = ref(15)

const fetchConfig = async () => {
  if (!isAdmin.value) return
  configLoading.value = true
  try {
    const res = await getConfigList()
    if (res.code === 200) {
      const item = res.data.find(c => c.config_key === 'overdue_days')
      if (item) overdueDays.value = parseInt(item.config_value) || 15
    }
  } catch { /* ignore */ }
  finally { configLoading.value = false }
}

const saveConfig = async () => {
  configSaving.value = true
  try {
    const res = await updateConfig({
      configs: [{ config_key: 'overdue_days', config_value: String(overdueDays.value) }]
    })
    if (res.code === 200) ElMessage.success('配置保存成功')
  } catch { ElMessage.error('保存失败') }
  finally { configSaving.value = false }
}

const checkHealth = async () => {
  try {
    const res = await getHealth()
    if (res.code === 200) {
      health.api = res.data.status === 'ok'
      health.db = !!res.data.db
      health.redis = !!res.data.redis
      health.timestamp = res.data.timestamp
      if (res.data.nodeEnv) health.nodeEnv = res.data.nodeEnv
      if (res.data.expressVersion) health.expressVersion = res.data.expressVersion
      if (res.data.mysqlVersion) health.mysqlVersion = res.data.mysqlVersion
    }
  } catch (e) { health.api = false }
}

const fetchStats = async () => {
  statsLoading.value = true
  try {
    const [users, customers, opps, contracts, services] = await Promise.allSettled([
      getUserList({ page: 1, pageSize: 1 }),
      getCustomerList({ page: 1, pageSize: 1 }),
      getOpportunityList({ page: 1, pageSize: 1 }),
      getContractList({ page: 1, pageSize: 1 }),
      getServiceList({ page: 1, pageSize: 1 })
    ])

    stats.userCount = users.value?.data?.total || 0
    stats.customerCount = customers.value?.data?.total || 0
    stats.opportunityCount = opps.value?.data?.total || 0
    stats.contractCount = contracts.value?.data?.total || 0
    stats.serviceCount = services.value?.data?.total || 0
  } catch (e) { /* ignore */ }
  finally { statsLoading.value = false }
}

onMounted(() => {
  checkHealth()
  fetchStats()
  fetchConfig()
})

// 企业微信通知测试
const testLoading = ref(false)
const handleTestNotification = async () => {
  testLoading.value = true
  try {
    const res = await testNotification()
    if (res.code === 200) {
      ElMessage.success('测试消息已发送，请查看企业微信群')
    } else {
      ElMessage.error(res.message || '发送失败')
    }
  } catch (e) {
    ElMessage.error('发送失败')
  } finally {
    testLoading.value = false
  }
}
</script>

<style scoped>
.settings-page { padding: 0; }
.page-header { margin-bottom: var(--space-5); }
.page-header h2 { margin: 0 0 var(--space-1); font-size: 28px; font-weight: 600; color: var(--color-text); letter-spacing: -0.02em; }
.page-desc { margin: 0; font-size: 13px; color: var(--color-text-tertiary); }
.card-title { font-size: 15px; font-weight: 600; }
.card-header-row { display: flex; justify-content: space-between; align-items: center; }
.form-tip { font-size: 12px; color: var(--color-text-tertiary); margin-top: var(--space-1); }
.about-section p { margin: var(--space-2) 0; line-height: 1.8; color: var(--color-text-secondary); }
.module-tag { margin: 0 var(--space-1) var(--space-1) 0; }
</style>
