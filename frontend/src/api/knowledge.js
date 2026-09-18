import request from '@/utils/request'

// ============ 知识库 ============
// 注意：以下调用必须与 backend/routes/knowledge.js 的 RESTful 路由保持一致，
// 后端只有 POST/PUT/DELETE /knowledge/{scripts,faqs}，不存在 /add、/update、/delete 后缀路由。
export const getKnowledgeScripts = (params) => request.get('/knowledge/scripts', { params })
export const addKnowledgeScript = (data) => request.post('/knowledge/scripts', data)
export const updateKnowledgeScript = (id, data) => request.put(`/knowledge/scripts/${id}`, data)
export const deleteKnowledgeScript = (id) => request.delete(`/knowledge/scripts/${id}`)
export const getKnowledgeFaqs = (params) => request.get('/knowledge/faqs', { params })
export const addKnowledgeFaq = (data) => request.post('/knowledge/faqs', data)
export const updateKnowledgeFaq = (id, data) => request.put(`/knowledge/faqs/${id}`, data)
export const deleteKnowledgeFaq = (id) => request.delete(`/knowledge/faqs/${id}`)
export const getKnowledgeStats = () => request.get('/knowledge/stats')
export const getKnowledgeScript = (id) => request.get(`/knowledge/scripts/${id}`)
export const getKnowledgeScriptsScenes = () => request.get('/knowledge/scripts-meta/scenes')
export const getKnowledgeFaqsCategories = () => request.get('/knowledge/faqs-meta/categories')
export const getKnowledgeProducts = (params) => request.get('/knowledge/products', { params })
export const getKnowledgeProductsCategories = () => request.get('/knowledge/products-meta/categories')
export const addKnowledgeProduct = (data) => request.post('/knowledge/products', data)
export const updateKnowledgeProduct = (id, data) => request.put(`/knowledge/products/${id}`, data)
export const deleteKnowledgeProduct = (id) => request.delete(`/knowledge/products/${id}`)
export const getKnowledgeDocuments = (params) => request.get('/knowledge/documents', { params })
export const addKnowledgeDocument = (data, config) => request.post('/knowledge/documents', data, config)
export const updateKnowledgeDocument = (id, data) => request.put(`/knowledge/documents/${id}`, data)
export const deleteKnowledgeDocument = (id) => request.delete(`/knowledge/documents/${id}`)
