<template>
  <el-container class="layout-container">
    <!-- 左侧边栏 -->
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

        <el-sub-menu index="/customer" v-if="hasAnyMenuPermission(['leads', 'customer:list', 'customer:pool', 'followup:calendar'])">
          <template #title>
            <el-icon><UserFilled /></el-icon>
            <span>客户管理</span>
          </template>
          <el-menu-item index="/leads" v-if="hasMenuPermission('leads')">线索管理</el-menu-item>
          <el-menu-item index="/customer/list?tab=prospect" v-if="hasMenuPermission('customer:list')">潜客池</el-menu-item>
          <el-menu-item index="/customer/list?tab=customer" v-if="hasMenuPermission('customer:list')">正式客户</el-menu-item>
          <el-menu-item index="/customer/pool" v-if="hasMenuPermission('customer:pool')">公海池</el-menu-item>
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
          <template #title>售后服务</template>
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
    
    <el-container>
      <!-- 顶部栏 -->
      <el-header class="header">
        <div class="header-left">
          <el-button
            link
            class="collapse-btn"
            @click="toggleCollapse"
          >
            <el-icon :size="20">
              <Fold v-if="!isCollapse" />
              <Expand v-else />
            </el-icon>
          </el-button>
          <el-breadcrumb separator="/">
            <el-breadcrumb-item :to="{ path: '/dashboard' }">首页</el-breadcrumb-item>
            <el-breadcrumb-item v-for="item in currentBreadcrumb" :key="item.name">
              {{ item.name }}
            </el-breadcrumb-item>
          </el-breadcrumb>

          <!-- 全局搜索 -->
          <SearchOverlay />

          <!-- 最近访问 -->
          <el-popover placement="bottom-start" :width="300" trigger="click" popper-class="recent-visit-popover">
            <template #reference>
              <el-button link class="recent-visit-btn" title="最近访问">
                <el-icon :size="18"><Clock /></el-icon>
              </el-button>
            </template>
            <div style="font-size:14px;font-weight:600;margin-bottom:8px">最近访问</div>
            <div v-if="recentVisits.length === 0" style="text-align:center;padding:20px;color:#909399;font-size:13px">暂无访问记录</div>
            <div v-for="item in recentVisits" :key="item.type + item.id" class="recent-visit-item" @click="goToVisit(item)">
              <el-tag size="small" :type="item.type === 'customer' ? 'primary' : 'success'" style="margin-right:8px">{{ getVisitTypeLabel(item.type) }}</el-tag>
              <span class="recent-visit-name">{{ item.name }}</span>
              <span class="recent-visit-time">{{ relativeTime(item.time) }}</span>
            </div>
          </el-popover>
        </div>
        
        <div class="header-right">
          <!-- 快捷创建 -->
          <QuickActions />

          <!-- 通知中心 -->
          <NotificationBadge />

          <!-- 回收站 -->
          <el-button v-if="isAdmin" link class="recycle-btn" @click="showRecycleBin = true" v-permission="'recycle_bin:view'">
            <el-icon :size="18"><Delete /></el-icon>
          </el-button>

          <!-- 老板看板入口 -->
          <el-button v-if="isBoss" link class="boss-dashboard-btn" @click="$router.push('/team-dashboard')">
            <el-icon :size="18"><DataBoard /></el-icon>
            <span>团队看板</span>
          </el-button>

          <UserDropdown :user-info="userInfo" />
        </div>
      </el-header>
      
      <!-- 中间内容区 -->
      <el-main class="main-content">
        <router-view v-slot="{ Component }">
          <keep-alive :include="['Dashboard', 'CustomerList', 'Leads', 'TeamDashboard']">
            <component :is="Component" />
          </keep-alive>
        </router-view>
      </el-main>
    </el-container>

    <!-- AI 助手 -->
    <AiChat />

    <!-- 回收站 -->
    <RecycleBin v-model="showRecycleBin" />

    <!-- 逾期提醒弹窗 -->
    <el-dialog v-model="showReminderDialog" title="待办提醒" width="700px">
      <el-tabs v-model="reminderTab">
        <el-tab-pane :label="`今日待跟进 (${todayList.length})`" name="today">
          <el-table :data="todayList" stripe border max-height="400">
            <el-table-column prop="company_name" label="公司名称" min-width="150" show-overflow-tooltip />
            <el-table-column prop="plan_content" label="计划内容" min-width="200" show-overflow-tooltip />
            <el-table-column prop="plan_time" label="计划时间" width="160">
              <template #default="{ row }">
                {{ row.plan_time ? formatTime(row.plan_time) : '-' }}
              </template>
            </el-table-column>
            <el-table-column label="状态" width="80" align="center">
              <template #default>
                <el-tag type="primary" size="small">待跟进</el-tag>
              </template>
            </el-table-column>
            <el-table-column label="操作" width="100">
              <template #default="{ row }">
                <el-button type="primary" link @click="goToCustomer(row.customer_id)">去跟进</el-button>
              </template>
            </el-table-column>
          </el-table>
          <div v-if="todayList.length === 0" style="text-align:center;padding:20px;color:#909399">今天没有待跟进的客户</div>
        </el-tab-pane>
        <el-tab-pane :label="`明日待跟进 (${upcomingList.length})`" name="upcoming">
          <el-table :data="upcomingList" stripe border max-height="400">
            <el-table-column prop="company_name" label="公司名称" min-width="150" show-overflow-tooltip />
            <el-table-column prop="plan_content" label="计划内容" min-width="200" show-overflow-tooltip />
            <el-table-column prop="plan_time" label="计划时间" width="160">
              <template #default="{ row }">
                {{ row.plan_time ? formatTime(row.plan_time) : '-' }}
              </template>
            </el-table-column>
            <el-table-column label="状态" width="80" align="center">
              <template #default>
                <el-tag type="warning" size="small">即将到期</el-tag>
              </template>
            </el-table-column>
            <el-table-column label="操作" width="100">
              <template #default="{ row }">
                <el-button type="primary" link @click="goToCustomer(row.customer_id)">去跟进</el-button>
              </template>
            </el-table-column>
          </el-table>
          <div v-if="upcomingList.length === 0" style="text-align:center;padding:20px;color:#909399">明天没有待跟进的客户</div>
        </el-tab-pane>
        <el-tab-pane label="逾期跟进" name="follow">
          <el-table :data="reminderList" stripe border max-height="400" v-loading="reminderLoading">
            <el-table-column prop="company_name" label="公司名称" min-width="150" show-overflow-tooltip />
            <el-table-column prop="overdue_days" label="逾期天数" width="100" align="center">
              <template #default="{ row }">
                <el-tag :type="row.overdue_days > 30 ? 'danger' : 'warning'">{{ row.overdue_days }}天</el-tag>
              </template>
            </el-table-column>
            <el-table-column prop="last_follow_time" label="最后跟进" width="160">
              <template #default="{ row }">
                {{ row.last_follow_time ? formatTime(row.last_follow_time) : '从未跟进' }}
              </template>
            </el-table-column>
            <el-table-column label="操作" width="100">
              <template #default="{ row }">
                <el-button type="primary" link @click="goToCustomer(row.customer_id)">去跟进</el-button>
              </template>
            </el-table-column>
          </el-table>
        </el-tab-pane>
        <el-tab-pane :label="`接近逾期 (${preWarningList.length})`" name="preWarning">
          <el-table :data="preWarningList" stripe border max-height="400">
            <el-table-column prop="company_name" label="公司名称" min-width="150" show-overflow-tooltip />
            <el-table-column prop="overdue_days" label="距逾期天数" width="110" align="center">
              <template #default="{ row }">
                <el-tag type="warning">还剩{{ overdueDaysConfig - row.overdue_days }}天</el-tag>
              </template>
            </el-table-column>
            <el-table-column prop="last_follow_time" label="最后跟进" width="160">
              <template #default="{ row }">
                {{ row.last_follow_time ? formatTime(row.last_follow_time) : '从未跟进' }}
              </template>
            </el-table-column>
            <el-table-column label="操作" width="100">
              <template #default="{ row }">
                <el-button type="primary" link @click="goToCustomer(row.customer_id)">去跟进</el-button>
              </template>
            </el-table-column>
          </el-table>
          <div v-if="preWarningList.length === 0" style="text-align:center;padding:20px;color:#909399">暂无接近逾期的客户</div>
        </el-tab-pane>
        <el-tab-pane :label="`回款提醒 (${paymentOverdueList.length + paymentUpcomingList.length})`" name="payment">
          <div v-if="paymentUpcomingList.length > 0" style="margin-bottom: 16px">
            <div style="font-size: 14px; font-weight: 600; margin-bottom: 8px; color: #e6a23c">即将到期</div>
            <el-table :data="paymentUpcomingList" stripe border max-height="200">
              <el-table-column prop="customer_name" label="客户名称" min-width="140" show-overflow-tooltip />
              <el-table-column prop="contract_no" label="合同编号" width="140" />
              <el-table-column prop="plan_date" label="计划日期" width="110" />
              <el-table-column label="未回金额" width="120" align="right">
                <template #default="{ row }">¥{{ fmt(row.plan_amount - row.paid_amount) }}</template>
              </el-table-column>
              <el-table-column label="状态" width="100" align="center">
                <template #default="{ row }">
                  <el-tag type="warning" size="small">还剩{{ row.days_left }}天</el-tag>
                </template>
              </el-table-column>
              <el-table-column label="操作" width="100">
                <template #default="{ row }">
                  <el-button type="primary" link @click="goToContract(row.contract_id)">查看合同</el-button>
                </template>
              </el-table-column>
            </el-table>
          </div>
          <div v-if="paymentUpcomingList.length === 0" style="text-align:center;padding:10px;color:#909399;font-size:13px">近期无即将到期的回款</div>
          <div style="font-size: 14px; font-weight: 600; margin-bottom: 8px; color: #f56c6c">已逾期</div>
          <el-table :data="paymentOverdueList" stripe border max-height="250" v-loading="paymentOverdueLoading">
            <el-table-column prop="customer_name" label="客户名称" min-width="140" show-overflow-tooltip />
            <el-table-column prop="contract_no" label="合同编号" width="140" />
            <el-table-column prop="plan_date" label="计划日期" width="110" />
            <el-table-column label="未回金额" width="120" align="right">
              <template #default="{ row }">¥{{ fmt(row.plan_amount - row.paid_amount) }}</template>
            </el-table-column>
            <el-table-column prop="overdue_days" label="逾期天数" width="100" align="center">
              <template #default="{ row }">
                <el-tag :type="row.overdue_days > 30 ? 'danger' : 'warning'">{{ row.overdue_days }}天</el-tag>
              </template>
            </el-table-column>
            <el-table-column label="操作" width="100">
              <template #default="{ row }">
                <el-button type="primary" link @click="goToContract(row.contract_id)">查看合同</el-button>
              </template>
            </el-table-column>
          </el-table>
          <div v-if="paymentOverdueList.length === 0" style="text-align:center;padding:10px;color:#909399;font-size:13px">暂无逾期回款</div>
        </el-tab-pane>
        <el-tab-pane :label="`审批待办 (${pendingApprovals.length})`" name="approval">
          <el-table :data="pendingApprovals" stripe border max-height="400">
            <el-table-column prop="title" label="类型" width="130">
              <template #default="{ row }">
                <el-tag :type="row.type === 'quote_approval' ? 'warning' : 'success'" size="small">
                  {{ row.type === 'quote_approval' ? '报价审批' : '合同审批' }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column prop="content" label="内容" min-width="250" show-overflow-tooltip />
            <el-table-column prop="from_user_name" label="提交人" width="100" />
            <el-table-column prop="create_time" label="时间" width="160">
              <template #default="{ row }">
                {{ formatTime(row.create_time) }}
              </template>
            </el-table-column>
            <el-table-column label="操作" width="100">
              <template #default="{ row }">
                <el-button type="primary" link @click="goToApproval(row)">去审批</el-button>
              </template>
            </el-table-column>
          </el-table>
          <div v-if="pendingApprovals.length === 0" style="text-align:center;padding:20px;color:#909399">暂无待审批事项</div>
        </el-tab-pane>
        <el-tab-pane :label="`催办通知 (${urgeNotifications.length})`" name="urge">
          <el-table :data="urgeNotifications" stripe border max-height="400">
            <el-table-column prop="content" label="催办内容" min-width="300" show-overflow-tooltip />
            <el-table-column prop="from_user_name" label="催办人" width="100" />
            <el-table-column prop="create_time" label="时间" width="160">
              <template #default="{ row }">
                {{ formatTime(row.create_time) }}
              </template>
            </el-table-column>
            <el-table-column label="操作" width="100">
              <template #default="{ row }">
                <el-button type="primary" link @click="goToUrgeCustomer(row)">去跟进</el-button>
              </template>
            </el-table-column>
          </el-table>
          <div v-if="urgeNotifications.length === 0" style="text-align:center;padding:20px;color:#909399">暂无催办通知</div>
        </el-tab-pane>
        <el-tab-pane :label="`新工单 (${newServiceNotifications.length})`" name="newService">
          <el-table :data="newServiceNotifications" stripe border max-height="400">
            <el-table-column prop="content" label="工单信息" min-width="300" show-overflow-tooltip />
            <el-table-column prop="from_user_name" label="分配人" width="100" />
            <el-table-column prop="create_time" label="时间" width="160">
              <template #default="{ row }">
                {{ formatTime(row.create_time) }}
              </template>
            </el-table-column>
            <el-table-column label="操作" width="100">
              <template #default="{ row }">
                <el-button type="primary" link @click="goToNewService(row)">去处理</el-button>
              </template>
            </el-table-column>
          </el-table>
          <div v-if="newServiceNotifications.length === 0" style="text-align:center;padding:20px;color:#909399">暂无新工单</div>
        </el-tab-pane>
        <el-tab-pane :label="`超时工单 (${overdueServices.length})`" name="overdueService">
          <el-table :data="overdueServices" stripe border max-height="400">
            <el-table-column prop="order_no" label="工单号" width="140" />
            <el-table-column prop="customer_name" label="客户" min-width="140" show-overflow-tooltip />
            <el-table-column prop="title" label="标题" min-width="160" show-overflow-tooltip />
            <el-table-column label="优先级" width="80" align="center">
              <template #default="{ row }">
                <el-tag :type="row.priority === 1 ? 'danger' : 'warning'" size="small">{{ row.priority === 1 ? '紧急' : '高' }}</el-tag>
              </template>
            </el-table-column>
            <el-table-column label="超时" width="100" align="center">
              <template #default="{ row }">
                <el-tag type="danger" size="small">{{ row.overdue_hours }}小时</el-tag>
              </template>
            </el-table-column>
            <el-table-column label="操作" width="100">
              <template #default="{ row }">
                <el-button type="primary" link @click="goToService(row)">去处理</el-button>
              </template>
            </el-table-column>
          </el-table>
          <div v-if="overdueServices.length === 0" style="text-align:center;padding:20px;color:#909399">暂无超时工单</div>
        </el-tab-pane>
      </el-tabs>
      <template #footer>
        <el-button @click="$router.push('/notification')">查看全部</el-button>
        <el-button @click="showReminderDialog = false">关闭</el-button>
        <el-button type="primary" @click="markAllRemindersRead">全部已读</el-button>
      </template>
    </el-dialog>
  </el-container>
</template>

<script setup>
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { getMyReminders, getPaymentOverdue, markAllRead, markNotificationRead } from '@/api/tools'
import AiChat from '@/components/AiChat.vue'
import RecycleBin from '@/components/RecycleBin.vue'
import QuickActions from '@/components/QuickActions.vue'
import SearchOverlay from '@/components/layout/SearchOverlay.vue'
import NotificationBadge from '@/components/layout/NotificationBadge.vue'
import UserDropdown from '@/components/layout/UserDropdown.vue'
import { formatTime } from '@/composables/useFormat'
import { getVisits, getVisitPath, getVisitTypeLabel } from '@/composables/useRecentVisit'
import { relativeTime } from '@/composables/useRelativeTime'
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
  Fold,
  Expand,
  DataBoard,
  Delete,
  DataAnalysis,
  ChatDotRound,
  Clock,
  Trophy,
  Histogram,
  Stamp,
  Notebook,
  Opportunity,
  Calendar,
  Message
} from '@element-plus/icons-vue'

