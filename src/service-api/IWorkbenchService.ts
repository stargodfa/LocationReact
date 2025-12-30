/**
 * src/service-api/IWorkbenchService.ts
 *
 * IWorkbenchService 的职责（接口层面）：
 * - 定义“应用启动一次性初始化入口”的统一形状。
 * - 让 main.tsx / Environment / 其它调用方只依赖接口，不依赖具体实现类。
 *
 * 在当前工程中的数据流位置：
 * - main.tsx 在 env 完成注册后，通过 getServiceSync(EService.IWorkbenchService) 获取实现
 * - main.tsx 调用 workbenchService.start()
 * - WorkbenchService.start() 内部目前会启动 WebSocketService.start()
 *
 * 注意（事实）：
 * - start() 被设计为“只调用一次”，但接口本身不保证幂等。
 * - 幂等需要实现类（WorkbenchService）或被启动的服务（WebSocketService）自行保证。
 */

export default interface IWorkbenchService {
  /**
   * start：
   * - 调用时机：应用启动阶段（main.tsx init() 内）
   * - 调用频率：设计意图是一次
   *
   * 输入：
   * - 无（当前接口不接受参数）
   *
   * 输出：
   * - void（同步接口）
   *
   * 预期副作用（由实现类决定）：
   * - 启动 WebSocketService（建立连接、绑定消息回调）
   * - 预加载配置或初始数据（例如请求地图列表、比例、Beacon 列表等）
   *
   * 后续数据流（典型）：
   * start() -> ws.start() -> 后端推送/回包 -> 各 ingestFrame 更新状态 -> UI 渲染
   */
  start(): void;
}
