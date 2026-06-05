<template>
  <div class="supplier-list">
    <div class="page-header">
      <h2>供应商管理</h2>
      <el-button type="primary" @click="handleAdd" v-permission="'supplier:add'">
        <el-icon><Plus /></el-icon>新增供应商
      </el-button>
    </div>

    <div class="search-bar">
      <el-form :inline="true" :model="searchForm" @submit.prevent="handleSearch">
        <el-form-item label="关键词">
          <el-input v-model="searchForm.keyword" placeholder="名称/编号/联系人" clearable style="width: 200px" />
        </el-form-item>
        <el-form-item label="类型">
          <el-select v-model="searchForm.type" placeholder="全部类型" clearable style="width: 120px">
            <el-option label="生产" value="生产" />
            <el-option label="贸易" value="贸易" />
            <el-option label="服务" value="服务" />
          </el-select>
        </el-form-item>
        <el-form-item label="等级">
          <el-select v-model="searchForm.level" placeholder="全部等级" clearable style="width: 120px">
            <el-option label="核心" value="核心" />
            <el-option label="重点" value="重点" />
            <el-option label="普通" value="普通" />
            <el-option label="备用" value="备用" />
          </el-select>
        </el-form-item>
        <el-form-item label="状态">
          <el-select v-model="searchForm.status" placeholder="全部状态" clearable style="width: 120px">
            <el-option label="合作中" :value="1" />
            <el-option label="暂停" :value="2" />
            <el-option label="终止" :value="3" />
          </el-select>
        </el-form-item>
        <el-form-item>
          <el-button type="primary" native-type="submit">查询</el-button>
          <el-button @click="resetSearch">重置</el-button>
        </el-form-item>
      </el-form>
    </div>

    <el-table :data="tableData" border stripe v-loading="loading" style="width: 100%">
      <el-table-column prop="supplier_no" label="编号" width="160" fixed />
      <el-table-column prop="name" label="供应商名称" min-width="180" show-overflow-tooltip>
        <template #default="{ row }">
          <el-link type="primary" @click="handleView(row.id)">{{ row.name }}</el-link>
        </template>
      </el-table-column>
      <el-table-column prop="short_name" label="简称" width="100" show-overflow-tooltip />
      <el-table-column prop="type" label="类型" width="80" align="center">
        <template #default="{ row }">
          <el-tag :type="getTypeTagType(row.type)" size="small">{{ row.type }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="level" label="等级" width="80" align="center">
        <template #default="{ row }">
          <el-tag :type="getLevelTagType(row.level)" size="small">{{ row.level }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="contact_person" label="联系人" width="100" />
      <el-table-column prop="contact_phone" label="联系电话" width="130" />
      <el-table-column prop="rating" label="评分" width="70" align="center">
        <template #default="{ row }">
          <span>{{ row.rating || '-' }}</span>
        </template>
      </el-table-column>
      <el-table-column prop="status" label="状态" width="90" align="center">
        <template #default="{ row }">
          <el-tag :type="getStatusType(row.status)" size="small">{{ getStatusText(row.status) }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="owner_name" label="负责人" width="90" align="center" />
      <el-table-column label="操作" width="200" fixed="right" align="center">
        <template #default="{ row }">
          <el-button link type="primary" size="small" @click="handleEdit(row)" v-permission="'supplier:edit'">编辑</el-button>
          <el-button link type="danger" size="small" @click="handleDelete(row)" v-permission="'supplier:delete'">删除</el-button>
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

    <!-- 新增/编辑对话框 -->
    <el-dialog v-model="dialogVisible" :title="dialogTitle" width="650px" destroy-on-close>
      <el-form ref="formRef" :model="form" :rules="formRules" label-width="110px">
        <el-row :gutter="24">
          <el-col :span="12">
            <el-form-item label="供应商名称" prop="name">
              <el-input v-model="form.name" placeholder="请输入供应商名称" maxlength="50" show-word-limit />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="简称">
              <el-input v-model="form.short_name" placeholder="简称（可选）" />
            </el-form-item>
          </el-col>
        </el-row>

        <el-row :gutter="24">
          <el-col :span="8">
            <el-form-item label="类型" prop="type">
              <el-select v-model="form.type" placeholder="请选择">
                <el-option label="生产" value="生产" />
                <el-option label="贸易" value="贸易" />
                <el-option label="服务" value="服务" />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="8">
            <el-form-item label="等级" prop="level">
              <el-select v-model="form.level" placeholder="请选择">
                <el-option label="核心" value="核心" />
                <el-option label="重点" value="重点" />
                <el-option label="普通" value="普通" />
                <el-option label="备用" value="备用" />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="8">
            <el-form-item label="行业">
              <el-input v-model="form.industry" placeholder="所属行业" />
            </el-form-item>
          </el-col>
        </el-row>

        <el-divider content-position="left">联系信息</el-divider>

        <el-row :gutter="24">
          <el-col :span="12">
            <el-form-item label="主要联系人">
              <el-input v-model="form.contact_person" placeholder="姓名" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="联系电话">
              <el-input v-model="form.contact_phone" placeholder="手机或座机" />
            </el-form-item>
          </el-col>
        </el-row>

        <el-row :gutter="24">
          <el-col :span="12">
            <el-form-item label="邮箱">
              <el-input v-model="form.contact_email" placeholder="电子邮箱" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="地址">
              <el-input v-model="form.address" placeholder="详细地址" />
            </el-form-item>
          </el-col>
        </el-row>

        <el-divider content-position="left">商务信息</el-divider>

        <el-row :gutter="24">
          <el-col :span="12">
            <el-form-item label="结算方式">
              <el-input v-model="form.payment_terms" placeholder="如：月结30天/预付50%" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="交货周期(天)">
              <el-input-number v-model="form.delivery_days" :min="1" :max="365" controls-position="right" style="width: 100%" />
            </el-form-item>
          </el-col>
        </el-row>

        <el-form-item label="备注">
          <el-input v-model="form.remark" type="textarea" :rows="3" placeholder="备注信息" maxlength="500" show-word-limit />
        </el-form-item>
      </el-form>

      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="submitLoading" @click="handleSubmit">确定</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage, ElMessageBox } from 'element-plus';
import { Plus } from '@element-plus/icons-vue';
import request from '@/utils/request';

const router = useRouter();
const loading = ref(false);
const tableData = ref([]);
const total = ref(0);
const page = ref(1);
const pageSize = ref(10);

const searchForm = reactive({
  keyword: '',
  type: '',
  level: '',
  status: ''
});

const dialogVisible = ref(false);
const dialogTitle = ref('新增供应商');
const submitLoading = ref(false);
const formRef = ref(null);
const isEdit = ref(false);

const form = reactive({
  id: null,
  name: '',
  short_name: '',
  type: '贸易',
  industry: '',
  level: '普通',
  contact_person: '',
  contact_phone: '',
  contact_email: '',
  address: '',
  payment_terms: '',
  delivery_days: null,
  remark: ''
});

const formRules = {
  name: [{ required: true, message: '请输入供应商名称', trigger: 'blur' }],
  type: [{ required: true, message: '请选择类型', trigger: 'change' }],
  level: [{ required: true, message: '请选择等级', trigger: 'change' }]
};

const getTypeTagType = (type) => ({ '生产': '', '贸易': 'success', '服务': 'warning' }[type] || 'info');

const getLevelTagType = (level) => ({
  '核心': 'danger',
  '重点': 'warning',
  '普通': '',
  '备用': 'info'
}[level] || 'info');

const getStatusType = (status) => ({ 1: 'success', 2: 'warning', 3: 'danger' }[status] || 'info');

const getStatusText = (status) => ({ 1: '合作中', 2: '暂停', 3: '终止' }[status] || '未知');

const fetchList = async () => {
  loading.value = true;
  try {
    const res = await request.post('/supplier/list', {
      page: page.value,
      pageSize: pageSize.value,
      ...searchForm
    });
    if (res.code === 200) {
      tableData.value = res.data.list;
      total.value = res.data.total;
    }
  } catch (error) {
    console.error('获取供应商列表失败:', error);
  } finally {
    loading.value = false;
  }
};

const handleSearch = () => {
  page.value = 1;
  fetchList();
};

const resetSearch = () => {
  Object.assign(searchForm, { keyword: '', type: '', level: '', status: '' });
  handleSearch();
};

const resetForm = () => {
  Object.assign(form, {
    id: null, name: '', short_name: '', type: '贸易', industry: '', level: '普通',
    contact_person: '', contact_phone: '', contact_email: '', address: '',
    payment_terms: '', delivery_days: null, remark: ''
  });
};

const handleAdd = () => {
  resetForm();
  isEdit.value = false;
  dialogTitle.value = '新增供应商';
  dialogVisible.value = true;
};

const handleEdit = (row) => {
  Object.assign(form, row);
  isEdit.value = true;
  dialogTitle.value = '编辑供应商';
  dialogVisible.value = true;
};

const handleSubmit = async () => {
  if (!formRef.value) return;

  await formRef.value.validate(async (valid) => {
    if (!valid) return;

    submitLoading.value = true;
    try {
      const url = isEdit.value ? '/supplier/update' : '/supplier/add';
      const res = await request.post(url, form);
      if (res.code === 200) {
        ElMessage.success(isEdit.value ? '修改成功' : '创建成功');
        dialogVisible.value = false;
        fetchList();
      }
    } catch (error) {
      console.error('提交失败:', error);
    } finally {
      submitLoading.value = false;
    }
  });
};

const handleDelete = async (row) => {
  try {
    await ElMessageBox.confirm(`确定删除供应商「${row.name}」吗？`, '确认删除', {
      confirmButtonText: '确定',
      cancelButtonText: '取消',
      type: 'warning'
    });

    const res = await request.post('/supplier/delete', { id: row.id });
    if (res.code === 200) {
      ElMessage.success('删除成功');
      fetchList();
    }
  } catch (error) {
    if (error !== 'cancel') console.error('删除失败:', error);
  }
};

const handleView = (id) => {
  router.push(`/supplier/detail/${id}`);
};

onMounted(() => {
  fetchList();
});
</script>

<style scoped>
.supplier-list {
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

.search-bar {
  background: var(--color-bg);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-sm);
  padding: var(--space-4) var(--space-5);
  margin-bottom: var(--space-4);
}

.pagination-wrapper {
  margin-top: var(--space-5);
  display: flex;
  justify-content: flex-end;
}
</style>