const route = useRoute()
const router = useRouter()

// 路由变化时刷新最近访问列表
watch(() => route.path, () => { recentVisits.value = getVisits() })

// 菜单折叠状态
const isCollapse = ref(false)

// 当前激活的菜单
const activeMenu = computed(() => {
  return route.path
})

// 面包屑导航数据
// 面包屑：从路由 matched 记录中提取有 title 的层级（自动适配新路由和动态路由）
const currentBreadcrumb = computed(() => {
  return route.matched
    .filter(r => r.meta?.title && r.meta.title !== '首页')
    .map(r => ({ name: r.meta.title }))
})

// 用户信息
const userInfo = ref({
  username: '',
  realName: '',
  roleId: 0,
  permissions: []
})

const isAdmin = computed(() => userInfo.value.manageAll === true || userInfo.value.roleId === 1)
const isBoss = computed(() => userInfo.value.viewAll === true || userInfo.value.roleId === 1)

// 权限检查函数
const hasMenuPermission = (permissionCode) => {
  // 超级管理员拥有所有权限
  if (userInfo.value.roleId === 1 || userInfo.value.manageAll) {
    return true
  }
  const permissions = userInfo.value.permissions || []
  return permissions.includes(permissionCode)
}

const hasAnyMenuPermission = (permissionCodes) => {
  if (!Array.isArray(permissionCodes)) return false
  return permissionCodes.some(code => hasMenuPermission(code))
}

