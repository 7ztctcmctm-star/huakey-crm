<template>
  <div class="supplier-detail" v-loading="loading">
    <div class="page-header">
      <h2>供应商详情</h2>
      <el-button @click="goBack">返回列表</el-button>
    </div>

    <template v-if="supplier">
      <el-row :gutter="24">
        <el-col :span="16">
          <el-card shadow="hover" class="info-card">
            <template #header>
              <div class="card-header">
                <span>基本信息</span>
                <el-tag :type="getStatusType(supplier.status)" size="small">{{ getStatusText(supplier.status) }}</el-tag>
              </div>
            </template>

            <el-descriptions :column="2" border size="default">
              <el-descriptions-item label="编号">{{ supplier.supplier_no }}</el-descriptions-item>
              <el-descriptions-item label="名称">{{ supplier.name }}</el-descriptions-item>
              <el-descriptions-item label="简称">{{ supplier.short_name || '-' }}</el-descriptions-item>
              <el-descriptions-item label="类型">
                <el-tag :type="getTypeTagType(supplier.type)" size="small">{{ supplier.type }}</el-tag>
              </el-descriptions-item>
              <el-descriptions-item label="行业">{{ supplier.industry || '-' }}</el-descriptions-item>
              <el-descriptions-item label="等级">
                <el-tag :type="getLevelTagType(supplier.level)" size="small">{{ supplier.level }}</el-tag>
              </el-descriptions-item>
              <el-descriptions-item label="综合评分">{{ supplier.rating || '-' }}/5</el-descriptions-item>
              <el-descriptions-item label="负责人">{{ supplier.owner_name || '-' }}</el-descriptions-item>
              <el-descriptions-item label="创建时间">{{ supplier.create_time }}</el-descriptions-item>
              <el-descriptions-item label="更新时间">{{ supplier.update_time }}</el-descriptions-item>
              <el-descriptions-item label="备注" :span="2">{{ supplier.remark || '-' }}</el-descriptions-item>
            </el-descriptions>
          </el-card>

          <el-card shadow="hover" class="info-card mt-20">
            <template #header><span>联系信息</span></template>
            <el-descriptions :column="2" border size="default">
              <el-descriptions-item label="主要联系人">{{ supplier.contact_person || '-' }}</el-descriptions-item>
              <el-descriptions-item label="联系电话">{{ supplier.contact_phone || '-' }}</el-descriptions-item>
              <el-descriptions-item label="邮箱">{{ supplier.contact_email || '-' }}</el-descriptions-item>
              <el-descriptions-item label="地址">{{ supplier.address || '-' }}</el-descriptions-item>
              <el-descriptions-item label="结算方式">{{ supplier.payment_terms || '-' }}</el-descriptions-item>
              <el-descriptions-item label="交货周期">{{ supplier.delivery_days ? `${supplier.delivery_days}天` : '-' }}</el-descriptions-item>
            </el-descriptions>
          </el-card>

          <!-- 联系人列表 -->
          <el-card shadow="hover" class="info-card mt-20">
            <template #header>
              <div class="card-header">
                <span>联系人 ({{ contacts.length }})</span>
                <el-button type="primary" size="small" @click="openContactDialog()">新增联系人</el-button>
              </div>
            </template>
            <el-table :data="contacts" border stripe size="small" empty-text="暂无联系人">
              <el-table-column prop="name" label="姓名" width="100" />
              <el-table-column prop="position" label="职位" width="120" />
              <el-table-column prop="department" label="部门" width="100" />
              <el-table-column prop="phone" label="电话" width="130" />
              <el-table-column prop="mobile" label="手机" width="130" />
              <el-table-column prop="email" label="邮箱" min-width="160" show-overflow-tooltip />
              <el-table-column prop="role" label="角色" width="90" align="center">
                <template #default="{ row }">
                  <el-tag :type="row.role === '决策人' ? 'danger' : 'primary'" size="small">{{ row.role }}</el-tag>
                </template>
              </el-table-column>
              <el-table-column prop="is_primary" label="主要" width="70" align="center">
                <template #default="{ row }">
                  <el-tag v-if="row.is_primary === 1" type="success" size="small">是</el-tag>
                  <span v-else>-</span>
                </template>
              </el-table-column>
              <el-table-column label="操作" width="120" align="center">
                <template #default="{ row }">
                  <el-button type="primary" size="small" link @click="openContactDialog(row)">编辑</el-button>
                  <el-popconfirm title="确定删除该联系人？" @confirm="deleteContact(row.id)">
                    <template #reference><el-button type="danger" size="small" link>删除</el-button></template>
                  </el-popconfirm>
                </template>
              </el-table-column>
            </el-table>
          </el-card>
        </el-col>

        <el-col :span="8">
          <!-- 资质证照 -->
          <el-card shadow="hover" class="info-card">
            <template #header>
              <div class="card-header">
                <span>资质证照 ({{ qualifications.length }})</span>
                <el-button type="primary" size="small" @click="openQualDialog()">新增资质</el-button>
              </div>
            </template>
            <div v-if="qualifications.length > 0" class="cert-list">
              <div v-for="item in qualifications" :key="item.id" class="cert-item">
                <div class="cert-name">{{ item.cert_name || item.cert_type }}</div>
                <div class="cert-meta">有效期至: {{ item.expire_date || '-' }}</div>
                <div class="cert-actions">
                  <el-tag :type="getCertStatusType(item.status)" size="small">{{ getCertStatusText(item.status) }}</el-tag>
                  <el-button type="primary" size="small" link @click="openQualDialog(item)">编辑</el-button>
                  <el-popconfirm title="确定删除？" @confirm="deleteQualification(item.id)">
                    <template #reference><el-button type="danger" size="small" link>删除</el-button></template>
                  </el-popconfirm>
                </div>
              </div>
            </div>
            <el-empty v-else description="暂无资质证照" :image-size="60" />
          </el-card>

          <!-- 评分记录 -->
          <el-card shadow="hover" class="info-card mt-20">
            <template #header>
              <div class="card-header">
                <span>近期评分</span>
                <el-button type="primary" size="small" @click="openRatingDialog()">新增评分</el-button>
              </div>
            </template>
            <div v-if="ratings.length > 0" class="rating-list">
              <div v-for="item in ratings" :key="item.id" class="rating-item">
                <div class="rating-period">{{ item.rating_period }}</div>
                <el-rate :model-value="item.total_score" disabled show-score text-color="#ff9900" score-template="{value}" />
                <div class="rating-scores">
                  质量:{{ item.quality_score }} | 交期:{{ item.delivery_score }} | 服务:{{ item.service_score }}
                </div>
              </div>
            </div>
            <el-empty v-else description="暂无评分记录" :image-size="60" />
          </el-card>

          <!-- 绩效统计 -->
          <el-card shadow="hover" class="info-card mt-20" v-if="performance">
            <template #header><span>绩效统计</span></template>
            <el-descriptions :column="1" border size="small">
              <el-descriptions-item label="采购单数">{{ performance.order_count }}单</el-descriptions-item>
              <el-descriptions-item label="采购总额">{{ formatMoney(performance.total_amount) }}元</el-descriptions-item>
              <el-descriptions-item label="质检合格率">
                <span v-if="performance.quality_rate !== null">{{ performance.quality_rate }}%</span>
                <span v-else>-</span>
              </el-descriptions-item>
              <el-descriptions-item label="准时交付率">
                <span v-if="performance.delivery_rate !== null">{{ performance.delivery_rate }}%</span>
                <span v-else>-</span>
              </el-descriptions-item>
            </el-descriptions>
            <div v-if="performance.rating_trend && performance.rating_trend.length" class="rating-trend">
              <div class="rating-trend-title">评分趋势</div>
              <div v-for="item in performance.rating_trend" :key="item.rating_period" class="rating-trend-item">
                <span class="rating-trend-period">{{ item.rating_period }}</span>
                <el-rate :model-value="item.total_score" disabled show-score text-color="#ff9900" score-template="{value}" />
              </div>
            </div>
          </el-card>

          <!-- 关联客户 -->
          <el-card shadow="hover" class="info-card mt-20">
            <template #header><span>关联客户 ({{ relatedCustomers.length }})</span></template>
            <div v-if="relatedCustomers.length > 0" class="customer-list">
              <div v-for="item in relatedCustomers" :key="item.id" class="customer-item">
                <el-link type="primary" @click="$router.push(`/customer/detail/${item.customer_id}`)">
                  {{ item.customer_name }}
                </el-link>
                <el-tag size="small" :type="item.relationship_type === '主要' ? 'success' : 'info'">
                  {{ item.relationship_type }}
                </el-tag>
              </div>
            </div>
            <el-empty v-else description="暂无关联客户" :image-size="60" />
          </el-card>
        </el-col>
      </el-row>
    </template>

    <!-- 评分对话框 -->
    <el-dialog v-model="showRatingDialog" title="新增评分" width="500px" destroy-on-close>
      <el-form ref="ratingFormRef" :model="ratingForm" :rules="ratingRules" label-width="100px">
        <el-form-item label="评分期次" prop="rating_period">
          <el-input v-model="ratingForm.rating_period" placeholder="如：2026-05" />
        </el-form-item>
        <el-form-item label="质量分">
          <el-rate v-model="ratingForm.quality_score" :max="5" allow-half show-score />
        </el-form-item>
        <el-form-item label="交期分">
          <el-rate v-model="ratingForm.delivery_score" :max="5" allow-half show-score />
        </el-form-item>
        <el-form-item label="服务分">
          <el-rate v-model="ratingForm.service_score" :max="5" allow-half show-score />
        </el-form-item>
        <el-form-item label="价格分">
          <el-rate v-model="ratingForm.price_score" :max="5" allow-half show-score />
        </el-form-item>
        <el-form-item label="综合分">
          <el-rate :model-value="ratingTotal" disabled show-score text-color="#ff9900" />
        </el-form-item>
        <el-form-item label="备注">
          <el-input v-model="ratingForm.remark" type="textarea" :rows="2" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showRatingDialog = false">取消</el-button>
        <el-button type="primary" :loading="ratingLoading" @click="handleRatingSubmit">确认评分</el-button>
      </template>
    </el-dialog>

    <!-- 联系人对话框 -->
    <el-dialog v-model="showContactDialog" :title="editingContact ? '编辑联系人' : '新增联系人'" width="500px" destroy-on-close>
      <el-form ref="contactFormRef" :model="contactForm" :rules="contactRules" label-width="80px">
        <el-form-item label="姓名" prop="name">
          <el-input v-model="contactForm.name" />
        </el-form-item>
        <el-form-item label="职位">
          <el-input v-model="contactForm.position" />
        </el-form-item>
        <el-form-item label="部门">
          <el-input v-model="contactForm.department" />
        </el-form-item>
        <el-form-item label="电话">
          <el-input v-model="contactForm.phone" />
        </el-form-item>
        <el-form-item label="手机">
          <el-input v-model="contactForm.mobile" />
        </el-form-item>
        <el-form-item label="邮箱">
          <el-input v-model="contactForm.email" />
        </el-form-item>
        <el-form-item label="角色">
          <el-select v-model="contactForm.role" style="width: 100%">
            <el-option label="决策人" value="决策人" />
            <el-option label="对接人" value="对接人" />
            <el-option label="财务" value="财务" />
            <el-option label="技术" value="技术" />
            <el-option label="其他" value="其他" />
          </el-select>
        </el-form-item>
        <el-form-item label="主要联系">
          <el-switch v-model="contactForm.is_primary" :active-value="1" :inactive-value="0" />
        </el-form-item>
        <el-form-item label="备注">
          <el-input v-model="contactForm.remark" type="textarea" :rows="2" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showContactDialog = false">取消</el-button>
        <el-button type="primary" :loading="contactLoading" @click="handleContactSubmit">确认</el-button>
      </template>
    </el-dialog>

    <!-- 资质对话框 -->
    <el-dialog v-model="showQualDialog" :title="editingQual ? '编辑资质' : '新增资质'" width="500px" destroy-on-close>
      <el-form ref="qualFormRef" :model="qualForm" :rules="qualRules" label-width="100px">
        <el-form-item label="证书类型">
          <el-input v-model="qualForm.cert_type" placeholder="如：营业执照、ISO认证" />
        </el-form-item>
        <el-form-item label="证书名称" prop="cert_name">
          <el-input v-model="qualForm.cert_name" />
        </el-form-item>
        <el-form-item label="证书编号">
          <el-input v-model="qualForm.cert_no" />
        </el-form-item>
        <el-form-item label="签发日期">
          <el-date-picker v-model="qualForm.issue_date" type="date" value-format="YYYY-MM-DD" style="width: 100%" />
        </el-form-item>
        <el-form-item label="到期日期">
          <el-date-picker v-model="qualForm.expire_date" type="date" value-format="YYYY-MM-DD" style="width: 100%" />
        </el-form-item>
        <el-form-item label="签发机构">
          <el-input v-model="qualForm.issuing_authority" />
        </el-form-item>
        <el-form-item label="备注">
          <el-input v-model="qualForm.remark" type="textarea" :rows="2" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showQualDialog = false">取消</el-button>
        <el-button type="primary" :loading="qualLoading" @click="handleQualSubmit">确认</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElMessage, ElMessageBox } from 'element-plus';
