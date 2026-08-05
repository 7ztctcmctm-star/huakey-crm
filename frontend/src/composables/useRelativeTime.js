/**
 * 兼容入口：实现已统一至 @/utils/time.js
 * 保留旧命名以兼容已有引用（CustomerTable / HeaderBar 等），
 * 新代码请直接 import { formatRelativeTime } from '@/utils/time'
 */
export { formatRelativeTime as relativeTime, formatFullTime as fullTime, formatRelativeNextTime as relativeNextTime } from '@/utils/time'
