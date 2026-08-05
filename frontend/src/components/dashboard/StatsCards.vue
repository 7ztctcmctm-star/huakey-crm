<template>
  <!-- 管理员/销售：经营概览 -->
  <el-row :gutter="24" v-if="isAdmin || isSales">
    <el-col :span="6">
      <el-card shadow="hover" class="stat-card" @click="$emit('quick-action', 'sales')">
        <div class="stat-body">
          <div class="stat-icon" style="background: #eff6ff; color: #1a56db">
            <el-icon :size="28"><TrendCharts /></el-icon>
          </div>
          <div class="stat-info">
            <div class="stat-value">¥{{ formatAmount(overview.month_sales) }}</div>
            <div class="stat-label">本月销售额</div>
          </div>
        </div>
      </el-card>
    </el-col>
    <el-col :span="6">
      <el-card shadow="hover" class="stat-card" @click="$emit('quick-action', 'customer')">
        <div class="stat-body">
          <div class="stat-icon" style="background: #eff6ff; color: #1a56db">
            <el-icon :size="28"><Plus /></el-icon>
          </div>
          <div class="stat-info">
            <div class="stat-value">{{ overview.month_customers }}</div>
            <div class="stat-label">本月新增客户</div>
          </div>
        </div>
      </el-card>
    </el-col>
    <el-col :span="6">
      <el-card shadow="hover" class="stat-card" @click="$emit('quick-action', 'contract')">
        <div class="stat-body">
          <div class="stat-icon" style="background: #eff6ff; color: #1a56db">
            <el-icon :size="28"><Document /></el-icon>
          </div>
          <div class="stat-info">
            <div class="stat-value">{{ overview.month_contracts }}</div>
            <div class="stat-label">本月合同数</div>
          </div>
        </div>
      </el-card>
    </el-col>
    <el-col :span="6">
      <el-card shadow="hover" class="stat-card" @click="$emit('quick-action', 'payment')">
        <div class="stat-body">
          <div class="stat-icon" style="background: #fef2f2; color: #dc2626">
            <el-icon :size="28"><ShoppingCart /></el-icon>
          </div>
          <div class="stat-info">
            <div class="stat-value">¥{{ formatAmount(overview.month_payments) }}</div>
            <div class="stat-label">本月回款</div>
          </div>
        </div>
      </el-card>
    </el-col>
  </el-row>

  <!-- 财务：回款概览 -->
  <el-row :gutter="24" v-else-if="isFinance">
    <el-col :span="6">
      <el-card shadow="hover" class="stat-card">
        <div class="stat-body">
          <div class="stat-icon" style="background: #eff6ff; color: #0071e3">
            <el-icon :size="28"><Money /></el-icon>
          </div>
          <div class="stat-info">
            <div class="stat-value">¥{{ formatAmount(financeData.month_plan) }}</div>
            <div class="stat-label">本月应回款</div>
          </div>
        </div>
      </el-card>
    </el-col>
    <el-col :span="6">
      <el-card shadow="hover" class="stat-card">
        <div class="stat-body">
          <div class="stat-icon" style="background: #f0fdf4; color: #16a34a">
            <el-icon :size="28"><Money /></el-icon>
          </div>
          <div class="stat-info">
            <div class="stat-value">¥{{ formatAmount(financeData.month_paid) }}</div>
            <div class="stat-label">本月已回款</div>
          </div>
        </div>
      </el-card>
    </el-col>
    <el-col :span="6">
      <el-card shadow="hover" class="stat-card">
        <div class="stat-body">
          <div class="stat-icon" style="background: #fef3c7; color: #d97706">
            <el-icon :size="28"><TrendCharts /></el-icon>
          </div>
          <div class="stat-info">
            <div class="stat-value">{{ financeData.month_rate }}%</div>
            <div class="stat-label">回款率</div>
          </div>
        </div>
      </el-card>
    </el-col>
    <el-col :span="6">
      <el-card shadow="hover" class="stat-card">
        <div class="stat-body">
          <div class="stat-icon" style="background: #fef2f2; color: #dc2626">
            <el-icon :size="28"><Warning /></el-icon>
          </div>
          <div class="stat-info">
            <div class="stat-value">{{ financeData.overdue_amount }}笔</div>
            <div class="stat-label">逾期回款</div>
          </div>
        </div>
      </el-card>
    </el-col>
  </el-row>

  <!-- 采购：采购概览 -->
  <el-row :gutter="24" v-else-if="isPurchase">
    <el-col :span="8">
      <el-card shadow="hover" class="stat-card">
        <div class="stat-body">
          <div class="stat-icon" style="background: #eff6ff; color: #0071e3">
            <el-icon :size="28"><Goods /></el-icon>
          </div>
          <div class="stat-info">
            <div class="stat-value">¥{{ formatAmount(purchaseData.month_amount) }}</div>
            <div class="stat-label">本月采购额</div>
          </div>
        </div>
      </el-card>
    </el-col>
    <el-col :span="8">
      <el-card shadow="hover" class="stat-card">
        <div class="stat-body">
          <div class="stat-icon" style="background: #fef3c7; color: #d97706">
            <el-icon :size="28"><Document /></el-icon>
          </div>
          <div class="stat-info">
            <div class="stat-value">{{ purchaseData.pending_approval }}</div>
            <div class="stat-label">待审批计划</div>
          </div>
        </div>
      </el-card>
    </el-col>
    <el-col :span="8">
      <el-card shadow="hover" class="stat-card" @click="$router.push('/inventory')">
        <div class="stat-body">
          <div class="stat-icon" style="background: #fef2f2; color: #dc2626">
            <el-icon :size="28"><Warning /></el-icon>
          </div>
          <div class="stat-info">
            <div class="stat-value">{{ purchaseData.stock_alerts }}</div>
            <div class="stat-label">库存预警</div>
          </div>
        </div>
      </el-card>
    </el-col>
  </el-row>

  <!-- 售后：工单概览 -->
  <el-row :gutter="24" v-else-if="isService">
    <el-col :span="6">
      <el-card shadow="hover" class="stat-card">
        <div class="stat-body">
          <div class="stat-icon" style="background: #eff6ff; color: #0071e3">
            <el-icon :size="28"><Ticket /></el-icon>
          </div>
          <div class="stat-info">
            <div class="stat-value">{{ serviceData.pending }}</div>
            <div class="stat-label">待处理工单</div>
          </div>
        </div>
      </el-card>
    </el-col>
    <el-col :span="6">
      <el-card shadow="hover" class="stat-card">
        <div class="stat-body">
          <div class="stat-icon" style="background: #fef2f2; color: #dc2626">
            <el-icon :size="28"><Clock /></el-icon>
          </div>
          <div class="stat-info">
            <div class="stat-value">{{ serviceData.overtime }}</div>
            <div class="stat-label">超时工单</div>
          </div>
        </div>
      </el-card>
    </el-col>
    <el-col :span="6">
      <el-card shadow="hover" class="stat-card">
        <div class="stat-body">
          <div class="stat-icon" style="background: #f0fdf4; color: #16a34a">
            <el-icon :size="28"><Plus /></el-icon>
          </div>
          <div class="stat-info">
            <div class="stat-value">{{ serviceData.today_new }}</div>
            <div class="stat-label">今日新增</div>
          </div>
        </div>
      </el-card>
    </el-col>
    <el-col :span="6">
      <el-card shadow="hover" class="stat-card">
        <div class="stat-body">
          <div class="stat-icon" style="background: #fef3c7; color: #d97706">
            <el-icon :size="28"><Trophy /></el-icon>
          </div>
          <div class="stat-info">
            <div class="stat-value">{{ serviceData.satisfaction }}%</div>
            <div class="stat-label">本月满意度</div>
          </div>
        </div>
      </el-card>
    </el-col>
  </el-row>

  <!-- 管理员/销售：商机/回款/逾期/合同 -->
  <el-row :gutter="24" style="margin-top: 16px" v-if="isAdmin || isSales">
    <el-col :span="6">
      <el-card shadow="hover" class="stat-card mini" @click="$router.push('/opportunity')">
        <div class="stat-body">
          <div class="stat-icon small" style="background: #eff6ff; color: #1a56db">
            <el-icon :size="20"><DocumentChecked /></el-icon>
          </div>
          <div class="stat-info">
            <div class="stat-value small">¥{{ formatAmount(overview.opportunity_amount) }}</div>
            <div class="stat-label">进行中商机</div>
          </div>
        </div>
      </el-card>
    </el-col>
    <el-col :span="6">
      <el-card shadow="hover" class="stat-card mini" @click="$router.push('/payment')">
        <div class="stat-body">
          <div class="stat-icon small" style="background: #fef2f2; color: #dc2626">
            <el-icon :size="20"><Service /></el-icon>
          </div>
          <div class="stat-info">
            <div class="stat-value small danger">{{ quickStats.pending_payment }}</div>
            <div class="stat-label">待回款计划</div>
          </div>
        </div>
      </el-card>
    </el-col>
    <el-col :span="6">
      <el-card shadow="hover" class="stat-card mini" @click="$router.push({ path: '/customer/list', query: { overdue: 'true' } })">
        <div class="stat-body">
          <div class="stat-icon small" :style="{ background: overdueCount > 0 ? 'var(--color-accent-bg)' : '#f0f9eb', color: overdueCount > 0 ? 'var(--color-accent)' : 'var(--color-accent)' }">
            <el-icon :size="20"><Clock /></el-icon>
          </div>
          <div class="stat-info">
            <div class="stat-value small danger">{{ overdueCount }}</div>
            <div class="stat-label">逾期跟进 (>{{ overdueDays }}天)</div>
          </div>
        </div>
      </el-card>
    </el-col>
    <el-col :span="6">
      <el-card shadow="hover" class="stat-card mini" @click="$router.push('/contract')">
        <div class="stat-body">
          <div class="stat-icon small" style="background: #eff6ff; color: #1a56db">
            <el-icon :size="20"><Document /></el-icon>
          </div>
          <div class="stat-info">
            <div class="stat-value small">{{ quickStats.pending_contract }}</div>
            <div class="stat-label">待执行合同</div>
          </div>
        </div>
      </el-card>
    </el-col>
  </el-row>

  <!-- 跟进提醒统计（管理员/销售） -->
  <el-row :gutter="24" style="margin-top: 16px" v-if="isAdmin || isSales">
    <el-col :span="8">
      <el-card shadow="hover" class="stat-card mini" @click="$emit('go-tasks', 'today')">
        <div class="stat-body">
          <div class="stat-icon small" style="background: #fef3c7; color: #d97706">
            <el-icon :size="20"><Bell /></el-icon>
          </div>
          <div class="stat-info">
            <div class="stat-value small orange">{{ followStats.today_follow }}</div>
            <div class="stat-label">今日待跟进</div>
          </div>
        </div>
      </el-card>
    </el-col>
    <el-col :span="8">
      <el-card shadow="hover" class="stat-card mini" @click="$router.push({ path: '/customer/list', query: { overdue: 'true' } })">
        <div class="stat-body">
          <div class="stat-icon small" style="background: #fef2f2; color: #dc2626">
            <el-icon :size="20"><Warning /></el-icon>
          </div>
          <div class="stat-info">
            <div class="stat-value small danger">{{ followStats.overdue }}</div>
            <div class="stat-label">逾期客户</div>
          </div>
        </div>
      </el-card>
    </el-col>
    <el-col :span="8">
      <el-card shadow="hover" class="stat-card mini" @click="$router.push({ path: '/customer/list', query: { near_recycle: 'true' } })">
        <div class="stat-body">
          <div class="stat-icon small" style="background: #fff7ed; color: #ea580c">
            <el-icon :size="20"><Clock /></el-icon>
          </div>
          <div class="stat-info">
            <div class="stat-value small" style="color: #ea580c">{{ followStats.near_recycle }}</div>
            <div class="stat-label">即将回收</div>
          </div>
        </div>
      </el-card>
    </el-col>
  </el-row>
</template>

<script setup>
import {
  TrendCharts, Plus, Document, ShoppingCart, DocumentChecked, Service,
  Bell, Clock, Warning, Money, Goods, Ticket, Trophy, Calendar
} from '@element-plus/icons-vue'
import { formatAmount } from '@/composables/useFormat'

defineProps({
  overview: { type: Object, required: true },
  financeData: { type: Object, required: true },
  purchaseData: { type: Object, required: true },
  serviceData: { type: Object, required: true },
  quickStats: { type: Object, required: true },
  taskStats: { type: Object, required: true },
  followStats: { type: Object, default: () => ({ today_follow: 0, overdue: 0, near_recycle: 0 }) },
  overdueCount: { type: Number, default: 0 },
  overdueDays: { type: Number, default: 15 },
  isAdmin: { type: Boolean, default: false },
  isSales: { type: Boolean, default: false },
  isFinance: { type: Boolean, default: false },
  isPurchase: { type: Boolean, default: false },
  isService: { type: Boolean, default: false }
})

defineEmits(['quick-action', 'go-tasks'])
</script>
