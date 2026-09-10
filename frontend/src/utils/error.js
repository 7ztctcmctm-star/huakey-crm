/**
 * 统一错误出口 —— 收敛散落在业务组件里的 console.error / console.warn。
 *
 * 约定：
 * - 业务代码一律使用 reportError / reportWarn，禁止直接调用 console.error。
 * - 当前仍输出到控制台（与改造前行为一致）。项目尚未接入错误上报服务，
 *   若此时在生产环境静默丢弃错误，将是可观测性的倒退。
 * - 待接入上报服务后，只需在本文件内改为「仅上报、不落控制台」，
 *   无需再改动 47 个调用点。
 */

/** 已注册的上报器，通过 setErrorReporter 注入 */
let reporter = null

/**
 * 注册统一错误上报通道。
 * @param {(level: 'error'|'warn', args: any[]) => void} fn
 */
export function setErrorReporter(fn) {
  reporter = typeof fn === 'function' ? fn : null
}

function emit(level, args) {
  if (reporter) {
    try {
      reporter(level, args)
    } catch (e) {
      // 上报器自身异常不得影响主流程
      void e
    }
  }
}

export function reportError(...args) {
  console.error(...args)
  emit('error', args)
}

export function reportWarn(...args) {
  console.warn(...args)
  emit('warn', args)
}

export default { reportError, reportWarn, setErrorReporter }
