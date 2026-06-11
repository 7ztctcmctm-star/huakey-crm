<template>
  <div class="page-container">
    <div class="page-header"><h2>对账管理</h2></div>

    <!-- 类型切换 -->
    <el-tabs v-model="activeType" @tab-change="handleTypeChange">
      <el-tab-pane label="客户对账" name="customer" />
      <el-tab-pane label="供应商对账" name="supplier" />
      <el-tab-pane label="历史对账单" name="history" />
    </el-tabs>

    <!-- 客户对账 -->
    <template v-if="activeType === 'customer'">
      <el-card shadow="never" class="search-card">
        <el-form inline>
          <el-form-item label="客户">
            <el-select v-model="custForm.customer_id" filterable placeholder="选择客户" style="width:240px">
              <el-option v-for="c in customerOptions" :key="c.id" :label="c.company_name" :value="c.id" />
            </el-select>
          </el-form-item>
          <el-form-item label="时间范围">
            <el-date-picker v-model="custForm.dateRange" type="daterange" start-placeholder="开始" end-placeholder="结束" value-format="YYYY-MM-DD" style="width:260px" />
          </el-form-item>
          <el-form-item><el-button type="primary" @click="fetchCustomerRecon">生成对账单</el-button></el-form-item>
        </el-form>
      </el-card>

      <template v-if="custData">
        <el-card shadow="never" style="margin-top:16px">
          <template #header><span class="card-title">客户信息</span></template>
          <el-descriptions :column="3" border size="small">
            <el-descriptions-item label="客户名称">{{ custData.customer.company_name }}</el-descriptions-item>
            <el-descriptions-item label="联系人">{{ custData.customer.contact_name || '-' }}</el-descriptions-item>
            <el-descriptions-item label="电话">{{ custData.customer.phone || '-' }}</el-descriptions-item>
          </el-descriptions>
        </el-card>

        <el-row :gutter="16" style="margin-top:16px">
          <el-col :span="16">
            <el-card shadow="never">
              <template #header><span class="card-title">合同明细</span></template>
              <el-table :data="custData.contracts" stripe size="small" border>
                <el-table-column prop="contract_no" label="合同编号" width="150" />
                <el-table-column prop="amount" label="合同金额" width="120" align="right">
                  <template #default="{ row }">¥{{ Number(row.amount).toLocaleString() }}</template>
                </el-table-column>
                <el-table-column prop="sign_date" label="签订日期" width="110" />
                <el-table-column prop="status" label="状态" width="80">
                  <template #default="{ row }"><el-tag size="small" :type="row.status===2?'success':'info'">{{ row.status===1?'执行中':'已完成' }}</el-tag></template>
                </el-table-column>
              </el-table>
            </el-card>
          </el-col>
          <el-col :span="8">
            <el-card shadow="never">
              <template #header><span class="card-title">汇总</span></template>
              <div class="summary-item"><span>合同总额</span><span class="summary-value">¥{{ Number(custData.summary.total_amount).toLocaleString() }}</span></div>
              <div class="summary-item"><span>已回款</span><span class="summary-value success">¥{{ Number(custData.summary.paid_amount).toLocaleString() }}</span></div>
              <div class="summary-item"><span>未回款</span><span class="summary-value danger">¥{{ Number(custData.summary.unpaid_amount).toLocaleString() }}</span></div>
              <el-button type="primary" style="width:100%;margin-top:16px" @click="handleSaveRecon('customer')">保存对账单</el-button>
              <el-button style="width:100%;margin-top:8px" @click="openEmailDialog('customer')">📧 发送邮件</el-button>
            </el-card>
          </el-col>
        </el-row>

        <el-card shadow="never" style="margin-top:16px">
          <template #header><span class="card-title">回款记录</span></template>
          <el-table :data="custData.payments" stripe size="small" border>
            <el-table-column prop="contract_no" label="合同编号" width="150" />
            <el-table-column prop="pay_amount" label="回款金额" width="120" align="right">
              <template #default="{ row }">¥{{ Number(row.pay_amount).toLocaleString() }}</template>
            </el-table-column>
            <el-table-column prop="pay_date" label="回款日期" width="110" />
            <el-table-column prop="pay_method" label="方式" width="100" />
          </el-table>
        </el-card>
      </template>
    </template>

    <!-- 供应商对账 -->
    <template v-if="activeType === 'supplier'">
      <el-card shadow="never" class="search-card">
        <el-form inline>
          <el-form-item label="供应商">
            <el-select v-model="suppForm.supplier_id" filterable placeholder="选择供应商" style="width:240px">
              <el-option v-for="s in supplierOptions" :key="s.id" :label="s.name" :value="s.id" />
            </el-select>
          </el-form-item>
          <el-form-item label="时间范围">
            <el-date-picker v-model="suppForm.dateRange" type="daterange" start-placeholder="开始" end-placeholder="结束" value-format="YYYY-MM-DD" style="width:260px" />
          </el-form-item>
          <el-form-item><el-button type="primary" @click="fetchSupplierRecon">生成对账单</el-button></el-form-item>
        </el-form>
      </el-card>

      <template v-if="suppData">
        <el-card shadow="never" style="margin-top:16px">
          <template #header><span class="card-title">供应商信息</span></template>
          <el-descriptions :column="3" border size="small">
            <el-descriptions-item label="供应商">{{ suppData.supplier.name }}</el-descriptions-item>
            <el-descriptions-item label="联系人">{{ suppData.supplier.contact_person || '-' }}</el-descriptions-item>
            <el-descriptions-item label="电话">{{ suppData.supplier.phone || '-' }}</el-descriptions-item>
          </el-descriptions>
        </el-card>

        <el-row :gutter="16" style="margin-top:16px">
          <el-col :span="16">
            <el-card shadow="never">
              <template #header><span class="card-title">采购单明细</span></template>
              <el-table :data="suppData.orders" stripe size="small" border>
                <el-table-column prop="order_no" label="采购单号" width="150" />
                <el-table-column prop="total_amount" label="金额" width="120" align="right">
                  <template #default="{ row }">¥{{ Number(row.total_amount).toLocaleString() }}</template>
                </el-table-column>
                <el-table-column prop="order_date" label="日期" width="110" />
                <el-table-column prop="status" label="状态" width="80" />
              </el-table>
            </el-card>
          </el-col>
          <el-col :span="8">
            <el-card shadow="never">
              <template #header><span class="card-title">汇总</span></template>
              <div class="summary-item"><span>采购总额</span><span class="summary-value">¥{{ Number(suppData.summary.total_amount).toLocaleString() }}</span></div>
              <div class="summary-item"><span>已付款</span><span class="summary-value success">¥{{ Number(suppData.summary.paid_amount).toLocaleString() }}</span></div>
              <div class="summary-item"><span>未付款</span><span class="summary-value danger">¥{{ Number(suppData.summary.unpaid_amount).toLocaleString() }}</span></div>
              <el-button type="primary" style="width:100%;margin-top:16px" @click="handleSaveRecon('supplier')">保存对账单</el-button>
              <el-button style="width:100%;margin-top:8px" @click="openEmailDialog('supplier')">📧 发送邮件</el-button>
            </el-card>
          </el-col>
        </el-row>
      </template>
    </template>

    <!-- 历史对账单 -->
    <template v-if="activeType === 'history'">
      <el-card shadow="never">
        <el-table :data="historyList" stripe border v-loading="historyLoading">
          <el-table-column prop="recon_no" label="对账单号" width="160" />
          <el-table-column prop="recon_type" label="类型" width="90" align="center">
            <template #default="{ row }"><el-tag size="small" :type="row.recon_type==='customer'?'primary':'success'">{{ row.recon_type==='customer'?'客户':'供应商' }}</el-tag></template>
          </el-table-column>
          <el-table-column prop="target_name" label="名称" min-width="160" show-overflow-tooltip />
          <el-table-column label="期间" width="200">
            <template #default="{ row }">{{ row.period_start }} ~ {{ row.period_end }}</template>
          </el-table-column>
          <el-table-column prop="total_amount" label="总额" width="120" align="right">
            <template #default="{ row }">¥{{ Number(row.total_amount).toLocaleString() }}</template>
          </el-table-column>
          <el-table-column prop="unpaid_amount" label="未付" width="120" align="right">
            <template #default="{ row }"><span style="color:#f56c6c">¥{{ Number(row.unpaid_amount).toLocaleString() }}</span></template>
          </el-table-column>
          <el-table-column prop="status" label="状态" width="80" align="center">
            <template #default="{ row }"><el-tag size="small" :type="row.status==='confirmed'?'success':row.status==='disputed'?'danger':'info'">{{ {draft:'草稿',confirmed:'已确认',disputed:'有异议'}[row.status] }}</el-tag></template>
          </el-table-column>
        </el-table>
      </el-card>
    </template>

    <!-- 邮件发送弹窗 -->
    <el-dialog v-model="emailVisible" title="发送对账单邮件" width="500px">
      <el-form :model="emailForm" label-width="80px">
        <el-form-item label="收件人">
          <el-input v-model="emailForm.to" placeholder="收件人邮箱" />
        </el-form-item>
        <el-form-item label="主题">
          <el-input v-model="emailForm.subject" placeholder="邮件主题" />
        </el-form-item>
        <el-form-item label="正文">
          <el-input v-model="emailForm.body" type="textarea" :rows="6" placeholder="邮件正文" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="emailVisible = false">取消</el-button>
        <el-button type="primary" :loading="emailSending" @click="sendEmail">发送</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import request from '@/utils/request'

