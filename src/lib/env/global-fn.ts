import Environment from './Environment'

/**
 * 从 spring4js 全局容器中同步获取某个服务。
 * 该函数由 spring4js 提供，这里仅做 re-export。
 * 用法示例：
 *   const ws = getServiceSync<WebSocketClient>("WebSocketClient")
 */
export { getServiceSync } from '@spring4js/container-browser'

/**
 * 获取全局挂载的 Environment 实例。
 * 前提是 Environment.setToGlobal() 已执行。
 *
 * 原理：
 *   Environment 在初始化时调用 setToGlobal()
 *   setToGlobal() 会将实例挂载到 window._szGlobal.environment
 *   本函数直接读取该全局对象并返回
 *
 * 返回：
 *   - Environment 实例
 *   - 未初始化时返回 undefined
 */
export function getGEnvironmentSync(): Environment {
    return (window as any)?._szGlobal?.environment
}
