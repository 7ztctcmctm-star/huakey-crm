import request from '@/utils/request'

// ============ 认证 ============
export const login = (data) => request.post('/auth/login', data)
export const logout = () => request.post('/auth/logout')
export const getMe = () => request.get('/auth/me')
export const getProfile = () => request.get('/auth/profile')
export const updateProfile = (data) => request.post('/auth/update-profile', data)
export const changePassword = (data) => request.post('/auth/change-password', data)
export const forceChangePassword = (data) => request.post('/auth/force-change-password', data)
export const getCaptcha = () => request.get('/auth/captcha')
