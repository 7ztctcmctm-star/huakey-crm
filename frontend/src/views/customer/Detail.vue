<template>
  <div class="customer-360">
    <!-- 顶部操作栏 -->
    <div class="detail-header">
      <el-button :icon="ArrowLeft" @click="goBack" text>返回列表</el-button>
      <div class="header-actions">
        <template v-if="(isBoss || isManager) && customer.owner_id">
          <el-select
            :model-value="customer.owner_id"
            placeholder="选择负责人"
            size="default"
            style="width: 150px; margin-right: 12px"
            @change="handleAssignOwner"
          >
            <el-option v-for="u in salesUsers" :key="u.id" :label="u.real_name" :value="u.id" />
          </el-select>
        </template>
        <el-button v-if="canForward(customer.status)" type="primary" :icon="ArrowRight" @click="handleForward">推进</el-button>
        <el-button v-if="canBackward(customer.status)" type="info" :icon="ArrowLeft" @click="openBackwardDialog">回退</el-button>
        <el-button type="primary" :icon="EditPen" @click="handleEdit">编辑</el-button>
        <el-button v-if="customer.owner_id && customer.pool_status === 0" :icon="Share" @click="handleRelease">释放公海</el-button>
      </div>
    </div>

    <!-- 顶部客户信息 -->
    <el-card class="hero-card" shadow="never" v-loading="loading">
      <div class="hero-content">
        <!-- 行动卡：下次跟进 / 逾期 / 快捷入口 -->
        <div class="action-card" v-if="customer.id">
          <div class="action-main">
            <div v-if="nextFollowTime" class="action-item">
              <el-icon><Clock /></el-icon>
              <span :class="{ 'text-danger': isNextFollowOverdue }">
                下次跟进: {{ formatTime(nextFollowTime) }}
                <span class="action-sub">({{ formatRelativeNextTime(nextFollowTime) }})</span>
              </span>
            </div>
            <div v-if="isFollowOverdue" class="action-item">
              <el-icon><Warning /></el-icon>
              <span class="text-danger">
                已逾期 {{ followOverdueDays }} 天未跟进
              </span>
            </div>
            <div v-else-if="customer.last_follow_time" class="action-item">
              <el-icon><Clock /></el-icon>
              <span>上次跟进: {{ formatRelativeTime(customer.last_follow_time) }}</span>
            </div>
            <div v-if="lastFollowSummary" class="action-summary">
              <span>最近: {{ lastFollowSummary }}</span>
            </div>
          </div>
          <el-button type="primary" size="small" :icon="EditPen" @click="openQuickFollow">
            立即跟进
          </el-button>
        </div>

        <div class="hero-left">
          <div class="hero-name">{{ customer.company_name }}</div>
          <div class="hero-contact">
            <span v-if="primaryContact.name"><el-icon><User /></el-icon> {{ primaryContact.name }}</span>
            <span v-if="primaryContact.phone"><el-icon><Phone /></el-icon> <a :href="'tel:' + primaryContact.phone">{{ primaryContact.phone }}</a></span>
            <span v-if="primaryContact.email"><el-icon><Message /></el-icon> {{ primaryContact.email }}</span>
          </div>
          <div class="hero-address" v-if="customer.address">
            <el-icon><Location /></el-icon> {{ customer.address }}
          </div>
          <div class="hero-tags">
            <el-tag v-if="customer.pool_status === 1" type="warning" effect="dark">公海客户</el-tag>
            <el-tag v-else-if="isProtected()" type="success">保护期至 {{ formatTime(customer.protect_until) }}</el-tag>
            <el-tag :type="levelTagType(customer.level)" effect="dark">{{ customer.level }}级客户</el-tag>
            <el-tag :type="statusTagType(customer.status)">{{ statusMap[customer.status] || customer.status }}</el-tag>
            <el-tag v-if="customer.score > 0" type="warning" effect="dark">评分 {{ customer.score }}</el-tag>
          </div>
        </div>
        <div class="hero-right">
          <el-button type="primary" :icon="ChatLineRound" @click="openQuickFollow" style="margin-bottom: 12px;">录入跟进</el-button>
          <div class="hero-meta">
            <div class="meta-item"><span class="meta-label">来源</span><span class="meta-value">{{ customer.source || '-' }}</span></div>
            <div class="meta-item"><span class="meta-label">行业</span><span class="meta-value">{{ customer.industry || '-' }}</span></div>
            <div class="meta-item"><span class="meta-label">负责人</span><span class="meta-value">{{ customer.owner_name || '-' }}</span></div>
            <div class="meta-item"><span class="meta-label">创建时间</span><span class="meta-value">{{ formatTime(customer.create_time) }}</span></div>
          </div>
        </div>
      </div>
    </el-card>

    <!-- 统计卡片 -->
    <div class="stats-row">
      <div class="stat-card" v-for="s in statCards" :key="s.key">
        <div class="stat-value">{{ s.value }}</div>
        <div class="stat-label">{{ s.label }}</div>
      </div>
    </div>

    <!-- 主内容区：标签页 -->
    <el-card class="tab-card" shadow="never">
      <el-tabs v-model="activeTab">
        <el-tab-pane label="跟进记录" name="follow">
          <div class="tab-toolbar">
            <el-button type="primary" :icon="Plus" @click="handleFollowAdd">新增跟进</el-button>
            <el-radio-group v-model="followFilter" size="small" style="margin-left: 12px;">
              <el-radio-button value="all">全部</el-radio-button>
              <el-radio-button value="followed">已跟进</el-radio-button>
              <el-radio-button value="pending">待跟进</el-radio-button>
            </el-radio-group>
          </div>
          <el-timeline v-if="filteredFollowRecords.length > 0">
            <el-timeline-item
              v-for="item in filteredFollowRecords"
              :key="item.id"
              :timestamp="formatTime(item.create_time)"
              placement="top"
              :color="followTypeColor(item.follow_type)"
            >
              <el-card shadow="hover" class="follow-card">
                <div class="follow-header">
                  <el-tag :type="followTypeTag(item.follow_type)" size="small">{{ item.follow_type || '电话' }}</el-tag>
                  <el-tag v-if="item.is_plan" type="warning" size="small">计划</el-tag>
                  <span v-if="item.contact_name" class="follow-contact"><el-icon><User /></el-icon> {{ item.contact_name }}</span>
                  <span class="follow-creator">{{ item.creator_name }}</span>
                  <span class="follow-actions">
                    <el-button type="primary" link size="small" :icon="Edit" @click="handleFollowEdit(item)">编辑</el-button>
                    <el-button type="danger" link size="small" :icon="Delete" @click="handleFollowDelete(item)">删除</el-button>
                  </span>
                </div>
                <div class="follow-content">{{ item.content }}</div>
                <div v-if="item.next_time" class="follow-next">
                  <el-icon><Clock /></el-icon> 下次跟进: {{ formatTime(item.next_time) }}
                  <span v-if="item.next_content"> — {{ item.next_content }}</span>
                </div>
                <div v-if="item.attachments && item.attachments.length > 0" class="follow-attachments">
                  <template v-for="att in item.attachments" :key="att.id">
                    <el-image v-if="isImage(att.file_type)" :src="att.file_path" :preview-src-list="getImageList(item)" fit="cover" style="width:80px;height:80px;margin:4px;border-radius:8px" />
                    <el-link v-else :href="att.file_path" target="_blank" type="primary" style="margin:4px">{{ att.file_name }}</el-link>
                  </template>
                </div>
              </el-card>
            </el-timeline-item>
          </el-timeline>
          <el-empty v-else description="暂无跟进记录" />
        </el-tab-pane>

        <el-tab-pane label="联系人" name="contact">
          <div class="tab-toolbar">
            <el-button type="primary" :icon="Plus" @click="handleContactAdd">新增联系人</el-button>
          </div>
          <el-table :data="contacts" stripe border>
            <el-table-column prop="name" label="姓名" width="100" />
            <el-table-column prop="position" label="职位" width="120" />
            <el-table-column prop="phone" label="电话" width="130">
              <template #default="{ row }">
                <a v-if="row.phone" :href="'tel:' + row.phone" style="color: var(--el-color-primary); text-decoration: none;">{{ row.phone }}</a>
                <span v-else>-</span>
              </template>
            </el-table-column>
            <el-table-column prop="email" label="邮箱" min-width="160" />
            <el-table-column prop="wechat" label="微信" width="120" />
            <el-table-column prop="is_decision" label="决策人" width="80" align="center">
              <template #default="{ row }">
                <el-tag :type="row.is_decision ? 'danger' : 'info'" size="small">{{ row.is_decision ? '是' : '否' }}</el-tag>
              </template>
            </el-table-column>
            <el-table-column label="操作" width="150" fixed="right">
              <template #default="{ row }">
                <el-button type="primary" link :icon="Edit" @click="handleContactEdit(row)">编辑</el-button>
                <el-button type="danger" link :icon="Delete" @click="handleContactDelete(row)">删除</el-button>
              </template>
            </el-table-column>
          </el-table>
        </el-tab-pane>

        <el-tab-pane label="报价记录" name="quote">
          <el-table :data="quoteList" stripe border v-loading="quoteLoading">
            <el-table-column prop="quote_no" label="报价单号" width="160" />
            <el-table-column prop="amount" label="报价金额" width="130" align="right">
              <template #default="{ row }">¥{{ fmtMoney(row.amount) }}</template>
            </el-table-column>
            <el-table-column prop="final_amount" label="成交金额" width="130" align="right">
              <template #default="{ row }">¥{{ fmtMoney(row.final_amount) }}</template>
            </el-table-column>
            <el-table-column prop="status" label="状态" width="90" align="center">
              <template #default="{ row }">
                <el-tag :type="quoteStatusType(row.status)" size="small">{{ quoteStatusMap[row.status] }}</el-tag>
              </template>
            </el-table-column>
            <el-table-column prop="create_by_name" label="创建人" width="100" />
            <el-table-column prop="create_time" label="创建时间" width="160">
              <template #default="{ row }">{{ formatTime(row.create_time) }}</template>
            </el-table-column>
          </el-table>
          <el-empty v-if="!quoteLoading && quoteList.length === 0" description="暂无报价记录" />
        </el-tab-pane>

        <el-tab-pane label="合同记录" name="contract">
          <el-table :data="contractList" stripe border v-loading="contractLoading">
            <el-table-column prop="contract_no" label="合同编号" width="160" />
            <el-table-column prop="amount" label="合同金额" width="130" align="right">
              <template #default="{ row }">¥{{ fmtMoney(row.amount) }}</template>
            </el-table-column>
            <el-table-column prop="paid_amount" label="已回款" width="130" align="right">
              <template #default="{ row }">¥{{ fmtMoney(row.paid_amount) }}</template>
            </el-table-column>
            <el-table-column prop="sign_date" label="签订日期" width="110" />
            <el-table-column prop="status" label="状态" width="90" align="center">
              <template #default="{ row }">
                <el-tag :type="contractStatusType(row.status)" size="small">{{ contractStatusMap[row.status] }}</el-tag>
              </template>
            </el-table-column>
            <el-table-column prop="create_by_name" label="创建人" width="100" />
          </el-table>
          <el-empty v-if="!contractLoading && contractList.length === 0" description="暂无合同记录" />
        </el-tab-pane>

        <el-tab-pane label="回款记录" name="payment">
          <el-table :data="paymentList" stripe border v-loading="paymentLoading">
            <el-table-column prop="contract_no" label="关联合同" width="160" />
            <el-table-column prop="pay_amount" label="回款金额" width="130" align="right">
              <template #default="{ row }">¥{{ fmtMoney(row.pay_amount) }}</template>
            </el-table-column>
            <el-table-column prop="pay_method" label="回款方式" width="120" />
            <el-table-column prop="pay_date" label="回款日期" width="120" />
            <el-table-column prop="remark" label="备注" min-width="160" show-overflow-tooltip />
          </el-table>
          <el-empty v-if="!paymentLoading && paymentList.length === 0" description="暂无回款记录" />
        </el-tab-pane>

        <el-tab-pane label="商机记录" name="opportunity">
          <div class="tab-toolbar">
            <el-button type="primary" :icon="Plus" @click="goCreateOpportunity">新增商机</el-button>
          </div>
          <el-table :data="opportunityList" stripe border v-loading="opportunityLoading">
            <el-table-column prop="name" label="商机名称" min-width="160" show-overflow-tooltip />
            <el-table-column prop="expected_amount" label="预期金额" width="130" align="right">
              <template #default="{ row }">¥{{ fmtMoney(row.expected_amount) }}</template>
            </el-table-column>
            <el-table-column prop="stage" label="阶段" width="110" align="center">
              <template #default="{ row }">
                <el-tag :type="stageTagType(row.stage)" size="small">{{ stageMap[row.stage] }}</el-tag>
              </template>
            </el-table-column>
            <el-table-column prop="win_rate" label="赢率" width="100" align="center">
              <template #default="{ row }">
                <el-progress v-if="row.win_rate != null" :percentage="row.win_rate" :stroke-width="14" :show-text="true" style="width:80px" />
                <span v-else>-</span>
              </template>
            </el-table-column>
            <el-table-column prop="owner_name" label="负责人" width="100" />
          </el-table>
          <el-empty v-if="!opportunityLoading && opportunityList.length === 0" description="暂无商机记录" />
        </el-tab-pane>

        <el-tab-pane label="销售漏斗" name="sales-funnel">
          <div v-if="opportunityList.length === 0" class="tab-toolbar">
            <el-empty description="暂无商机，无法展示销售漏斗" />
          </div>
          <div v-else>
            <div class="funnel-selector">
              <el-select v-model="selectedOppId" placeholder="选择商机查看时间轴" style="width: 300px" @change="onOppSelect">
                <el-option
                  v-for="opp in opportunityList"
                  :key="opp.id"
                  :label="opp.name + ' (' + stageMap[opp.stage] + ')'"
                  :value="opp.id"
                />
              </el-select>
            </div>
            <SalesTimeline v-if="selectedOppId" :opportunity-id="selectedOppId" />
          </div>
        </el-tab-pane>

        <el-tab-pane label="服务工单" name="service">
          <el-table :data="serviceList" stripe border v-loading="serviceLoading">
            <el-table-column prop="order_no" label="工单号" width="160" />
            <el-table-column prop="title" label="标题" min-width="160" show-overflow-tooltip />
            <el-table-column prop="type" label="类型" width="100" />
            <el-table-column prop="priority" label="优先级" width="90" align="center">
              <template #default="{ row }">
                <el-tag :type="priorityType(row.priority)" size="small">{{ priorityMap[row.priority] }}</el-tag>
              </template>
            </el-table-column>
            <el-table-column prop="status" label="状态" width="90" align="center">
              <template #default="{ row }">
                <el-tag :type="serviceStatusType(row.status)" size="small">{{ serviceStatusMap[row.status] }}</el-tag>
              </template>
            </el-table-column>
            <el-table-column prop="assignee_name" label="处理人" width="100" />
            <el-table-column prop="create_time" label="创建时间" width="160">
              <template #default="{ row }">{{ formatTime(row.create_time) }}</template>
            </el-table-column>
          </el-table>
          <el-empty v-if="!serviceLoading && serviceList.length === 0" description="暂无服务工单" />
        </el-tab-pane>

        <el-tab-pane label="评分记录" name="score">
          <div class="tab-toolbar">
            <el-button :icon="Refresh" :loading="scoreCalculating" @click="handleCalculateScore">重新计算评分</el-button>
          </div>
          <div v-if="customer.score > 0" class="score-summary">
            <span class="score-big">{{ customer.score }}</span>
            <span class="score-unit">分</span>
          </div>
          <el-table :data="scoreLogs" stripe border>
            <el-table-column prop="rule_name" label="评分规则" min-width="160" />
            <el-table-column prop="score" label="得分" width="80" align="center">
              <template #default="{ row }">
                <span :style="{ color: row.score > 0 ? '#67C23A' : '#F56C6C' }">{{ row.score > 0 ? '+' : '' }}{{ row.score }}</span>
              </template>
            </el-table-column>
            <el-table-column prop="total_score" label="总分" width="80" align="center" />
            <el-table-column prop="remark" label="备注" min-width="160" />
            <el-table-column prop="create_time" label="时间" width="160">
              <template #default="{ row }">{{ formatTime(row.create_time) }}</template>
            </el-table-column>
          </el-table>
          <el-empty v-if="scoreLogs.length === 0" description="暂无评分记录" />
        </el-tab-pane>

        <el-tab-pane label="邮件" name="email">
          <div class="tab-toolbar">
            <el-button type="primary" :icon="Message" @click="goComposeEmail">发送邮件</el-button>
          </div>
          <el-table :data="emailList" stripe border v-loading="emailLoading">
            <el-table-column prop="direction" label="方向" width="70" align="center">
              <template #default="{ row }">
                <el-tag :type="row.direction === 'in' ? 'success' : 'primary'" size="small">{{ row.direction === 'in' ? '收' : '发' }}</el-tag>
              </template>
            </el-table-column>
            <el-table-column prop="from_address" label="发件人" width="180" show-overflow-tooltip />
            <el-table-column prop="subject" label="主题" min-width="200" show-overflow-tooltip />
            <el-table-column prop="is_read" label="状态" width="70" align="center">
              <template #default="{ row }">
                <span v-if="!row.is_read" style="color:#409eff;font-weight:bold">●</span>
                <span v-else style="color:#c0c4cc">○</span>
              </template>
            </el-table-column>
            <el-table-column prop="created_at" label="时间" width="160">
              <template #default="{ row }">{{ formatTime(row.received_at || row.sent_at || row.created_at) }}</template>
            </el-table-column>
          </el-table>
          <el-empty v-if="emailList.length === 0 && !emailLoading" description="暂无关联邮件" />
        </el-tab-pane>
      </el-tabs>
    </el-card>

    <!-- 联系人弹窗 -->
    <el-dialog v-model="contactDialogVisible" :title="contactDialogTitle" width="500px" :close-on-click-modal="false" @closed="handleContactDialogClosed">
      <el-form ref="contactFormRef" :model="contactForm" :rules="contactRules" label-width="100px">
        <el-form-item label="姓名" prop="name">
          <el-input v-model="contactForm.name" placeholder="请输入姓名" />
        </el-form-item>
        <el-row :gutter="24">
          <el-col :span="12">
            <el-form-item label="职位">
              <el-input v-model="contactForm.position" placeholder="请输入职位" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="是否决策人">
              <el-switch v-model="contactForm.is_decision" :active-value="1" :inactive-value="0" />
            </el-form-item>
          </el-col>
        </el-row>
        <el-form-item label="是否主联系人">
          <el-switch v-model="contactForm.is_primary" :active-value="1" :inactive-value="0" />
          <span class="el-text el-text--info" style="margin-left: 8px; font-size: 12px">主联系人将显示在客户列表和详情顶部</span>
        </el-form-item>
        <el-form-item label="电话">
          <el-input v-model="contactForm.phone" placeholder="请输入电话" />
        </el-form-item>
        <el-form-item label="邮箱">
          <el-input v-model="contactForm.email" placeholder="请输入邮箱" />
        </el-form-item>
        <el-form-item label="微信">
          <el-input v-model="contactForm.wechat" placeholder="请输入微信" />
        </el-form-item>
        <el-form-item label="备注">
          <el-input v-model="contactForm.remark" type="textarea" :rows="2" placeholder="请输入备注" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="contactDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="contactSubmitLoading" @click="handleContactSubmit">确定</el-button>
      </template>
    </el-dialog>

    <!-- 跟进弹窗 -->
    <el-dialog v-model="followDialogVisible" :title="isFollowEdit ? '编辑跟进' : '新增跟进'" width="550px" :close-on-click-modal="false" @closed="handleFollowDialogClosed">
      <el-form ref="followFormRef" :model="followForm" :rules="followRules" label-width="100px">
        <el-form-item label="联系人">
          <el-select v-model="followForm.contact_id" placeholder="请选择联系人（可选）" clearable style="width: 100%">
            <el-option v-for="c in contacts" :key="c.id" :label="`${c.name}${c.is_decision ? ' (决策人)' : ''}`" :value="c.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="跟进方式" prop="follow_type">
          <el-radio-group v-model="followForm.follow_type">
            <el-radio-button v-for="t in followTypes" :key="t" :value="t">{{ t }}</el-radio-button>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="使用模板">
          <el-select v-model="selectedTemplateId" placeholder="选择模板自动填充内容" clearable style="width:100%" @change="handleTemplateChange">
            <el-option v-for="tpl in followTemplates" :key="tpl.id" :label="tpl.name" :value="tpl.id">
              <span>{{ tpl.name }}</span>
              <el-tag :type="typeTagMap[tpl.type]" size="small" style="margin-left:8px;">{{ typeNameMap[tpl.type] }}</el-tag>
            </el-option>
          </el-select>
        </el-form-item>
        <el-form-item label="跟进内容" prop="content">
          <div style="margin-bottom: 8px;">
            <el-button type="primary" link @click="scriptDialogVisible = true">📋 插入话术</el-button>
          </div>
          <el-input v-model="followForm.content" type="textarea" :rows="4" placeholder="请输入跟进内容" />
        </el-form-item>
        <el-form-item label="下次跟进时间">
          <el-date-picker v-model="followForm.next_time" type="datetime" placeholder="选择下次跟进时间（可选）" value-format="YYYY-MM-DD HH:mm:ss" style="width: 100%" />
        </el-form-item>
        <el-form-item label="下次计划">
          <el-input v-model="followForm.next_content" type="textarea" :rows="2" placeholder="下次跟进计划（可选）" />
        </el-form-item>
        <el-form-item label="附件">
          <el-upload
            ref="followUploadRef"
            :action="uploadUrl"
            with-credentials
            :data="{ business_type: 'follow_up' }"
            :on-success="handleFollowUploadSuccess"
            :on-remove="handleFollowUploadRemove"
            :on-error="handleFollowUploadError"
            :file-list="followUploadList"
            multiple
            :limit="9"
            accept="image/*,.pdf,.doc,.docx,.xls,.xlsx"
          >
            <el-button size="small" type="primary">选择文件</el-button>
            <template #tip><span class="el-upload__tip">支持图片、文档，最多9个</span></template>
          </el-upload>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="followDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="followSubmitLoading" @click="handleFollowSubmit">确定</el-button>
      </template>
    </el-dialog>

    <!-- 话术选择弹窗 -->
    <el-dialog v-model="scriptDialogVisible" title="选择话术" width="500px">
      <el-input v-model="scriptKeyword" placeholder="搜索话术标题/内容" clearable style="margin-bottom: 12px;" @input="fetchScripts" />
      <div style="margin-bottom: 12px; display: flex; gap: 6px; flex-wrap: wrap;">
        <el-tag v-for="s in scriptScenes" :key="s" :type="scriptScene === s ? '' : 'info'" style="cursor:pointer" @click="scriptScene = scriptScene === s ? '' : s; fetchScripts()">{{ s }}</el-tag>
      </div>
      <div v-loading="scriptLoading" style="max-height: 350px; overflow-y: auto;">
        <div v-for="item in scriptList" :key="item.id" class="script-card" @click="insertScript(item)">
          <div class="script-title">{{ item.title }}</div>
          <div class="script-preview">{{ (item.content || '').slice(0, 80) }}{{ (item.content || '').length > 80 ? '...' : '' }}</div>
          <div class="script-meta">使用 {{ item.usage_count || 0 }} 次 · {{ item.scene || '通用' }}</div>
        </div>
        <el-empty v-if="!scriptLoading && scriptList.length === 0" description="暂无话术" :image-size="48" />
      </div>
    </el-dialog>

    <!-- 编辑客户弹窗 -->
    <el-dialog v-model="editDialogVisible" title="编辑客户" width="600px" :close-on-click-modal="false" @closed="handleEditDialogClosed">
      <el-form ref="editFormRef" :model="editForm" :rules="editRules" label-width="100px">
        <el-form-item label="公司名称" prop="company_name">
          <el-input v-model="editForm.company_name" placeholder="请输入公司名称" />
        </el-form-item>
        <el-form-item label="联系人">
          <el-alert
            title="联系人信息已迁移至「联系人」标签页，请前往该标签页管理"
            type="info"
            :closable="false"
            show-icon
          />
        </el-form-item>
        <el-row :gutter="24">
          <el-col :span="12">
            <el-form-item label="所属行业">
              <el-input v-model="editForm.industry" placeholder="请输入行业" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="客户来源">
              <el-select v-model="editForm.source" placeholder="请选择来源" filterable style="width: 100%">
                <el-option v-for="s in sourceOptions" :key="s" :label="s" :value="s" />
              </el-select>
            </el-form-item>
          </el-col>
        </el-row>
        <el-row :gutter="24">
          <el-col :span="12">
            <el-form-item label="客户等级">
              <el-select v-model="editForm.level" placeholder="请选择等级" style="width: 100%">
                <el-option label="A级 - 重点客户" value="A" />
                <el-option label="B级 - 意向客户" value="B" />
                <el-option label="C级 - 潜在客户" value="C" />
                <el-option label="D级 - 一般客户" value="D" />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="客户状态">
              <el-select v-model="editForm.status" placeholder="请选择状态" style="width: 100%">
                <el-option label="公海客户" value="sea" />
                <el-option label="跟进中" value="following" />
                <el-option label="已报价" value="quoted" />
                <el-option label="谈判中" value="negotiating" />
                <el-option label="已签约" value="signed" />
                <el-option label="已流失" value="lost" />
                <el-option label="暂停跟进" value="paused" />
              </el-select>
            </el-form-item>
          </el-col>
        </el-row>
        <el-form-item label="地址">
          <el-input v-model="editForm.address" placeholder="请输入地址" />
        </el-form-item>
        <el-form-item label="备注">
          <el-input v-model="editForm.remark" type="textarea" :rows="3" placeholder="请输入备注" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="editDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="editSubmitLoading" @click="handleEditSubmit">确定</el-button>
      </template>
    </el-dialog>
  </div>

  <!-- 回退原因弹窗 -->
  <el-dialog v-model="backwardDialogVisible" title="回退客户状态" width="440px" :close-on-click-modal="false">
    <p style="font-size:15px;font-weight:bold;text-align:center;padding:8px">{{ customer.company_name }}</p>
    <el-form label-width="80px">
      <el-form-item label="回退原因" required>
        <el-input v-model="backwardReason" type="textarea" :rows="3" placeholder="请输入回退原因" />
      </el-form-item>
    </el-form>
    <template #footer>
      <el-button @click="backwardDialogVisible = false">取消</el-button>
      <el-button type="warning" @click="handleBackward" :loading="backwardLoading">确认回退</el-button>
    </template>
  </el-dialog>
