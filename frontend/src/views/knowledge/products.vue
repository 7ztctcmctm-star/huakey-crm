<template>
  <div class="page-container">
    <div class="page-header">
      <h2>产品知识库</h2>
      <el-button type="primary" :icon="Plus" @click="handleAdd">新增产品</el-button>
    </div>

    <!-- 搜索栏 -->
    <el-card shadow="never" class="search-card">
      <el-form :model="search" inline @keyup.enter="fetchList">
        <el-form-item><el-input v-model="search.keyword" placeholder="搜索产品名称/型号" clearable style="width:220px" /></el-form-item>
        <el-form-item>
          <el-select v-model="search.category" placeholder="全部分类" clearable style="width:140px">
            <el-option v-for="c in categories" :key="c" :label="c" :value="c" />
          </el-select>
        </el-form-item>
        <el-form-item><el-button type="primary" @click="fetchList">搜索</el-button></el-form-item>
      </el-form>
    </el-card>

    <!-- 产品卡片列表 -->
    <div class="product-grid" v-loading="loading">
      <div v-for="item in list" :key="item.id" class="product-card" @click="handleView(item)">
        <div class="product-image">
          <img v-if="getFirstImage(item)" :src="getFirstImage(item)" />
          <div v-else class="product-placeholder"><el-icon :size="40" color="#d2d2d7"><Box /></el-icon></div>
        </div>
        <div class="product-info">
          <div class="product-name">{{ item.name }}</div>
          <div class="product-meta">
            <el-tag v-if="item.category" size="small" type="info">{{ item.category }}</el-tag>
            <span v-if="item.model" class="product-model">{{ item.model }}</span>
          </div>
          <div class="product-price" v-if="item.price">¥{{ Number(item.price).toLocaleString() }}</div>
        </div>
        <div class="product-actions" @click.stop>
          <el-button type="primary" link :icon="Edit" @click="handleEdit(item)" />
          <el-button type="danger" link :icon="Delete" @click="handleDelete(item)" />
        </div>
      </div>
      <el-empty v-if="!loading && list.length === 0" description="暂无产品" />
    </div>

    <div class="pagination"><el-pagination v-model:current-page="page" v-model:page-size="pageSize" :total="total" :page-sizes="[12,24,48]" layout="total,sizes,prev,pager,next" @size-change="fetchList" @current-change="fetchList" /></div>

    <!-- 新增/编辑弹窗 -->
    <el-dialog v-model="dialogVisible" :title="isEdit ? '编辑产品' : '新增产品'" width="600px">
      <el-form ref="formRef" :model="form" :rules="rules" label-width="90px">
        <el-form-item label="产品名称" prop="name"><el-input v-model="form.name" placeholder="请输入产品名称" /></el-form-item>
        <el-row :gutter="16">
          <el-col :span="12"><el-form-item label="分类"><el-select v-model="form.category" placeholder="选择分类" filterable allow-create style="width:100%"><el-option v-for="c in categories" :key="c" :label="c" :value="c" /></el-select></el-form-item></el-col>
          <el-col :span="12"><el-form-item label="型号"><el-input v-model="form.model" placeholder="产品型号" /></el-form-item></el-col>
        </el-row>
        <el-form-item label="参考价格"><el-input-number v-model="form.price" :min="0" :precision="2" style="width:100%" controls-position="right" /></el-form-item>
        <el-form-item label="产品描述"><el-input v-model="form.description" type="textarea" :rows="3" placeholder="产品描述" /></el-form-item>
        <el-form-item label="产品参数">
          <div v-for="(spec, idx) in form.specsList" :key="idx" style="display:flex;gap:8px;margin-bottom:8px">
            <el-input v-model="spec.name" placeholder="参数名" style="width:40%" />
            <el-input v-model="spec.value" placeholder="参数值" style="width:40%" />
            <el-button :icon="Delete" @click="form.specsList.splice(idx,1)" />
          </div>
          <el-button size="small" @click="form.specsList.push({name:'',value:''})">添加参数</el-button>
        </el-form-item>
      </el-form>
      <template #footer><el-button @click="dialogVisible=false">取消</el-button><el-button type="primary" :loading="submitLoading" @click="handleSubmit">保存</el-button></template>
    </el-dialog>

    <!-- 详情弹窗 -->
    <el-dialog v-model="detailVisible" title="产品详情" width="600px">
      <div v-if="detail" class="detail-content">
        <div v-if="detail.images" class="detail-images">
          <el-image v-for="(img,i) in parseImages(detail.images)" :key="i" :src="img" :preview-src-list="parseImages(detail.images)" fit="cover" style="width:100px;height:100px;border-radius:8px;margin-right:8px" />
        </div>
        <el-descriptions :column="2" border>
          <el-descriptions-item label="名称">{{ detail.name }}</el-descriptions-item>
          <el-descriptions-item label="分类">{{ detail.category || '-' }}</el-descriptions-item>
          <el-descriptions-item label="型号">{{ detail.model || '-' }}</el-descriptions-item>
          <el-descriptions-item label="价格">{{ detail.price ? '¥' + Number(detail.price).toLocaleString() : '-' }}</el-descriptions-item>
          <el-descriptions-item label="描述" :span="2">{{ detail.description || '-' }}</el-descriptions-item>
        </el-descriptions>
        <div v-if="detail.specs" class="detail-specs">
          <h4>产品参数</h4>
          <div v-for="s in parseSpecs(detail.specs)" :key="s.name" class="spec-row"><span class="spec-name">{{ s.name }}</span><span class="spec-value">{{ s.value }}</span></div>
        </div>
      </div>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus, Edit, Delete, Box } from '@element-plus/icons-vue'
