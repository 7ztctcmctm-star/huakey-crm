import { createRouter, createWebHistory } from 'vue-router'
import Login from '../views/login/index.vue'
import Layout from '../views/layout/index.vue'
import Dashboard from '../views/Dashboard.vue'

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
          path: 'leads',
          name: 'Leads',
          component: () => import('../views/leads/Index.vue'),
          meta: { title: '线索导入', permission: 'leads' }
        },
        {
          path: 'followup/calendar',
          name: 'FollowupCalendar',
          component: () => import('../views/followup/calendar.vue'),
          meta: { title: '跟进日历', permission: 'followup:calendar' }
        },
        {
          path: 'followup/plan',
          name: 'FollowupPlan',
          component: () => import('../views/followup/plan.vue'),
          meta: { title: '跟进计划', permission: 'customer:list' }
        },
        {
          path: 'followup/template',
          name: 'FollowupTemplate',
          component: () => import('../views/followup/template.vue'),
          meta: { title: '跟进模板', permission: 'customer:list' }
        },
        {
          path: 'follow-up/today',
          name: 'TodayTasks',
          component: () => import('../views/follow-up/TodayTasks.vue'),
          meta: { title: '今日待跟进', permission: 'customer:list' }
        },
        {
          path: 'follow-up/tomorrow',
          name: 'TomorrowTasks',
          component: () => import('../views/follow-up/TomorrowTasks.vue'),
          meta: { title: '明日计划', permission: 'customer:list' }
        },
        {
          path: 'customer/prospects',
          name: 'ProspectPool',
          component: () => import('../views/customer/List.vue'),
          meta: { title: '潜客池', permission: 'customer:list' }
        },
        {
          path: 'customer/list',
          name: 'CustomerList',
          component: () => import('../views/customer/List.vue'),
          meta: { title: '正式客户', permission: 'customer:list' }
        },
        {
          path: 'customer/detail/:id',
          name: 'CustomerDetail',
          component: () => import('../views/customer/Detail.vue'),
          meta: { title: '客户详情' }
        },
        {
          path: 'customer/pool',
          name: 'CustomerPool',
          component: () => import('../views/customer/pool.vue'),
          meta: { title: '客户池', permission: 'customer:pool' }
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
          meta: { title: '报价单编辑' }
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
          meta: { title: '合同详情' }
        },
        {
          path: 'payment',
          name: 'Payment',
          component: () => import('../views/payment/index.vue'),
          meta: { title: '回款管理', permission: 'contract' }
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
          meta: { title: '供应商详情' }
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
          meta: { title: '采购详情' }
        },
        {
          path: 'service',
          name: 'Service',
          component: () => import('../views/service/index.vue'),
          meta: { title: '售后服务', permission: 'service' }
        },
        {
          path: 'report',
          name: 'Report',
          component: () => import('../views/report/index.vue'),
          meta: { title: '数据报表', permission: 'report', admin: true }
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
          meta: { title: '团队看板', admin: true }
        },
        {
          path: 'analysis',
          name: 'Analysis',
          component: () => import('../views/analysis/index.vue'),
          meta: { title: '数据分析' }
        },
        {
          path: 'scoring/rules',
          name: 'ScoringRules',
          component: () => import('../views/scoring/rules.vue'),
          meta: { title: '评分规则', permission: 'customer:list' }
        },
        {
          path: 'scoring/ranking',
          name: 'ScoringRanking',
          component: () => import('../views/scoring/ranking.vue'),
          meta: { title: '评分排行', permission: 'customer:list' }
        },
        {
          path: 'ai-suggestions',
          name: 'AiSuggestions',
          component: () => import('../views/ai/index.vue'),
          meta: { title: 'AI建议' }
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
          meta: { title: '系统设置' }
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
          meta: { title: '审批流程', permission: 'customer:list', admin: true }
        },
        {
          path: 'approval/pending',
          name: 'ApprovalPending',
          component: () => import('../views/approval/pending.vue'),
          meta: { title: '我的待审批', permission: 'customer:list' }
        },
        {
          path: 'approval/submitted',
          name: 'ApprovalSubmitted',
          component: () => import('../views/approval/submitted.vue'),
          meta: { title: '我的审批', permission: 'customer:list' }
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
          meta: { title: '数据备份', permission: 'backup:create', admin: true }
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
          meta: { title: '集成管理', admin: true }
        }
      ]
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
router.beforeEach((to, from, next) => {
  const token = localStorage.getItem('token')

  // 公开页面直接放行
  if (to.meta.public) {
    next()
    return
  }

  // 未登录跳转到登录页
  if (!token) {
    next('/login')
    return
  }

  // 获取用户信息
  let userInfo = {}
  try {
    userInfo = JSON.parse(localStorage.getItem('userInfo') || '{}')
  } catch {
    next('/login')
    return
  }

  // 检查管理员权限
  if (to.meta.admin) {
    if (userInfo.manageAll || userInfo.roleId === 1) {
      next()
    } else {
      next('/dashboard')
    }
    return
  }

  // 检查菜单权限
  if (to.meta.permission) {
    const permissions = userInfo.permissions || []
    const hasAuth = userInfo.roleId === 1 ||
                    userInfo.manageAll ||
                    permissions.includes(to.meta.permission)

    if (!hasAuth) {
      next('/dashboard')
      return
    }
  }

  next()
})

export default router
