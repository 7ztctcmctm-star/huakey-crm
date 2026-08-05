import { createRouter, createWebHistory } from 'vue-router'
import Login from '../views/login/index.vue'
import { useUser } from '../composables/useUser'
// Layout 和 Dashboard 改为懒加载，减小首屏包体积
const Layout = () => import('../views/layout/index.vue')
const Dashboard = () => import('../views/Dashboard.vue')

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/login',
      name: 'Login',
      component: Login,
      meta: { public: true }
    },
    {
      path: '/change-password',
      name: 'ChangePassword',
      component: () => import('../views/change-password/index.vue'),
      meta: { public: true, title: '首次登录修改密码' }
    },
    {
      path: '/',
      name: 'Layout',
      component: Layout,
      redirect: '/dashboard',
      children: [
        {
          path: 'dashboard',
          name: 'Dashboard',
          component: Dashboard,
          meta: { title: '首页', permission: 'dashboard' }
        },
        {
          path: 'followup/calendar',
          name: 'FollowupCalendar',
          component: () => import('../views/followup/calendar.vue'),
          meta: { title: '跟进日历', permission: 'followup:calendar' }
        },
        {
          path: 'followup/template',
          name: 'FollowupTemplate',
          component: () => import('../views/followup/template.vue'),
          meta: { title: '跟进模板', permission: 'followup:template' }
        },
        {
          path: 'follow-up/today',
          name: 'TodayTasks',
          component: () => import('../views/follow-up/TodayTasks.vue'),
          meta: { title: '今日待跟进', permission: 'followup:today' }
        },
        {
          path: 'follow-up/tomorrow',
          name: 'TomorrowTasks',
          component: () => import('../views/follow-up/TomorrowTasks.vue'),
          meta: { title: '明日计划', permission: 'followup:tomorrow' }
        },
        {
          path: 'leads',
          name: 'LeadsPool',
          component: () => import('../views/leads/List.vue'),
          meta: { title: '潜客池', permission: 'leads:view' }
        },
        {
          path: 'customer/list',
          name: 'CustomerList',
          component: () => import('../views/customer/List.vue'),
          meta: { title: '正式客户', permission: 'customer:view' }
        },
        {
          path: 'pool',
          name: 'PublicPool',
          component: () => import('../views/pool/List.vue'),
          meta: { title: '公海池', permission: 'pool:view' }
        },
        {
          path: 'customer/prospects',
          redirect: '/leads'
        },
        {
          path: 'customer/detail/:id',
          name: 'CustomerDetail',
          component: () => import('../views/customer/Detail.vue'),
          meta: { title: '客户详情', permission: 'customer:view' }
        },
        {
          path: 'customer/assign-rules',
          name: 'AssignRules',
          component: () => import('../views/customer/AssignRules.vue'),
          meta: { title: '分配规则', permission: 'customer:assign' }
        },
        {
          path: 'opportunity',
          name: 'Opportunity',
          component: () => import('../views/opportunity/list.vue'),
          meta: { title: '商机管理', permission: 'opportunity' }
        },
        {
          path: 'opportunity/detail/:id',
          name: 'OpportunityDetail',
          component: () => import('../views/opportunity/Detail.vue'),
          meta: { title: '商机详情', permission: 'opportunity:view' }
        },
        {
          path: 'product',
          name: 'Product',
          component: () => import('../views/product/index.vue'),
          meta: { title: '产品管理', permission: 'product' }
        },
        {
          path: 'quotation',
          name: 'Quotation',
          component: () => import('../views/quotation/list.vue'),
          meta: { title: '报价管理', permission: 'quotation' }
        },
        {
          path: 'quotation/edit/:id?',
          name: 'QuotationEdit',
          component: () => import('../views/quotation/edit.vue'),
          meta: { title: '报价单编辑', permission: 'quotation' }
        },
        {
          path: 'contract',
          name: 'Contract',
          component: () => import('../views/contract/list.vue'),
          meta: { title: '合同管理', permission: 'contract' }
        },
        {
          path: 'contract/detail/:id',
          name: 'ContractDetail',
          component: () => import('../views/contract/detail.vue'),
          meta: { title: '合同详情', permission: 'contract' }
        },
        {
          path: 'payment',
          name: 'Payment',
          component: () => import('../views/payment/index.vue'),
          meta: { title: '回款管理', permission: 'payment:view' }
        },
        {
          path: 'payment/reminders',
          name: 'PaymentReminders',
          component: () => import('../views/payment/reminders.vue'),
          meta: { title: '回款提醒', permission: 'payment:view' }
        },
        {
          path: 'payment/reconciliation',
          name: 'PaymentReconciliation',
          component: () => import('../views/payment/reconciliation.vue'),
          meta: { title: '对账管理', permission: 'payment:view' }
        },
        {
          path: 'payment/analysis',
          name: 'PaymentAnalysis',
          component: () => import('../views/payment/analysis.vue'),
          meta: { title: '财务分析', permission: 'payment:view', admin: true }
        },
        {
          path: 'notification',
          name: 'Notification',
          component: () => import('../views/notification/index.vue'),
          meta: { title: '通知中心', permission: 'notification' }
        },
        {
          path: 'email/inbox',
          name: 'EmailInbox',
          component: () => import('../views/email/inbox.vue'),
          meta: { title: '邮件收发', permission: 'email' }
        },
        {
          path: 'email/compose',
          name: 'EmailCompose',
          component: () => import('../views/email/compose.vue'),
          meta: { title: '写邮件', permission: 'email' }
        },
        {
          path: 'email/settings',
          name: 'EmailSettings',
          component: () => import('../views/email/settings.vue'),
          meta: { title: '邮箱设置', permission: 'email' }
        },
        {
          path: 'supplier/list',
          name: 'SupplierList',
          component: () => import('../views/supplier/list.vue'),
          meta: { title: '供应商列表', permission: 'supplier' }
        },
        {
          path: 'supplier/detail/:id',
          name: 'SupplierDetail',
          component: () => import('../views/supplier/detail.vue'),
          meta: { title: '供应商详情', permission: 'supplier' }
        },
        {
          path: 'purchase/list',
          name: 'PurchaseList',
          component: () => import('../views/purchase/list.vue'),
          meta: { title: '采购列表', permission: 'purchase' }
        },
        {
          path: 'purchase/detail/:id',
          name: 'PurchaseDetail',
          component: () => import('../views/purchase/detail.vue'),
          meta: { title: '采购详情', permission: 'purchase' }
        },
        {
          path: 'purchase/requests',
          name: 'PurchaseRequestList',
          component: () => import('../views/purchase/RequestList.vue'),
          meta: { title: '采购申请', permission: 'purchase:request' }
        },
        {
          path: 'purchase/request/create',
          name: 'PurchaseRequestCreate',
          component: () => import('../views/purchase/RequestForm.vue'),
          meta: { title: '新建采购申请', permission: 'purchase:request' }
        },
        {
          path: 'purchase/approvals',
          name: 'PurchaseApprovalList',
          component: () => import('../views/purchase/ApprovalList.vue'),
          meta: { title: '采购审批', permission: 'purchase:approve' }
        },
        {
          path: 'purchase/comparisons',
          name: 'PurchaseComparisonList',
          component: () => import('../views/purchase/ComparisonList.vue'),
          meta: { title: '采购比价', permission: 'purchase:comparison' }
        },
        {
          path: 'purchase/comparison/detail/:id',
          name: 'PurchaseComparisonDetail',
          component: () => import('../views/purchase/ComparisonDetail.vue'),
          meta: { title: '比价详情', permission: 'purchase:comparison' }
        },
        {
          path: 'procurement/plan',
          name: 'ProcurementPlan',
          component: () => import('../views/procurement/plan.vue'),
          meta: { title: '采购计划', permission: 'purchase' }
        },
        {
          path: 'procurement/plan/:id',
          name: 'ProcurementPlanDetail',
          component: () => import('../views/procurement/planDetail.vue'),
          meta: { title: '计划详情', permission: 'purchase' }
        },
        {
          path: 'inventory',
          name: 'Inventory',
          component: () => import('../views/inventory/index.vue'),
          meta: { title: '库存管理', permission: 'product' }
        },
        {
          path: 'inventory/movements',
          name: 'InventoryMovements',
          component: () => import('../views/inventory/movements.vue'),
          meta: { title: '库存变动', permission: 'product' }
        },
        {
          path: 'supplier/ranking',
          name: 'SupplierRanking',
          component: () => import('../views/supplier/ranking.vue'),
          meta: { title: '供应商排行', permission: 'supplier' }
        },
        {
          path: 'service',
          name: 'Service',
          component: () => import('../views/service/index.vue'),
          meta: { title: '服务工单', permission: 'service' }
        },
        {
          path: 'survey',
          name: 'SurveyIndex',
          component: () => import('../views/survey/index.vue'),
          meta: { title: '调查管理', permission: 'survey' }
        },
        {
          path: 'survey/templates',
          name: 'SurveyTemplates',
          component: () => import('../views/survey/templates.vue'),
          meta: { title: '调查模板', permission: 'survey' }
        },
        {
          path: 'survey/detail/:id',
          name: 'SurveyDetail',
          component: () => import('../views/survey/detail.vue'),
          meta: { title: '调查详情', permission: 'survey' }
        },
        {
          path: 'survey/analytics/:id',
          name: 'SurveyAnalytics',
          component: () => import('../views/survey/analytics.vue'),
          meta: { title: '调查分析', permission: 'survey' }
        },
        {
          path: 'survey/overview',
          name: 'SurveyOverview',
          component: () => import('../views/survey/overview.vue'),
          meta: { title: '满意度总览', permission: 'survey' }
        },
        {
          path: 'hr/employees',
          name: 'HrEmployees',
          component: () => import('../views/hr/employees.vue'),
          meta: { title: '员工档案', permission: 'system:user', admin: true }
        },
        {
          path: 'hr/commission',
          name: 'HrCommission',
          component: () => import('../views/hr/commission.vue'),
          meta: { title: '佣金管理', permission: 'system:user', admin: true }
        },
        {
          path: 'hr/org-chart',
          name: 'HrOrgChart',
          component: () => import('../views/hr/org-chart.vue'),
          meta: { title: '组织架构', permission: 'system:user', admin: true }
        },
        {
          path: 'automation/workflows',
          name: 'AutomationWorkflows',
          component: () => import('../views/automation/workflows.vue'),
          meta: { title: '工作流管理', permission: 'system:user', admin: true }
        },
        {
          path: 'automation/assign-rules',
          name: 'AutomationAssignRules',
          component: () => import('../views/automation/assign-rules.vue'),
          meta: { title: '自动分配', permission: 'system:user', admin: true }
        },
        {
          path: 'automation/smart-reminders',
          name: 'AutomationSmartReminders',
          component: () => import('../views/automation/smart-reminders.vue'),
          meta: { title: '智能提醒', permission: 'system:user', admin: true }
        },
        {
          path: 'calendar',
          name: 'Calendar',
          component: () => import('../views/calendar/index.vue'),
          meta: { title: '日程管理', permission: 'calendar' }
        },
        {
          path: 'social',
          name: 'Social',
          component: () => import('../views/social/index.vue'),
          meta: { title: '社媒沟通', permission: 'social' }
        },
        {
          path: 'settings/api-platform',
          name: 'ApiPlatform',
          component: () => import('../views/settings/api-platform.vue'),
          meta: { title: 'API开放平台', permission: 'system:user', admin: true }
        },
        {
          path: 'competitor',
          name: 'Competitor',
          component: () => import('../views/competitor/index.vue'),
          meta: { title: '竞品分析', permission: 'competitor:view' }
        },
        {
          path: 'competitor/:id',
          name: 'CompetitorDetail',
          component: () => import('../views/competitor/detail.vue'),
          meta: { title: '竞争对手详情', permission: 'competitor:view' }
        },
        {
          path: 'analysis/prediction',
          name: 'AnalysisPrediction',
          component: () => import('../views/analysis/prediction.vue'),
          meta: { title: '增强预测', permission: 'analysis' }
        },
        {
          path: 'report',
          name: 'Report',
          component: () => import('../views/report/index.vue'),
          meta: { title: '数据报表', permission: 'report', admin: true }
        },
        {
          path: 'report/finance',
          name: 'ReportFinance',
          component: () => import('../views/report/finance.vue'),
          meta: { title: '财务报表', permission: 'report', admin: true }
        },
        {
          path: 'report/business',
          name: 'ReportBusiness',
          component: () => import('../views/report/business.vue'),
          meta: { title: '经营分析', permission: 'report', admin: true }
        },
        {
          path: 'report/custom',
          name: 'ReportCustom',
          component: () => import('../views/report/custom.vue'),
          meta: { title: '自定义报表', permission: 'report', admin: true }
        },
        {
          path: 'target',
          name: 'Target',
          component: () => import('../views/target/index.vue'),
          meta: { title: '销售目标', permission: 'target', admin: true }
        },
        {
          path: 'team-dashboard',
          name: 'TeamDashboard',
          component: () => import('../views/TeamDashboard.vue'),
          meta: { title: '团队看板', permission: 'team-dashboard', admin: true }
        },
        {
          path: 'analysis',
          name: 'Analysis',
          component: () => import('../views/analysis/index.vue'),
          meta: { title: '数据分析', permission: 'analysis' }
        },
        {
          path: 'scoring/rules',
          name: 'ScoringRules',
          component: () => import('../views/scoring/rules.vue'),
          meta: { title: '评分规则', permission: 'scoring:view' }
        },
        {
          path: 'scoring/ranking',
          name: 'ScoringRanking',
          component: () => import('../views/scoring/ranking.vue'),
          meta: { title: '评分排行', permission: 'scoring:view' }
        },
        {
          path: 'ai-suggestions',
          name: 'AiSuggestions',
          component: () => import('../views/ai/index.vue'),
          meta: { title: 'AI建议', permission: 'ai' }
        },
        {
          path: 'knowledge',
          name: 'Knowledge',
          component: () => import('../views/knowledge/index.vue'),
          meta: { title: '销售资料', permission: 'knowledge' }
        },
        {
          path: 'knowledge/products',
          name: 'KnowledgeProducts',
          component: () => import('../views/knowledge/products.vue'),
          meta: { title: '产品知识库', permission: 'knowledge' }
        },
        {
          path: 'knowledge/scripts',
          name: 'KnowledgeScripts',
          component: () => import('../views/knowledge/scripts.vue'),
          meta: { title: '销售话术', permission: 'knowledge' }
        },
        {
          path: 'knowledge/faqs',
          name: 'KnowledgeFaqs',
          component: () => import('../views/knowledge/faqs.vue'),
          meta: { title: '常见问题', permission: 'knowledge' }
        },
        {
          path: 'knowledge/documents',
          name: 'KnowledgeDocuments',
          component: () => import('../views/knowledge/documents.vue'),
          meta: { title: '文档模板', permission: 'knowledge' }
        },
        {
          path: 'profile',
          name: 'Profile',
          component: () => import('../views/profile/index.vue'),
          meta: { title: '个人中心' }
        },
        {
          path: 'settings',
          name: 'Settings',
          component: () => import('../views/settings/index.vue'),
          meta: { title: '系统设置', permission: 'settings' }
        },
        {
          path: 'system/user',
          name: 'UserManage',
          component: () => import('../views/system/user.vue'),
          meta: { title: '用户管理', permission: 'system:user', admin: true }
        },
        {
          path: 'system/role',
          name: 'RoleManage',
          component: () => import('../views/system/role.vue'),
          meta: { title: '角色管理', permission: 'system:role', admin: true }
        },
        {
          path: 'approval/workflow',
          name: 'ApprovalWorkflow',
          component: () => import('../views/approval/workflow.vue'),
          meta: { title: '审批流程', permission: 'approval:view', admin: true }
        },
        {
          path: 'approval/pending',
          name: 'ApprovalPending',
          component: () => import('../views/approval/pending.vue'),
          meta: { title: '我的待审批', permission: 'approval:view' }
        },
        {
          path: 'approval/submitted',
          name: 'ApprovalSubmitted',
          component: () => import('../views/approval/submitted.vue'),
          meta: { title: '我的审批', permission: 'approval:view' }
        },
        {
          path: 'system/dept',
          name: 'DeptManage',
          component: () => import('../views/system/dept.vue'),
          meta: { title: '部门管理', permission: 'system:dept', admin: true }
        },
        {
          path: 'system/log',
          name: 'SystemLog',
          component: () => import('../views/system/log.vue'),
          meta: { title: '操作日志', permission: 'system:log', admin: true }
        },
        {
          path: 'system/backup',
          name: 'SystemBackup',
          component: () => import('../views/system/backup.vue'),
          meta: { title: '数据备份', permission: 'backup:add', admin: true }
        },
        {
          path: 'system/permission',
          name: 'SystemPermission',
          component: () => import('../views/system/permission.vue'),
          meta: { title: '权限管理', permission: 'permission:view', admin: true }
        },
        {
          path: 'system/tags',
          name: 'SystemTags',
          component: () => import('../views/system/tags.vue'),
          meta: { title: '标签管理', permission: 'system:tag', admin: true }
        },
        {
          path: 'system/integration',
          name: 'SystemIntegration',
          component: () => import('../views/settings/integration.vue'),
          meta: { title: '集成管理', permission: 'system:integration', admin: true }
        },
        {
          path: 'system/currency',
          name: 'SystemCurrency',
          component: () => import('../views/system/currency.vue'),
          meta: { title: '货币管理', permission: 'system:currency', admin: true }
        }
      ]
    },
    {
      path: '/survey/fill/:campaign_id',
      name: 'SurveyFill',
      component: () => import('../views/survey/fill.vue'),
      meta: { title: '满意度调查', public: true }
    },
    {
      path: '/:pathMatch(.*)*',
      name: 'NotFound',
      component: () => import('../views/NotFound.vue'),
      meta: { public: true }
    }
  ]
})

