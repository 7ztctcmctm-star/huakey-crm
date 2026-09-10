<template>
  <el-container class="layout-container">
    <!-- 左侧边栏：移动端转为抽屉式覆盖层，折叠态强制展开以便完整显示菜单 -->
    <Sidebar
      :is-collapse="isMobile ? false : isCollapse"
      :is-mobile="isMobile"
      :mobile-open="mobileMenuOpen"
      :user-info="userInfo"
    />
    <div
      v-if="isMobile && mobileMenuOpen"
      class="sidebar-backdrop"
      @click="mobileMenuOpen = false"
    />

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
            <transition name="fade-slide" mode="out-in">
              <component :is="Component" />
            </transition>
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
import { ref, watch, onMounted, onUnmounted } from 'vue'
import { reportWarn } from '@/utils/error'
import { useRouter, useRoute } from 'vue-router'
import { getMyReminders, getPaymentOverdue, markAllRead, markNotificationRead } from '@/api/tools'
import { useUser } from '@/composables/useUser'
import AiChat from '@/components/AiChat.vue'
import RecycleBin from '@/components/RecycleBin.vue'
import Sidebar from '@/components/layout/Sidebar.vue'
import HeaderBar from '@/components/layout/HeaderBar.vue'

const router = useRouter()
const route = useRoute()
const { userInfo } = useUser()

// 菜单折叠状态（桌面端）
const isCollapse = ref(false)

// ===== 移动端适配 =====
// 断点须与 apple.css 的 @media (max-width: 768px) 保持一致
const MOBILE_QUERY = '(max-width: 768px)'
const isMobile = ref(false)
const mobileMenuOpen = ref(false)

const syncIsMobile = (matches) => {
  isMobile.value = matches
  // 切回桌面端时收起抽屉，避免残留覆盖层挡住内容
  if (!matches) mobileMenuOpen.value = false
}

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
  // P1-11：原为空 catch。此为「阅读后跳转」的附带动作，
  // 失败不应打断跳转流程，故只记日志、不弹提示。
  try {
    await markNotificationRead(row.id)
  } catch (error) {
    reportWarn('标记通知已读失败:', error)
  }
  if (row.business_type === 'quote') {
    router.push(`/quotation?id=${row.business_id}`)
  } else if (row.business_type === 'contract') {
    router.push(`/contract/detail/${row.business_id}`)
  }
}

const goToUrgeCustomer = async (row) => {
  showReminderDialog.value = false
  // P1-11：原为空 catch。此为「阅读后跳转」的附带动作，
  // 失败不应打断跳转流程，故只记日志、不弹提示。
  try {
    await markNotificationRead(row.id)
  } catch (error) {
    reportWarn('标记通知已读失败:', error)
  }
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
  // P1-11：原为空 catch。此为「阅读后跳转」的附带动作，
  // 失败不应打断跳转流程，故只记日志、不弹提示。
  try {
    await markNotificationRead(row.id)
  } catch (error) {
    reportWarn('标记通知已读失败:', error)
  }
  router.push(`/service?id=${row.business_id}`)
}

fetchReminders()
fetchPaymentOverdue()
const reminderTimer = setInterval(fetchReminders, 2 * 60 * 1000)

let mobileMediaQuery = null
const onMediaChange = (e) => syncIsMobile(e.matches)

onMounted(() => {
  // 监听移动端断点（保留 addListener 回退，兼容旧版 Safari）
  mobileMediaQuery = window.matchMedia(MOBILE_QUERY)
  syncIsMobile(mobileMediaQuery.matches)
  if (mobileMediaQuery.addEventListener) {
    mobileMediaQuery.addEventListener('change', onMediaChange)
  } else {
    mobileMediaQuery.addListener(onMediaChange)
  }
})

onUnmounted(() => {
  clearInterval(reminderTimer)
  if (!mobileMediaQuery) return
  if (mobileMediaQuery.removeEventListener) {
    mobileMediaQuery.removeEventListener('change', onMediaChange)
  } else {
    mobileMediaQuery.removeListener(onMediaChange)
  }
})

// 移动端点击菜单跳转后自动收起抽屉
watch(() => route.fullPath, () => {
  if (mobileMenuOpen.value) mobileMenuOpen.value = false
})

const toggleCollapse = () => {
  // 移动端顶栏按钮切换的是抽屉，而非折叠
  if (isMobile.value) {
    mobileMenuOpen.value = !mobileMenuOpen.value
    return
  }
  isCollapse.value = !isCollapse.value
}
</script>

<style scoped>
.layout-container {
  height: 100vh;
}

/* 移动端抽屉遮罩，层级低于侧边栏（2001） */
.sidebar-backdrop {
  position: fixed;
  inset: 0;
  z-index: 2000;
  background: var(--overlay-backdrop);
}

.main-content {
  background: var(--color-bg-secondary);
  padding: 24px;
  overflow-y: auto;
}
</style>
