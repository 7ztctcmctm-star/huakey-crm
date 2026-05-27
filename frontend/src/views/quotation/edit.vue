<template>
  <div class="quotation-edit">
    <el-card shadow="never">
      <div class="page-header">
        <h2>{{ isEdit ? '编辑报价单' : '新建报价单' }}</h2>
        <div class="header-actions">
          <el-button @click="handleBack">返回</el-button>
          <el-button type="primary" :loading="submitLoading" @click="handleSubmit">
            {{ isEdit ? '保存修改' : '创建报价单' }}
          </el-button>
        </div>
      </div>

      <el-form ref="formRef" :model="formData" label-width="100px">
        <!-- 基本信息 -->
        <div class="form-section">
          <h3 class="section-title">基本信息</h3>
          <el-row :gutter="24">
            <el-col :span="12">
              <el-form-item label="报价单号" v-if="isEdit">
                <el-input v-model="formData.quote_no" disabled />
              </el-form-item>
            </el-col>
          </el-row>
          <el-row :gutter="24">
            <el-col :span="12">
              <el-form-item label="客户" prop="customer_id">
                <el-select
                  v-model="formData.customer_id"
                  placeholder="请选择客户"
                  filterable
                  remote
                  :remote-method="searchCustomers"
                  :loading="customerLoading"
                  @change="handleCustomerChange"
                  style="width: 100%"
                >
                  <el-option
                    v-for="item in customerOptions"
                    :key="item.id"
                    :label="item.company_name"
                    :value="item.id"
                  />
                </el-select>
              </el-form-item>
            </el-col>
            <el-col :span="12">
              <el-form-item label="有效期(天)" prop="valid_days">
                <el-input-number
                  v-model="formData.valid_days"
                  :min="1"
                  :max="365"
                  placeholder="天数"
                  style="width: 100%"
                />
              </el-form-item>
            </el-col>
          </el-row>
          <el-row :gutter="24">
            <el-col :span="12">
              <el-form-item label="折扣">
                <div class="discount-input">
                  <el-input-number
                    v-model="formData.discount"
                    :min="0"
                    :max="0.99"
                    :step="0.01"
                    :precision="2"
                    placeholder="0.05表示95折"
                    style="flex: 1"
                  />
                  <span class="discount-label">= {{ discountPercent }}折</span>
                </div>
              </el-form-item>
            </el-col>
            <el-col :span="12">
              <el-form-item label="状态" v-if="isEdit">
                <el-select v-model="formData.status" style="width: 100%">
                  <el-option v-for="item in statusOptions" :key="item.value" :label="item.label" :value="item.value" />
                </el-select>
              </el-form-item>
            </el-col>
          </el-row>
          <el-row :gutter="24">
            <el-col :span="24">
              <el-form-item label="备注">
                <el-input v-model="formData.remark" type="textarea" :rows="3" placeholder="请输入备注" />
              </el-form-item>
            </el-col>
          </el-row>
        </div>

        <!-- 客户信息 -->
        <div class="form-section" v-if="customerInfo">
          <h3 class="section-title">客户信息</h3>
          <el-row :gutter="24">
            <el-col :span="8">
              <div class="info-item">
                <span class="info-label">公司名称:</span>
                <span class="info-value">{{ customerInfo.company_name }}</span>
              </div>
            </el-col>
            <el-col :span="8">
              <div class="info-item">
                <span class="info-label">联系人:</span>
                <span class="info-value">{{ customerInfo.contact_name }}</span>
              </div>
            </el-col>
            <el-col :span="8">
              <div class="info-item">
                <span class="info-label">联系电话:</span>
                <span class="info-value">{{ customerInfo.phone }}</span>
              </div>
            </el-col>
          </el-row>
        </div>

        <!-- 产品明细 -->
        <div class="form-section">
          <h3 class="section-title">产品明细</h3>
          
          <!-- 添加产品按钮 -->
          <el-button type="success" :icon="Plus" @click="showProductModal = true" style="margin-bottom: 16px">
            添加产品
          </el-button>

          <!-- 产品表格 -->
          <el-table
            :data="formData.items"
            border
            style="width: 100%"
            :header-cell-style="{ background: 'var(--c-bg)' }"
          >
            <el-table-column label="产品信息" min-width="250">
              <template #default="{ row }">
                <div class="product-info">
                  <div class="product-name">{{ row.product_name }}</div>
                  <div class="product-code">{{ row.product_code }}</div>
                </div>
              </template>
            </el-table-column>
            <el-table-column label="单位" width="80" align="center">
              <template #default="{ row }">{{ row.unit }}</template>
            </el-table-column>
            <el-table-column label="数量" width="100">
              <template #default="{ row }">
                <el-input-number
                  v-model="row.quantity"
                  :min="1"
                  @change="calculateItemTotal(row)"
                  style="width: 100%"
                />
              </template>
            </el-table-column>
            <el-table-column label="单价" width="120" align="right">
              <template #default="{ row }">
                <el-input-number
                  v-model="row.unit_price"
                  :min="0.01"
                  :step="0.01"
                  :precision="2"
                  @change="calculateItemTotal(row)"
                  style="width: 100%"
                />
              </template>
            </el-table-column>
            <el-table-column label="小计" width="120" align="right">
              <template #default="{ row }">
                <span class="item-total">¥{{ formatAmount(row.total_price) }}</span>
              </template>
            </el-table-column>
            <el-table-column label="备注" width="150">
              <template #default="{ row }">
                <el-input v-model="row.remark" placeholder="备注" />
              </template>
            </el-table-column>
            <el-table-column label="操作" width="80" align="center">
              <template #default="{ row }">
                <el-button type="danger" link :icon="Delete" @click="removeItem(row)">删除</el-button>
              </template>
            </el-table-column>
          </el-table>

          <!-- 空状态 -->
          <div v-if="formData.items.length === 0" class="empty-state">
            <el-icon :size="48" color="#ccc"><ShoppingCart /></el-icon>
            <p>暂无产品，请点击上方按钮添加产品</p>
          </div>
        </div>

        <!-- 金额汇总 -->
        <div class="form-section total-section">
          <h3 class="section-title">金额汇总</h3>
          <div class="total-row">
            <span class="total-label">产品总价:</span>
            <span class="total-value">¥{{ formatAmount(totalAmount) }}</span>
          </div>
          <div class="total-row">
            <span class="total-label">折扣:</span>
            <span class="total-value">-¥{{ formatAmount(discountAmount) }}</span>
          </div>
          <div class="total-row final">
            <span class="total-label">折后金额:</span>
            <span class="total-value">¥{{ formatAmount(finalAmount) }}</span>
          </div>
        </div>
      </el-form>
    </el-card>

    <!-- 选择产品弹窗 -->
    <el-dialog
      v-model="showProductModal"
      title="选择产品"
      width="900px"
      :close-on-click-modal="false"
    >
      <div class="product-modal">
        <!-- 搜索 -->
        <el-form :model="productSearch" inline style="margin-bottom: 16px">
          <el-form-item>
            <el-input v-model="productSearch.name" placeholder="产品名称" clearable @keyup.enter="fetchProducts" />
          </el-form-item>
          <el-form-item>
            <el-select v-model="productSearch.category" placeholder="产品分类" clearable>
              <el-option v-for="cat in categories" :key="cat" :label="cat" :value="cat" />
            </el-select>
          </el-form-item>
          <el-form-item>
            <el-button type="primary" @click="fetchProducts">搜索</el-button>
          </el-form-item>
        </el-form>

        <!-- 产品列表 -->
        <el-table
          v-loading="productLoading"
          :data="productList"
          border
          style="width: 100%"
          :header-cell-style="{ background: 'var(--c-bg)' }"
          @row-click="selectProduct"
        >
          <el-table-column type="selection" width="55" />
          <el-table-column prop="code" label="产品编码" width="120" />
          <el-table-column prop="name" label="产品名称" min-width="200" />
          <el-table-column prop="category" label="分类" width="100" />
          <el-table-column prop="unit" label="单位" width="80" />
          <el-table-column prop="price" label="参考价格" width="120" align="right">
            <template #default="{ row }">¥{{ formatAmount(row.price) }}</template>
          </el-table-column>
          <el-table-column prop="stock" label="库存" width="80" align="center" />
          <el-table-column prop="description" label="描述" />
        </el-table>

        <div class="modal-footer">
          <el-pagination
            v-model:current-page="productSearch.page"
            v-model:page-size="productSearch.pageSize"
            :page-sizes="[10, 20, 50]"
            :total="productTotal"
            layout="total, sizes, prev, pager, next, jumper"
            @size-change="fetchProducts"
            @current-change="fetchProducts"
          />
        </div>
      </div>
      <template #footer>
        <el-button @click="showProductModal = false">取消</el-button>
        <el-button type="primary" @click="confirmSelectProduct">确认添加</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted, watch } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { ElMessage } from 'element-plus'