import request from '@/utils/request';
import { getSupplierDetail, getSupplierPerformance, addSupplierContact, updateSupplierContact, deleteSupplierContact, addQualification, updateQualification, deleteQualification as deleteQualificationApi, addSupplierRating } from '@/api/supplier';

const route = useRoute();
const router = useRouter();
const loading = ref(false);
const supplier = ref(null);
const contacts = ref([]);
const qualifications = ref([]);
const ratings = ref([]);
const relatedCustomers = ref([]);
const performance = ref(null);

const showRatingDialog = ref(false);
const ratingLoading = ref(false);
const ratingFormRef = ref(null);
const ratingForm = reactive({
  quality_score: 0, delivery_score: 0, service_score: 0, price_score: 0,
  rating_period: '', remark: ''
});
const ratingRules = {
  rating_period: [{ required: true, message: '请输入评分期次', trigger: 'blur' }]
};
const ratingTotal = computed(() => Number(((ratingForm.quality_score + ratingForm.delivery_score + ratingForm.service_score + ratingForm.price_score) / 4).toFixed(2)));

const showContactDialog = ref(false);
const contactLoading = ref(false);
const contactFormRef = ref(null);
const editingContact = ref(null);
const contactForm = reactive({
  name: '', position: '', department: '', phone: '', mobile: '',
  email: '', role: '对接人', is_primary: 0, remark: ''
});
const contactRules = {
  name: [{ required: true, message: '请输入姓名', trigger: 'blur' }]
};

