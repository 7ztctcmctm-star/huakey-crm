<template>
  <div class="purchase-detail" v-loading="loading">
    <div class="page-header">
      <h2>采购单详情</h2>
      <el-button @click="goBack">返回列表</el-button>
    </div>

    <template v-if="order">
      <!-- 基本信息 -->
      <el-card shadow="hover" class="info-card">
        <template #header>
          <div class="card-header">
            <span>{{ order.order_no }}</span>
            <el-tag :type="getStatusType(order.status)" size="large">{{ order.status }}</el-tag>
          </div>
        </template>
        <el-descriptions :column="3" border size="default">
          <el-descriptions-item label="供应商">{{ order.supplier_name }}</el-descriptions-item>
          <el-descriptions-item label="类型">
            <el-tag :type="getTypeTagType(order.type)" size="small">{{ order.type }}</el-tag>
          </el-descriptions-item>
          <el-descriptions-item label="负责人">{{ order.owner_name || '-' }}</el-descriptions-item>
          <el-descriptions-item label="采购标题" :span="2">{{ order.title }}</el-descriptions-item>
          <el-descriptions-item label="期望交期">{{ order.expected_date || '-' }}</el-descriptions-item>
          <el-descriptions-item label="总金额">{{ formatMoney(order.total_amount) }} 元</el-descriptions-item>
          <el-descriptions-item label="税率">{{ order.tax_rate }}%</el-descriptions-item>
          <el-descriptions-item label="税额">{{ formatMoney(order.tax_amount) }} 元</el-descriptions-item>
          <el-descriptions-item label="含税总价" :span="1">
            <span style="font-weight: bold; color: var(--color-accent);">{{ formatMoney(order.total_with_tax) }} 元</span>
          </el-descriptions-item>
          <el-descriptions-item label="付款条件">{{ order.payment_terms || '-' }}</el-descriptions-item>
          <el-descriptions-item label="收货地址">{{ order.delivery_address || '-' }}</el-descriptions-item>
          <el-descriptions-item label="创建时间">{{ order.create_time }}</el-descriptions-item>
          <el-descriptions-item label="备注" :span="3">{{ order.remark || '-' }}</el-descriptions-item>
        </el-descriptions>
      </el-card>

      <!-- 采购明细 -->
      <el-card shadow="hover" class="info-card mt-20">
        <template #header><span>采购明细 ({{ items.length }}项)</span></template>
        <el-table :data="items" border stripe size="default" show-summary :summary-method="getSummary">
          <el-table-column type="index" label="#" width="50" />
          <el-table-column prop="product_name" label="产品名称" min-width="150" />
          <el-table-column prop="product_spec" label="规格型号" width="120" />
          <el-table-column prop="unit" label="单位" width="70" align="center" />
          <el-table-column prop="quantity" label="数量" width="100" align="right" />
          <el-table-column prop="unit_price" label="单价" width="110" align="right">
            <template #default="{ row }">{{ formatMoney(row.unit_price) }}</template>
          </el-table-column>
          <el-table-column prop="discount_rate" label="折扣%" width="80" align="center" />
          <el-table-column prop="amount" label="小计" width="120" align="right">
            <template #default="{ row }">{{ formatMoney(row.amount) }}</template>
          </el-table-column>
          <el-table-column prop="received_qty" label="已收货" width="90" align="right" />
          <el-table-column prop="quality_status" label="质检状态" width="100" align="center">
            <template #default="{ row }">
              <el-tag :type="row.quality_status === '合格' ? 'success' : row.quality_status === '不合格' ? 'danger' : 'warning'" size="small">
                {{ row.quality_status }}
              </el-tag>
            </template>
          </el-table-column>
        </el-table>
      </el-card>

      <el-row :gutter="24">
        <!-- 入库记录 -->
        <el-col :span="12">
          <el-card shadow="hover" class="info-card mt-20">
            <template #header><span>入库记录 ({{ receipts.length }})</span></template>
            <el-table :data="receipts" border stripe size="small" max-height="300" empty-text="暂无入库记录">
              <el-table-column prop="receipt_no" label="入库单号" width="150" />
              <el-table-column prop="quantity" label="数量" width="80" align="right" />
              <el-table-column prop="quality_result" label="质检结果" width="90" align="center">
                <template #default="{ row }">
                  <el-tag :type="row.quality_result === '合格' ? 'success' : 'danger'" size="small">{{ row.quality_result }}</el-tag>
                </template>
              </el-table-column>
              <el-table-column prop="warehouse" label="仓库" width="100" show-overflow-tooltip />
              <el-table-column prop="operator_name" label="操作人" width="90" />
              <el-table-column prop="receive_time" label="入库时间" width="160" />
            </el-table>
          </el-card>
        </el-col>

        <!-- 付款记录 -->
        <el-col :span="12">
          <el-card shadow="hover" class="info-card mt-20">
            <template #header>
              <span>付款记录 ({{ payments.length }})</span>
            </template>
            <el-table :data="payments" border stripe size="small" max-height="300" empty-text="暂无付款记录">
              <el-table-column label="编号" width="80" align="center">
                <template #default="{ row }">{{ row.id }}</template>
              </el-table-column>
              <el-table-column prop="amount" label="金额" width="100" align="right">
                <template #default="{ row }">{{ formatMoney(row.amount) }}</template>
              </el-table-column>
              <el-table-column prop="pay_method" label="付款方式" width="100" align="center" />
              <el-table-column prop="pay_date" label="付款时间" width="160" />
              <el-table-column prop="payer_name" label="付款人" width="90" />
            </el-table>
          </el-card>
        </el-col>
      </el-row>

      <!-- 操作按钮区 -->
      <div class="action-bar mt-20">
        <el-button type="success" @click="showReceiptDialog = true" :disabled="!canReceive">登记入库</el-button>
        <el-button type="primary" @click="showPaymentDialog = true" :disabled="!canPay">登记付款</el-button>
        <el-dropdown trigger="click" @command="handleStatusChange">
          <el-button type="warning">更新状态<el-icon class="el-icon--right"><ArrowDown /></el-icon></el-button>
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item v-if="order.status === '草稿'" command="待审核">提交审核</el-dropdown-item>
              <el-dropdown-item v-if="order.status === '待审核'" command="已确认">确认通过</el-dropdown-item>
              <el-dropdown-item v-if="order.status === '已确认'" command="部分收货">标记收货中</el-dropdown-item>
              <el-dropdown-item v-if="['已确认', '部分收货'].includes(order.status)" command="已完成">完成订单</el-dropdown-item>
              <el-dropdown-item command="已取消" divided>取消订单</el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>
      </div>

      <!-- 入库对话框 -->
      <el-dialog v-model="showReceiptDialog" title="登记入库" width="500px" destroy-on-close>
        <el-form ref="receiptFormRef" :model="receiptForm" :rules="receiptRules" label-width="100px">
          <el-form-item label="选择明细" prop="item_id">
            <el-select v-model="receiptForm.item_id" placeholder="选择明细项" style="width: 100%">
              <el-option v-for="item in receivableItems" :key="item.id"
                :label="`${item.product_name} (剩余${item.quantity - item.received_qty})`" :value="item.id" />
            </el-select>
          </el-form-item>
          <el-form-item label="入库数量" prop="quantity">
            <el-input-number v-model="receiptForm.quantity" :min="0.001" :precision="3" style="width: 100%" />
          </el-form-item>
          <el-form-item label="质检结果" prop="quality_result">
            <el-radio-group v-model="receiptForm.quality_result">
              <el-radio value="合格">合格</el-radio>
              <el-radio value="不合格">不合格</el-radio>
              <el-radio value="待检">待检</el-radio>
            </el-radio-group>
          </el-form-item>
          <el-form-item label="仓库位置">
            <el-input v-model="receiptForm.warehouse" placeholder="如：A区-01-02" />
          </el-form-item>
        </el-form>
        <template #footer>
          <el-button @click="showReceiptDialog = false">取消</el-button>
          <el-button type="primary" :loading="receiptLoading" @click="handleReceiptSubmit">确认入库</el-button>
        </template>
      </el-dialog>

      <!-- 付款对话框 -->
      <el-dialog v-model="showPaymentDialog" title="登记付款" width="500px" destroy-on-close>
        <el-form ref="paymentFormRef" :model="paymentForm" :rules="paymentRules" label-width="100px">
          <el-form-item label="付款金额" prop="amount">
            <el-input-number v-model="paymentForm.amount" :min="0.01" :precision="2" style="width: 100%" />
          </el-form-item>
          <el-form-item label="付款方式">
            <el-select v-model="paymentForm.pay_method" placeholder="选择付款方式" style="width: 100%">
              <el-option label="银行转账" value="银行转账" />
              <el-option label="现金" value="现金" />
              <el-option label="支票" value="支票" />
              <el-option label="其他" value="其他" />
            </el-select>
          </el-form-item>
          <el-form-item label="付款日期">
            <el-date-picker v-model="paymentForm.pay_date" type="date" value-format="YYYY-MM-DD" style="width: 100%" />
          </el-form-item>
          <el-form-item label="备注">
            <el-input v-model="paymentForm.remark" type="textarea" :rows="2" />
          </el-form-item>
        </el-form>
        <template #footer>
          <el-button @click="showPaymentDialog = false">取消</el-button>
          <el-button type="primary" :loading="paymentLoading" @click="handlePaymentSubmit">确认登记</el-button>
        </template>
      </el-dialog>
    </template>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElMessage, ElMessageBox } from 'element-plus';
