import request from '@/utils/request'

// ============ 全局搜索 ============
export const globalSearch = (keyword) => request.get('/search/global', { params: { keyword } })
