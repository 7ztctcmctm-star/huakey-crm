import { ref, reactive } from 'vue'

export function useTable(fetchFn) {
  const loading = ref(false)
  const data = ref([])
  const total = ref(0)
  const page = ref(1)
  const pageSize = ref(20)

  async function fetch() {
    loading.value = true
    try {
      const result = await fetchFn({ page: page.value, pageSize: pageSize.value })
      if (result) {
        data.value = result.list || []
        total.value = result.total || 0
      }
    } finally { loading.value = false }
  }

  function onPageChange(p) { page.value = p; fetch() }
  function onSizeChange(s) { pageSize.value = s; page.value = 1; fetch() }
  function refresh() { page.value = 1; fetch() }

  return { loading, data, total, page, pageSize, fetch, onPageChange, onSizeChange, refresh }
}

export function useSearchForm(initial, fetchFn) {
  const form = reactive({ ...initial })
  function search() { fetchFn() }
  function reset() {
    Object.keys(initial).forEach(k => { form[k] = initial[k] })
    fetchFn()
  }
  return { form, search, reset }
}