import { Plus, Delete, ShoppingCart } from '@element-plus/icons-vue'
import { post, get } from '@/utils/request'
import { formatAmount } from '@/composables/useFormat'

const router = useRouter()
const route = useRoute()

const STATUS_MAP = { 1: '草稿', 2: '已发送', 3: '已确认', 4: '已失效' }

const statusOptions = [
  { label: '草稿', value: 1 },
  { label: '已发送', value: 2 },
  { label: '已确认', value: 3 },
  { label: '已失效', value: 4 }
]

// 是否编辑
const isEdit = computed(() => !!route.params.id)

// 表单数据
const formData = reactive({
  customer_id: '',
  opportunity_id: '', // [修复] 关联商机ID
  valid_days: 30,
  discount: 0,
  remark: '',
  quote_no: '',
  status: 1,
  items: []
})

// 客户信息
const customerInfo = ref(null)

// 客户选择
const customerOptions = ref([])
const customerLoading = ref(false)

// 产品选择
const showProductModal = ref(false)
const productSearch = reactive({ name: '', category: '', page: 1, pageSize: 10 })
const productList = ref([])
const productTotal = ref(0)
const productLoading = ref(false)
const categories = ref([])
const selectedProducts = ref([])

// 提交状态
const submitLoading = ref(false)
const formRef = ref(null)