const showReminderDialog = ref(false)
const showRecycleBin = ref(false)
const reminderTab = ref('follow')
const reminderList = ref([])
const todayList = ref([])
const upcomingList = ref([])
const unreadReminderCount = ref(0)
const urgeUnreadCount = ref(0)
const totalUnreadCount = computed(() => unreadReminderCount.value + urgeUnreadCount.value + paymentOverdueList.value.length)
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

// 最近访问
const recentVisits = ref(getVisits())
const goToVisit = (item) => {
  const path = getVisitPath(item)
  router.push(path)
  recentVisits.value = getVisits()
}

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

const fmt = (v) => { if (!v && v !== 0) return '0.00'; return parseFloat(v).toLocaleString('zh-CN', { minimumFractionDigits: 2 }) }

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

      // 有新提醒时触发浏览器通知
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
  // 标记通知已读
  try { await markNotificationRead(row.id) } catch {}
  // 跳转到对应详情
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

// 从localStorage获取用户信息
const getUserInfo = () => {
  const storedUserInfo = localStorage.getItem('userInfo')
  if (storedUserInfo) {
    userInfo.value = JSON.parse(storedUserInfo)
  }
}

getUserInfo()
fetchReminders()
// 每5分钟刷新一次提醒
const reminderTimer = setInterval(fetchReminders, 2 * 60 * 1000)

