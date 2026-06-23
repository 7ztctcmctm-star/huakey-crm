import request from '@/utils/request'

export const getKnowledgeList = (params) => request.get('/knowledge/list', { params })
export const addKnowledge = (data) => request.post('/knowledge/add', data)
export const updateKnowledge = (data) => request.post('/knowledge/update', data)
export const deleteKnowledge = (id) => request.post('/knowledge/delete', { id })
export const getKnowledgeScripts = (params) => request.get('/knowledge/scripts', { params })
export const addKnowledgeScript = (data) => request.post('/knowledge/scripts/add', data)
export const updateKnowledgeScript = (data) => request.post('/knowledge/scripts/update', data)
export const deleteKnowledgeScript = (id) => request.post('/knowledge/scripts/delete', { id })
export const getKnowledgeFaqs = (params) => request.get('/knowledge/faqs', { params })
export const addKnowledgeFaq = (data) => request.post('/knowledge/faqs/add', data)
export const updateKnowledgeFaq = (data) => request.post('/knowledge/faqs/update', data)
export const deleteKnowledgeFaq = (id) => request.post('/knowledge/faqs/delete', { id })

// Stats
export const getKnowledgeStats = () => request.get('/knowledge/stats')

// Scripts meta
export const getKnowledgeScript = (id) => request.get(`/knowledge/scripts/${id}`)
export const getKnowledgeScriptsScenes = () => request.get('/knowledge/scripts-meta/scenes')

// FAQs meta
export const getKnowledgeFaqsCategories = () => request.get('/knowledge/faqs-meta/categories')

// Products
export const getKnowledgeProducts = (params) => request.get('/knowledge/products', { params })
export const getKnowledgeProductsCategories = () => request.get('/knowledge/products-meta/categories')
export const addKnowledgeProduct = (data) => request.post('/knowledge/products', data)
export const updateKnowledgeProduct = (id, data) => request.put(`/knowledge/products/${id}`, data)
export const deleteKnowledgeProduct = (id) => request.delete(`/knowledge/products/${id}`)

// Documents
export const getKnowledgeDocuments = (params) => request.get('/knowledge/documents', { params })
export const addKnowledgeDocument = (data, config) => request.post('/knowledge/documents', data, config)
export const updateKnowledgeDocument = (id, data) => request.put(`/knowledge/documents/${id}`, data)
export const deleteKnowledgeDocument = (id) => request.delete(`/knowledge/documents/${id}`)
