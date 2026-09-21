/**
 * @file 认证 API 模块
 * @module api/auth
 * @description 登录 / 登出 / 用户资料 / 密码 / 验证码
 *
 * 统一返回结构：后端 axios 封装返回 response.data，即
 *   { code: 200, message: '...', data: {...} }
 * 前端调用后请用 `res.code === 200` 判断成功，`res.data` 取业务数据。
 *
 * 认证方式：httpOnly Cookie（后端设置 sameSite=strict），前端不持久化 token。
 * 刷新策略：axios 封装在 request.js 中统一处理 401 → 尝试 refresh → 重放原请求。
 */
import request from '@/utils/request'

/**
 * 登录
 * @param {Object} data
 * @param {string} data.username
 * @param {string} data.password
 * @param {string} [data.captcha]   验证码（SKIP_CAPTCHA=true 时可省略）
 * @returns {Promise<{code:number, message:string, data:{user:{id:number, username:string, role_code:string}}}>}
 */
export const login = (data) => request.post('/auth/login', data)

/** 登出（清 cookie + 后端 token 黑名单） */
export const logout = () => request.post('/auth/logout')

/** 获取当前登录用户完整信息（权限 / 角色 / 部门） */
export const getMe = () => request.get('/auth/me')

/** 获取当前用户基础资料（不含权限，轻量版） */
export const getProfile = () => request.get('/auth/profile')

/** 修改当前用户资料（邮箱、手机等，不含密码） */
export const updateProfile = (data) => request.post('/auth/update-profile', data)

/** 修改密码（需提供旧密码） */
export const changePassword = (data) => request.post('/auth/change-password', data)

/** 强制改密（管理员对其他用户使用，或 must_change_password 强制场景） */
export const forceChangePassword = (data) => request.post('/auth/force-change-password', data)

/** 获取图形验证码（svg-captcha，前端渲染） */
export const getCaptcha = () => request.get('/auth/captcha')
