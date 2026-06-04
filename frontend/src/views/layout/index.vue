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
          <el-menu-item index="/leads" v-if="hasMenuPermission('leads')">线索导入</el-menu-item>
          <el-menu-item index="/customer/prospects" v-if="hasMenuPermission('customer:list')">
            <template #title>潜客池</template>
          </el-menu-item>
          <el-menu-item index="/customer/list" v-if="hasMenuPermission('customer:list')">正式客户</el-menu-item>
          <el-menu-item index="/customer/pool" v-if="hasMenuPermission('customer:pool')">公海池</el-menu-item>
          <el-menu-item index="/followup/calendar" v-if="hasMenuPermission('followup:calendar')">跟进日历</el-menu-item>
          <el-menu-item index="/followup/plan" v-if="hasMenuPermission('customer:list')">跟进计划</el-menu-item>
        </el-sub-menu>

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

        <el-menu-item index="/payment" v-if="hasMenuPermission('contract')">
          <el-icon><Money /></el-icon>
          <template #title>回款管理</template>
        </el-menu-item>

        <el-menu-item index="/supplier/list" v-if="hasMenuPermission('supplier')">
          <el-icon><OfficeBuilding /></el-icon>
          <template #title>供应商管理</template>
        </el-menu-item>

        <el-menu-item index="/purchase/list" v-if="hasMenuPermission('purchase')">
          <el-icon><ShoppingCart /></el-icon>
          <template #title>采购管理</template>
        </el-menu-item>

        <el-menu-item index="/service" v-if="hasMenuPermission('service')">
          <el-icon><Service /></el-icon>
          <template #title>售后服务</template>
        </el-menu-item>

        <el-menu-item index="/report" v-if="isAdmin && hasMenuPermission('report')">
          <el-icon><TrendCharts /></el-icon>
          <template #title>数据报表</template>
        </el-menu-item>

        <el-menu-item index="/analysis">
          <el-icon><DataAnalysis /></el-icon>
          <template #title>分析工具</template>
        </el-menu-item>

        <el-menu-item index="/ai-suggestions">
          <el-icon><ChatDotRound /></el-icon>
          <template #title>AI助手</template>
        </el-menu-item>

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
          <el-menu-item index="/system/integration">集成管理</el-menu-item>
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
          <el-popover
            placement="bottom-start"
            :width="420"
            trigger="manual"
            v-model:visible="searchVisible"
            popper-class="global-search-popover"
          >
            <template #reference>
              <el-input
                v-model="searchKeyword"
                placeholder="搜索客户、合同、商机..."
                :prefix-icon="Search"
                clearable
                class="global-search-input"
                @input="onSearchInput"
                @focus="onSearchFocus"
                @keydown.enter="doSearch"
              @blur="onSearchBlur"
              />
            </template>
            <div v-loading="searchLoading" class="search-results">
              <div v-if="searchKeyword.length < 2" class="search-hint">请输入至少2个字符</div>
              <template v-else>
                <div v-if="searchResults.customers.length > 0" class="search-group">
                  <div class="search-group-title">客户</div>
                  <div
                    v-for="item in searchResults.customers"
                    :key="'c' + item.id"
                    class="search-item"
                    @click="goTo('/customer/detail/' + item.id)"
                  >
                    <span class="search-item-name">{{ item.company_name }}</span>
                    <span class="search-item-sub">{{ item.contact_name }} {{ item.phone }}</span>
                  </div>
                </div>
                <div v-if="searchResults.contracts.length > 0" class="search-group">
                  <div class="search-group-title">合同</div>
                  <div
                    v-for="item in searchResults.contracts"
                    :key="'ct' + item.id"
                    class="search-item"
                    @click="goTo('/contract/detail/' + item.id)"
                  >
                    <span class="search-item-name">{{ item.contract_no }}</span>
                    <span class="search-item-sub">{{ item.customer_name }}</span>
                  </div>
                </div>
                <div v-if="searchResults.opportunities.length > 0" class="search-group">
                  <div class="search-group-title">商机</div>
                  <div
                    v-for="item in searchResults.opportunities"
                    :key="'o' + item.id"
                    class="search-item"
                    @click="goTo('/opportunity')"
                  >
                    <span class="search-item-name">{{ item.name }}</span>
                    <span class="search-item-sub">{{ item.customer_name }} · {{ item.stage_name }}</span>
                  </div>
                </div>
                <div v-if="searchResults.quotes.length > 0" class="search-group">
                  <div class="search-group-title">报价</div>
                  <div
                    v-for="item in searchResults.quotes"
                    :key="'q' + item.id"
                    class="search-item"
                    @click="goTo('/quotation/edit/' + item.id)"
                  >
                    <span class="search-item-name">{{ item.quote_no }}</span>
                    <span class="search-item-sub">{{ item.customer_name }}</span>
                  </div>
                </div>
                <div
                  v-if="searchResults.customers.length === 0 && searchResults.contracts.length === 0 && searchResults.opportunities.length === 0 && searchResults.quotes.length === 0"
                  class="search-hint"
                >未找到匹配结果</div>
              </template>
            </div>
          </el-popover>

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
              <el-tag size="small" :type="item.type === 'customer' ? '' : 'success'" style="margin-right:8px">{{ getVisitTypeLabel(item.type) }}</el-tag>
              <span class="recent-visit-name">{{ item.name }}</span>
              <span class="recent-visit-time">{{ relativeTime(item.time) }}</span>
            </div>
          </el-popover>
        </div>
        
        <div class="header-right">
          <!-- 逾期提醒铃铛 -->
          <el-badge :value="totalUnreadCount" :hidden="totalUnreadCount === 0" :max="99" class="reminder-bell">
            <el-button link @click="showReminderDialog = true; fetchPaymentOverdue()">
              <el-icon :size="20"><Bell /></el-icon>
            </el-button>
          </el-badge>

          <!-- 回收站 -->
          <el-button v-if="isAdmin" link class="recycle-btn" @click="showRecycleBin = true" v-permission="'recycle_bin:view'">
            <el-icon :size="18"><Delete /></el-icon>
          </el-button>

          <!-- 老板看板入口 -->
          <el-button v-if="isBoss" link class="boss-dashboard-btn" @click="$router.push('/team-dashboard')">
            <el-icon :size="18"><DataBoard /></el-icon>
            <span>团队看板</span>
          </el-button>

          <el-dropdown @command="handleCommand">
            <span class="user-info">
              <el-icon><User /></el-icon>
              {{ userInfo.realName || userInfo.username }}
              <el-icon><ArrowDown /></el-icon>
            </span>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item command="profile">个人中心</el-dropdown-item>
                <el-dropdown-item command="settings">系统设置</el-dropdown-item>
                <el-dropdown-item divided command="logout">退出登录</el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
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
        <el-button @click="showReminderDialog = false">关闭</el-button>
        <el-button type="primary" @click="markAllRemindersRead">全部已读</el-button>
      </template>
    </el-dialog>
  </el-container>