const showQualDialog = ref(false);
const qualLoading = ref(false);
const qualFormRef = ref(null);
const editingQual = ref(null);
const qualForm = reactive({
  cert_type: '', cert_no: '', cert_name: '', issue_date: '',
  expire_date: '', issuing_authority: '', remark: ''
});
const qualRules = {
  cert_name: [{ required: true, message: '请输入证书名称', trigger: 'blur' }]
};

const getTypeTagType = (type) => ({ '生产': '', '贸易': 'success', '服务': 'warning' }[type] || 'info');
const getLevelTagType = (level) => ({ '核心': 'danger', '重点': 'warning', '普通': '', '备用': 'info' }[level] || 'info');
const getStatusType = (status) => ({ 1: 'success', 2: 'warning', 3: 'danger' }[status] || 'info');
const getStatusText = (status) => ({ 1: '合作中', 2: '暂停', 3: '终止' }[status] || '未知');
const getCertStatusType = (status) => ({ 1: 'success', 2: 'warning', 3: 'danger' }[status] || 'info');
const getCertStatusText = (status) => ({ 1: '有效', 2: '即将到期', 3: '已过期' }[status] || '未知');
const formatMoney = (val) => val ? Number(val).toLocaleString('zh-CN', { minimumFractionDigits: 2 }) : '0.00';

