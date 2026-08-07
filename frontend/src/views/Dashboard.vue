<template>
  <div class="dashboard">
    <SalesDashboard v-if="dashboardType === 'sales'" />
    <PurchaseDashboard v-else-if="dashboardType === 'purchase'" />
    <ManagerDashboard v-else />
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { useUser } from '@/composables/useUser'
import SalesDashboard from '@/components/dashboard/SalesDashboard.vue'
import PurchaseDashboard from '@/components/dashboard/PurchaseDashboard.vue'
import ManagerDashboard from '@/components/dashboard/ManagerDashboard.vue'

const { userInfo } = useUser()

const dashboardType = computed(() => {
  const rc = userInfo.value?.roleCode || ''
  if (['super_admin', 'admin', 'boss'].includes(rc)) return 'manager'
  if (['purchase', 'hr', 'finance', 'engineer'].includes(rc)) return 'purchase'
  return 'sales'
})
</script>

<style scoped>
.dashboard { padding: 0; }
</style>