import { ArrowDown } from '@element-plus/icons-vue';
import request from '@/utils/request';
import { getPurchaseDetail, updatePurchaseStatus, addReceipt, addPurchasePayment } from '@/api/product';

const route = useRoute();
const router = useRouter();
const loading = ref(false);
const order = ref(null);
const items = ref([]);
const receipts = ref([]);
const payments = ref([]);

const showReceiptDialog = ref(false);
const receiptLoading = ref(false);
const receiptFormRef = ref(null);

const showPaymentDialog = ref(false);
const paymentLoading = ref(false);
const paymentFormRef = ref(null);
const paymentForm = reactive({ amount: null, pay_method: '银行转账', pay_date: '', remark: '' });
const paymentRules = { amount: [{ required: true, message: '请输入金额', trigger: 'blur' }] };

const receiptForm = reactive({ order_id: null, item_id: null, quantity: 1, quality_result: '合格', warehouse: '', defect_desc: '' });
const receiptRules = { item_id: [{ required: true, message: '请选择明细', trigger: 'change' }], quantity: [{ required: true, message: '请输入数量', trigger: 'blur' }] };

const canReceive = computed(() => ['已确认', '部分收货'].includes(order.value?.status));
const canPay = computed(() => ['已确认', '部分收货', '已完成'].includes(order.value?.status));
const receivableItems = computed(() => items.value.filter(item => item.quantity > item.received_qty));