const activeType = ref('customer')
const customerOptions = ref([])
const supplierOptions = ref([])

const custForm = reactive({ customer_id: null, dateRange: null })
const custData = ref(null)
const suppForm = reactive({ supplier_id: null, dateRange: null })
const suppData = ref(null)

const historyList = ref([])
const historyLoading = ref(false)

// 邮件发送
const emailVisible = ref(false)
const emailSending = ref(false)
const emailType = ref('customer')
const emailForm = reactive({ to: '', subject: '', body: '' })

const openEmailDialog = (type) => {
  emailType.value = type
  const data = type === 'customer' ? custData.value : suppData.value
  if (!data) return ElMessage.warning('请先查询对账数据')
  const targetName = type === 'customer' ? (data.customer?.company_name || '') : (data.supplier?.name || '')
  const now = new Date()
  emailForm.to = ''
  emailForm.subject = `${targetName}对账单 - ${now.getFullYear()}年${now.getMonth() + 1}月`
  emailForm.body = `您好，\n\n附件为${targetName}的对账单，请查收。\n\n汇总：\n- 总金额：¥${Number(data.summary?.total_amount || 0).toLocaleString()}\n- 已付：¥${Number(data.summary?.paid_amount || 0).toLocaleString()}\n- 未付：¥${Number(data.summary?.unpaid_amount || 0).toLocaleString()}\n\n如有疑问，请联系我们。`
  emailVisible.value = true
}

