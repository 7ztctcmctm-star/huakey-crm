<template>
  <el-row :gutter="24" style="margin-top: 24px">
    <el-col :span="12">
      <el-card shadow="never">
        <template #header>
          <div class="section-header">
            <span class="section-title">
              <el-icon><Setting /></el-icon> 快捷操作
            </span>
          </div>
        </template>
        <div class="quick-actions">
          <div class="action-item" @click="$emit('quick-action', 'add_customer')">
            <div class="action-icon" style="background: #eff6ff; color: #1a56db">
              <el-icon :size="24"><Plus /></el-icon>
            </div>
            <span>新建客户</span>
          </div>
          <div class="action-item" @click="$emit('quick-action', 'add_follow')">
            <div class="action-icon" style="background: #eff6ff; color: #1a56db">
              <el-icon :size="24"><ArrowDown /></el-icon>
            </div>
            <span>添加跟进</span>
          </div>
          <div class="action-item" @click="$emit('quick-action', 'add_opportunity')">
            <div class="action-icon" style="background: #eff6ff; color: #1a56db">
              <el-icon :size="24"><Star /></el-icon>
            </div>
            <span>新建商机</span>
          </div>
          <div class="action-item" @click="$emit('quick-action', 'add_contract')">
            <div class="action-icon" style="background: #eff6ff; color: #dc2626">
              <el-icon :size="24"><Document /></el-icon>
            </div>
            <span>新建合同</span>
          </div>
          <div class="action-item" @click="$emit('quick-action', 'add_service')">
            <div class="action-icon" style="background: #eff6ff; color: #1a56db">
              <el-icon :size="24"><Service /></el-icon>
            </div>
            <span>创建工单</span>
          </div>
          <div class="action-item" @click="$emit('quick-action', 'report')">
            <div class="action-icon" style="background: #eff6ff; color: #1a56db">
              <el-icon :size="24"><Histogram /></el-icon>
            </div>
            <span>数据报表</span>
          </div>
          <div class="action-item" @click="$emit('quick-action', 'batch_follow')">
            <div class="action-icon" style="background: #f0fdf4; color: #16a34a">
              <el-icon :size="24"><List /></el-icon>
            </div>
            <span>批量跟进</span>
          </div>
        </div>
      </el-card>
    </el-col>

    <el-col :span="12">
      <el-card shadow="never">
        <template #header>
          <div class="section-header">
            <span class="section-title">
              <el-icon><TrendCharts /></el-icon> 销售趋势
            </span>
          </div>
        </template>
        <div ref="trendChartRef" class="chart-container"></div>
      </el-card>
    </el-col>
  </el-row>

  <el-row :gutter="24" style="margin-top: 24px">
    <el-col :span="14">
      <el-card shadow="never">
        <template #header>
          <div class="section-header">
            <span class="section-title">
              <el-icon><TrendCharts /></el-icon> 销售趋势
            </span>
          </div>
        </template>
        <div ref="trendChartRef2" class="chart-container"></div>
      </el-card>
    </el-col>
    <el-col :span="10">
      <el-card shadow="never">
        <template #header>
          <div class="section-header">
            <span class="section-title">
              <el-icon><PieChart /></el-icon> 客户来源分布
            </span>
          </div>
        </template>
        <div ref="sourceChartRef" class="chart-container"></div>
      </el-card>
    </el-col>
  </el-row>

  <el-row :gutter="24" style="margin-top: 24px">
    <el-col :span="14">
      <el-card shadow="never">
        <template #header>
          <div class="section-header">
            <span class="section-title">
              <el-icon><Search /></el-icon> 销售漏斗
            </span>
          </div>
        </template>
        <div ref="funnelChartRef" class="chart-container"></div>
      </el-card>
    </el-col>
    <el-col :span="10">
      <el-card shadow="never">
        <template #header>
          <div class="section-header">
            <span class="section-title">
              <el-icon><Trophy /></el-icon> 销售业绩排行
            </span>
          </div>
        </template>
        <div v-if="rankLoading" v-loading="rankLoading" style="min-height: 260px" />
        <el-table v-else :data="performanceRank" stripe size="small">
          <el-table-column type="index" label="排名" width="60" align="center" />
          <el-table-column prop="name" label="销售" min-width="80" />
          <el-table-column prop="contract_amount" label="成交金额" width="100" align="right">
            <template #default="{ row }">
              <span class="amount-text">¥{{ formatAmount(row.contract_amount) }}</span>
            </template>
          </el-table-column>
          <el-table-column prop="payment_amount" label="回款金额" width="100" align="right">
            <template #default="{ row }">
              <span class="amount-text">¥{{ formatAmount(row.payment_amount) }}</span>
            </template>
          </el-table-column>
        </el-table>
      </el-card>
    </el-col>
  </el-row>
</template>

<script setup>
import {
  TrendCharts, Plus, Document, Service, ArrowDown, Star,
  Histogram, List, PieChart, Search, Trophy, Setting
} from '@element-plus/icons-vue'
import { formatAmount } from '@/composables/useFormat'

defineProps({
  performanceRank: { type: Array, default: () => [] },
  rankLoading: { type: Boolean, default: false }
})

defineEmits(['quick-action'])

// 暴露图表ref给父组件
import { ref } from 'vue'
const trendChartRef = ref(null)
const trendChartRef2 = ref(null)
const sourceChartRef = ref(null)
const funnelChartRef = ref(null)

defineExpose({ trendChartRef, trendChartRef2, sourceChartRef, funnelChartRef })
</script>

<style scoped>
.section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.section-title {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  font-size: 17px;
  font-weight: 600;
  color: var(--color-text);
  letter-spacing: -0.02em;
}

.chart-container {
  height: 260px;
}

.quick-actions {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: var(--space-4);
}

.action-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-5) var(--space-3);
  border-radius: var(--radius-lg);
  cursor: pointer;
  transition: background 0.2s var(--ease-out);
}

.action-item:hover {
  background: var(--color-bg-secondary);
}

.action-icon {
  width: 48px;
  height: 48px;
  border-radius: var(--radius-md);
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--color-bg-secondary);
  color: var(--color-text-secondary);
}

.action-item span {
  font-size: 13px;
  color: var(--color-text-secondary);
  font-weight: 500;
}

.amount-text {
  font-size: 13px;
  color: var(--color-text);
}
</style>