import request from '@/utils/request'
import { getKnowledgeProducts, getKnowledgeProductsCategories, addKnowledgeProduct, updateKnowledgeProduct, deleteKnowledgeProduct } from '@/api/tools'

const loading = ref(false)
const list = ref([])
const total = ref(0)
const page = ref(1)
const pageSize = ref(12)
const categories = ref([])
const search = reactive({ keyword: '', category: '' })

const dialogVisible = ref(false)
const isEdit = ref(false)
const editId = ref(null)
const formRef = ref(null)
const submitLoading = ref(false)
const form = reactive({ name: '', category: '', model: '', description: '', price: null, specsList: [] })
const rules = { name: [{ required: true, message: '请输入产品名称', trigger: 'blur' }] }

const detailVisible = ref(false)
const detail = ref(null)

const getFirstImage = (item) => { try { const imgs = JSON.parse(item.images); return imgs[0] || '' } catch { return '' } }
const parseImages = (v) => { try { return JSON.parse(v) } catch { return [] } }
const parseSpecs = (v) => { try { return JSON.parse(v) } catch { return [] } }

const fetchList = async () => {
  loading.value = true
  try {
    const res = await getKnowledgeProducts({ page: page.value, pageSize: pageSize.value, ...search })
    if (res.code === 200) { list.value = res.data.list; total.value = res.data.total }
  } catch (e) { /* */ }
  finally { loading.value = false }
}

const fetchCategories = async () => {
  try { const res = await getKnowledgeProductsCategories(); if (res.code === 200) categories.value = res.data } catch (e) { /* */ }
}

const handleAdd = () => { isEdit.value = false; editId.value = null; Object.assign(form, { name: '', category: '', model: '', description: '', price: null, specsList: [] }); dialogVisible.value = true }
const handleEdit = (item) => {
  isEdit.value = true; editId.value = item.id
  Object.assign(form, { name: item.name, category: item.category || '', model: item.model || '', description: item.description || '', price: item.price, specsList: parseSpecs(item.specs) })
  dialogVisible.value = true
}
const handleView = (item) => { detail.value = item; detailVisible.value = true }
const handleDelete = (item) => {
  ElMessageBox.confirm(`确定删除产品"${item.name}"？`, '提示', { type: 'warning' }).then(async () => {
    const res = await deleteKnowledgeProduct(item.id)
    if (res.code === 200) { ElMessage.success('已删除'); fetchList() }
  }).catch(() => {})
}

const handleSubmit = async () => {
  if (!formRef.value) return
  await formRef.value.validate(async (valid) => {
    if (!valid) return
    submitLoading.value = true
    try {
      const data = { ...form, specs: form.specsList.length > 0 ? JSON.stringify(form.specsList) : null }
      delete data.specsList
      let res
      if (isEdit.value) res = await updateKnowledgeProduct(editId.value, data)
      else res = await addKnowledgeProduct(data)
      if (res.code === 200) { ElMessage.success(isEdit.value ? '修改成功' : '新增成功'); dialogVisible.value = false; fetchList(); fetchCategories() }
    } finally { submitLoading.value = false }
  })
}

onMounted(() => { fetchList(); fetchCategories() })
</script>

<style scoped>
.page-container { padding: 0; }
.page-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: var(--space-4); }
.page-header h2 { margin: 0; font-size: 28px; font-weight: 600; color: var(--color-text); }
.search-card { margin-bottom: var(--space-4); }
.search-card .el-form-item { margin-bottom: 0; }

.product-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 20px; }
.product-card {
  background: #fff; border-radius: 16px; overflow: hidden; cursor: pointer;
  box-shadow: 0 2px 12px rgba(0,0,0,0.06); transition: transform 0.2s, box-shadow 0.2s;
  position: relative;
}
.product-card:hover { transform: translateY(-2px); box-shadow: 0 4px 20px rgba(0,0,0,0.1); }
.product-image { height: 160px; background: #f5f5f7; display: flex; align-items: center; justify-content: center; overflow: hidden; }
.product-image img { width: 100%; height: 100%; object-fit: cover; }
.product-placeholder { color: #d2d2d7; }
.product-info { padding: 16px; }
.product-name { font-size: 15px; font-weight: 600; color: var(--color-text); margin-bottom: 8px; }
.product-meta { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }
.product-model { font-size: 13px; color: var(--color-text-tertiary); }
.product-price { font-size: 16px; font-weight: 700; color: #f56c6c; }
.product-actions { position: absolute; top: 12px; right: 12px; display: flex; gap: 4px; background: rgba(255,255,255,0.9); padding: 4px 8px; border-radius: 8px; opacity: 0; transition: opacity 0.2s; }
.product-card:hover .product-actions { opacity: 1; }
.pagination { display: flex; justify-content: flex-end; margin-top: var(--space-5); }

.detail-content { font-size: 14px; }
.detail-images { margin-bottom: 16px; display: flex; flex-wrap: wrap; }
.detail-specs { margin-top: 16px; }
.detail-specs h4 { font-size: 14px; margin-bottom: 8px; }
.spec-row { display: flex; padding: 8px 0; border-bottom: 1px solid var(--color-border); }
.spec-name { width: 120px; color: var(--color-text-tertiary); }
.spec-value { flex: 1; color: var(--color-text); }
</style>
