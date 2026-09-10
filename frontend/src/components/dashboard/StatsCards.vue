<template>
  <!-- 管理员/销售：经营概览 -->
  <el-row :gutter="24" v-if="isAdmin || isSales">
    <el-col :xs="24" :sm="12" :md="12" :lg="6">
      <el-card class="stat-card" @click="$emit('quick-action', 'sales')">
        <div class="stat-body">
          <div class="stat-icon">
            <el-icon :size="28"><TrendCharts /></el-icon>
          </div>
          <div class="stat-info">
            <div class="stat-value"><AnimatedNumber :value="overview.month_sales" prefix="¥" :decimals="2" /></div>
            <div class="stat-label">本月销售额</div>
          </div>
        </div>
      </el-card>
    </el-col>
    <el-col :xs="24" :sm="12" :md="12" :lg="6">
      <el-card class="stat-card" @click="$emit('quick-action', 'customer')">
        <div class="stat-body">
          <div class="stat-icon">
            <el-icon :size="28"><Plus /></el-icon>
          </div>
          <div class="stat-info">
            <div class="stat-value"><AnimatedNumber :value="overview.month_customers" /></div>
            <div class="stat-label">本月新增客户</div>
          </div>
        </div>
      </el-card>
    </el-col>
    <el-col :xs="24" :sm="12" :md="12" :lg="6">
      <el-card class="stat-card" @click="$emit('quick-action', 'contract')">
        <div class="stat-body">
          <div class="stat-icon">
            <el-icon :size="28"><Document /></el-icon>
          </div>
          <div class="stat-info">
            <div class="stat-value"><AnimatedNumber :value="overview.month_contracts" /></div>
            <div class="stat-label">本月合同数</div>
          </div>
        </div>
      </el-card>
    </el-col>
    <el-col :xs="24" :sm="12" :md="12" :lg="6">
      <el-card class="stat-card" @click="$emit('quick-action', 'payment')">
        <div class="stat-body">
          <div class="stat-icon">
            <el-icon :size="28"><ShoppingCart /></el-icon>
          </div>
          <div class="stat-info">
            <div class="stat-value"><AnimatedNumber :value="overview.month_payments" prefix="¥" :decimals="2" /></div>
            <div class="stat-label">本月回款</div>
          </div>
        </div>
      </el-card>
    </el-col>
  </el-row>

  <!-- 财务：回款概览 -->
  <el-row :gutter="24" v-else-if="isFinance">
    <el-col :xs="24" :sm="12" :md="12" :lg="6">
      <el-card class="stat-card">
        <div class="stat-body">
          <div class="stat-icon">
            <el-icon :size="28"><Money /></el-icon>
          </div>
          <div class="stat-info">
            <div class="stat-value"><AnimatedNumber :value="financeData.month_plan" prefix="¥" :decimals="2" /></div>
            <div class="stat-label">本月应回款</div>
          </div>
        </div>
      </el-card>
    </el-col>
    <el-col :xs="24" :sm="12" :md="12" :lg="6">
      <el-card class="stat-card">
        <div class="stat-body">
          <div class="stat-icon">
            <el-icon :size="28"><Money /></el-icon>
          </div>
          <div class="stat-info">
            <div class="stat-value"><AnimatedNumber :value="financeData.month_paid" prefix="¥" :decimals="2" /></div>
            <div class="stat-label">本月已回款</div>
          </div>
        </div>
      </el-card>
    </el-col>
    <el-col :xs="24" :sm="12" :md="12" :lg="6">
      <el-card class="stat-card">
        <div class="stat-body">
          <div class="stat-icon">
            <el-icon :size="28"><TrendCharts /></el-icon>
          </div>
          <div class="stat-info">
            <div class="stat-value"><AnimatedNumber :value="financeData.month_rate" suffix="%" /></div>
            <div class="stat-label">回款率</div>
          </div>
        </div>
      </el-card>
    </el-col>
    <el-col :xs="24" :sm="12" :md="12" :lg="6">
      <el-card class="stat-card">
        <div class="stat-body">
          <div class="stat-icon">
            <el-icon :size="28"><Warning /></el-icon>
          </div>
          <div class="stat-info">
            <div class="stat-value"><AnimatedNumber :value="financeData.overdue_amount" suffix="笔" /></div>
            <div class="stat-label">逾期回款</div>
          </div>
        </div>
      </el-card>
    </el-col>
  </el-row>

  <!-- 采购：采购概览 -->
  <el-row :gutter="24" v-else-if="isPurchase">
    <el-col :xs="24" :sm="12" :md="12" :lg="8">
      <el-card class="stat-card">
        <div class="stat-body">
          <div class="stat-icon">
            <el-icon :size="28"><Goods /></el-icon>
          </div>
          <div class="stat-info">
            <div class="stat-value"><AnimatedNumber :value="purchaseData.month_amount" prefix="¥" :decimals="2" /></div>
            <div class="stat-label">本月采购额</div>
          </div>
        </div>
      </el-card>
    </el-col>
    <el-col :xs="24" :sm="12" :md="12" :lg="8">
      <el-card class="stat-card">
        <div class="stat-body">
          <div class="stat-icon">
            <el-icon :size="28"><Document /></el-icon>
          </div>
          <div class="stat-info">
            <div class="stat-value"><AnimatedNumber :value="purchaseData.pending_approval" /></div>
            <div class="stat-label">待审批计划</div>
          </div>
        </div>
      </el-card>
    </el-col>
    <el-col :xs="24" :sm="12" :md="12" :lg="8">
      <el-card class="stat-card" @click="$router.push('/inventory')">
        <div class="stat-body">
          <div class="stat-icon">
            <el-icon :size="28"><Warning /></el-icon>
          </div>
          <div class="stat-info">
            <div class="stat-value"><AnimatedNumber :value="purchaseData.stock_alerts" /></div>
            <div class="stat-label">库存预警</div>
          </div>
        </div>
      </el-card>
    </el-col>
  </el-row>

  <!-- 售后：工单概览 -->
  <el-row :gutter="24" v-else-if="isService">
    <el-col :xs="24" :sm="12" :md="12" :lg="6">
      <el-card class="stat-card">
        <div class="stat-body">
          <div class="stat-icon">
            <el-icon :size="28"><Ticket /></el-icon>
          </div>
          <div class="stat-info">
            <div class="stat-value"><AnimatedNumber :value="serviceData.pending" /></div>
            <div class="stat-label">待处理工单</div>
          </div>
        </div>
      </el-card>
    </el-col>
    <el-col :xs="24" :sm="12" :md="12" :lg="6">
      <el-card class="stat-card">
        <div class="stat-body">
          <div class="stat-icon">
            <el-icon :size="28"><Clock /></el-icon>
          </div>
          <div class="stat-info">
            <div class="stat-value"><AnimatedNumber :value="serviceData.overtime" /></div>
            <div class="stat-label">超时工单</div>
          </div>
        </div>
      </el-card>
    </el-col>
    <el-col :xs="24" :sm="12" :md="12" :lg="6">
      <el-card class="stat-card">
        <div class="stat-body">
          <div class="stat-icon">
            <el-icon :size="28"><Plus /></el-icon>
          </div>
          <div class="stat-info">
            <div class="stat-value"><AnimatedNumber :value="serviceData.today_new" /></div>
            <div class="stat-label">今日新增</div>
          </div>
        </div>
      </el-card>
    </el-col>
    <el-col :xs="24" :sm="12" :md="12" :lg="6">
      <el-card class="stat-card">
        <div class="stat-body">
          <div class="stat-icon">
            <el-icon :size="28"><Trophy /></el-icon>
          </div>
          <div class="stat-info">
            <div class="stat-value"><AnimatedNumber :value="serviceData.satisfaction" suffix="%" /></div>
            <div class="stat-label">本月满意度</div>
          </div>
        </div>
      </el-card>
    </el-col>
  </el-row>

  <!-- 管理员/销售：商机/回款/逾期/合同 -->
  <el-row :gutter="24" style="margin-top: 16px" v-if="isAdmin || isSales">
    <el-col :xs="24" :sm="12" :md="12" :lg="6">
      <el-card class="stat-card mini" @click="$router.push('/opportunity')">
        <div class="stat-body">
          <div class="stat-icon small">
            <el-icon :size="20"><DocumentChecked /></el-icon>
          </div>
          <div class="stat-info">
            <div class="stat-value small"><AnimatedNumber :value="overview.opportunity_amount" prefix="¥" :decimals="2" /></div>
            <div class="stat-label">进行中商机</div>
          </div>
        </div>
      </el-card>
    </el-col>
    <el-col :xs="24" :sm="12" :md="12" :lg="6">
      <el-card class="stat-card mini" @click="$router.push('/payment')">
        <div class="stat-body">
          <div class="stat-icon small">
            <el-icon :size="20"><Service /></el-icon>
          </div>
          <div class="stat-info">
            <div class="stat-value small text-danger"><AnimatedNumber :value="quickStats.pending_payment" /></div>
            <div class="stat-label">待回款计划</div>
          </div>
        </div>
      </el-card>
    </el-col>
    <el-col :xs="24" :sm="12" :md="12" :lg="6">
      <el-card class="stat-card mini" @click="$router.push({ path: '/customer/list', query: { overdue: 'true' } })">
        <div class="stat-body">
          <div class="stat-icon small">
            <el-icon :size="20"><Clock /></el-icon>
          </div>
          <div class="stat-info">
            <div class="stat-value small text-danger"><AnimatedNumber :value="overdueCount" /></div>
            <div class="stat-label">逾期跟进 (>{{ overdueDays }}天)</div>
          </div>
        </div>
      </el-card>
    </el-col>
    <el-col :xs="24" :sm="12" :md="12" :lg="6">
      <el-card class="stat-card mini" @click="$router.push('/contract')">
        <div class="stat-body">
          <div class="stat-icon small">
            <el-icon :size="20"><Document /></el-icon>
          </div>
          <div class="stat-info">
            <div class="stat-value small"><AnimatedNumber :value="quickStats.pending_contract" /></div>
            <div class="stat-label">待执行合同</div>
          </div>
        </div>
      </el-card>
    </el-col>
  </el-row>

  <!-- 跟进提醒统计（管理员/销售） -->
  <el-row :gutter="24" style="margin-top: 16px" v-if="isAdmin || isSales">
    <el-col :xs="24" :sm="12" :md="12" :lg="8">
      <el-card class="stat-card mini" @click="$emit('go-tasks', 'today')">
        <div class="stat-body">
          <div class="stat-icon small">
            <el-icon :size="20"><Bell /></el-icon>
          </div>
          <div class="stat-info">
            <div class="stat-value small text-warning"><AnimatedNumber :value="followStats.today_follow" /></div>
            <div class="stat-label">今日待跟进</div>
          </div>
        </div>
      </el-card>
    </el-col>
    <el-col :xs="24" :sm="12" :md="12" :lg="8">
      <el-card class="stat-card mini" @click="$router.push({ path: '/customer/list', query: { overdue: 'true' } })">
        <div class="stat-body">
          <div class="stat-icon small">
            <el-icon :size="20"><Warning /></el-icon>
          </div>
          <div class="stat-info">
            <div class="stat-value small text-danger"><AnimatedNumber :value="followStats.overdue" /></div>
            <div class="stat-label">逾期客户</div>
          </div>
        </div>
      </el-card>
    </el-col>
    <el-col :xs="24" :sm="12" :md="12" :lg="8">
      <el-card class="stat-card mini" @click="$router.push({ path: '/customer/list', query: { near_recycle: 'true' } })">
        <div class="stat-body">
          <div class="stat-icon small">
            <el-icon :size="20"><Clock /></el-icon>
          </div>
          <div class="stat-info">
            <div class="stat-value small text-warning"><AnimatedNumber :value="followStats.near_recycle" /></div>
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
import AnimatedNumber from '@/components/common/AnimatedNumber.vue'

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
