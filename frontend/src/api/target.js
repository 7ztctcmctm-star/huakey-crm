import request from '@/utils/request'

export const getTargetList = (params) => request.post('/target/list', params)
export const batchSetTarget = (data) => request.post('/target/batch-set', data)