</template>

<script setup>
import { ref, computed, watch, onUnmounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import request from '@/utils/request'
import { useUser } from '@/composables/useUser'
import AiChat from '@/components/AiChat.vue'
import RecycleBin from '@/components/RecycleBin.vue'
import { formatTime } from '@/composables/useFormat'
import { getVisits, getVisitPath, getVisitTypeLabel } from '@/composables/useRecentVisit'
import { relativeTime } from '@/composables/useRelativeTime'
import {
  HomeFilled,
  UserFilled,
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
  User,
  ArrowDown,
  Bell,
  DataBoard,
  Delete,
  DataAnalysis,
  ChatDotRound,
  Search,
  Clock
} from '@element-plus/icons-vue'

const { clearUser } = useUser()
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

// 提醒相关
// 全局搜索
const searchKeyword = ref('')
const searchVisible = ref(false)
const searchLoading = ref(false)
const searchResults = ref({ customers: [], contracts: [], opportunities: [], quotes: [] })
let searchTimer = null

const doSearch = async () => {
  if (searchKeyword.value.trim().length < 2) {
    searchResults.value = { customers: [], contracts: [], opportunities: [], quotes: [] }
    return
  }
  searchLoading.value = true
  try {
    const res = await request.get('/search/global', { params: { keyword: searchKeyword.value.trim() } })
    if (res.code === 200) {
      searchResults.value = res.data
    }
  } catch { /* ignore */ }
  finally { searchLoading.value = false }
}

const onSearchInput = () => {
  searchVisible.value = searchKeyword.value.trim().length >= 1
  clearTimeout(searchTimer)
  searchTimer = setTimeout(doSearch, 500)
}

const onSearchFocus = () => {
  if (searchKeyword.value.trim().length >= 1) {
    searchVisible.value = true
  }
}

const onSearchBlur = () => {
  setTimeout(() => { searchVisible.value = false }, 200)
}

const goTo = (path) => {
  searchVisible.value = false
  searchKeyword.value = ''
  router.push(path)
}

const showReminderDialog = ref(false)
const showRecycleBin = ref(false)
const reminderTab = ref('follow')
const reminderList = ref([])
const todayList = ref([])
const upcomingList = ref([])
const unreadReminderCount = ref(0)
const urgeUnreadCount = ref(0)
const totalUnreadCount = computed(() => unreadReminderCount.value + urgeUnreadCount.value)
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
    const res = await request.get('/reminder/my-reminders')
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
    const res = await request.get('/reminder/payment-overdue')
    if (res.code === 200) {
      paymentOverdueList.value = res.data.list || []
      paymentUpcomingList.value = res.data.upcoming || []
    }
  } catch (e) { /* ignore */ }
  finally { paymentOverdueLoading.value = false }
}

