<template>
  <div class="page-container">
    <div class="page-header"><h2>产品管理</h2></div>

    <!-- 搜索区域 -->
    <el-card shadow="never" class="search-card">
      <el-form :model="searchForm" inline @keyup.enter="handleSearch">
        <el-form-item label="关键词">
          <el-input v-model="searchForm.keyword" placeholder="产品名称/编码" clearable style="width:200px" />
        </el-form-item>
        <el-form-item label="分类">
          <el-select v-model="searchForm.category" placeholder="全部分类" clearable style="width:140px">
            <el-option v-for="c in categories" :key="c" :label="c" :value="c" />
          </el-select>
        </el-form-item>
        <el-form-item label="状态">
          <el-select v-model="searchForm.status" placeholder="全部状态" clearable style="width:120px">
            <el-option label="上架" :value="1" />
            <el-option label="下架" :value="0" />
          </el-select>
        </el-form-item>
        <el-form-item>
          <el-button type="primary" :icon="Search" @click="handleSearch">搜索</el-button>
          <el-button :icon="Refresh" @click="handleReset">重置</el-button>
        </el-form-item>
      </el-form>
    </el-card>

    <el-card shadow="never" class="table-card">
      <div class="toolbar">
        <el-button type="primary" :icon="Plus" @click="handleAdd" v-permission="'product:add'">新增产品</el-button>
      </div>

      <el-table v-loading="loading" :data="tableData" stripe border
        :header-cell-style="{ background: 'var(--color-bg)' }">
        <el-table-column prop="code" label="产品编码" width="140" show-overflow-tooltip />
        <el-table-column prop="name" label="产品名称" min-width="160" show-overflow-tooltip />
        <el-table-column prop="category" label="分类" width="100" />
        <el-table-column prop="unit" label="单位" width="70" align="center" />
        <el-table-column prop="cost_price" label="成本价" width="110" align="right" v-if="isAdmin">
          <template #default="{ row }">¥{{ formatAmount(row.cost_price) }}</template>
        </el-table-column>
        <el-table-column prop="price" label="销售价" width="110" align="right">
          <template #default="{ row }">¥{{ formatAmount(row.price) }}</template>
        </el-table-column>
        <el-table-column label="利润率" width="90" align="center" v-if="isAdmin">
          <template #default="{ row }">
            <el-tag v-if="row.cost_price > 0 && row.price > 0"
              :type="profitRate(row) > 30 ? 'success' : profitRate(row) > 10 ? 'warning' : 'danger'" size="small">
              {{ profitRate(row) }}%
            </el-tag>
            <span v-else>-</span>
          </template>
        </el-table-column>
        <el-table-column prop="stock" label="库存" width="80" align="center">
          <template #default="{ row }">
            <el-tag :type="row.stock > 0 ? 'success' : 'danger'" size="small">{{ row.stock }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="status" label="状态" width="80" align="center">
          <template #default="{ row }">
            <el-tag :type="row.status === 1 ? 'success' : 'info'" size="small">
              {{ row.status === 1 ? '上架' : '下架' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="180" fixed="right">
          <template #default="{ row }">
            <el-button type="primary" link :icon="Edit" @click="handleEdit(row)" v-permission="'product:edit'">编辑</el-button>
            <el-button
              :type="row.status === 1 ? 'warning' : 'success'"
              link
              @click="toggleStatus(row)"
              v-permission="'product:edit'"
            >{{ row.status === 1 ? '下架' : '上架' }}</el-button>
            <el-button type="danger" link :icon="Delete" @click="handleDelete(row)" v-permission="'product:delete'">删除</el-button>
          </template>
        </el-table-column>
      </el-table>

      <div class="pagination">
        <el-pagination
          v-model:current-page="page" v-model:page-size="pageSize"
          :page-sizes="[10, 20, 50]" :total="total"
          layout="total, sizes, prev, pager, next" @size-change="fetchList" @current-change="fetchList"
        />
      </div>
    </el-card>

    <!-- 新增/编辑弹窗 -->
    <el-dialog v-model="dialogVisible" :title="isEdit ? '编辑产品' : '新增产品'" width="560px" @closed="resetForm">
      <el-form ref="formRef" :model="form" :rules="rules" label-width="80px">
        <el-row :gutter="16">
          <el-col :span="16">
            <el-form-item label="产品名称" prop="name">
              <el-input v-model="form.name" placeholder="请输入产品名称" />
            </el-form-item>
          </el-col>
          <el-col :span="8">
            <el-form-item label="单位">
              <el-input v-model="form.unit" placeholder="台/套/个" />
            </el-form-item>
          </el-col>
        </el-row>
        <el-row :gutter="16">
          <el-col :span="12">
            <el-form-item label="产品编码">
              <el-input v-model="form.code" placeholder="如 UPS-3000" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="产品分类">
              <el-select v-model="form.category" placeholder="选择或输入分类" filterable allow-create style="width:100%">
                <el-option v-for="c in categories" :key="c" :label="c" :value="c" />
              </el-select>
            </el-form-item>
          </el-col>
        </el-row>
        <el-row :gutter="16">
          <el-col :span="8">
            <el-form-item label="成本价">
              <el-input-number v-model="form.cost_price" :min="0" :precision="2" style="width:100%" controls-position="right" />
            </el-form-item>
          </el-col>
          <el-col :span="8">
            <el-form-item label="销售价" prop="price">
              <el-input-number v-model="form.price" :min="0" :precision="2" style="width:100%" controls-position="right" />
            </el-form-item>
          </el-col>
          <el-col :span="8">
            <el-form-item label="库存">
              <el-input-number v-model="form.stock" :min="0" style="width:100%" controls-position="right" />
            </el-form-item>
          </el-col>
        </el-row>
        <el-form-item label="描述">
          <el-input v-model="form.description" type="textarea" :rows="3" placeholder="产品规格、参数等描述信息" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="submitLoading" @click="handleSubmit">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus, Edit, Delete, Search, Refresh } from '@element-plus/icons-vue'
import { post, get } from '@/utils/request'
import { formatAmount } from '@/composables/useFormat'

const loading = ref(false)
const tableData = ref([])
const total = ref(0)
const page = ref(1)
const pageSize = ref(20)
const categories = ref([])
const dialogVisible = ref(false)
const isEdit = ref(false)
const submitLoading = ref(false)
const formRef = ref(null)
const editId = ref(null)

const userInfo = JSON.parse(localStorage.getItem('userInfo') || '{}')
const isAdmin = computed(() => userInfo.manageAll || userInfo.roleId === 1)

const searchForm = reactive({ keyword: '', category: '', status: '' })

const form = reactive({
  name: '', code: '', category: '', unit: '台',
  price: 0, cost_price: 0, stock: 0, description: ''
})

const rules = {
  name: [{ required: true, message: '请输入产品名称', trigger: 'blur' }]
}

const profitRate = (row) => {
  if (!row.cost_price || row.cost_price <= 0 || !row.price) return 0
  return Math.round((row.price - row.cost_price) / row.cost_price * 100)
}

const fetchList = async () => {
  loading.value = true
  try {
    const params = { page: page.value, pageSize: pageSize.value }
    if (searchForm.keyword) params.keyword = searchForm.keyword
    if (searchForm.category) params.category = searchForm.category
    if (searchForm.status !== '' && searchForm.status !== null) params.status = searchForm.status
    const res = await post('/product/list', params)
    if (res.code === 200) {
      tableData.value = res.data.list
      total.value = res.data.total
    }
  } catch (e) { console.error(e) }
  finally { loading.value = false }
}

const fetchCategories = async () => {
  try {
    const res = await get('/product/categories')
    if (res.code === 200) categories.value = res.data
  } catch (e) { /* ignore */ }
}

const handleSearch = () => { page.value = 1; fetchList() }
const handleReset = () => {
  searchForm.keyword = ''; searchForm.category = ''; searchForm.status = ''
  page.value = 1; fetchList()
}

const handleAdd = () => { isEdit.value = false; editId.value = null; dialogVisible.value = true }

const handleEdit = (row) => {
  isEdit.value = true; editId.value = row.id
  Object.assign(form, {
    name: row.name || '', code: row.code || '', category: row.category || '',
    unit: row.unit || '台', price: row.price || 0, cost_price: row.cost_price || 0,
    stock: row.stock || 0, description: row.description || ''
  })
  dialogVisible.value = true
}

const toggleStatus = async (row) => {
  const newStatus = row.status === 1 ? 0 : 1
  const action = newStatus === 1 ? '上架' : '下架'
  try {
    const res = await post('/product/update', { id: row.id, status: newStatus })
    if (res.code === 200) { ElMessage.success(`已${action}`); fetchList() }
  } catch (e) { ElMessage.error(`${action}失败`) }
}

const handleDelete = (row) => {
  ElMessageBox.confirm(`确定删除 "${row.name}" 吗？`, '提示', { type: 'warning' }).then(async () => {
    const res = await post('/product/delete', { id: row.id })
    if (res.code === 200) { ElMessage.success('已删除'); fetchList() }
  }).catch(() => {})
}

const handleSubmit = async () => {
  if (!formRef.value) return
  await formRef.value.validate(async (valid) => {
    if (!valid) return
    submitLoading.value = true
    try {
      const data = { ...form }
      if (isEdit.value) data.id = editId.value
      const res = await post(isEdit.value ? '/product/update' : '/product/add', data)
      if (res.code === 200) {
        ElMessage.success(isEdit.value ? '修改成功' : '新增成功')
        dialogVisible.value = false
        fetchList()
      }
    } catch (e) { console.error(e) }
    finally { submitLoading.value = false }
  })
}

const resetForm = () => {
  formRef.value?.resetFields()
  Object.assign(form, { name: '', code: '', category: '', unit: '台', price: 0, cost_price: 0, stock: 0, description: '' })
}

onMounted(() => { fetchList(); fetchCategories() })
</script>

<style scoped>
.page-container { padding: 0; }
.page-header { margin-bottom: var(--space-5); }
.page-header h2 { margin: 0; font-size: 28px; font-weight: 600; color: var(--color-text); letter-spacing: -0.02em; }
.search-card { margin-bottom: var(--space-4); }
.search-card .el-form-item { margin-bottom: 0; }
.toolbar { margin-bottom: var(--space-4); }
.pagination { display: flex; justify-content: flex-end; margin-top: var(--space-5); }
</style>
