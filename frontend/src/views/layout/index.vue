<template>
  <el-container class="layout-container">
    <!-- 左侧边栏 -->
    <Sidebar :is-collapse="isCollapse" :user-info="userInfo" />

    <el-container direction="vertical">
      <!-- 顶部栏 -->
      <HeaderBar
        :is-collapse="isCollapse"
        :user-info="userInfo"
        v-model:show-reminder-dialog="showReminderDialog"
        v-model:reminder-tab="reminderTab"
        :reminder-list="reminderList"
        :today-list="todayList"
        :upcoming-list="upcomingList"
        :pre-warning-list="preWarningList"
        :pending-approvals="pendingApprovals"
        :payment-overdue-list="paymentOverdueList"
        :payment-upcoming-list="paymentUpcomingList"
        :urge-notifications="urgeNotifications"
        :overdue-services="overdueServices"
        :new-service-notifications="newServiceNotifications"
        :reminder-loading="reminderLoading"
        :payment-overdue-loading="paymentOverdueLoading"
        :overdue-days-config="overdueDaysConfig"
        @toggle-collapse="toggleCollapse"
        @open-recycle-bin="showRecycleBin = true"
        @mark-all-read="markAllRemindersRead"
        @go-to-customer="goToCustomer"
        @go-to-contract="goToContract"
        @go-to-approval="goToApproval"
        @go-to-urge-customer="goToUrgeCustomer"
        @go-to-service="goToService"
        @go-to-new-service="goToNewService"
      />

      <!-- 中间内容区 -->
      <el-main class="main-content">
        <router-view v-slot="{ Component }">
          <keep-alive :include="['Dashboard', 'CustomerList', 'TeamDashboard']">
            <component :is="Component" />
          </keep-alive>
        </router-view>
      </el-main>
    </el-container>

    <!-- AI 助手 -->
    <AiChat />

    <!-- 回收站 -->
    <RecycleBin v-model="showRecycleBin" />
  </el-container>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { getMyReminders, getPaymentOverdue, markAllRead, markNotificationRead } from '@/api/tools'
import { useUser } from '@/composables/useUser'
import AiChat from '@/components/AiChat.vue'
import RecycleBin from '@/components/RecycleBin.vue'
import Sidebar from '@/components/layout/Sidebar.vue'
import HeaderBar from '@/components/layout/HeaderBar.vue'

const router = useRouter()
const { userInfo } = useUser()

// 菜单折叠状态
const isCollapse = ref(false)

const showReminderDialog = ref(false)
const showRecycleBin = ref(false)
const reminderTab = ref('follow')
const reminderList = ref([])
const todayList = ref([])
const upcomingList = ref([])
const unreadReminderCount = ref(0)
const urgeUnreadCount = ref(0)
const reminderLoading = ref(false)
const preWarningList = ref([])
const pendingApprovals = ref([])
const overdueDaysConfig = ref(15)
const paymentOverdueList = ref([])
const paymentUpcomingList = ref([])
const paymentOverdueLoading = ref(false)
const urgeNotifications = ref([])
const overdueServices = ref([])
const newServiceNotifications = ref([])

// 浏览器通知
const prevTotalUnread = ref(0)
const requestNotifyPermission = () => {
  if ('Notification' in window && Notification.permission === 'default') {
    Notification.requestPermission()
  }
}
const showBrowserNotify = (count) => {
  if (!('Notification' in window) || Notification.permission !== 'granted') return
  const n = new Notification('铧旗CRM提醒', {
    body: `您有${count}条新提醒待处理`,
    icon: '/logo.png',
    tag: 'crm-reminder'
  })
  n.onclick = () => {
    window.focus()
    showReminderDialog.value = true
    n.close()
  }
}
requestNotifyPermission()

const fetchReminders = async () => {
  try {
    const res = await getMyReminders()
    if (res.code === 200) {
      reminderList.value = res.data.list || []
      todayList.value = res.data.today_list || []
      upcomingList.value = res.data.upcoming_list || []
      unreadReminderCount.value = res.data.unread_count || 0
      preWarningList.value = res.data.pre_warning_list || []
      pendingApprovals.value = res.data.pending_approvals || []
      urgeNotifications.value = res.data.urge_notifications || []
      urgeUnreadCount.value = res.data.urge_unread_count || 0
      newServiceNotifications.value = res.data.new_services || []
      overdueServices.value = res.data.overdue_services || []
      if (res.data.overdue_days) overdueDaysConfig.value = res.data.overdue_days

      const newTotal = (res.data.unread_count || 0) + (res.data.urge_unread_count || 0)
      if (prevTotalUnread.value > 0 && newTotal > prevTotalUnread.value) {
        showBrowserNotify(newTotal)
      }
      prevTotalUnread.value = newTotal
    }
  } catch (e) { /* ignore */ }
}

const fetchPaymentOverdue = async () => {
  paymentOverdueLoading.value = true
  try {
    const res = await getPaymentOverdue()
    if (res.code === 200) {
      paymentOverdueList.value = res.data.list || []
      paymentUpcomingList.value = res.data.upcoming || []
    }
  } catch (e) { /* ignore */ }
  finally { paymentOverdueLoading.value = false }
}

const markAllRemindersRead = async () => {
  try {
    await markAllRead()
    unreadReminderCount.value = 0
    urgeUnreadCount.value = 0
  } catch (e) { /* ignore */ }
}

const goToCustomer = (id) => {
  showReminderDialog.value = false
  router.push(`/customer/detail/${id}`)
}

const goToContract = (id) => {
  showReminderDialog.value = false
  router.push(`/contract/detail/${id}`)
}

const goToApproval = async (row) => {
  showReminderDialog.value = false
  try { await markNotificationRead(row.id) } catch {}
  if (row.business_type === 'quote') {
    router.push(`/quotation?id=${row.business_id}`)
  } else if (row.business_type === 'contract') {
    router.push(`/contract/detail/${row.business_id}`)
  }
}

const goToUrgeCustomer = async (row) => {
  showReminderDialog.value = false
  try { await markNotificationRead(row.id) } catch {}
  if (row.business_type === 'customer' && row.business_id) {
    router.push(`/customer/detail/${row.business_id}`)
  }
}

const goToService = (row) => {
  showReminderDialog.value = false
  router.push(`/service?id=${row.id}`)
}

const goToNewService = async (row) => {
  showReminderDialog.value = false
  try { await markNotificationRead(row.id) } catch {}
  router.push(`/service?id=${row.business_id}`)
}

fetchReminders()
fetchPaymentOverdue()
const reminderTimer = setInterval(fetchReminders, 2 * 60 * 1000)

onMounted(() => {})
onUnmounted(() => {
  clearInterval(reminderTimer)
})

const toggleCollapse = () => {
  isCollapse.value = !isCollapse.value
}
</script>

<style scoped>
.layout-container {
  height: 100vh;
}

.main-content {
  background: var(--color-bg-secondary);
  padding: 24px;
  overflow-y: auto;
}
</style>
