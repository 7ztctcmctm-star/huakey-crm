#!/usr/bin/env node
/**
 * 路由 × 侧边栏一致性守卫（P3 未穷举项）
 *
 * 检查两件事：
 *   1) 侧边栏每个 el-menu-item 的 index 必须有对应路由（防止死链）
 *   2) 每个静态路由都应有侧边栏入口，除非登记在 HIDDEN_ROUTES（详情页/顶栏入口/跳板页等）
 *
 * 约束：路由表当前所有子路由都挂在根路径 '/' 下，故相对 path 统一按 '/' 前缀归一化；
 *       动态路由（含 ':' 或 '*'）不参与「必须有菜单」检查，仅参与菜单反查。
 *
 * 用法：npm run lint:routes
 * 退出码：0 = 通过；1 = 存在不一致
 */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const ROUTER = join(ROOT, 'src/router/index.js')
const SIDEBAR = join(ROOT, 'src/components/layout/Sidebar.vue')

// 无侧边栏入口但属预期的路由：需写明入口位置，新增时请一并登记
const HIDDEN_ROUTES = {
  '/login': '登录页',
  '/change-password': '强制改密页',
  '/': '根路径（重定向到 /dashboard）',
  '/customer/prospects': '重定向到 /leads',
  '/email/compose': '从邮件列表/客户详情进入',
  '/email/settings': '从邮件页进入',
  '/follow-up/today': '从销售/经理看板进入',
  '/follow-up/tomorrow': '从销售/经理看板进入',
  '/purchase/request/create': '从采购申请列表进入',
  '/team-dashboard': '老板看板入口在顶栏',
  '/profile': '个人中心入口在右上角用户菜单'
}

const routerSource = readFileSync(ROUTER, 'utf8')
const sidebarSource = readFileSync(SIDEBAR, 'utf8')

const routePaths = [...routerSource.matchAll(/path:\s*'([^']+)'/g)]
  .map(m => m[1])
  .map(p => (p.startsWith('/') ? p : `/${p}`))

const menuPaths = [...sidebarSource.matchAll(/<el-menu-item[^>]*index="([^"]+)"/g)]
  .map(m => m[1])
  .map(p => (p.startsWith('/') ? p : `/${p}`))

const isDynamic = p => p.includes(':') || p.includes('*')
const staticRoutes = new Set(routePaths.filter(p => !isDynamic(p)))
const dynamicRoutes = routePaths.filter(isDynamic)
const menuSet = new Set(menuPaths)

const errors = []

// 1) 菜单项必须有路由（动态路由按前缀匹配，如 /competitor/:id）
for (const menu of menuSet) {
  const exact = staticRoutes.has(menu)
  const prefixMatch = dynamicRoutes.some(pattern => {
    const base = pattern.split('/:')[0]
    return base && (menu === base || menu.startsWith(`${base}/`))
  })
  if (!exact && !prefixMatch) {
    errors.push(`侧边栏入口无对应路由: ${menu}`)
  }
}

// 2) 静态路由必须有菜单入口（或显式登记为隐藏）
for (const route of staticRoutes) {
  if (menuSet.has(route) || HIDDEN_ROUTES[route]) continue
  errors.push(`路由无侧边栏入口且未登记 HIDDEN_ROUTES: ${route}`)
}

if (errors.length === 0) {
  console.log(`check-sidebar-routes: OK（静态路由 ${staticRoutes.size} 个：菜单入口 ${staticRoutes.size - Object.keys(HIDDEN_ROUTES).length} 个 / 登记隐藏 ${Object.keys(HIDDEN_ROUTES).length} 个；菜单项 ${menuSet.size} 个均有效）`)
  process.exit(0)
}

console.error(`check-sidebar-routes: 发现 ${errors.length} 处不一致`)
for (const error of errors) console.error(`  ${error}`)
process.exit(1)
