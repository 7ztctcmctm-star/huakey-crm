<template>
  <el-aside :width="isCollapse ? '64px' : '230px'" class="sidebar">
    <div class="logo">
      <template v-if="!isCollapse">
        <img src="/logo.png" alt="Huakey" class="logo-img" />
        <span class="logo-title">铧旗CRM系统</span>
      </template>
      <span class="logo-icon" v-else>H</span>
    </div>

    <el-menu
      :default-active="activeMenu"
      :collapse="isCollapse"
      :collapse-transition="false"
      router
      background-color="transparent"
      text-color="rgba(255,255,255,0.7)"
      active-text-color="#fff"
    >
      <el-menu-item index="/dashboard">
        <el-icon><HomeFilled /></el-icon>
        <template #title>首页</template>
      </el-menu-item>

      <el-sub-menu index="/customer" v-if="hasAnyMenuPermission(['customer:list', 'customer:pool', 'followup:calendar'])">
        <template #title>
          <el-icon><UserFilled /></el-icon>
          <span>客户管理</span>
        </template>
        <el-menu-item index="/customer/list?tab=prospect" v-if="hasMenuPermission('customer:list')">潜客池</el-menu-item>
        <el-menu-item index="/customer/list?tab=customer" v-if="hasMenuPermission('customer:list')">正式客户</el-menu-item>
        <el-menu-item index="/customer/list?tab=sea" v-if="hasMenuPermission('customer:pool')">公海池</el-menu-item>
        <el-menu-item index="/followup/calendar" v-if="hasMenuPermission('followup:calendar')">跟进日历</el-menu-item>
        <el-menu-item index="/followup/template" v-if="hasMenuPermission('customer:list')">跟进模板</el-menu-item>
      </el-sub-menu>

      <el-menu-item index="/email/inbox">
        <el-icon><Message /></el-icon>
        <template #title>邮件</template>
      </el-menu-item>

      <el-menu-item index="/opportunity" v-if="hasMenuPermission('opportunity')">
        <el-icon><TrendCharts /></el-icon>
        <template #title>商机管理</template>
      </el-menu-item>

      <el-menu-item index="/product" v-if="hasMenuPermission('product')">
        <el-icon><Collection /></el-icon>
        <template #title>产品管理</template>
      </el-menu-item>

      <el-menu-item index="/quotation" v-if="hasMenuPermission('quotation')">
        <el-icon><Document /></el-icon>
        <template #title>报价管理</template>
      </el-menu-item>

      <el-menu-item index="/contract" v-if="hasMenuPermission('contract')">
        <el-icon><DocumentChecked /></el-icon>
        <template #title>合同管理</template>
      </el-menu-item>

      <el-menu-item index="/calendar">
        <el-icon><Calendar /></el-icon>
        <template #title>日程管理</template>
      </el-menu-item>

      <el-menu-item index="/social" v-if="hasMenuPermission('customer:list')">
        <el-icon><ChatDotRound /></el-icon>
        <template #title>社媒沟通</template>
      </el-menu-item>

      <el-sub-menu index="/payment" v-if="hasMenuPermission('contract')">
        <template #title>
          <el-icon><Money /></el-icon>
          <span>回款管理</span>
        </template>
        <el-menu-item index="/payment">回款列表</el-menu-item>
        <el-menu-item index="/payment/reminders">回款提醒</el-menu-item>
        <el-menu-item index="/payment/reconciliation">对账管理</el-menu-item>
        <el-menu-item index="/payment/analysis">财务分析</el-menu-item>
      </el-sub-menu>

      <el-sub-menu index="/supplier" v-if="hasMenuPermission('supplier')">
        <template #title>
          <el-icon><OfficeBuilding /></el-icon>
          <span>供应商管理</span>
        </template>
        <el-menu-item index="/supplier/list">供应商列表</el-menu-item>
        <el-menu-item index="/supplier/ranking">评估排行</el-menu-item>
      </el-sub-menu>

      <el-sub-menu index="/purchase" v-if="hasMenuPermission('purchase')">
        <template #title>
          <el-icon><ShoppingCart /></el-icon>
          <span>采购管理</span>
        </template>
        <el-menu-item index="/purchase/list">采购单</el-menu-item>
        <el-menu-item index="/procurement/plan">采购计划</el-menu-item>
        <el-menu-item index="/inventory">库存管理</el-menu-item>
        <el-menu-item index="/inventory/movements">库存变动</el-menu-item>
      </el-sub-menu>

      <el-menu-item index="/service" v-if="hasMenuPermission('service')">
        <el-icon><Service /></el-icon>
        <template #title>服务工单</template>
      </el-menu-item>

      <el-sub-menu index="/survey">
        <template #title>
          <el-icon><Opportunity /></el-icon>
          <span>客户满意度</span>
        </template>
        <el-menu-item index="/survey">调查管理</el-menu-item>
        <el-menu-item index="/survey/templates">调查模板</el-menu-item>
        <el-menu-item index="/survey/overview">满意度总览</el-menu-item>
      </el-sub-menu>

      <el-sub-menu index="/hr" v-if="isAdmin">
        <template #title>
          <el-icon><User /></el-icon>
          <span>人力资源</span>
        </template>
        <el-menu-item index="/hr/employees">员工档案</el-menu-item>
        <el-menu-item index="/hr/commission">佣金管理</el-menu-item>
        <el-menu-item index="/hr/org-chart">组织架构</el-menu-item>
      </el-sub-menu>

      <el-sub-menu index="/automation" v-if="isAdmin">
        <template #title>
          <el-icon><Setting /></el-icon>
          <span>自动化</span>
        </template>
        <el-menu-item index="/automation/workflows">工作流管理</el-menu-item>
        <el-menu-item index="/automation/assign-rules">自动分配</el-menu-item>
        <el-menu-item index="/automation/smart-reminders">智能提醒</el-menu-item>
      </el-sub-menu>

      <el-sub-menu index="/report" v-if="isAdmin && hasMenuPermission('report')">
        <template #title>
          <el-icon><TrendCharts /></el-icon>
          <span>数据报表</span>
        </template>
        <el-menu-item index="/report">报表首页</el-menu-item>
        <el-menu-item index="/report/finance">财务报表</el-menu-item>
        <el-menu-item index="/report/business">经营分析</el-menu-item>
        <el-menu-item index="/report/custom">自定义报表</el-menu-item>
      </el-sub-menu>

      <el-sub-menu index="/analysis">
        <template #title>
          <el-icon><DataAnalysis /></el-icon>
          <span>分析工具</span>
        </template>
        <el-menu-item index="/analysis">分析首页</el-menu-item>
        <el-menu-item index="/analysis/prediction">增强预测</el-menu-item>
        <el-menu-item index="/competitor">竞品分析</el-menu-item>
      </el-sub-menu>

      <el-menu-item index="/scoring/rules" v-if="hasMenuPermission('customer:list')">
        <el-icon><Trophy /></el-icon>
        <template #title>评分规则</template>
      </el-menu-item>

      <el-menu-item index="/scoring/ranking" v-if="hasMenuPermission('customer:list')">
        <el-icon><Histogram /></el-icon>
        <template #title>评分排行</template>
      </el-menu-item>

      <el-menu-item index="/ai-suggestions">
        <el-icon><ChatDotRound /></el-icon>
        <template #title>AI助手</template>
      </el-menu-item>

      <el-menu-item index="/approval/pending">
        <el-icon><Stamp /></el-icon>
        <template #title>待审批</template>
      </el-menu-item>

      <el-menu-item index="/approval/submitted">
        <el-icon><Document /></el-icon>
        <template #title>我的审批</template>
      </el-menu-item>

      <el-sub-menu index="/knowledge">
        <template #title>
          <el-icon><Notebook /></el-icon>
          <span>知识库</span>
        </template>
        <el-menu-item index="/knowledge">知识库首页</el-menu-item>
        <el-menu-item index="/knowledge/products">产品知识</el-menu-item>
        <el-menu-item index="/knowledge/scripts">销售话术</el-menu-item>
        <el-menu-item index="/knowledge/faqs">常见问题</el-menu-item>
        <el-menu-item index="/knowledge/documents">文档模板</el-menu-item>
      </el-sub-menu>

      <el-menu-item index="/target" v-if="isAdmin && hasMenuPermission('target')">
        <el-icon><DataBoard /></el-icon>
        <template #title>销售目标</template>
      </el-menu-item>

      <el-sub-menu index="/system" v-if="isAdmin">
        <template #title>
          <el-icon><Setting /></el-icon>
          <span>系统管理</span>
        </template>
        <el-menu-item index="/system/user" v-if="hasMenuPermission('system:user')">用户管理</el-menu-item>
        <el-menu-item index="/system/role" v-if="hasMenuPermission('system:role')">角色管理</el-menu-item>
        <el-menu-item index="/system/dept" v-if="hasMenuPermission('system:dept')">部门管理</el-menu-item>
        <el-menu-item index="/system/log" v-if="hasMenuPermission('system:log')">操作日志</el-menu-item>
        <el-menu-item index="/system/tags">标签管理</el-menu-item>
        <el-menu-item index="/approval/workflow">审批流程</el-menu-item>
        <el-menu-item index="/system/integration">集成管理</el-menu-item>
        <el-menu-item index="/settings/api-platform">API开放平台</el-menu-item>
      </el-sub-menu>
    </el-menu>
  </el-aside>
