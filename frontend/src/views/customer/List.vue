<template>
  <div class="customer-list">
    <!-- 搜索区域 -->
    <el-card class="search-card" shadow="never">
      <el-form :model="searchForm" inline @keyup.enter="handleSearch">
        <el-form-item label="公司名称">
          <el-input v-model="searchForm.company_name" placeholder="请输入公司名称" clearable />
        </el-form-item>
        <el-form-item label="联系人">
          <el-input v-model="searchForm.contact_name" placeholder="请输入联系人" clearable />
        </el-form-item>
        <el-form-item label="电话">
          <el-input v-model="searchForm.phone" placeholder="请输入电话" clearable />
        </el-form-item>
        <el-form-item label="客户来源">
          <el-select v-model="searchForm.source" placeholder="全部来源" clearable style="width: 160px">
            <template v-for="item in sourceSearchOptions" :key="item.value || item.label">
              <el-option-group v-if="item.options" :label="item.label">
                <el-option v-for="child in item.options" :key="child.value" :label="child.label" :value="child.value" />
              </el-option-group>
              <el-option v-else :label="item.label" :value="item.value" />
            </template>
          </el-select>
        </el-form-item>
        <el-form-item label="客户等级">
          <el-select v-model="searchForm.level" placeholder="请选择等级" clearable>
            <el-option v-for="item in levelOptions" :key="item.value" :label="item.label" :value="item.value" />
          </el-select>
        </el-form-item>
        <el-form-item label="状态">
          <el-select v-model="searchForm.status" placeholder="请选择状态" clearable>
            <el-option v-for="item in statusOptions" :key="item.value" :label="item.label" :value="item.value" />
          </el-select>
        </el-form-item>
        <el-form-item label="客户类型">
          <el-select v-model="searchForm.customer_type" placeholder="全部类型" clearable>
            <el-option label="潜客" value="prospect" />
            <el-option label="正式客户" value="customer" />
          </el-select>
        </el-form-item>
        <el-form-item label="生命周期">
          <el-select v-model="searchForm.lifecycle_status" placeholder="全部阶段" clearable>
            <el-option label="新导入" value="new" />
            <el-option label="培育中" value="nurturing" />
            <el-option label="意向合作" value="intent" />
            <el-option label="正在合作" value="active" />
            <el-option label="流失" value="lost" />
            <el-option label="无效" value="inactive" />
          </el-select>
        </el-form-item>
        <el-form-item label="标签">
          <el-select v-model="searchForm.tag_id" placeholder="全部标签" clearable style="width:140px" @change="handleSearch">
            <el-option v-for="t in tagOptions" :key="t.id" :label="t.name" :value="t.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="创建时间">
          <el-date-picker v-model="searchForm.dateRange" type="daterange" start-placeholder="开始日期" end-placeholder="结束日期" value-format="YYYY-MM-DD" style="width: 240px" />
        </el-form-item>
        <el-form-item label="排序">
          <el-select v-model="searchForm.sort" placeholder="默认排序" clearable style="width: 180px" @change="handleSearch">
            <el-option label="最后跟进 ↑ 久未跟进优先" value="last_follow_time_asc" />
            <el-option label="最后跟进 ↓ 最近跟进优先" value="last_follow_time_desc" />
            <el-option label="创建时间 ↓ 最新优先" value="create_time_desc" />
          </el-select>
        </el-form-item>
        <el-form-item>
          <el-button type="primary" :icon="Search" @click="handleSearch">搜索</el-button>
          <el-button :icon="Refresh" @click="handleReset">重置</el-button>
        </el-form-item>
      </el-form>
    </el-card>

    <!-- 逾期跟进提示 -->
    <el-alert
      v-if="overdueMode"
      title="当前显示逾期未跟进客户"
      type="warning"
      show-icon
      :closable="false"
      style="margin-bottom: 12px"
    >
      <template #default>
        超过 {{ overdueDays }} 天未跟进的客户。
        <el-button type="primary" link @click="clearOverdueFilter">查看全部客户</el-button>
      </template>
    </el-alert>

    <!-- 状态筛选 Tabs -->
    <el-card class="tab-card" shadow="never" style="margin-bottom: 12px;">
      <el-tabs v-model="activeTab" @tab-change="handleTabChange">
        <el-tab-pane label="全部" name="all" />
        <el-tab-pane label="线索" name="lead" />
        <el-tab-pane label="潜客" name="prospect" />
        <el-tab-pane label="正式客户" name="customer" />
        <el-tab-pane label="流失客户" name="lost" />
      </el-tabs>
    </el-card>

    <!-- 操作按钮区域 -->
    <el-card class="table-card" shadow="never">
      <div class="toolbar">
        <el-button type="primary" :icon="Plus" @click="handleAdd" v-permission="'customer:add'">新增客户</el-button>
        <el-button type="success" :icon="Upload" @click="openImport" v-permission="'customer:import'">导入Excel</el-button>
        <el-button type="warning" :icon="Download" :loading="exportLoading" @click="handleExport" v-permission="'customer:export'">导出Excel</el-button>
        <el-button :icon="DataAnalysis" @click="showQualityCheck = true" v-permission="'data_quality:check'">质量检查</el-button>
        <el-button
          type="success"
          :icon="ChatLineRound"
          :disabled="selectedRows.length === 0"
          @click="openBatchFollow"
          v-permission="'customer:edit'"
        >
          批量跟进 ({{ selectedRows.length }})
        </el-button>
        <el-divider direction="vertical" />
        <el-radio-group v-model="viewMode" @change="switchViewMode" size="default">
          <el-radio-button value="all">全部客户</el-radio-button>
          <el-radio-button value="mine">我的客户</el-radio-button>
          <el-radio-button v-if="isBoss || isManager" value="staff">{{ isManager ? '下属客户' : '职员客户' }}</el-radio-button>
        </el-radio-group>
        <template v-if="(isBoss || isManager) && viewMode === 'staff'">
          <el-select
            v-model="staffFilterId"
            placeholder="选择职员"
            size="default"
            style="width: 150px"
            @change="switchViewMode"
          >
            <el-option v-for="u in staffOptions" :key="u.id" :label="u.real_name" :value="u.id" />
          </el-select>
        </template>
        <template v-if="isBoss || isManager">
          <el-divider direction="vertical" />
          <el-select v-model="batchNewOwnerId" placeholder="批量更换负责人" size="default" style="width: 160px" clearable>
            <el-option value="" label="回收为待分配" />
            <el-option v-for="u in salesUsers" :key="u.id" :label="u.real_name" :value="u.id" />
          </el-select>
          <el-button type="warning" :disabled="selectedRows.length === 0"
            @click="handleBatchAssign"
            v-permission="'customer:assign'"
          >
            批量更换负责人 ({{ selectedRows.length }})
          </el-button>
        </template>
      </div>

      <!-- 批量操作提示条 -->
      <div v-if="selectedRows.length > 0" class="batch-bar">
        <el-icon><Select /></el-icon>
        <span>已选择 <strong>{{ selectedRows.length }}</strong> 项</span>
      </div>

      <!-- 表格 -->
      <el-table
        v-loading="loading"
        ref="tableRef"
        @selection-change="handleSelectionChange"
        :data="tableData"
        stripe border
        style="width: 100%"
        :row-class-name="rowClassName"
        :header-cell-style="{ background: 'var(--color-bg)', color: 'var(--color-text-secondary)' }"
      >
        <template #empty>
          <el-empty description="">
            <template v-if="viewMode === 'mine'">暂无负责的客户</template>
            <template v-else>暂无客户数据</template>
            <el-button type="primary" @click="handleAdd" v-permission="'customer:add'">新增第一个客户</el-button>
          </el-empty>
        </template>
        <el-table-column type="selection" width="50" />
        <el-table-column prop="company_name" label="公司名称" min-width="180" show-overflow-tooltip />
        <el-table-column prop="owner_name" label="负责人" width="110">
          <template #default="{ row }">
            <el-tag v-if="row.owner_name" type="success" size="small">{{ row.owner_name }}</el-tag>
            <el-tag v-else type="danger" size="small" effect="plain">待分配</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="contact_name" label="联系人" width="100" class-name="hide-mobile" />
        <el-table-column prop="phone" label="电话" width="130" class-name="hide-mobile">
          <template #default="{ row }">
            <a v-if="row.phone" :href="'tel:' + row.phone" style="color: var(--el-color-primary); text-decoration: none;">{{ row.phone }}</a>
            <span v-else>-</span>
          </template>
        </el-table-column>
        <el-table-column prop="source" label="客户来源" width="100" class-name="hide-mobile">
          <template #default="{ row }">
            <el-tag v-if="row.source">{{ row.source }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="level" label="客户等级" width="120" align="center">
          <template #default="{ row }">
            <el-tag
              :type="levelTagType(row.level)"
              :color="levelColor(row.level)"
              effect="dark"
              size="large"
              style="font-weight:bold;min-width:60px"
            >
              {{ levelLabel(row.level) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="status" label="状态" width="100" align="center">
          <template #default="{ row }">
            <el-tag :type="statusTagType(row.status)">
              {{ statusMap[row.status] || '未知' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="标签" width="160">
          <template #default="{ row }">
            <template v-if="row.tags && row.tags.length">
              <el-tag v-for="t in row.tags" :key="t.id" :color="t.color" size="small" effect="dark" style="margin: 1px 2px">{{ t.name }}</el-tag>
            </template>
            <span v-else style="color:#999;font-size:12px">-</span>
          </template>
        </el-table-column>
        <el-table-column label="最后跟进" width="150">
          <template #default="{ row }">
            <el-tooltip v-if="row.last_follow_time" :content="fullTime(row.last_follow_time)" placement="top">
              <span :style="{ color: isOverdue(row.last_follow_time) ? '#e85c5c' : '' }">
                {{ relativeTime(row.last_follow_time) }}
              </span>
            </el-tooltip>
            <el-tag v-else type="danger" size="small">从未跟进</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="create_time" label="创建时间" width="150">
          <template #default="{ row }">
            <el-tooltip :content="fullTime(row.create_time)" placement="top">
              <span>{{ relativeTime(row.create_time) }}</span>
            </el-tooltip>
          </template>
        </el-table-column>
        <el-table-column label="操作" :width="isProspectView && (isBoss || isManager) ? 350 : 260" fixed="right">
          <template #default="{ row }">
            <el-button type="success" size="small" :icon="ChatLineRound" @click="openQuickFollow(row)" v-permission="'customer:edit'">跟进</el-button>
            <el-button v-if="isBoss || isManager" type="warning" size="small" @click="openAssignDialog(row)" v-permission="'customer:assign'">分配</el-button>
            <!-- 潜客池：转为正式客户 -->
            <el-button v-if="isProspectView && (isBoss || isManager)" type="primary" size="small" @click="handleConvert(row, 'to_customer')">转为正式客户</el-button>
            <el-dropdown trigger="click" @command="(cmd) => handleMoreAction(cmd, row)">
              <el-button size="small">更多</el-button>
              <template #dropdown>
                <el-dropdown-menu>
                  <el-dropdown-item command="view">查看</el-dropdown-item>
                  <el-dropdown-item v-if="hasPermissionFromStorage('customer:edit')" command="edit">编辑</el-dropdown-item>
                  <!-- 客户列表：退回潜客池（仅boss/manager） -->
                  <el-dropdown-item v-if="!isProspectView && (isBoss || isManager)" command="to_prospect" divided :style="{ color: '#f97316' }">退回潜客池</el-dropdown-item>
                  <el-dropdown-item v-if="hasPermissionFromStorage('customer:delete')" command="delete" divided :style="{ color: 'var(--color-accent)' }">删除</el-dropdown-item>
                </el-dropdown-menu>
              </template>
            </el-dropdown>
          </template>
        </el-table-column>

    <!-- 转化确认弹窗 -->
    <el-dialog v-model="convertDialogVisible" :title="convertAction === 'to_customer' ? '转为正式客户' : '退回潜客池'" width="440px">
      <el-alert :title="convertAction === 'to_customer' ? '确认将以下潜客转为正式客户？' : '确认将以下客户退回潜客池？'" :type="convertAction === 'to_customer' ? 'success' : 'warning'" :description="convertAction === 'to_customer' ? '转化后该客户将出现在正式客户列表中，可联动后续业务流程（商机、合同、回款、售后）。' : '退回后该客户将回到潜客池，不再享有正式客户状态。'" show-icon :closable="false" style="margin-bottom:16px" />
      <p style="font-size:15px;font-weight:bold;text-align:center;padding:8px">{{ convertTarget?.company_name }}</p>
      <template #footer>
        <el-button @click="convertDialogVisible = false">取消</el-button>
        <el-button :type="convertAction === 'to_customer' ? 'primary' : 'warning'" @click="confirmConvert" :loading="convertLoading">确认{{ convertAction === 'to_customer' ? '转化' : '退回' }}</el-button>
      </template>
    </el-dialog>
      </el-table>

      <!-- 分页 -->
      <div class="pagination">
        <el-pagination
          v-model:current-page="searchForm.page"
          v-model:page-size="searchForm.pageSize"
          :page-sizes="[10, 20, 50, 100]"
          :total="total"
          layout="total, sizes, prev, pager, next, jumper"
          @size-change="handleSizeChange"
          @current-change="handlePageChange"
        />
      </div>
    </el-card>

    <!-- 新增/编辑弹窗 -->
    <el-dialog
      v-model="dialogVisible"
      :title="dialogTitle"
      width="600px"
      :close-on-click-modal="false"
      @closed="handleDialogClosed"
    >
      <el-form
        ref="formRef"
        :model="formData"
        :rules="formRules"
        label-width="100px"
      >
        <el-row :gutter="24">
          <el-col :span="24">
            <el-form-item label="公司名称" prop="company_name">
              <el-input v-model="formData.company_name" placeholder="请输入公司名称" />
            </el-form-item>
          </el-col>
        </el-row>
        <el-row :gutter="24">
          <el-col :span="12">
            <el-form-item label="联系人" prop="contact_name">
              <el-input v-model="formData.contact_name" placeholder="请输入联系人" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="电话" prop="phone">
              <el-input v-model="formData.phone" placeholder="请输入电话" />
            </el-form-item>
          </el-col>
        </el-row>
        <el-row :gutter="24">
          <el-col :span="12">
            <el-form-item label="邮箱" prop="email">
              <el-input v-model="formData.email" placeholder="请输入邮箱" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="所属行业" prop="industry">
              <el-input v-model="formData.industry" placeholder="请输入行业" />
            </el-form-item>
          </el-col>
        </el-row>
        <el-row :gutter="24">
          <el-col :span="12">
            <el-form-item label="客户来源" prop="source">
              <el-select v-model="formData.source" placeholder="请选择来源" filterable style="width: 100%">
                <el-option v-for="s in flatSourceOptions" :key="s.value" :label="s.label" :value="s.value" />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="客户等级" prop="level">
              <el-select v-model="formData.level" placeholder="请选择等级" style="width: 100%">
                <el-option v-for="item in levelOptions" :key="item.value" :label="item.label" :value="item.value" />
              </el-select>
            </el-form-item>
          </el-col>
        </el-row>
        <el-row v-if="isEdit" :gutter="24">
          <el-col :span="12">
            <el-form-item label="客户状态" prop="status">
              <el-select v-model="formData.status" placeholder="请选择状态" style="width: 100%">
                <el-option v-for="item in editStatusOptions" :key="item.value" :label="item.label" :value="item.value" />
              </el-select>
            </el-form-item>
          </el-col>
        </el-row>
        <el-row :gutter="24">
          <el-col :span="24">
            <el-form-item label="地址" prop="address">
              <el-input v-model="formData.address" placeholder="请输入地址" />
            </el-form-item>
          </el-col>
        </el-row>
        <el-row :gutter="24">
          <el-col :span="24">
            <el-form-item label="备注" prop="remark">
              <el-input v-model="formData.remark" type="textarea" :rows="3" placeholder="请输入备注" />
            </el-form-item>
          </el-col>
        </el-row>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="submitLoading" @click="handleSubmit">确定</el-button>
      </template>
    </el-dialog>

    <!-- 分配客户弹窗 -->
    <el-dialog v-model="assignDialogVisible" :title="assignUserId === '' ? '回收客户到待分配池' : '分配客户负责人'" width="420px">
      <div v-if="assignCustomer" style="margin-bottom:16px">
        <p><strong>客户：</strong>{{ assignCustomer.company_name }}</p>
        <p><strong>当前负责人：</strong>{{ assignCustomer.owner_name || '待分配（无负责人）' }}</p>
      </div>
      <el-form label-width="80px">
        <el-form-item label="新负责人">
          <el-select v-model="assignUserId" placeholder="请选择" clearable style="width:100%">
            <el-option value="" label="无负责人（回收待分配）" />
            <el-option v-for="u in salesUsers" :key="u.id" :label="u.real_name + ' (' + u.username + ')'" :value="u.id" />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="assignDialogVisible = false">取消</el-button>
        <el-button :type="assignUserId === '' ? 'warning' : 'primary'" :loading="assignLoading" @click="confirmAssign">
          {{ assignUserId === '' ? '确认回收' : '确认分配' }}
        </el-button>
      </template>
    </el-dialog>

    <!-- 导入Excel弹窗 -->
    <CustomerImport v-model="importVisible" @imported="finishImport" />

    <!-- 数据质量检查弹窗 -->
    <el-dialog v-model="showQualityCheck" title="数据质量检查" width="500px">
      <DataQualityCheck table="crm_customer" />
    </el-dialog>

    <!-- 快速跟进弹窗 -->
    <el-dialog v-model="quickFollowVisible" :title="'快速跟进 - ' + (quickFollowCustomer?.company_name || '')" width="480px" @closed="resetQuickFollow">
      <el-form ref="quickFollowFormRef" :model="quickFollowForm" :rules="quickFollowRules" label-width="90px">
        <el-form-item label="跟进方式">
          <el-select v-model="quickFollowForm.follow_type" style="width:100%">
            <el-option label="电话" value="电话" />
            <el-option label="微信" value="微信" />
            <el-option label="拜访" value="拜访" />
            <el-option label="邮件" value="邮件" />
            <el-option label="其他" value="其他" />
          </el-select>
        </el-form-item>
        <el-form-item label="跟进内容" prop="content">
          <el-input v-model="quickFollowForm.content" type="textarea" :rows="3" placeholder="请输入跟进内容" />
        </el-form-item>
        <el-form-item label="下次跟进">
          <el-date-picker v-model="quickFollowForm.next_time" type="datetime" placeholder="选择时间" style="width:100%" value-format="YYYY-MM-DD HH:mm:ss" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="quickFollowVisible = false">取消</el-button>
        <el-button type="primary" :loading="quickFollowLoading" @click="submitQuickFollow">提交</el-button>
      </template>
    </el-dialog>

    <!-- 批量跟进弹窗 -->
    <el-dialog v-model="batchFollowVisible" title="批量跟进" width="480px" @closed="resetBatchFollow">
      <div style="margin-bottom: 16px; color: var(--color-text-secondary); font-size: 13px">
        将对选中的 <strong style="color: var(--color-accent)">{{ selectedRows.length }}</strong> 个客户记录相同的跟进内容
      </div>
      <el-form ref="batchFollowFormRef" :model="batchFollowForm" :rules="batchFollowRules" label-width="90px">
        <el-form-item label="跟进方式">
          <el-select v-model="batchFollowForm.follow_type" style="width:100%">
            <el-option label="电话" value="电话" />
            <el-option label="微信" value="微信" />
            <el-option label="拜访" value="拜访" />
            <el-option label="邮件" value="邮件" />
            <el-option label="其他" value="其他" />
          </el-select>
        </el-form-item>
        <el-form-item label="跟进内容" prop="content">
          <el-input v-model="batchFollowForm.content" type="textarea" :rows="3" placeholder="请输入跟进内容（将应用于所有选中客户）" />
        </el-form-item>
        <el-form-item label="下次跟进">
          <el-date-picker v-model="batchFollowForm.next_time" type="datetime" placeholder="选择时间" style="width:100%" value-format="YYYY-MM-DD HH:mm:ss" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="batchFollowVisible = false">取消</el-button>
        <el-button type="primary" :loading="batchFollowLoading" @click="submitBatchFollow">提交</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Search, Refresh, Plus, View, Edit, Delete, Upload, Switch, Select, Download, DataAnalysis, ChatLineRound } from '@element-plus/icons-vue'
import CustomerImport from '@/components/CustomerImport.vue'
import DataQualityCheck from '@/components/DataQualityCheck.vue'
import request, { post, get } from '@/utils/request'
import { SOURCE_SEARCH_OPTIONS, SOURCE_FORM_OPTIONS, ALL_SOURCE_VALUES } from '@/constants/source'
import { relativeTime, fullTime } from '@/composables/useRelativeTime'
import { hasPermissionFromStorage } from '@/utils/permission'

const router = useRouter()
const route = useRoute()
const overdueMode = ref(route.query.overdue === 'true')

// 状态 Tab 筛选
const activeTab = ref(route.query.tab || 'all')
const handleTabChange = (tab) => {
  activeTab.value = tab
  searchForm.page = 1
  fetchList()
}

// 我的客户 / 全部客户 / 职员客户 切换
const viewMode = ref('all')
const staffFilterId = ref(null)
const switchViewMode = () => {
  searchForm.page = 1
  fetchList()
}

// 老板/经理权限
const isBoss = ref(false)
const isManager = ref(false)
const selectedRows = ref([])
const batchNewOwnerId = ref('')
const salesUsers = ref([])
const subordinateUsers = ref([])
const tableRef = ref(null)

try {
  const stored = localStorage.getItem('userInfo')
  if (stored) {
    const u = JSON.parse(stored)
    // 角色判断：roleId 1=老板 2=部门经理 3=普通销售
    isBoss.value = u.manageAll === true || u.roleId === 1
    isManager.value = u.roleId === 2
  }
} catch (e) { /* ignore */ }

// 职员选项：老板看全部销售，经理看全量下属
const staffOptions = computed(() => {
  return (isBoss.value || isManager.value) ? salesUsers.value : subordinateUsers.value
})

const fetchSalesUsers = async () => {
  if (!isBoss.value && !isManager.value) return
  try {
    const res = await get('/customer/sales-users')
    if (res.code === 200) salesUsers.value = res.data
  } catch (e) { /* ignore */ }
}

const fetchSubordinates = async () => {
  if (!isManager.value) return
  try {
    const res = await get('/customer/my-subordinates')
    if (res.code === 200) subordinateUsers.value = res.data
  } catch (e) { /* ignore */ }
}

const handleSelectionChange = (rows) => {
  selectedRows.value = rows
}

const handleBatchAssign = async () => {
  if (selectedRows.value.length === 0) return
  const isBatchRecycle = batchNewOwnerId.value === ''
  try {
    await ElMessageBox.confirm(
      isBatchRecycle
        ? `确定将选中的 ${selectedRows.value.length} 个客户回收为待分配？`
        : `确定将选中的 ${selectedRows.value.length} 个客户批量分配给新负责人？`,
      isBatchRecycle ? '批量回收确认' : '批量分配确认',
      { confirmButtonText: '确定分配', cancelButtonText: '取消', type: 'warning' }
    )
  } catch { return }

  try {
    const res = await post('/customer/batch-assign', {
      customer_ids: selectedRows.value.map(r => r.id),
      to_user_id: batchNewOwnerId.value || null,
      remark: '批量重新分配'
    })
    if (res.code === 200) {
      ElMessage.success(res.message)
      batchNewOwnerId.value = ''
      selectedRows.value = []
      fetchList()
    }
  } catch (e) {
    ElMessage.error('批量分配失败')
  }
}

// 快速分配弹窗
const assignDialogVisible = ref(false)
const assignCustomer = ref(null)
const assignUserId = ref('')
const assignLoading = ref(false)

const openAssignDialog = (row) => {
  assignCustomer.value = row
  assignUserId.value = row.owner_id || ''
  assignDialogVisible.value = true
}

const confirmAssign = async () => {
  const isRecycle = assignUserId.value === ''
  assignLoading.value = true
  try {
    const res = await post('/customer/assign', {
      customer_id: assignCustomer.value.id,
      to_user_id: assignUserId.value || null,
      remark: isRecycle ? '回收为待分配' : '手动分配'
    })
    if (res.code === 200) {
      ElMessage.success(res.message)
      assignDialogVisible.value = false
      fetchList()
    }
  } catch (e) {
    ElMessage.error(isRecycle ? '回收失败' : '分配失败')
  } finally {
    assignLoading.value = false
  }
}

// 搜索表单
// 视图模式：潜客池 vs 客户列表
const isProspectView = computed(() => route.path.includes('prospects'))

const searchForm = reactive({
  company_name: '',
  contact_name: '',
  phone: '',
  source: '',
  level: '',
  status: isProspectView.value ? 1 : '',  // 潜客池默认只显示潜在客户
  customer_type: isProspectView.value ? 'prospect' : '',  // 潜客池默认筛选潜客
  lifecycle_status: '',  // 生命周期筛选
  dateRange: [],
  sort: '',
  page: 1,
  pageSize: 20
})

// 选项数据
const sourceSearchOptions = SOURCE_SEARCH_OPTIONS
const sourceFormOptions = SOURCE_FORM_OPTIONS
const flatSourceOptions = ALL_SOURCE_VALUES.map(v => ({ label: v, value: v }))

const levelOptions = [
  { label: 'A级 - 重点客户', value: 'A' },
  { label: 'B级 - 意向客户', value: 'B' },
  { label: 'C级 - 潜在客户', value: 'C' },
  { label: 'D级 - 非意向客户', value: 'D' }
]

const statusOptions = [
  { label: '线索', value: 5 },
  { label: '潜客', value: 1 },
  { label: '正式客户', value: 2 },
  { label: '流失', value: 3 }
]

const editStatusOptions = [
  { label: '线索', value: 5 },
  { label: '潜客', value: 1 },
  { label: '正式客户', value: 2 },
  { label: '流失', value: 3 }
]

const statusMap = {
  0: '已删除',
  1: '潜客',
  2: '正式客户',
  3: '已流失',
  5: '线索'
}

// 标签
const tagOptions = ref([])
const fetchTags = async () => {
  try { const res = await request.get('/tag/list'); if (res.code === 200) tagOptions.value = res.data; } catch {}
}

// 表格数据
const tableData = ref([])
const total = ref(0)
const loading = ref(false)
const exportLoading = ref(false)

// 弹窗相关
const dialogVisible = ref(false)
const dialogTitle = ref('新增客户')
const isEdit = ref(false)
const submitLoading = ref(false)
const formRef = ref(null)
const currentId = ref(null)

const formData = reactive({
  company_name: '',
  contact_name: '',
  phone: '',
  email: '',
  industry: '',
  source: '',
  level: 'C',
  status: 1,
  address: '',
  remark: ''
})

const formRules = {
  company_name: [
    { required: true, message: '请输入公司名称', trigger: 'blur' }
  ]
}

// 等级标签类型
const levelTagType = (level) => {
  const map = { A: 'danger', B: 'warning', C: 'info', D: '' }
  return map[level] || 'info'
}

const levelLabel = (level) => {
  const map = { A: 'A级-重点', B: 'B级-意向', C: 'C级-潜在', D: 'D级-冷淡' }
  return map[level] || level || '-'
}

const levelColor = (level) => {
  const map = { A: 'var(--color-accent)', B: 'var(--color-accent)', C: 'var(--color-accent)', D: 'var(--color-text-tertiary)' }
  return map[level]
}

// 状态标签类型
const statusTagType = (status) => {
  const map = { 0: 'info', 1: 'warning', 2: 'success', 3: 'danger', 5: '' }
  return map[status] || 'info'
}

const overdueDays = ref(15)

const isOverdue = (time) => {
  if (!time) return true
  return (new Date() - new Date(time)) > overdueDays.value * 24 * 60 * 60 * 1000
}

const rowClassName = ({ row }) => {
  if (isOverdue(row.last_follow_time)) return 'overdue-row'
  return ''
}

// 获取客户列表
const fetchList = async () => {
  loading.value = true
  try {
    const params = {
      page: searchForm.page,
      pageSize: searchForm.pageSize
    }
    if (searchForm.company_name) params.company_name = searchForm.company_name
    if (searchForm.contact_name) params.contact_name = searchForm.contact_name
    if (searchForm.phone) params.phone = searchForm.phone
    if (searchForm.source) params.source = searchForm.source
    if (searchForm.level) params.level = searchForm.level
    if (searchForm.status !== '' && searchForm.status !== null) params.status = searchForm.status
    if (searchForm.customer_type) params.customer_type = searchForm.customer_type
    if (searchForm.lifecycle_status) params.lifecycle_status = searchForm.lifecycle_status
    if (searchForm.dateRange && searchForm.dateRange.length === 2) {
      params.start_date = searchForm.dateRange[0]
      params.end_date = searchForm.dateRange[1]
    }
    if (searchForm.sort) params.sort = searchForm.sort
    // 我的客户模式：只显示当前用户负责的客户
    if (viewMode.value === 'mine') {
      const stored = localStorage.getItem('userInfo')
      if (stored) params.owner_id = JSON.parse(stored).id
    }
    // 逾期跟进模式
    if (overdueMode.value) {
      params.overdue = true
    }
    // 职员客户模式：管理员查看指定职员的客户
    if (viewMode.value === 'staff' && staffFilterId.value) {
      params.owner_id = staffFilterId.value
    }

    // 状态 Tab 筛选
    if (activeTab.value === 'lead') {
      params.status = 5
    } else if (activeTab.value === 'prospect') {
      params.status = 1
    } else if (activeTab.value === 'customer') {
      params.status = 2
    } else if (activeTab.value === 'lost') {
      params.status = 3
    }

    const res = await post('/customer/list', params)
    if (res.code === 200) {
      tableData.value = res.data.list
      total.value = res.data.total
    }
  } catch (error) {
    ElMessage.error('加载客户列表失败'); console.error('获取客户列表失败:', error)
  } finally {
    loading.value = false
  }
}

// 搜索
const handleSearch = () => {
  searchForm.page = 1
  fetchList()
}

// 翻页/切换每页条数（不重置页码）
const handleSizeChange = () => {
  searchForm.page = 1
  fetchList()
}
const handlePageChange = () => {
  fetchList()
}

// 重置
const handleReset = () => {
  searchForm.company_name = ''
  searchForm.contact_name = ''
  searchForm.phone = ''
  searchForm.source = ''
  searchForm.level = ''
  searchForm.status = isProspectView.value ? 1 : ''  // 潜客池默认显示潜在客户
  searchForm.customer_type = isProspectView.value ? 'prospect' : ''
  searchForm.lifecycle_status = ''
  searchForm.dateRange = []
  searchForm.sort = ''
  searchForm.page = 1
  fetchList()
}

const clearOverdueFilter = () => {
  overdueMode.value = false
  router.replace({ path: '/customer/list' })
  fetchList()
}

// 新增
const handleAdd = () => {
  isEdit.value = false
  dialogTitle.value = '新增客户'
  currentId.value = null
  dialogVisible.value = true
}

// 编辑
const handleEdit = (row) => {
  isEdit.value = true
  dialogTitle.value = '编辑客户'
  currentId.value = row.id
  Object.assign(formData, {
    company_name: row.company_name || '',
    contact_name: row.contact_name || '',
    phone: row.phone || '',
    email: row.email || '',
    industry: row.industry || '',
    source: row.source || '',
    level: row.level || 'C',
    status: row.status || 1,
    address: row.address || '',
    remark: row.remark || ''
  })
  dialogVisible.value = true
}

// 查看
const handleView = (row) => {
  router.push(`/customer/detail/${row.id}`)
}

// P1-1: 更多操作下拉
const handleMoreAction = (command, row) => {
  if (command === 'view') handleView(row)
  else if (command === 'edit') handleEdit(row)
  else if (command === 'delete') handleDelete(row)
  else if (command === 'to_prospect') handleConvert(row, 'to_prospect')
}

// 潜客池⇄客户列表转化
const convertDialogVisible = ref(false)
const convertAction = ref('')
const convertTarget = ref(null)
const convertLoading = ref(false)

const handleConvert = (row, action) => {
  convertTarget.value = row
  convertAction.value = action
  convertDialogVisible.value = true
}

const confirmConvert = async () => {
  convertLoading.value = true
  try {
    const res = await request.post('/customer/convert', {
      customer_id: convertTarget.value.id,
      action: convertAction.value
    })
    if (res.code === 200) {
      ElMessage.success(res.message)
      convertDialogVisible.value = false
      fetchList()
    } else {
      ElMessage.error(res.message || '操作失败')
    }
  } catch (error) {
    ElMessage.error('转化失败：' + (error.response?.data?.message || error.message))
  } finally {
    convertLoading.value = false
  }
}

// 提交表单
const handleSubmit = async () => {
  if (!formRef.value) return

  await formRef.value.validate(async (valid) => {
    if (!valid) return

    submitLoading.value = true
    try {
      const data = {
        company_name: formData.company_name,
        contact_name: formData.contact_name,
        phone: formData.phone,
        email: formData.email,
        industry: formData.industry,
        source: formData.source,
        level: formData.level,
        address: formData.address,
        remark: formData.remark
      }

      let res
      if (isEdit.value) {
        data.id = currentId.value
        data.status = formData.status
        res = await post('/customer/update', data)
      } else {
        res = await post('/customer/add', data)
      }

      if (res.code === 200) {
        ElMessage.success(isEdit.value ? '修改成功' : '新增成功')
        dialogVisible.value = false
        fetchList()
      }
    } catch (error) {
      console.error('提交失败:', error)
    } finally {
      submitLoading.value = false
    }
  })
}

// 删除
const handleDelete = (row) => {
  ElMessageBox.confirm(
    `确定要删除客户"${row.company_name}"吗？删除后数据不可恢复。`,
    '删除确认',
    {
      confirmButtonText: '确定删除',
      cancelButtonText: '取消',
      type: 'warning'
    }
  ).then(async () => {
    try {
      const res = await post('/customer/delete', { id: row.id })
      if (res.code === 200) {
        ElMessage.success('删除成功')
        fetchList()
      }
    } catch (error) {
      console.error('删除失败:', error)
    }
  }).catch(() => {})
}

// 弹窗关闭时重置表单
const handleDialogClosed = () => {
  formRef.value?.resetFields()
  Object.assign(formData, {
    company_name: '',
    contact_name: '',
    phone: '',
    email: '',
    industry: '',
    source: '',
    level: 'C',
    status: 1,
    address: '',
    remark: ''
  })
}

// ========== Excel导入 ==========
const importVisible = ref(false)
const openImport = () => { importVisible.value = true }
const finishImport = () => { importVisible.value = false; fetchList() }
const showQualityCheck = ref(false)

// 快速跟进
const quickFollowVisible = ref(false)
const quickFollowCustomer = ref(null)
const quickFollowLoading = ref(false)
const quickFollowFormRef = ref(null)
const quickFollowForm = reactive({
  follow_type: '电话',
  content: '',
  next_time: null
})
const quickFollowRules = {
  content: [{ required: true, message: '请输入跟进内容', trigger: 'blur' }]
}

const openQuickFollow = (row) => {
  quickFollowCustomer.value = row
  quickFollowVisible.value = true
}

const resetQuickFollow = () => {
  quickFollowFormRef.value?.resetFields()
  quickFollowForm.follow_type = '电话'
  quickFollowForm.content = ''
  quickFollowForm.next_time = null
  quickFollowCustomer.value = null
}

const submitQuickFollow = async () => {
  if (!quickFollowFormRef.value) return
  await quickFollowFormRef.value.validate(async (valid) => {
    if (!valid) return
    quickFollowLoading.value = true
    try {
      const res = await post('/follow-up/add', {
        customer_id: quickFollowCustomer.value.id,
        follow_type: quickFollowForm.follow_type,
        content: quickFollowForm.content,
        next_time: quickFollowForm.next_time || null
      })
      if (res.code === 200) {
        ElMessage.success('跟进记录已保存')
        quickFollowVisible.value = false
        fetchList()
      }
    } catch (e) {
      ElMessage.error('提交失败')
    } finally {
      quickFollowLoading.value = false
    }
  })
}

// 批量跟进
const batchFollowVisible = ref(false)
const batchFollowLoading = ref(false)
const batchFollowFormRef = ref(null)
const batchFollowForm = reactive({
  follow_type: '电话',
  content: '',
  next_time: null
})
const batchFollowRules = {
  content: [{ required: true, message: '请输入跟进内容', trigger: 'blur' }]
}

const openBatchFollow = () => {
  if (selectedRows.value.length === 0) return
  batchFollowVisible.value = true
}

const resetBatchFollow = () => {
  batchFollowFormRef.value?.resetFields()
  batchFollowForm.follow_type = '电话'
  batchFollowForm.content = ''
  batchFollowForm.next_time = null
}

const submitBatchFollow = async () => {
  if (!batchFollowFormRef.value) return
  await batchFollowFormRef.value.validate(async (valid) => {
    if (!valid) return
    batchFollowLoading.value = true
    try {
      const items = selectedRows.value.map(row => ({
        customer_id: row.id,
        follow_type: batchFollowForm.follow_type,
        content: batchFollowForm.content,
        next_time: batchFollowForm.next_time || null
      }))
      const res = await post('/follow-up/batch-add', { items })
      if (res.code === 200) {
        ElMessage.success(res.message)
        batchFollowVisible.value = false
        selectedRows.value = []
        tableRef.value?.clearSelection()
        fetchList()
      }
    } catch (e) {
      ElMessage.error('批量跟进失败')
    } finally {
      batchFollowLoading.value = false
    }
  })
}

// 导出Excel
const handleExport = async () => {
  exportLoading.value = true
  try {
    const params = {}
    if (searchForm.company_name) params.company_name = searchForm.company_name
    if (searchForm.contact_name) params.contact_name = searchForm.contact_name
    if (searchForm.phone) params.phone = searchForm.phone
    if (searchForm.source) params.source = searchForm.source
    if (searchForm.level) params.level = searchForm.level
    if (searchForm.status !== '' && searchForm.status !== null) params.status = searchForm.status
    if (searchForm.customer_type) params.customer_type = searchForm.customer_type
    if (searchForm.lifecycle_status) params.lifecycle_status = searchForm.lifecycle_status
    if (viewMode.value === 'mine') {
      const stored = localStorage.getItem('userInfo')
      if (stored) params.owner_id = JSON.parse(stored).id
    }
    if (viewMode.value === 'staff' && staffFilterId.value) {
      params.owner_id = staffFilterId.value
    }
    const blob = await request.post('/customer/export', params, { responseType: 'blob' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = '客户列表.xlsx'
    a.click()
    URL.revokeObjectURL(url)
  } catch { ElMessage.error('导出失败') }
  finally { exportLoading.value = false }
}

onMounted(() => {
  fetchList()
  fetchSalesUsers()
  fetchSubordinates()
  fetchTags()
  fetchOverdueDays()
  // 首页快捷按钮带 ?action=add 时自动打开新增弹窗
  if (route.query.action === 'add') handleAdd()
})

const fetchOverdueDays = async () => {
  try {
    const res = await get('/config/overdue-days')
    if (res.code === 200) overdueDays.value = res.data.overdue_days
  } catch { /* 使用默认值 */ }
}
</script>

<style scoped>
.customer-list {
  padding: 0;
}

.search-card {
  margin-bottom: var(--space-4);
}

.search-card .el-form-item {
  margin-bottom: var(--space-2);
}

.table-card {
  min-height: 400px;
}

.toolbar {
  margin-bottom: var(--space-4);
  display: flex;
  align-items: center;
  gap: var(--space-3);
  flex-wrap: wrap;
}

.pagination {
  margin-top: var(--space-5);
  display: flex;
  justify-content: flex-end;
  padding: var(--space-4) 0;
}

:deep(.el-card__body) {
  padding: var(--space-5) var(--space-6);
}

:deep(.el-table) {
  border: none;
  border-radius: var(--radius-lg);
}

:deep(.el-table__header-wrapper th.el-table__cell) {
  background: var(--color-bg);
  color: var(--color-text-secondary);
  font-weight: 500;
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.02em;
  border-bottom: 1px solid var(--color-border-strong);
}

:deep(.el-table__body-wrapper td.el-table__cell) {
  height: 56px;
  border-bottom: 1px solid var(--color-border);
  color: var(--color-text);
}

:deep(.el-table__body tr:hover > td) {
  background: var(--color-bg-secondary);
}

:deep(.el-button--primary) {
  background: var(--color-accent);
  border-color: var(--color-accent);
}
</style>