const fetchDetail = async () => {
  const id = route.params.id;
  if (!id) return;

  loading.value = true;
  try {
    const res = await getSupplierDetail(id);
    if (res.code === 200) {
      supplier.value = res.data;
      contacts.value = res.data.contacts || [];
      qualifications.value = res.data.qualifications || [];
      ratings.value = res.data.ratings || [];
      relatedCustomers.value = res.data.relatedCustomers || [];
    }
  } catch (error) {
    console.error('获取供应商详情失败:', error);
  } finally {
    loading.value = false;
  }
};

const goBack = () => {
  router.push('/supplier/list');
};

const fetchPerformance = async () => {
  const id = route.params.id;
  if (!id) return;
  try {
    const res = await getSupplierPerformance(id);
    if (res.code === 200) performance.value = res.data;
  } catch (e) { console.error(e); }
};

const openRatingDialog = () => {
  Object.assign(ratingForm, { quality_score: 0, delivery_score: 0, service_score: 0, price_score: 0, rating_period: '', remark: '' });
  showRatingDialog.value = true;
};

const handleRatingSubmit = async () => {
  await ratingFormRef.value.validate(async (valid) => {
    if (!valid) return;
    ratingLoading.value = true;
    try {
      const res = await addSupplierRating({ supplier_id: route.params.id, ...ratingForm });
      if (res.code === 200) {
        ElMessage.success('评分成功');
        showRatingDialog.value = false;
        fetchDetail();
        fetchPerformance();
      }
    } catch (e) { console.error(e); }
    finally { ratingLoading.value = false; }
  });
};

