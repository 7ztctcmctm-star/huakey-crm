import request from '@/utils/request'

export const globalSearch = (keyword) => request.get('/search/global', { params: { keyword } })