const markAllRemindersRead = async () => {
  try {
    await request.post('/reminder/mark-all-read')
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
  try { await request.post('/reminder/notification-read', { notification_id: row.id }) } catch {}
  // 跳转到对应详情
  if (row.business_type === 'quote') {
    router.push(`/quotation?id=${row.business_id}`)
  } else if (row.business_type === 'contract') {
    router.push(`/contract/detail/${row.business_id}`)
  }
}

const goToUrgeCustomer = async (row) => {
  showReminderDialog.value = false
  try { await request.post('/reminder/notification-read', { notification_id: row.id }) } catch {}
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
  try { await request.post('/reminder/notification-read', { notification_id: row.id }) } catch {}
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
onUnmounted(() => clearInterval(reminderTimer))

// 切换菜单折叠
const toggleCollapse = () => {
  isCollapse.value = !isCollapse.value
}

// 处理下拉菜单命令
const handleCommand = (command) => {
  switch (command) {
    case 'profile':
      router.push('/profile')
      break
    case 'settings':
      router.push('/settings')
      break
    case 'logout':
      handleLogout()
      break
  }
}

// 退出登录
const handleLogout = () => {
  ElMessageBox.confirm('确定要退出登录吗？', '提示', {
    confirmButtonText: '确定',
    cancelButtonText: '取消',
    type: 'warning'
  }).then(async () => {
    try {
      await request.post('/auth/logout')
    } catch (e) { /* 即使后端请求失败也继续登出 */ }

    localStorage.removeItem('token')
    clearUser()

    ElMessage.success('退出登录成功')
    router.push('/login')
  }).catch(() => {})
}
</script>

<style scoped>
.layout-container {
  height: 100vh;
}

.sidebar {
  background: #1f2937;
}

.logo {
  height: 56px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 8px 12px;
  border-bottom: 1px solid rgba(255,255,255,0.06);
}

.logo-img {
  height: 32px;
  width: auto;
  flex-shrink: 0;
}

.logo-title {
  color: #fff;
  font-size: 14px;
  font-weight: 600;
  letter-spacing: -0.02em;
  white-space: nowrap;
}

.logo-icon {
  color: #fff;
  font-size: 18px;
  font-weight: 700;
}

.header {
  background: #fff;
  box-shadow: none;
  border-bottom: 1px solid rgba(60,60,67,0.08);
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
  background: var(--c-bg);
}

.recent-visit-btn {
  margin-left: 8px;
  color: var(--c-text-secondary);
}
.recent-visit-btn:hover {
  color: var(--c-primary);
}
.recent-visit-item {
  display: flex;
  align-items: center;
  padding: 6px 4px;
  cursor: pointer;
  border-radius: 4px;
  font-size: 13px;
}
.recent-visit-item:hover {
  background: var(--c-bg);
}
.recent-visit-name {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.recent-visit-time {
  color: var(--c-text-tertiary);
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
  color: #909399;
  font-size: 13px;
}

.search-group {
  margin-bottom: 8px;
}

.search-group-title {
  font-size: 12px;
  font-weight: 600;
  color: #909399;
  padding: 4px 8px;
  background: #f5f7fa;
  border-radius: 4px;
  margin-bottom: 4px;
}

.search-item {
  padding: 8px 12px;
  cursor: pointer;
  border-radius: 4px;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.search-item:hover {
  background: #f5f7fa;
}

.search-item-name {
  font-size: 14px;
  color: #303133;
}

.search-item-sub {
  font-size: 12px;
  color: #909399;
}

.collapse-btn {
  margin-right: 16px;
  color: var(--c-text-secondary);
}

.header-right {
  display: flex;
  align-items: center;
}

.user-info {
  cursor: pointer;
  display: flex;
  align-items: center;
  color: var(--c-text-secondary);
  font-size: 14px;
}

.user-info .el-icon {
  margin-right: 8px;
}

.reminder-bell {
  margin-right: 16px;
  cursor: pointer;
}
.boss-dashboard-btn {
  margin-right: 16px;
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 14px;
  color: #1a56db;
}
.main-content {
  background: #f8f9fb;
  padding: 24px;
  overflow-y: auto;
}

:deep(.el-menu) {
  border-right: none !important;
}

:deep(.el-menu-item),
:deep(.el-sub-menu__title) {
  border-radius: 8px;
  margin: 2px 8px;
}

:deep(.el-menu-item:hover),
:deep(.el-sub-menu__title:hover) {
  background: rgba(255,255,255,0.08) !important;
}

:deep(.el-menu-item.is-active) {
  background: rgba(255,255,255,0.14) !important;
  font-weight: 600;
}
</style>