const formatMoney = (val) => val ? Number(val).toLocaleString('zh-CN', { minimumFractionDigits: 2 }) : '0.00';
const getTypeTagType = (type) => ({ '常规': '', '紧急': 'danger', '样品': 'warning', '返修': 'info' }[type] || '');
const getStatusType = (s) => ({ '草稿': 'info', '待审核': 'warning', '已确认': '', '部分收货': 'warning', '已完成': 'success', '已取消': 'danger' }[s] || '');

const getSummary = (param) => {
  const { columns, data } = param;
  const sums = [];
  columns.forEach((col, idx) => { sums[idx] = idx === 0 ? '合计' : ''; });
  const totalAmount = data.reduce((sum, row) => sum + (parseFloat(row.amount) || 0), 0);
  const totalQty = data.reduce((sum, row) => sum + (parseFloat(row.quantity) || 0), 0);
  const amountIdx = columns.findIndex(c => c.property === 'amount');
  const qtyIdx = columns.findIndex(c => c.property === 'quantity');
  if (qtyIdx >= 0) sums[qtyIdx] = totalQty.toFixed(3);
  if (amountIdx >= 0) sums[amountIdx] = formatMoney(totalAmount);
  return sums;
};

const fetchDetail = async () => {
  const id = route.params.id;
  if (!id) return;
  loading.value = true;
  try {
    const res = await getPurchaseDetail(id);
    if (res.code === 200) {
      order.value = res.data;
      items.value = res.data.items || [];
      receipts.value = res.data.receipts || [];
      payments.value = res.data.payments || [];
    }
  } catch (e) { console.error(e); }
  finally { loading.value = false; }
};

const handleStatusChange = async (command) => {
  try {
    let approveRemark = null;
    if (command === '已确认') {
      const { value } = await ElMessageBox.prompt('请输入审批备注（可选）', '确认通过', {
        confirmButtonText: '确认',
        cancelButtonText: '取消',
        inputPlaceholder: '审批备注',
        type: 'warning'
      });
      approveRemark = value;
    } else {
      await ElMessageBox.confirm(`确定将状态改为「${command}」？`, '确认', { confirmButtonText: '确定', cancelButtonText: '取消', type: 'warning' });
    }
    const res = await updatePurchaseStatus({ id: route.params.id, status: command, approveRemark });
    if (res.code === 200) { ElMessage.success('更新成功'); fetchDetail(); }
  } catch (e) { if (e !== 'cancel') console.error(e); }
};

const handleReceiptSubmit = async () => {
  await receiptFormRef.value.validate(async (valid) => {
    if (!valid) return;
    receiptLoading.value = true;
    try {
      receiptForm.order_id = route.params.id;
      const res = await addReceipt(receiptForm);
      if (res.code === 200) { ElMessage.success('入库成功'); showReceiptDialog.value = false; fetchDetail(); }
    } catch (e) { console.error(e); }
    finally { receiptLoading.value = false; }
  });
};

const goBack = () => { router.push('/purchase/list'); };

const handlePaymentSubmit = async () => {
  await paymentFormRef.value.validate(async (valid) => {
    if (!valid) return;
    paymentLoading.value = true;
    try {
      const res = await addPurchasePayment({
        order_id: route.params.id,
        amount: paymentForm.amount,
        pay_method: paymentForm.pay_method,
        pay_date: paymentForm.pay_date || undefined,
        remark: paymentForm.remark || undefined
      });
      if (res.code === 200) { ElMessage.success('付款登记成功'); showPaymentDialog.value = false; fetchDetail(); }
    } catch (e) { console.error(e); }
    finally { paymentLoading.value = false; }
  });
};
onMounted(() => { fetchDetail(); });
</script>

<style scoped>
.purchase-detail { padding: 0; }
.page-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: var(--space-5); }
.page-header h2 { margin: 0; font-size: 28px; font-weight: 600; color: var(--color-text); letter-spacing: -0.02em; }
.info-card { margin-bottom: 0; }
.mt-20 { margin-top: var(--space-5); }
.card-header { display: flex; justify-content: space-between; align-items: center; }
.action-bar { display: flex; gap: var(--space-2); padding: var(--space-4); background: var(--color-bg-secondary); border-radius: var(--radius-sm); }
</style>
