<template>
  <el-popover
    placement="bottom-start"
    :width="420"
    trigger="manual"
    v-model:visible="searchVisible"
    popper-class="global-search-popover"
  >
    <template #reference>
      <el-input
        v-model="searchKeyword"
        placeholder="搜索客户、合同、商机..."
        :prefix-icon="Search"
        clearable
        class="global-search-input"
        @input="onSearchInput"
        @focus="onSearchFocus"
        @keydown.enter="doSearch"
        @blur="onSearchBlur"
      >
        <template #suffix>
          <span class="search-shortcut-hint">Ctrl+K</span>
        </template>
      </el-input>
    </template>
    <div v-loading="searchLoading" class="search-results">
      <div v-if="searchKeyword.length < 2" class="search-hint">请输入至少2个字符</div>
      <template v-else>
        <div v-if="searchResults.customers.length > 0" class="search-group">
          <div class="search-group-title">客户</div>
          <div
            v-for="item in searchResults.customers"
            :key="'c' + item.id"
            class="search-item"
            @click="goTo('/customer/detail/' + item.id)"
          >
            <span class="search-item-name">{{ item.company_name }}</span>
            <span class="search-item-sub">{{ item.contact_name }} {{ item.phone }}</span>
          </div>
        </div>
        <div v-if="searchResults.contracts.length > 0" class="search-group">
          <div class="search-group-title">合同</div>
          <div
            v-for="item in searchResults.contracts"
            :key="'ct' + item.id"
            class="search-item"
            @click="goTo('/contract/detail/' + item.id)"
          >
            <span class="search-item-name">{{ item.contract_no }}</span>
            <span class="search-item-sub">{{ item.customer_name }}</span>
          </div>
        </div>
        <div v-if="searchResults.opportunities.length > 0" class="search-group">
          <div class="search-group-title">商机</div>
          <div
            v-for="item in searchResults.opportunities"
            :key="'o' + item.id"
            class="search-item"
            @click="goTo('/opportunity')"
          >
            <span class="search-item-name">{{ item.name }}</span>
            <span class="search-item-sub">{{ item.customer_name }} · {{ item.stage_name }}</span>
          </div>
        </div>
        <div v-if="searchResults.quotes.length > 0" class="search-group">
          <div class="search-group-title">报价</div>
          <div
            v-for="item in searchResults.quotes"
            :key="'q' + item.id"
            class="search-item"
            @click="goTo('/quotation/edit/' + item.id)"
          >
            <span class="search-item-name">{{ item.quote_no }}</span>
            <span class="search-item-sub">{{ item.customer_name }}</span>
          </div>
        </div>
        <div
          v-if="searchResults.customers.length === 0 && searchResults.contracts.length === 0 && searchResults.opportunities.length === 0 && searchResults.quotes.length === 0"
          class="search-hint"
        >未找到匹配结果</div>
      </template>
    </div>
  </el-popover>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { Search } from '@element-plus/icons-vue'
import { globalSearch } from '@/api/search'

const router = useRouter()

const searchKeyword = ref('')
const searchVisible = ref(false)
const searchLoading = ref(false)
const searchResults = ref({ customers: [], contracts: [], opportunities: [], quotes: [] })
let searchTimer = null

const doSearch = async () => {
  if (searchKeyword.value.trim().length < 2) {
    searchResults.value = { customers: [], contracts: [], opportunities: [], quotes: [] }
    return
  }
  searchLoading.value = true
  try {
    const res = await globalSearch(searchKeyword.value.trim())
    if (res.code === 200) searchResults.value = res.data
  } catch { /* ignore */ }
  finally { searchLoading.value = false }
}

const onSearchInput = () => {
  searchVisible.value = searchKeyword.value.trim().length >= 1
  clearTimeout(searchTimer)
  searchTimer = setTimeout(doSearch, 500)
}

const onSearchFocus = () => {
  if (searchKeyword.value.trim().length >= 1) searchVisible.value = true
}

const onSearchBlur = () => {
  setTimeout(() => { searchVisible.value = false }, 200)
}

const goTo = (path) => {
  searchVisible.value = false
  searchKeyword.value = ''
  router.push(path)
}

// Ctrl+K 全局快捷键
const handleGlobalKeydown = (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
    e.preventDefault()
    const input = document.querySelector('.global-search-input input')
    if (input) input.focus()
  }
  if (e.key === 'Escape') {
    searchKeyword.value = ''
    const input = document.querySelector('.global-search-input input')
    if (input) input.blur()
  }
}

onMounted(() => document.addEventListener('keydown', handleGlobalKeydown))
onUnmounted(() => document.removeEventListener('keydown', handleGlobalKeydown))
</script>

<style scoped>
.search-results {
  max-height: 400px;
  overflow-y: auto;
}

.search-hint {
  text-align: center;
  padding: 20px;
  color: #909399;
  font-size: 13px;
}

.search-group {
  margin-bottom: 8px;
}

.search-group-title {
  font-size: 12px;
  color: #909399;
  padding: 4px 8px;
  font-weight: 600;
}

.search-item {
  padding: 8px 12px;
  cursor: pointer;
  border-radius: 4px;
  transition: background 0.2s;
}

.search-item:hover {
  background: #f5f7fa;
}

.search-item-name {
  display: block;
  font-size: 14px;
  color: #303133;
}

.search-item-sub {
  display: block;
  font-size: 12px;
  color: #909399;
  margin-top: 2px;
}

.search-shortcut-hint {
  font-size: 11px;
  color: #c0c4cc;
  background: #f5f7fa;
  padding: 2px 6px;
  border-radius: 3px;
}
</style>
