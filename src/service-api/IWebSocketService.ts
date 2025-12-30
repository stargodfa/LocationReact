/**
 * src/service-api/IWebSocketService.ts
 *
 * IWebSocketService 的职责（接口层面）：
 * - 规定“WebSocket 连接管理服务”的最小能力边界：
 *   1) start() 启动连接（并可重复调用）
 *   2) send(data) 发送消息
 *   3) subscribe(listener) 订阅连接状态
 *
 * 在当前工程里的数据流位置：
 * - WorkbenchService.start() / App.tsx useEffect -> IWebSocketService.start()
 * - App.tsx 订阅状态 -> connected 后发 GetMapList/GetMapScale/GetBeaconList
 * - 其它 service（BeaconPositionService、BeaconListService、MapConfigService via bindSender）调用 send()
 * - WebSocketService 实现类内部 onmessage -> 广播给各业务 service.ingestFrame（该能力不在接口里暴露）
 *
 * 注意（事实）：
 * - 该接口没有暴露“收到消息”的订阅能力，你的架构选择是“由 WebSocketService 内部分发到各 ingestFrame”。
 * - send(data:any) 默认约定发送 JSON，可由实现类统一 JSON.stringify。
 */

export type WSStatus = "connecting" | "connected" | "disconnected";

/**
 * 纯 WebSocket 管理服务接口。
 * 只负责连接 / 重连 / 发送 / 状态通知。
 */
export default interface IWebSocketService {
  /**
   * start：
   * - 调用时机：应用初始化阶段或需要确保连接时
   * - 设计意图：重复调用是安全的（幂等由实现类保证）
   *
   * 数据流：
   * start() -> 建立 ws 连接 -> 状态变化通过 subscribe 广播
   */
  start(): void;

  /**
   * send：
   * - 输入：data（任意对象）
   * - 数据来源：
   *   - UI 发命令（GetMapList/GetMapScale/GetBeaconList 等）
   *   - 业务 service 发命令（SetBeaconPosition/RemoveBeacon/SetMapScale 等）
   * - 用途：向服务端发送一条 JSON 消息
   * - 流向：实现类通常会 JSON.stringify(data) -> ws.send(string)
   *
   * 注意（事实）：接口不描述“未连接时的行为”（丢弃/排队/报错），由实现类决定。
   */
  send(data: any): void;

  /**
   * subscribe：
   * - 输入：listener(status)
   * - 输出：unsubscribe()
   * - 用途：让 UI 能显示连接状态并在 connected 时触发初始化请求
   *
   * 状态说明：
   * - "connecting"：开始建立连接或重连中
   * - "connected"：WebSocket.OPEN
   * - "disconnected"：未连接（close 后或未创建）
   *
   * 数据流：
   * ws 事件 -> 实现类 emitStatus -> listener(status) -> UI setState -> 渲染
   */
  subscribe(listener: (status: WSStatus) => void): () => void;
}