// 折扣百分比显示
const discountPercent = computed(() => {
  return ((1 - formData.discount) * 100).toFixed(0)
})

// 计算总价
const totalAmount = computed(() => {
  return formData.items.reduce((sum, item) => sum + (item.total_price || 0), 0)
})

// 折扣金额
const discountAmount = computed(() => {
  return totalAmount.value * formData.discount
})

// 折后金额
const finalAmount = computed(() => {
  return totalAmount.value * (1 - formData.discount)
})

// 搜索客户
const searchCustomers = async (query) => {
  if (!query) {
    customerOptions.value = []
    return
  }
  customerLoading.value = true
  try {
    const res = await post('/customer/list', { company_name: query, pageSize: 20 })
    if (res.code === 200) {
      customerOptions.value = res.data.list
    }
  } catch (error) {
    console.error('搜索客户失败:', error)
  } finally {
    customerLoading.value = false
  }
}

// 获取客户详情
const handleCustomerChange = async () => {
  if (!formData.customer_id) {
    customerInfo.value = null
    return
  }
  try {
    const res = await get(`/customer/detail/${formData.customer_id}`)
    if (res.code === 200) {
      customerInfo.value = res.data.customer
    }
  } catch (error) {
    console.error('获取客户详情失败:', error)
  }
}

// 获取产品列表
const fetchProducts = async () => {
  productLoading.value = true
  try {
    const params = {
      page: productSearch.page,
      pageSize: productSearch.pageSize
    }
    if (productSearch.name) params.name = productSearch.name
    if (productSearch.category) params.category = productSearch.category

    const res = await post('/product/list', params)
    if (res.code === 200) {
      productList.value = res.data.list
      productTotal.value = res.data.total
    }
  } catch (error) {
    console.error('获取产品列表失败:', error)
  } finally {
    productLoading.value = false
  }
}

// 获取产品分类
const fetchCategories = async () => {
  try {
    const res = await get('/product/categories')
    if (res.code === 200) {
      categories.value = res.data
    }
  } catch (error) {
    console.error('获取产品分类失败:', error)
  }
}

// 选择产品
const selectProduct = (row) => {
  const index = selectedProducts.value.findIndex(p => p.id === row.id)
  if (index > -1) {
    selectedProducts.value.splice(index, 1)
  } else {
    selectedProducts.value.push(row)
  }
}

// 确认添加产品
const confirmSelectProduct = () => {
  if (selectedProducts.value.length === 0) {
    ElMessage.warning('请选择产品')
    return
  }

  selectedProducts.value.forEach(product => {
    const existingIndex = formData.items.findIndex(item => item.product_id === product.id)
    if (existingIndex > -1) {
      formData.items[existingIndex].quantity += 1
      formData.items[existingIndex].total_price = formData.items[existingIndex].quantity * formData.items[existingIndex].unit_price
    } else {
      formData.items.push({
        product_id: product.id,
        product_name: product.name,
        product_code: product.code,
        unit: product.unit,
        quantity: 1,
        unit_price: product.price,
        total_price: product.price,
        remark: ''
      })
    }
  })

  const count = selectedProducts.value.length
  selectedProducts.value = []
  showProductModal.value = false
  ElMessage.success(`已添加 ${count} 个产品`)
}

// 计算单项金额
const calculateItemTotal = (row) => {
  row.total_price = row.quantity * row.unit_price
}

// 删除产品项
const removeItem = (row) => {
  const index = formData.items.indexOf(row)
  if (index > -1) {
    formData.items.splice(index, 1)
  }
}