</template>

<script setup>
import { ref, reactive, computed, onMounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { ArrowLeft, Plus, Edit, EditPen, Delete, User, Clock, Share, Refresh, Phone, Message, Location, ChatLineRound, ArrowRight, Warning } from '@element-plus/icons-vue'
import request from '@/utils/request'
import { getCustomer360, updateCustomer, assignCustomer, releaseCustomer, getSalesUsers, addContact, updateContact, deleteContact, calculateCustomerScore, forwardCustomer, backwardCustomer } from '@/api/customer'
import { addFollowUp, updateFollowUp, deleteFollowUp, getFollowupTemplates } from '@/api/customer'
import { getEmailList } from '@/api/tools'
import { getKnowledgeScripts } from '@/api/tools'
import { formatTime } from '@/composables/useFormat'
import { formatRelativeTime, formatRelativeNextTime } from '@/utils/time'
import { recordVisit } from '@/composables/useRecentVisit'
import { ALL_SOURCE_VALUES } from '@/constants/source'
import { useUser } from '@/composables/useUser'
import SalesTimeline from '@/components/customer/SalesTimeline.vue'

const route = useRoute()
const router = useRouter()
const loading = ref(false)

// 权限
const { userInfo } = useUser()
// 统一使用 manageAll/roleCode，禁止依赖固定数字 roleId
const isBoss = computed(() => userInfo.value?.manageAll === true)
// 部门经理 code 现为 'manager'（'admin' 为历史遗留 code，保留兼容）
const isManager = computed(() => ['manager', 'admin'].includes(userInfo.value?.roleCode || ''))
const salesUsers = ref([])

const fetchSalesUsers = async () => {
  if (!isBoss.value && !isManager.value) return
  try {
    const res = await getSalesUsers()
    if (res.code === 200) salesUsers.value = res.data
  } catch (e) { /* */ }
}

const handleAssignOwner = (newOwnerId) => {
  const target = salesUsers.value.find(u => u.id === newOwnerId)
  ElMessageBox.confirm(`确认将客户分配给「${target?.real_name || newOwnerId}」吗？`, '变更负责人', { type: 'warning' }).then(async () => {
    try {
      const res = await assignCustomer({ customer_id: customer.id, to_user_id: newOwnerId, remark: '手动重新分配' })
      if (res.code === 200) { ElMessage.success('负责人已更新'); fetchDetail() }
    } catch { ElMessage.error('分配失败') }
  }).catch(() => {})
}

const activeTab = ref('follow')

// 状态映射
const PIPELINE = ['sea', 'following', 'quoted', 'negotiating', 'signed']
const statusMap = {
  sea: '公海客户',
  following: '跟进中',
  quoted: '已报价',
  negotiating: '谈判中',
  signed: '已签约',
  lost: '已流失',
  paused: '暂停跟进'
}
const levelTagType = (l) => ({ A: 'danger', B: 'warning', C: 'info', D: '' }[l] || 'info')
const statusTagType = (s) => ({
  sea: 'info',
  following: 'warning',
  quoted: '',
  negotiating: 'primary',
  signed: 'success',
  lost: 'danger',
  paused: 'info'
}[s] || 'info')

const canForward = (status) => {
  const idx = PIPELINE.indexOf(status)
  return idx !== -1 && idx < PIPELINE.length - 1 && status !== 'lost' && status !== 'paused'
}

const canBackward = (status) => {
  const idx = PIPELINE.indexOf(status)
  return idx > 0 && status !== 'lost' && status !== 'paused'
}

// 客户数据
const customer = reactive({
  id: null, company_name: '', contact_name: '', phone: '', email: '', address: '',
  industry: '', source: '', level: '', status: '', customer_type: '', lifecycle_status: '',
  remark: '', owner_name: '', owner_id: null, create_time: '', update_time: '',
  pool_status: 0, protect_until: null, score: 0
})

// 各模块数据
const contacts = ref([])
const primaryContact = computed(() => {
  if (!contacts.value || contacts.value.length === 0) return { name: '', phone: '', email: '' }
  const primary = contacts.value.find(c => c.is_primary === 1)
  return primary || contacts.value[0]
})
const followRecords = ref([])
// 跟进筛选：全部 / 已跟进 / 待跟进（Prompt 4-2 合并后统一在跟进记录中区分计划与跟进）
const followFilter = ref('all')
const isPendingFollow = (item) => {
  if (item.is_plan === 1) return true
  if (item.next_time && new Date(item.next_time).getTime() > Date.now()) return true
  return false
}
const filteredFollowRecords = computed(() => {
  if (followFilter.value === 'all') return followRecords.value
  if (followFilter.value === 'pending') return followRecords.value.filter(isPendingFollow)
  return followRecords.value.filter(item => !isPendingFollow(item))
})
const quoteList = ref([])
const quoteLoading = ref(false)
const contractList = ref([])
const contractLoading = ref(false)
const paymentList = ref([])
const paymentLoading = ref(false)
const opportunityList = ref([])
const opportunityLoading = ref(false)
const serviceList = ref([])
const serviceLoading = ref(false)
const scoreLogs = ref([])
const scoreCalculating = ref(false)

// 邮件相关
const emailList = ref([])
const emailLoading = ref(false)

// 统计卡片
const stats = reactive({
  follow_count: 0, quote_amount: 0, contract_amount: 0,
  paid_amount: 0, opportunity_amount: 0, service_count: 0
})

const statCards = computed(() => [
  { key: 'follow', label: '跟进次数', value: stats.follow_count },
  { key: 'quote', label: '报价金额', value: '¥' + fmtMoney(stats.quote_amount) },
  { key: 'contract', label: '合同金额', value: '¥' + fmtMoney(stats.contract_amount) },
  { key: 'paid', label: '回款金额', value: '¥' + fmtMoney(stats.paid_amount) },
  { key: 'opportunity', label: '商机金额', value: '¥' + fmtMoney(stats.opportunity_amount) },
  { key: 'service', label: '工单数量', value: stats.service_count }
])

// 行动卡计算
const latestFollow = computed(() => followRecords.value && followRecords.value.length > 0 ? followRecords.value[0] : null)
const nextFollowTime = computed(() => latestFollow.value?.next_time || null)
const lastFollowSummary = computed(() => {
  const content = latestFollow.value?.content
  if (!content) return ''
  return content.length > 40 ? content.slice(0, 40) + '...' : content
})
const followOverdueDays = computed(() => {
  const base = customer.last_follow_time || customer.create_time
  if (!base) return 0
  const diff = Date.now() - new Date(base).getTime()
  return Math.max(0, Math.floor(diff / (24 * 60 * 60 * 1000)))
})
const isFollowOverdue = computed(() => followOverdueDays.value > 15)
const isNextFollowOverdue = computed(() => {
  const t = nextFollowTime.value
  if (!t) return false
  return new Date(t).getTime() < Date.now()
})

// 映射
const stageMap = { 1: '询盘', 2: '需求确认', 3: '方案报价', 4: '谈判', 5: '成交', 6: '失败' }
const stageTagType = (s) => ({ 1: 'info', 2: '', 3: 'warning', 4: '', 5: 'success', 6: 'danger' }[s] || 'info')
const contractStatusMap = { 1: '待执行', 2: '执行中', 3: '已完成', 4: '已取消' }
const contractStatusType = (s) => ({ 1: 'info', 2: '', 3: 'success', 4: 'danger' }[s] || 'info')
const quoteStatusMap = { 1: '草稿', 2: '已发送', 3: '已确认', 4: '已过期' }
const quoteStatusType = (s) => ({ 1: 'info', 2: '', 3: 'success', 4: 'danger' }[s] || 'info')
const priorityMap = { 1: '紧急', 2: '高', 3: '中', 4: '低' }
const priorityType = (p) => ({ 1: 'danger', 2: 'warning', 3: '', 4: 'info' }[p] || 'info')
const serviceStatusMap = { 1: '待分配', 2: '已分配', 3: '处理中', 4: '待确认', 5: '已完成' }
const serviceStatusType = (s) => ({ 1: 'warning', 2: 'info', 3: '', 4: 'warning', 5: 'success' }[s] || 'info')
const fmtMoney = (v) => { if (!v && v !== 0) return '0.00'; return parseFloat(v).toLocaleString('zh-CN', { minimumFractionDigits: 2 }) }

// 销售漏斗标签：选中商机的 timeline（Prompt 4-3-10）
const selectedOppId = ref(null)
const onOppSelect = () => {} // SalesTimeline 组件通过 watch 自动加载

// 获取360度数据
const fetchDetail = async () => {
  const id = route.params.id
  if (!id) { ElMessage.error('缺少客户ID'); goBack(); return }

  loading.value = true
  try {
    const res = await getCustomer360(id)
    if (res.code === 200) {
      const d = res.data
      Object.assign(customer, d.customer)
      contacts.value = d.contacts || []
      followRecords.value = d.followRecords || []
      quoteList.value = d.quotes || []
      contractList.value = d.contracts || []
      paymentList.value = d.payments || []
      opportunityList.value = d.opportunities || []
      serviceList.value = d.serviceOrders || []
      scoreLogs.value = d.scoreLogs || []
      if (d.stats) Object.assign(stats, d.stats)
      recordVisit('customer', parseInt(id), customer.company_name)
    }
  } catch (error) {
    console.error('获取客户360视图失败:', error)
  } finally {
    loading.value = false
  }
}

const goBack = () => router.push('/customer/list')
const goCreateOpportunity = () => {
  router.push({ path: '/opportunity', query: { customer_id: customer.id, customer_name: customer.company_name } })
}

const isProtected = () => customer.protect_until && new Date(customer.protect_until) > new Date()

const handleRelease = () => {
  ElMessageBox.confirm(`确定要将"${customer.company_name}"释放到公海吗？`, '释放确认', { type: 'warning' }).then(async () => {
    try {
      const res = await releaseCustomer(customer.id)
      if (res.code === 200) { ElMessage.success('已释放到公海'); fetchDetail() }
    } catch (e) { console.error('释放失败:', e) }
  }).catch(() => {})
}

const handleForward = async () => {
  try {
    const res = await forwardCustomer({ customer_id: customer.id })
    if (res.code === 200) {
      ElMessage.success(res.message)
      fetchDetail()
    } else {
      ElMessage.error(res.message || '推进失败')
    }
  } catch (error) {
    ElMessage.error('推进失败：' + (error.response?.data?.message || error.message))
  }
}

const backwardDialogVisible = ref(false)
const backwardReason = ref('')
const backwardLoading = ref(false)

const openBackwardDialog = () => {
  backwardReason.value = ''
  backwardDialogVisible.value = true
}

const handleBackward = async () => {
  if (!backwardReason.value.trim()) {
    ElMessage.warning('请输入回退原因')
    return
  }
  backwardLoading.value = true
  try {
    const res = await backwardCustomer({ customer_id: customer.id, reason: backwardReason.value })
    if (res.code === 200) {
      ElMessage.success(res.message)
      backwardDialogVisible.value = false
      fetchDetail()
    } else {
      ElMessage.error(res.message || '回退失败')
    }
  } catch (error) {
    ElMessage.error('回退失败：' + (error.response?.data?.message || error.message))
  } finally {
    backwardLoading.value = false
  }
}

// 评分计算
const handleCalculateScore = async () => {
  scoreCalculating.value = true
  try {
    const res = await calculateCustomerScore(customer.id)
    if (res.code === 200) {
      ElMessage.success(`评分计算完成：${res.data.score} 分`)
      fetchDetail()
    }
  } catch { ElMessage.error('评分计算失败') }
  finally { scoreCalculating.value = false }
}

// 邮件相关
const fetchEmails = async () => {
  emailLoading.value = true
  try {
    const res = await getEmailList({ customer_id: customer.id, page: 1, page_size: 50 })
    if (res.code === 200) emailList.value = res.data.list || []
  } catch {}
  finally { emailLoading.value = false }
}

const goComposeEmail = () => {
  router.push({ path: '/email/compose', query: { to: primaryContact.value.email, customer_id: customer.id } })
}

// ============ 编辑客户 ============
const sourceOptions = ALL_SOURCE_VALUES
const editDialogVisible = ref(false)
const editSubmitLoading = ref(false)
const editFormRef = ref(null)
const editForm = reactive({ company_name: '', industry: '', source: '', level: '', status: 'following', address: '', remark: '' })
const editRules = { company_name: [{ required: true, message: '请输入公司名称', trigger: 'blur' }] }

const handleEdit = () => {
  Object.assign(editForm, {
    company_name: customer.company_name || '',
    industry: customer.industry || '',
    source: customer.source || '', level: customer.level || 'C', status: customer.status || 'following',
    address: customer.address || '', remark: customer.remark || ''
  })
  editDialogVisible.value = true
}

const handleEditSubmit = async () => {
  if (!editFormRef.value) return
  await editFormRef.value.validate(async (valid) => {
    if (!valid) return
    editSubmitLoading.value = true
    try {
      const res = await updateCustomer({ id: customer.id, ...editForm })
      if (res.code === 200) { ElMessage.success('修改成功'); editDialogVisible.value = false; fetchDetail() }
    } catch { ElMessage.error('修改失败') }
    finally { editSubmitLoading.value = false }
  })
}

const handleEditDialogClosed = () => { editFormRef.value?.resetFields() }

// ============ 联系人管理 ============
const contactDialogVisible = ref(false)
const contactDialogTitle = ref('新增联系人')
const isContactEdit = ref(false)
const contactSubmitLoading = ref(false)
const contactFormRef = ref(null)
const contactEditId = ref(null)
const contactForm = reactive({ name: '', position: '', phone: '', email: '', wechat: '', is_decision: 0, is_primary: 0, remark: '' })
const contactRules = { name: [{ required: true, message: '请输入姓名', trigger: 'blur' }] }

const handleContactAdd = () => { isContactEdit.value = false; contactDialogTitle.value = '新增联系人'; contactEditId.value = null; contactDialogVisible.value = true }
const handleContactEdit = (row) => {
  isContactEdit.value = true; contactDialogTitle.value = '编辑联系人'; contactEditId.value = row.id
  Object.assign(contactForm, { name: row.name || '', position: row.position || '', phone: row.phone || '', email: row.email || '', wechat: row.wechat || '', is_decision: row.is_decision || 0, is_primary: row.is_primary || 0, remark: row.remark || '' })
  contactDialogVisible.value = true
}

const handleContactSubmit = async () => {
  if (!contactFormRef.value) return
  await contactFormRef.value.validate(async (valid) => {
    if (!valid) return
    contactSubmitLoading.value = true
    try {
      const data = { ...contactForm }
      let res
      if (isContactEdit.value) { data.id = contactEditId.value; res = await updateContact(data) }
      else { data.customer_id = customer.id; res = await addContact(data) }
      if (res.code === 200) { ElMessage.success(isContactEdit.value ? '修改成功' : '新增成功'); contactDialogVisible.value = false; fetchDetail() }
    } catch (error) { console.error('提交联系人失败:', error) }
    finally { contactSubmitLoading.value = false }
  })
}

const handleContactDelete = (row) => {
  ElMessageBox.confirm(`确定要删除联系人"${row.name}"吗？`, '删除确认', { type: 'warning' }).then(async () => {
    try {
      const res = await deleteContact(row.id)
      if (res.code === 200) { ElMessage.success('删除成功'); fetchDetail() }
    } catch (error) { console.error('删除联系人失败:', error) }
  }).catch(() => {})
}

const handleContactDialogClosed = () => {
  contactFormRef.value?.resetFields()
  Object.assign(contactForm, { name: '', position: '', phone: '', email: '', wechat: '', is_decision: 0, is_primary: 0, remark: '' })
}

// ============ 跟进管理 ============
const followTypes = ['电话', '拜访', '微信', '邮件', '其他']
const typeNameMap = { general: '通用', first: '首次跟进', quote: '报价跟进', deal: '成交跟进' }
const typeTagMap = { general: 'info', first: '', quote: 'warning', deal: 'success' }
const followTemplates = ref([])
const selectedTemplateId = ref(null)

const fetchTemplates = async () => {
  try { const res = await getFollowupTemplates(); if (res.code === 200) followTemplates.value = res.data } catch (e) { /* */ }
}
const handleTemplateChange = (templateId) => {
  if (!templateId) return
  const tpl = followTemplates.value.find(t => t.id === templateId)
  if (tpl) followForm.content = tpl.content
}

const followDialogVisible = ref(false)
const followSubmitLoading = ref(false)
const followFormRef = ref(null)
const isFollowEdit = ref(false)
const followEditId = ref(null)
const followForm = reactive({ contact_id: null, follow_type: '电话', content: '', next_time: '', next_content: '' })
const followRules = {
  follow_type: [{ required: true, message: '请选择跟进方式', trigger: 'change' }],
  content: [{ required: true, message: '请输入跟进内容', trigger: 'blur' }]
}
const followTypeTag = (type) => ({ '电话': 'warning', '拜访': '', '微信': 'success', '邮件': 'info', '其他': '' }[type] || '')
const followTypeColor = (type) => ({ '电话': 'var(--color-accent)', '拜访': 'var(--color-accent)', '微信': 'var(--color-accent)', '邮件': 'var(--color-text-tertiary)', '其他': '#B3B3B3' }[type] || 'var(--color-accent)')

const handleFollowAdd = () => {
  isFollowEdit.value = false; followEditId.value = null
  Object.assign(followForm, { contact_id: null, follow_type: '电话', content: '', next_time: '', next_content: '' })
  followUploadList.value = []; followAttachmentIds.value = []; selectedTemplateId.value = null
  fetchTemplates(); followDialogVisible.value = true
}

const openQuickFollow = () => { handleFollowAdd() }

// 话术选择
const scriptDialogVisible = ref(false)
const scriptKeyword = ref('')
const scriptScene = ref('')
const scriptLoading = ref(false)
const scriptList = ref([])
const scriptScenes = ['首次接触', '报价跟进', '异议处理', '成交促成', '售后维护']

const fetchScripts = async () => {
  scriptLoading.value = true
  try {
    const params = {}
    if (scriptKeyword.value) params.keyword = scriptKeyword.value
    if (scriptScene.value) params.scene = scriptScene.value
    const res = await getKnowledgeScripts(params)
    if (res.code === 200) scriptList.value = res.data || []
  } catch { /* */ }
  finally { scriptLoading.value = false }
}

const insertScript = (item) => {
  followForm.content = followForm.content ? followForm.content + '\n' + item.content : item.content
  scriptDialogVisible.value = false
  scriptKeyword.value = ''
  scriptScene.value = ''
}

watch(scriptDialogVisible, (v) => { if (v) fetchScripts() })

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || '/api/v1'
const uploadUrl = `${apiBaseUrl}/upload/file`
const followUploadRef = ref(null)
const followUploadList = ref([])
const followAttachmentIds = ref([])
const handleFollowUploadSuccess = (res) => { if (res.code === 200 && res.data) { res.data.forEach(item => { if (!followAttachmentIds.value.includes(item.id)) followAttachmentIds.value.push(item.id) }) } else { ElMessage.error(res.message || '上传失败') } }
const handleFollowUploadRemove = (file) => { const res = file.response; if (res && res.data) { res.data.forEach(item => { const idx = followAttachmentIds.value.indexOf(item.id); if (idx > -1) followAttachmentIds.value.splice(idx, 1) }) } }
const handleFollowUploadError = () => { ElMessage.error('文件上传失败') }
const isImage = (fileType) => fileType && fileType.startsWith('image/')
const getImageList = (item) => (item.attachments || []).filter(a => isImage(a.file_type)).map(a => a.file_path)

const handleFollowEdit = (item) => {
  isFollowEdit.value = true; followEditId.value = item.id
  Object.assign(followForm, { contact_id: item.contact_id || null, follow_type: item.follow_type || '电话', content: item.content || '', next_time: item.next_time ? formatTime(item.next_time) : '', next_content: item.next_content || '' })
  selectedTemplateId.value = null; fetchTemplates(); followDialogVisible.value = true
}

const handleFollowSubmit = async () => {
  if (!followFormRef.value) return
  await followFormRef.value.validate(async (valid) => {
    if (!valid) return
    followSubmitLoading.value = true
    try {
      let res
      if (isFollowEdit.value) {
        res = await updateFollowUp({ id: followEditId.value, ...followForm, next_time: followForm.next_time || null, next_content: followForm.next_content || null })
      } else {
        res = await addFollowUp({ customer_id: customer.id, ...followForm, next_time: followForm.next_time || null, next_content: followForm.next_content || null, attachment_ids: [...followAttachmentIds.value] })
      }
      if (res.code === 200) {
        ElMessage.success(isFollowEdit.value ? '修改成功' : '跟进记录添加成功')
        followDialogVisible.value = false
        fetchDetail()
        // 新增跟进且未设定下次跟进时间时，提醒设定
        if (!isFollowEdit.value && !followForm.next_time) {
          ElMessageBox.confirm('是否设定下次跟进时间？', '跟进提醒', {
            confirmButtonText: '设定', cancelButtonText: '跳过', type: 'info'
          }).then(() => {
            ElMessageBox.prompt('选择下次跟进时间', '设定跟进时间', {
              confirmButtonText: '确定', cancelButtonText: '取消', inputType: 'date', inputPlaceholder: '选择日期'
            }).then(async ({ value }) => {
              if (value) {
                await updateFollowUp({ id: res.data?.id, next_time: value + ' 09:00:00' })
                ElMessage.success('已设定下次跟进时间')
                fetchDetail()
              }
            }).catch(() => {})
          }).catch(() => {})
        }
      }
    } catch (error) { console.error('提交跟进记录失败:', error) }
    finally { followSubmitLoading.value = false }
  })
}

const handleFollowDelete = (item) => {
  ElMessageBox.confirm('确定要删除该跟进记录吗？', '删除确认', { type: 'warning' }).then(async () => {
    try { const res = await deleteFollowUp(item.id); if (res.code === 200) { ElMessage.success('删除成功'); fetchDetail() } }
    catch (error) { console.error('删除跟进记录失败:', error) }
  }).catch(() => {})
}

const handleFollowDialogClosed = () => {
  followFormRef.value?.resetFields(); isFollowEdit.value = false; followEditId.value = null
  Object.assign(followForm, { contact_id: null, follow_type: '电话', content: '', next_time: '', next_content: '' })
  followUploadList.value = []; followAttachmentIds.value = []
}

// 监听Tab切换，懒加载邮件数据
watch(activeTab, (tab) => {
  if (tab === 'email' && emailList.value.length === 0) fetchEmails()
})

onMounted(() => { fetchDetail(); fetchSalesUsers() })
</script>

<style scoped>
.customer-360 { padding: 0; }

.detail-header {
  display: flex; align-items: center; justify-content: space-between;
  margin-bottom: var(--space-4);
}
.header-actions { display: flex; align-items: center; }

/* Hero 卡片 */
.hero-card { margin-bottom: var(--space-4); }
.hero-content { display: flex; gap: var(--space-6); flex-wrap: wrap; }
.hero-left { flex: 1; }
.action-card { width: 100%; }

/* 行动卡 */
.action-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-4);
  padding: var(--space-3) var(--space-4);
  background: var(--color-bg);
  border-radius: 12px;
  border: 1px solid var(--color-border);
  margin-bottom: var(--space-3);
}
.action-main {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--space-4);
}
.action-item {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 14px;
  color: var(--color-text);
}
.action-item .el-icon {
  color: var(--color-text-secondary);
}
.action-sub {
  color: var(--color-text-secondary);
  font-size: 12px;
  margin-left: 4px;
}
.action-summary {
  font-size: 13px;
  color: var(--color-text-secondary);
  max-width: 320px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.text-danger {
  color: #e85c5c;
}
.text-danger .el-icon {
  color: #e85c5c;
}
.hero-right { flex-shrink: 0; }
.hero-name {
  font-size: 28px; font-weight: 700; color: var(--color-text);
  letter-spacing: -0.02em; margin-bottom: var(--space-2);
}
.hero-contact {
  display: flex; gap: var(--space-4); color: var(--color-text-secondary); font-size: 14px;
  margin-bottom: var(--space-1);
}
.hero-contact a { color: var(--color-accent); text-decoration: none; }
.hero-contact a:hover { text-decoration: underline; }
.hero-contact .el-icon { margin-right: 4px; vertical-align: middle; }
.hero-address {
  color: var(--color-text-tertiary); font-size: 13px; margin-bottom: var(--space-3);
}
.hero-address .el-icon { margin-right: 4px; }
.hero-tags { display: flex; flex-wrap: wrap; gap: 8px; }
.hero-meta { display: flex; flex-direction: column; gap: var(--space-2); min-width: 180px; }
.meta-item { display: flex; justify-content: space-between; font-size: 13px; }
.meta-label { color: var(--color-text-tertiary); }
.meta-value { color: var(--color-text); font-weight: 500; }

/* 统计卡片 */
.stats-row {
  display: grid; grid-template-columns: repeat(6, 1fr); gap: var(--space-3);
  margin-bottom: var(--space-4);
}
.stat-card {
  background: var(--color-bg-secondary); border-radius: 12px; padding: var(--space-4);
  text-align: center; transition: transform 0.2s;
}
.stat-card:hover { transform: translateY(-2px); }
.stat-value { font-size: 24px; font-weight: 700; color: var(--color-text); letter-spacing: -0.02em; }
.stat-label { font-size: 12px; color: var(--color-text-tertiary); margin-top: var(--space-1); }

/* Tab 区域 */
.tab-card { min-height: 400px; }
.tab-toolbar { margin-bottom: var(--space-4); }
.funnel-selector { margin-bottom: var(--space-4); }

/* 跟进卡片 */
.follow-card { margin-bottom: 0; }
.follow-header { display: flex; align-items: center; gap: 10px; margin-bottom: var(--space-2); }
.follow-actions { margin-left: auto; }
.follow-contact { color: var(--color-text-tertiary); font-size: 13px; display: flex; align-items: center; gap: 4px; }
.follow-creator { margin-left: auto; color: var(--color-text-tertiary); font-size: 12px; }
.follow-content { color: var(--color-text); line-height: 1.6; margin-bottom: var(--space-2); }
.follow-next {
  color: var(--color-accent); font-size: 13px; display: flex; align-items: center; gap: 4px;
  padding-top: var(--space-2); border-top: 1px dashed var(--color-border);
}
.follow-attachments { margin-top: var(--space-2); display: flex; flex-wrap: wrap; align-items: center; }

/* 评分 */
.score-summary { text-align: center; margin-bottom: var(--space-4); }
.score-big { font-size: 48px; font-weight: 800; color: var(--color-accent); }
.score-unit { font-size: 16px; color: var(--color-text-tertiary); margin-left: 4px; }

/* 响应式 */
@media (max-width: 1200px) {
  .stats-row { grid-template-columns: repeat(3, 1fr); }
  .hero-content { flex-direction: column; }
}
@media (max-width: 768px) {
  .stats-row { grid-template-columns: repeat(2, 1fr); }
}
.script-card { padding: 12px; border: 1px solid #f0f0f0; border-radius: 8px; margin-bottom: 8px; cursor: pointer; transition: all 0.2s; }
.script-card:hover { border-color: #0071e3; background: #f5f7fa; }
.script-title { font-weight: 600; font-size: 14px; margin-bottom: 4px; }
.script-preview { font-size: 12px; color: #86868b; line-height: 1.5; }
.script-meta { font-size: 11px; color: #aeaeb2; margin-top: 4px; }
</style>