const openContactDialog = (row) => {
  editingContact.value = row || null;
  if (row) {
    Object.assign(contactForm, { name: row.name, position: row.position || '', department: row.department || '', phone: row.phone || '', mobile: row.mobile || '', email: row.email || '', role: row.role || '对接人', is_primary: row.is_primary || 0, remark: row.remark || '' });
  } else {
    Object.assign(contactForm, { name: '', position: '', department: '', phone: '', mobile: '', email: '', role: '对接人', is_primary: 0, remark: '' });
  }
  showContactDialog.value = true;
};

const handleContactSubmit = async () => {
  await contactFormRef.value.validate(async (valid) => {
    if (!valid) return;
    contactLoading.value = true;
    try {
      if (editingContact.value) {
        const res = await updateSupplierContact({ id: editingContact.value.id, ...contactForm });
        if (res.code === 200) { ElMessage.success('修改成功'); showContactDialog.value = false; fetchDetail(); }
      } else {
        const res = await addSupplierContact({ supplier_id: route.params.id, ...contactForm });
        if (res.code === 200) { ElMessage.success('添加成功'); showContactDialog.value = false; fetchDetail(); }
      }
    } catch (e) { console.error(e); }
    finally { contactLoading.value = false; }
  });
};

const deleteContact = async (id) => {
  try {
    const res = await deleteSupplierContact(id);
    if (res.code === 200) { ElMessage.success('删除成功'); fetchDetail(); }
  } catch (e) { console.error(e); }
};

const openQualDialog = (row) => {
  editingQual.value = row || null;
  if (row) {
    Object.assign(qualForm, { cert_type: row.cert_type || '', cert_no: row.cert_no || '', cert_name: row.cert_name || '', issue_date: row.issue_date || '', expire_date: row.expire_date || '', issuing_authority: row.issuing_authority || '', remark: row.remark || '' });
  } else {
    Object.assign(qualForm, { cert_type: '', cert_no: '', cert_name: '', issue_date: '', expire_date: '', issuing_authority: '', remark: '' });
  }
  showQualDialog.value = true;
};

const handleQualSubmit = async () => {
  await qualFormRef.value.validate(async (valid) => {
    if (!valid) return;
    qualLoading.value = true;
    try {
      if (editingQual.value) {
        const res = await updateQualification({ id: editingQual.value.id, ...qualForm });
        if (res.code === 200) { ElMessage.success('修改成功'); showQualDialog.value = false; fetchDetail(); }
      } else {
        const res = await addQualification({ supplier_id: route.params.id, ...qualForm });
        if (res.code === 200) { ElMessage.success('添加成功'); showQualDialog.value = false; fetchDetail(); }
      }
    } catch (e) { console.error(e); }
    finally { qualLoading.value = false; }
  });
};

const deleteQualification = async (id) => {
  try {
    const res = await deleteQualificationApi(id);
    if (res.code === 200) { ElMessage.success('删除成功'); fetchDetail(); }
  } catch (e) { console.error(e); }
};

onMounted(() => {
  fetchDetail();
  fetchPerformance();
});
</script>

<style scoped>
.supplier-detail {
  padding: 0;
}

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: var(--space-5);
}

.page-header h2 {
  margin: 0;
  font-size: 28px;
  font-weight: 600;
  color: var(--color-text);
  letter-spacing: -0.02em;
}

.info-card {
  margin-bottom: 0;
}

.mt-20 {
  margin-top: var(--space-5);
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.cert-list, .rating-list, .customer-list {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.cert-item, .rating-item, .customer-item {
  padding: var(--space-2);
  border-radius: var(--radius-sm);
  background: var(--color-bg-secondary);
  border-left: 3px solid var(--color-accent);
}

.cert-name {
  font-weight: 500;
  color: var(--color-text);
  font-size: 14px;
}

.cert-meta {
  font-size: 12px;
  color: var(--color-text-tertiary);
  margin-top: var(--space-1);
}

.rating-period {
  font-weight: 500;
  color: var(--color-text);
  margin-bottom: var(--space-1);
}

.rating-scores {
  font-size: 12px;
  color: var(--color-text-tertiary);
  margin-top: var(--space-1);
}

.customer-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.cert-actions {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  margin-top: var(--space-1);
}

.rating-trend {
  margin-top: var(--space-3);
  padding-top: var(--space-3);
  border-top: 1px solid var(--color-border);
}

.rating-trend-title {
  font-size: 13px;
  font-weight: 500;
  color: var(--color-text-secondary);
  margin-bottom: var(--space-2);
}

.rating-trend-item {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  margin-bottom: var(--space-1);
}

.rating-trend-period {
  font-size: 12px;
  color: var(--color-text-tertiary);
  min-width: 60px;
}
</style>