// 获取报价单详情
const fetchQuoteDetail = async () => {
  try {
    const res = await get(`/quote/detail/${route.params.id}`)
    if (res.code === 200) {
      const data = res.data
      formData.customer_id = data.customer_id
      formData.valid_days = data.valid_days
      formData.discount = data.discount
      formData.remark = data.remark
      formData.quote_no = data.quote_no
      formData.status = data.status
      
      formData.items = (data.items || []).map(item => ({
        product_id: item.product_id,
        product_name: item.product_name,
        product_code: item.product_code,
        unit: item.unit || '个',
        quantity: item.quantity,
        unit_price: item.unit_price,
        total_price: item.total_price,
        remark: item.remark || ''
      }))

      await handleCustomerChange()
    }
  } catch (error) {
    console.error('获取报价单详情失败:', error)
  }
}

// 提交表单
const handleSubmit = async () => {
  if (!formData.customer_id) {
    ElMessage.warning('请选择客户')
    return
  }
  if (formData.items.length === 0) {
    ElMessage.warning('请添加产品')
    return
  }

  submitLoading.value = true
  try {
    const data = {
      customer_id: formData.customer_id,
      opportunity_id: formData.opportunity_id || undefined,
      items: formData.items.map(item => ({
        product_id: item.product_id,
        quantity: item.quantity,
        unit_price: item.unit_price,
        remark: item.remark
      })),
      discount: formData.discount,
      valid_days: formData.valid_days,
      remark: formData.remark
    }

    let res
    if (isEdit.value) {
      data.id = route.params.id
      data.status = formData.status
      res = await post('/quote/update', data)
    } else {
      res = await post('/quote/add', data)
    }

    if (res.code === 200) {
      ElMessage.success(isEdit.value ? '修改成功' : '创建成功')
      router.push('/quotation')
    }
  } catch (error) {
    console.error('提交失败:', error)
    ElMessage.error('提交失败')
  } finally {
    submitLoading.value = false
  }
}

// 返回
const handleBack = () => {
  router.push('/quotation')
}

onMounted(() => {
  fetchCategories()
  if (isEdit.value) {
    fetchQuoteDetail()
  } else if (route.query.customer_id) {
    // 从商机跳转过来，预填客户
    const cid = parseInt(route.query.customer_id)
    const cname = route.query.customer_name || ''
    customerOptions.value = [{ id: cid, company_name: cname }]
    formData.customer_id = cid
    // [修复] 接收并保存商机ID
    if (route.query.opportunity_id) {
      formData.opportunity_id = parseInt(route.query.opportunity_id)
    }
    handleCustomerChange()
  }
})
</script>

<style scoped>
.quotation-edit {
  padding: 0;
}

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 24px;
  padding-bottom: 16px;
  border-bottom: 1px solid #eee;
}

.page-header h2 {
  margin: 0;
  font-size: 18px;
}

.header-actions {
  display: flex;
  gap: 12px;
}

.form-section {
  margin-bottom: 24px;
}

.section-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--c-text);
  margin: 0 0 16px 0;
  padding-left: 8px;
  border-left: 4px solid var(--c-primary);
}

.discount-input {
  display: flex;
  align-items: center;
  gap: 12px;
}

.discount-label {
  color: var(--c-text-secondary);
  font-size: 13px;
}

.info-item {
  display: flex;
  gap: 8px;
}

.info-label {
  color: var(--c-text-secondary);
  font-size: 13px;
}

.info-value {
  color: var(--c-text);
  font-weight: 500;
}

.product-info {
  display: flex;
  flex-direction: column;
}

.product-name {
  font-weight: 500;
  color: var(--c-text);
}

.product-code {
  font-size: 12px;
  color: var(--c-text-tertiary);
}

.item-total {
  font-weight: 600;
  color: var(--c-primary);
}

.empty-state {
  text-align: center;
  padding: 32px;
  color: #999;
}

.empty-state p {
  margin-top: 8px;
}

.total-section {
  background: #fafafa;
  padding: 16px;
  border-radius: 4px;
}

.total-row {
  display: flex;
  justify-content: space-between;
  padding: 8px 0;
  border-bottom: 1px dashed #e4e7ed;
}

.total-row:last-child {
  border-bottom: none;
}

.total-row.final {
  margin-top: 8px;
  padding: 16px;
  background: #fff;
  border-radius: 4px;
}

.total-row.final .total-value {
  font-size: 20px;
  font-weight: 700;
  color: var(--c-primary);
}

.total-label {
  color: var(--c-text-secondary);
}

.total-value {
  color: var(--c-text);
  font-weight: 600;
}

.product-modal {
  max-height: 500px;
  overflow-y: auto;
}

.modal-footer {
  margin-top: 16px;
  display: flex;
  justify-content: flex-end;
}
</style>