// Ctrl+K 全局快捷键聚焦搜索框
const handleGlobalKeydown = (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
    e.preventDefault()
    const input = document.querySelector('.global-search-input input')
    if (input) input.focus()
  }
  if (e.key === 'Escape') {
    searchKeyword.value = ''
    const input = document.querySelector('.global-search-input input')
    if (input) input.blur()
  }
}
onMounted(() => document.addEventListener('keydown', handleGlobalKeydown))
onUnmounted(() => {
  clearInterval(reminderTimer)
  document.removeEventListener('keydown', handleGlobalKeydown)
})

// 切换菜单折叠
const toggleCollapse = () => {
  isCollapse.value = !isCollapse.value
}
</script>

<style scoped>
.layout-container {
  height: 100vh;
}

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

.header {
  background: rgba(255, 255, 255, 0.72);
  backdrop-filter: saturate(180%) blur(20px);
  -webkit-backdrop-filter: saturate(180%) blur(20px);
  border-bottom: 1px solid var(--color-border);
  box-shadow: none;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 24px;
}

.header-left {
  display: flex;
  align-items: center;
}

.global-search-input {
  width: 260px;
  margin-left: 16px;
}

.global-search-input :deep(.el-input__wrapper) {
  border-radius: 20px;
  background: var(--color-bg-secondary);
  border: 1px solid var(--color-border);
}