const sendEmail = async () => {
  if (!emailForm.to) return ElMessage.warning('请输入收件人邮箱')
  emailSending.value = true
  try {
    const res = await request.post('/integration/send-email', { to: emailForm.to, subject: emailForm.subject, body: emailForm.body })
    if (res.code === 200) { ElMessage.success('邮件发送成功'); emailVisible.value = false }
    else { ElMessage.error(res.message || '发送失败') }
  } catch { ElMessage.error('发送失败') }
  finally { emailSending.value = false }
}

const fetchOptions = async () => {
  try {
    const [cRes, sRes] = await Promise.all([
      request.post('/customer/list', { page: 1, pageSize: 200 }),
      request.post('/supplier/list', { page: 1, pageSize: 200 })
    ])
    if (cRes.code === 200) customerOptions.value = cRes.data.list
    if (sRes.code === 200) supplierOptions.value = sRes.data.list || sRes.data
  } catch (e) { /* */ }
}

const fetchCustomerRecon = async () => {
  if (!custForm.customer_id) { ElMessage.warning('请选择客户'); return }
  try {
    const params = { customer_id: custForm.customer_id }
    if (custForm.dateRange && custForm.dateRange.length === 2) { params.start_date = custForm.dateRange[0]; params.end_date = custForm.dateRange[1] }
    const res = await request.get('/finance/reconciliation/customer', { params })
    if (res.code === 200) custData.value = res.data
  } catch (e) { /* */ }
}

const fetchSupplierRecon = async () => {
  if (!suppForm.supplier_id) { ElMessage.warning('请选择供应商'); return }
  try {
    const params = { supplier_id: suppForm.supplier_id }
    if (suppForm.dateRange && suppForm.dateRange.length === 2) { params.start_date = suppForm.dateRange[0]; params.end_date = suppForm.dateRange[1] }
    const res = await request.get('/finance/reconciliation/supplier', { params })
    if (res.code === 200) suppData.value = res.data
  } catch (e) { /* */ }
}

const handleSaveRecon = async (type) => {
  const data = type === 'customer' ? custData.value : suppData.value
  if (!data) return
  const payload = {
    recon_type: type,
    target_id: type === 'customer' ? custData.value.customer.id : suppData.value.supplier.id,
    target_name: type === 'customer' ? custData.value.customer.company_name : suppData.value.supplier.name,
    period_start: type === 'customer' ? (custForm.dateRange?.[0] || null) : (suppForm.dateRange?.[0] || null),
    period_end: type === 'customer' ? (custForm.dateRange?.[1] || null) : (suppForm.dateRange?.[1] || null),
    total_amount: data.summary.total_amount,
    paid_amount: data.summary.paid_amount,
    unpaid_amount: data.summary.unpaid_amount
  }
  try {
    const res = await request.post('/finance/reconciliation/save', payload)
    if (res.code === 200) { ElMessage.success(`对账单 ${res.data.recon_no} 已保存`); fetchHistory() }
  } catch (e) { /* */ }
}

const fetchHistory = async () => {
  historyLoading.value = true
  try {
    const res = await request.get('/finance/reconciliation/list', { params: { page: 1, page_size: 50 } })
    if (res.code === 200) historyList.value = res.data.list
  } catch (e) { /* */ }
  finally { historyLoading.value = false }
}

const handleTypeChange = (val) => { if (val === 'history') fetchHistory() }

onMounted(() => { fetchOptions() })
</script>

<style scoped>
.page-container { padding: 0; }
.page-header { margin-bottom: var(--space-4); }
.page-header h2 { margin: 0; font-size: 28px; font-weight: 600; color: var(--color-text); }
.card-title { font-size: 15px; font-weight: 600; }
.search-card { margin-bottom: 0; }
.summary-item { display: flex; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid var(--color-border); font-size: 14px; }
.summary-item:last-of-type { border-bottom: none; }
.summary-value { font-weight: 600; }
.summary-value.success { color: #34c759; }
.summary-value.danger { color: #f56c6c; }
</style>