</template>

<script setup>
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import {
  HomeFilled,
  UserFilled,
  User,
  TrendCharts,
  Collection,
  Document,
  DocumentChecked,
  Money,
  OfficeBuilding,
  ShoppingCart,
  Service,
  Setting,
  DataBoard,
  DataAnalysis,
  ChatDotRound,
  Trophy,
  Histogram,
  Stamp,
  Notebook,
  Opportunity,
  Calendar,
  Message
} from '@element-plus/icons-vue'

const props = defineProps({
  isCollapse: { type: Boolean, default: false },
  userInfo: { type: Object, default: () => ({}) }
})

const route = useRoute()

const activeMenu = computed(() => route.path)

const isAdmin = computed(() => props.userInfo.manageAll === true || props.userInfo.roleId === 1)
const isBoss = computed(() => props.userInfo.viewAll === true || props.userInfo.roleId === 1)

const hasMenuPermission = (permissionCode) => {
  if (props.userInfo.roleId === 1 || props.userInfo.manageAll) return true
  const permissions = props.userInfo.permissions || []
  return permissions.includes(permissionCode)
}

const hasAnyMenuPermission = (permissionCodes) => {
  if (!Array.isArray(permissionCodes)) return false
  return permissionCodes.some(code => hasMenuPermission(code))
}
</script>

<style scoped>
.sidebar {
  background: var(--color-bg);
  border-right: 1px solid var(--color-border);
}

.logo {
  height: 56px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 8px 16px;
  border-bottom: 1px solid var(--color-border);
}

.logo-img {
  height: 32px;
  width: auto;
  flex-shrink: 0;
}

.logo-title {
  color: var(--color-text);
  font-size: 15px;
  font-weight: 600;
  letter-spacing: -0.02em;
  white-space: nowrap;
}

.logo-icon {
  color: var(--color-text);
  font-size: 18px;
  font-weight: 700;
}

:deep(.el-menu) {
  border-right: none !important;
}

:deep(.el-menu-item),
:deep(.el-sub-menu__title) {
  border-radius: var(--radius-sm);
  margin: 2px 8px;
}

:deep(.el-menu-item:hover),
:deep(.el-sub-menu__title:hover) {
  background: var(--color-bg-secondary) !important;
}

:deep(.el-menu-item.is-active) {
  background: var(--color-bg-secondary) !important;
  font-weight: 600;
  color: var(--color-text) !important;
}
</style>