.search-shortcut-hint {
  font-size: 11px;
  color: var(--color-text-tertiary);
  background: var(--color-bg-secondary);
  padding: 2px 6px;
  border-radius: 4px;
  border: 1px solid var(--color-border);
  font-family: monospace;
  pointer-events: none;
}

.recent-visit-btn {
  margin-left: 8px;
  color: var(--color-text-secondary);
}

.recent-visit-btn:hover {
  color: var(--color-accent);
}

.recent-visit-item {
  display: flex;
  align-items: center;
  padding: 6px 4px;
  cursor: pointer;
  border-radius: var(--radius-sm);
  font-size: 13px;
}

.recent-visit-item:hover {
  background: var(--color-bg-secondary);
}

.recent-visit-name {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.recent-visit-time {
  color: var(--color-text-tertiary);
  font-size: 12px;
  margin-left: 8px;
  flex-shrink: 0;
}

.search-results {
  max-height: 400px;
  overflow-y: auto;
}

.search-hint {
  text-align: center;
  padding: 20px;
  color: var(--color-text-secondary);
  font-size: 13px;
}

.search-group {
  margin-bottom: 8px;
}

.search-group-title {
  font-size: 11px;
  font-weight: 600;
  color: var(--color-text-secondary);
  padding: 4px 8px;
  background: var(--color-bg-secondary);
  border-radius: var(--radius-sm);
  margin-bottom: 4px;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.search-item {
  padding: 8px 12px;
  cursor: pointer;
  border-radius: var(--radius-sm);
  display: flex;
  justify-content: space-between;
  align-items: center;
  transition: background 0.2s var(--ease-out);
}

.search-item:hover {
  background: var(--color-bg-secondary);
}

.search-item-name {
  font-size: 14px;
  color: var(--color-text);
}

.search-item-sub {
  font-size: 12px;
  color: var(--color-text-tertiary);
}

.collapse-btn {
  margin-right: 16px;
  color: var(--color-text-secondary);
}

.header-right {
  display: flex;
  align-items: center;
  gap: 4px;
}

.user-info {
  cursor: pointer;
  display: flex;
  align-items: center;
  color: var(--color-text-secondary);
  font-size: 14px;
  padding: 6px 12px;
  border-radius: var(--radius-sm);
  transition: background 0.2s var(--ease-out);
}

.user-info:hover {
  background: var(--color-bg-secondary);
}

.user-info .el-icon {
  margin-right: 8px;
}

.reminder-bell {
  margin-right: 12px;
  cursor: pointer;
}

.boss-dashboard-btn {
  margin-right: 12px;
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 14px;
  color: var(--color-accent);
}

.main-content {
  background: var(--color-bg-secondary);
  padding: 24px;
  overflow-y: auto;
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

.notify-panel { margin: -12px; }
.notify-tabs { display: flex; border-bottom: 1px solid #f0f0f0; padding: 0 12px; }
.notify-tab { padding: 10px 16px; cursor: pointer; font-size: 14px; color: #86868b; border-bottom: 2px solid transparent; transition: all 0.2s; }
.notify-tab.active { color: #1d1d1f; border-bottom-color: #0071e3; font-weight: 600; }
.notify-body { max-height: 400px; overflow-y: auto; padding: 8px 0; }
.notify-group-title { padding: 6px 16px; font-size: 12px; color: #86868b; font-weight: 600; }
.notify-item { display: flex; align-items: flex-start; gap: 10px; padding: 10px 16px; cursor: pointer; transition: background 0.15s; }
.notify-item:hover { background: #f5f5f7; }
.notify-item.read { opacity: 0.5; }
.notify-dot { width: 8px; height: 8px; border-radius: 50%; background: #0071e3; margin-top: 6px; flex-shrink: 0; }
.notify-dot.warn { background: #ff9500; }
.notify-dot.hide { background: transparent; }
.notify-content { flex: 1; min-width: 0; }
.notify-title { font-size: 13px; color: #1d1d1f; line-height: 1.4; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.notify-desc { font-size: 12px; color: #86868b; margin-top: 2px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.notify-time { font-size: 11px; color: #aeaeb2; margin-top: 2px; }
.notify-footer { display: flex; justify-content: space-between; padding: 8px 16px; border-top: 1px solid #f0f0f0; }
</style>
