<template>
  <div class="purchase-list">
    <div class="page-header">
      <h2>采购管理</h2>
      <el-button type="primary" @click="handleAdd" v-permission="'purchase:add'">
        <el-icon><Plus /></el-icon>新建采购单
      </el-button>
    </div>

    <!-- 统计卡片 -->
    <el-row :gutter="16" class="stat-cards" v-if="stats">
      <el-col :span="4">
        <el-card shadow="hover" class="stat-card">
          <div class="stat-value">{{ stats.totalOrders }}</div>
          <div class="stat-label">采购单总数</div>
        </el-card>
      </el-col>
      <el-col :span="4">
        <el-card shadow="hover" class="stat-card warning">
          <div class="stat-value">{{ stats.pendingApprove }}</div>
          <div class="stat-label">待审核</div>
        </el-card>
      </el-col>
      <el-col :span="4">
        <el-card shadow="hover" class="stat-card info">
          <div class="stat-value">{{ stats.pendingReceive }}</div>
          <div class="stat-label">待收货</div>
        </el-card>
      </el-col>
      <el-col :span="4">
        <el-card shadow="hover" class="stat-card success">
          <div class="stat-value">{{ stats.completedThisMonth }}</div>
          <div class="stat-label">本月完成</div>
        </el-card>
      </el-col>
      <el-col :span="8">
        <el-card shadow="hover" class="stat-card">
          <div class="stat-value large">{{ formatMoney(stats.totalAmount) }}</div>
          <div class="stat-label">采购总金额(元)</div>
        </el-card>
      </el-col>
    </el-row>

    <div class="search-bar">
      <el-form :inline="true" :model="searchForm" @submit.prevent="handleSearch">
        <el-form-item label="关键词">
          <el-input v-model="searchForm.keyword" placeholder="单号/标题/供应商" clearable style="width: 200px" />
        </el-form-item>
        <el-form-item label="状态">
          <el-select v-model="searchForm.status" placeholder="全部状态" clearable style="width: 120px">
            <el-option label="草稿" value="草稿" />
            <el-option label="待审核" value="待审核" />
            <el-option label="已确认" value="已确认" />
            <el-option label="部分收货" value="部分收货" />
            <el-option label="已完成" value="已完成" />
            <el-option label="已取消" value="已取消" />
          </el-select>
        </el-form-item>
        <el-form-item label="类型">
          <el-select v-model="searchForm.type" placeholder="全部类型" clearable style="width: 100px">
            <el-option label="常规" value="常规" />
            <el-option label="紧急" value="紧急" />
            <el-option label="样品" value="样品" />
            <el-option label="返修" value="返修" />
          </el-select>
        </el-form-item>
        <el-form-item>
          <el-button type="primary" native-type="submit">查询</el-button>
          <el-button @click="resetSearch">重置</el-button>
        </el-form-item>
      </el-form>
    </div>

    <el-table :data="tableData" border stripe v-loading="loading" style="width: 100%">
      <el-table-column prop="order_no" label="采购单号" width="170" fixed>
        <template #default="{ row }">
          <el-link type="primary" @click="handleView(row.id)">{{ row.order_no }}</el-link>
        </template>
      </el-table-column>
      <el-table-column prop="title" label="采购标题" min-width="180" show-overflow-tooltip />
      <el-table-column prop="supplier_name" label="供应商" width="140" show-overflow-tooltip />
      <el-table-column prop="type" label="类型" width="80" align="center">
        <template #default="{ row }">
          <el-tag :type="getTypeTagType(row.type)" size="small">{{ row.type }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="total_amount" label="金额" width="120" align="right">
        <template #default="{ row }">
          <span>{{ formatMoney(row.total_amount) }}</span>
        </template>
      </el-table-column>
      <el-table-column prop="status" label="状态" width="100" align="center">
        <template #default="{ row }">
          <el-tag :type="getStatusType(row.status)" size="small">{{ row.status }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="approval_status" label="审批状态" width="100" align="center">
        <template #default="{ row }">
          <el-tag :type="approvalTagType(row.approval_status)" size="small">{{ approvalMap[row.approval_status] || '草稿' }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="expected_date" label="期望交期" width="110" align="center" />
      <el-table-column prop="owner_name" label="负责人" width="90" align="center" />
      <el-table-column prop="create_time" label="创建时间" width="160" align="center" />
      <el-table-column label="操作" width="200" fixed="right" align="center">
        <template #default="{ row }">
          <el-button link type="primary" size="small" @click="handleView(row.id)">详情</el-button>
          <el-dropdown v-if="row.status === '草稿' || row.status === '待审核'" trigger="click" @command="(cmd) => handleStatusChange(cmd, row)" v-permission="'purchase:edit'">
            <el-button link type="warning" size="small">状态<el-icon class="el-icon--right"><ArrowDown /></el-icon></el-button>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item v-if="row.status === '草稿'" command="待审核">提交审核</el-dropdown-item>
                <el-dropdown-item v-if="row.status === '待审核'" command="已确认">确认通过</el-dropdown-item>
                <el-dropdown-item command="已取消">取消订单</el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
          <el-button v-if="row.approval_status === 0 || !row.approval_status" link type="warning" size="small" @click="handleSubmitApproval(row)">提交审批</el-button>
          <el-button v-if="row.approval_status === 1" link type="info" size="small" @click="handleWithdrawApproval(row)">撤回</el-button>
        </template>
      </el-table-column>
    </el-table>

    <div class="pagination-wrapper">
      <el-pagination
        v-model:current-page="page"
        v-model:page-size="pageSize"
        :total="total"
        :page-sizes="[10, 20, 50]"
        layout="total, sizes, prev, pager, next"
        @size-change="fetchList"
        @current-change="fetchList"
      />
    </div>

    <!-- 新建采购单对话框 -->
    <el-dialog v-model="dialogVisible" title="新建采购单" width="900px" destroy-on-close @close="resetForm">
      <el-form ref="formRef" :model="form" :rules="formRules" label-width="100px">
        <el-row :gutter="24">
          <el-col :span="12">
            <el-form-item label="供应商" prop="supplier_id">
              <el-select v-model="form.supplier_id" placeholder="选择供应商" filterable style="width: 100%">
                <el-option v-for="s in supplierOptions" :key="s.id" :label="s.name" :value="s.id" />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="采购类型" prop="type">
              <el-select v-model="form.type" placeholder="请选择" style="width: 100%">
                <el-option label="常规" value="常规" />
                <el-option label="紧急" value="紧急" />
                <el-option label="样品" value="样品" />
                <el-option label="返修" value="返修" />
              </el-select>
            </el-form-item>
          </el-col>
        </el-row>

        <el-row :gutter="24">
          <el-col :span="16">
            <el-form-item label="采购标题" prop="title">
              <el-input v-model="form.title" placeholder="请输入采购标题" maxlength="100" show-word-limit />
            </el-form-item>
          </el-col>
          <el-col :span="8">
            <el-form-item label="期望交期">
              <el-date-picker v-model="form.expected_date" type="date" placeholder="选择日期" style="width: 100%" value-format="YYYY-MM-DD" />
            </el-form-item>
          </el-col>
        </el-row>

        <el-divider content-position="left">采购明细</el-divider>

        <el-table :data="form.items" border size="small" style="margin-bottom: 16px">
          <el-table-column label="产品名称" min-width="150">
            <template #default="{ row }">
              <el-input v-model="row.product_name" placeholder="产品名称" size="small" />
            </template>
          </el-table-column>
          <el-table-column label="规格型号" width="120">
            <template #default="{ row }">
              <el-input v-model="row.product_spec" placeholder="规格" size="small" />
            </template>
          </el-table-column>
          <el-table-column label="单位" width="70">
            <template #default="{ row }">
              <el-input v-model="row.unit" placeholder="个" size="small" />
            </template>
          </el-table-column>
          <el-table-column label="数量" width="90">
            <template #default="{ row }">
              <el-input-number v-model="row.quantity" :min="0.001" :precision="3" size="small" controls-position="right" style="width: 100%" />
            </template>
          </el-table-column>
          <el-table-column label="单价" width="110">
            <template #default="{ row }">
              <el-input-number v-model="row.unit_price" :min="0" :precision="4" size="small" controls-position="right" style="width: 100%" />
            </template>
          </el-table-column>
          <el-table-column label="小计" width="100" align="right">
            <template #default="{ row }">
              {{ calcItemAmount(row) }}
            </template>
          </el-table-column>
          <el-table-column label="" width="50" align="center">
            <template #default="{ $index }">
              <el-button link type="danger" size="small" @click="removeItem($index)">删除</el-button>
            </template>
          </el-table-column>
        </el-table>

        <el-button type="primary" plain size="small" @click="addItem">+ 添加明细</el-button>

        <el-divider />

        <el-row :gutter="24">
          <el-col :span="12">
            <el-form-item label="付款条件">
              <el-input v-model="form.payment_terms" placeholder="如：月结30天/预付50%" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="收货地址">
              <el-input v-model="form.delivery_address" placeholder="详细地址" />
            </el-form-item>
          </el-col>
        </el-row>

        <el-form-item label="备注">
          <el-input v-model="form.remark" type="textarea" :rows="2" maxlength="500" show-word-limit />
        </el-form-item>
      </el-form>

      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="submitLoading" @click="handleSubmit">创建采购单</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage, ElMessageBox } from 'element-plus';
import { Plus, ArrowDown } from '@element-plus/icons-vue';
import request from '@/utils/request';
import { getPurchaseList, addPurchase, updatePurchaseStatus, getPurchaseStatistics } from '@/api/product';
import { submitApproval, withdrawApproval } from '@/api/tools';
import { getSupplierOptions } from '@/api/product';

const router = useRouter();
const loading = ref(false);
const tableData = ref([]);
const total = ref(0);
const page = ref(1);
const pageSize = ref(10);
const stats = ref(null);
const supplierOptions = ref([]);

const searchForm = reactive({ keyword: '', status: '', type: '' });

const dialogVisible = ref(false);
const submitLoading = ref(false);
const formRef = ref(null);

const form = reactive({
  supplier_id: null,
  title: '',
  type: '常规',
  expected_date: '',
  payment_terms: '',
  delivery_address: '',
  remark: '',
  items: [{ product_name: '', product_spec: '', unit: '个', quantity: 1, unit_price: 0, discount_rate: 0 }]
});

const formRules = {
  supplier_id: [{ required: true, message: '请选择供应商', trigger: 'change' }],
  title: [{ required: true, message: '请输入采购标题', trigger: 'blur' }],
  type: [{ required: true, message: '请选择类型', trigger: 'change' }]
};

const formatMoney = (val) => val ? Number(val).toLocaleString('zh-CN', { minimumFractionDigits: 2 }) : '0.00';

const getTypeTagType = (type) => ({ '常规': '', '紧急': 'danger', '样品': 'warning', '返修': 'info' }[type] || '');
const getStatusType = (status) => ({ '草稿': 'info', '待审核': 'warning', '已确认': '', '部分收货': 'warning', '已完成': 'success', '已取消': 'danger' }[status] || '');
const approvalMap = { 0: '草稿', 1: '待审批', 2: '已通过', 3: '已拒绝' };
const approvalTagType = (s) => ({ 0: 'info', 1: 'warning', 2: 'success', 3: 'danger' }[s] || 'info');

const calcItemAmount = (item) => {
  const amount = (item.quantity || 0) * (item.unit_price || 0);
  return amount.toFixed(2);
};

const addItem = () => {
  form.items.push({ product_name: '', product_spec: '', unit: '个', quantity: 1, unit_price: 0, discount_rate: 0 });
};

const removeItem = (index) => {
  if (form.items.length > 1) form.items.splice(index, 1);
};

const fetchStats = async () => {
  try {
    const res = await getPurchaseStatistics();
    if (res.code === 200) stats.value = res.data;
  } catch (e) { console.error(e); }
};

const fetchSupplierOptions = async () => {
  try {
    const res = await getSupplierOptions();
    if (res.code === 200) supplierOptions.value = res.data;
  } catch (e) { console.error(e); }
};

const fetchList = async () => {
  loading.value = true;
  try {
    const res = await getPurchaseList({ page: page.value, pageSize: pageSize.value, ...searchForm });
    if (res.code === 200) { tableData.value = res.data.list; total.value = res.data.total; }
  } catch (error) { console.error(error); }
  finally { loading.value = false; }
};

const resetForm = () => {
  Object.assign(form, { supplier_id: null, title: '', type: '常规', expected_date: '', payment_terms: '', delivery_address: '', remark: '', items: [{ product_name: '', product_spec: '', unit: '个', quantity: 1, unit_price: 0 }] });
};

const handleAdd = () => { resetForm(); dialogVisible.value = true; };

const handleSubmit = async () => {
  await formRef.value.validate(async (valid) => {
    if (!valid) return;
    submitLoading.value = true;
    try {
      const res = await addPurchase(form);
      if (res.code === 200) { ElMessage.success('创建成功'); dialogVisible.value = false; fetchList(); fetchStats(); }
    } catch (e) { console.error(e); }
    finally { submitLoading.value = false; }
  });
};

const handleStatusChange = async (command, row) => {
  try {
    await ElMessageBox.confirm(`确定将状态改为「${command}」吗？`, '确认', { confirmButtonText: '确定', cancelButtonText: '取消', type: 'warning' });
    const res = await updatePurchaseStatus({ id: row.id, status: command });
    if (res.code === 200) { ElMessage.success('更新成功'); fetchList(); fetchStats(); }
  } catch (e) { if (e !== 'cancel') console.error(e); }
};

const handleView = (id) => { router.push(`/purchase/detail/${id}`); };
const handleSearch = () => { page.value = 1; fetchList(); };
const resetSearch = () => { Object.assign(searchForm, { keyword: '', status: '', type: '' }); handleSearch(); };

// 提交审批
const handleSubmitApproval = (row) => {
  ElMessageBox.confirm(`确定提交采购单"${row.order_no}"进行审批？`, '提交审批', {
    confirmButtonText: '确定提交', cancelButtonText: '取消', type: 'info'
  }).then(async () => {
    try {
      const res = await submitApproval({ business_type: 'purchase', business_id: row.id })
      if (res.code === 200) { ElMessage.success('已提交审批'); fetchList() }
    } catch (error) { console.error('提交审批失败:', error) }
  }).catch(() => {})
}

// 撤回审批
const handleWithdrawApproval = (row) => {
  ElMessageBox.confirm(`确定撤回采购单"${row.order_no}"的审批？`, '撤回审批', {
    confirmButtonText: '确定撤回', cancelButtonText: '取消', type: 'warning'
  }).then(async () => {
    try {
      const res = await withdrawApproval('purchase', row.id)
      if (res.code === 200) { ElMessage.success('审批已撤回'); fetchList() }
    } catch (error) { console.error('撤回审批失败:', error) }
  }).catch(() => {})
}

onMounted(() => { fetchList(); fetchStats(); fetchSupplierOptions(); });
</script>

<style scoped>
.purchase-list { padding: 0; }
.page-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: var(--space-5); }
.page-header h2 { margin: 0; font-size: 28px; font-weight: 600; color: var(--color-text); letter-spacing: -0.02em; }
.stat-cards { margin-bottom: var(--space-4); }
.stat-card { text-align: center; }
.stat-card .stat-value { font-size: 28px; font-weight: 700; color: var(--color-text); }
.stat-card .stat-value.large { font-size: 24px; }
.stat-card.warning .stat-value { color: var(--color-warning); }
.stat-card.info .stat-value { color: var(--color-text-tertiary); }
.stat-card.success .stat-value { color: var(--color-success); }
.stat-label { font-size: 13px; color: var(--color-text-tertiary); margin-top: var(--space-1); }
.search-bar { background: var(--color-bg); border: 1px solid var(--color-border); border-radius: var(--radius-lg); box-shadow: var(--shadow-sm); padding: var(--space-4) var(--space-5); margin-bottom: var(--space-4); }
.pagination-wrapper { margin-top: var(--space-5); display: flex; justify-content: flex-end; }
</style>
