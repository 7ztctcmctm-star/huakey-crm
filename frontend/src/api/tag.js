import request from '@/utils/request'

export const getTagList = () => request.get('/tag/list')
export const addTag = (data) => request.post('/tag/add', data)
export const updateTag = (data) => request.post('/tag/update', data)
export const deleteTag = (id) => request.post('/tag/delete', { id })
export const manageTag = (data) => request.post('/tag/manage', data)
