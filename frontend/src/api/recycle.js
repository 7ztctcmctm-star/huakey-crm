import request from '@/utils/request'

// ============ 回收站 ============
export const getRecycleList = (params) => request.post('/recycle/list', params)
export const restoreRecycle = (data) => request.post('/recycle/restore', data)
export const permanentDelete = (data) => request.post('/recycle/permanent-delete', data)