// 路由守卫
router.beforeEach(async (to, from, next) => {
  // 公开页面直接放行
  if (to.meta.public) {
    next()
    return
  }

  // 验证登录状态（cookie + 后端校验）
  const { userInfo, verifyAuth } = useUser()

  const isAuthenticated = await verifyAuth()
  if (!isAuthenticated) {
    next('/login')
    return
  }

  // 获取用户信息
  const user = userInfo.value || {}

  // 首次登录/重置密码后必须修改密码，强制跳转到改密页面
  if (user.mustChangePassword && to.path !== '/change-password') {
    next('/change-password')
    return
  }

  // 检查管理员权限
  // admin 路由：manageAll 用户直接放行；非 manageAll 用户若持有对应 permission 也放行
  if (to.meta.admin) {
    if (user.manageAll) {
      next()
      return
    }

    if (to.meta.permission) {
      const permissions = user.permissions || []
      if (permissions.includes(to.meta.permission)) {
        next()
        return
      }
    }

    // 无权限访问：直接转到登录页（避免 /dashboard 重定向循环）
    next('/login')
    return
  }

  // 检查菜单权限
  if (to.meta.permission) {
    const permissions = user.permissions || []
    const hasAuth = user.manageAll || permissions.includes(to.meta.permission)

    if (!hasAuth) {
      // 无权限访问：转到登录页
      next('/login')
      return
    }
  }

  next()
})

export default router
