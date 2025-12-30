/**
 * src/lib/env/global-fn.ts
 *
 * 该文件的职责：
 * 1) 重新导出 getServiceSync（来自 @spring4js/container-browser）
 *    让工程内统一从这里 import，避免到处写第三方路径。
 * 2) 提供 getGEnvironmentSync()：读取挂载在 window 上的全局 Environment 实例
 *
 * 在当前工程中的数据流位置：
 * - main.tsx：
 *   new Environment({ services }) -> env.init() -> env.setToGlobal()
 *   => window._szGlobal.environment 被赋值
 * - 之后任意模块：
 *   getGEnvironmentSync() -> 读到同一个 env 实例（用于调试或访问 env 提供的能力）
 *
 * 注意（事实）：
 * - 这个文件本身不创建任何实例，不做 DI，只是“读取和导出”工具函数。
 */

import Environment from "./Environment";

/**
 * getServiceSync：
 * - 数据来源：@spring4js/container-browser（第三方 IoC 容器）
 * - 用途：按服务 key 从容器中“同步”获取服务单例
 * - 流向：被 App.tsx、各 service-impl、各 view 组件调用
 *
 * 典型数据流：
 * getServiceSync(EService.IWebSocketService) -> WebSocketService 单例
 *
 * 关键事实：
 * - 如果 Environment 尚未注册 services，则 getServiceSync 可能取不到实例或抛错（取决于容器实现）。
 */
export { getServiceSync } from "@spring4js/container-browser";

/**
 * getGEnvironmentSync：
 * - 用途：读取全局挂载的 Environment 实例
 * - 数据来源：window._szGlobal.environment
 * - 前置条件：Environment.setToGlobal() 已执行（main.tsx init 流程里执行）
 * - 流向：返回给调用方（通常用于调试、读取 env 配置、访问 env 内部工具）
 *
 * 返回值语义（事实）：
 * - 代码签名写的是 Environment，但实现可能返回 undefined。
 *   因为未初始化时 window._szGlobal.environment 不存在。
 * - 这会让 TS 类型与运行时不一致，严格模式下应改为 Environment | undefined。
 */
export function getGEnvironmentSync(): Environment {
  return (window as any)?._szGlobal?.environment;
}
