// src/service-impl/WorkbenchService.ts
//
// WorkbenchService 的职责：应用启动阶段“一次性初始化入口”。
// 当前仅做一件事：启动 WebSocketService，让后续数据链路跑起来。
// 它本身不持有状态，不做数据分发，不参与业务逻辑更新。

import { getServiceSync } from "@spring4js/container-browser";

/**
 * IWorkbenchService：
 * - 约束 WorkbenchService 的对外接口
 * - 数据来源：src/service-api/IWorkbenchService.ts
 * - 用途：主入口 main.tsx 调用 workbenchService.start() 时的编译期约束
 */
import IWorkbenchService from "../service-api/IWorkbenchService";

/**
 * IWebSocketService：
 * - WebSocket 连接管理与消息收发的 service 接口
 * - 数据来源：src/service-api/IWebSocketService.ts
 * - 用途：
 *   - start(): 建立连接与内部监听
 *   - send()/subscribe(): 供其它 service 或 UI 使用
 *
 * 数据流（宏观）：
 * - WorkbenchService.start() -> IWebSocketService.start()
 * - WebSocketService 建立连接后：
 *   - 接收服务端消息
 *   - 按 cmd/type 分发给 BluetoothDataService / MapService / LocateResultService 等（取决于实现）
 *   - 同时维护连接状态（connected/connecting/disconnected）
 */
import IWebSocketService from "../service-api/IWebSocketService";

/**
 * EService：
 * - IoC 容器中每个 service 的 key 枚举/常量
 * - 数据来源：src/service-config/EService.ts
 * - 用途：getServiceSync 时指定取哪个 service 实例
 */
import EService from "../service-config/EService";

/**
 * WorkbenchService
 * 只负责做一次性的系统初始化。
 *
 * 当前实现的“初始化”内容：
 * 1) 打印启动日志（便于确认 start() 是否被 main.tsx 调用）
 * 2) 从 IoC 容器获取 IWebSocketService 单例
 * 3) 调用 ws.start() 建立 WebSocket 连接
 *
 * 注意（事实说明）：
 * - 这里每次 start() 都会调用 ws.start()。
 * - 是否会重复连接取决于 WebSocketService.start() 内部是否做了幂等保护。
 * - 你的 App.tsx 里也调用了 wsService.start()，因此现在存在“双重启动”的可能性。
 *   这是架构层面的重复职责，后续优化会处理，但这里先只注解不改。
 */
export default class WorkbenchService implements IWorkbenchService {
  /**
   * start：
   * - 调用方：main.tsx init() 中 `await workbenchService.start()`
   * - 数据来源：应用启动流程
   * - 用途：启动系统级后台服务（目前只有 WebSocket）
   * - 流向：
   *   - 获取 ws service -> ws.start()
   *   - WebSocket 连接成功后产生的消息会流向其他业务 service（地图/蓝牙/定位等）
   */
  start(): void {
    // 以后如果还有别的初始化（比如预加载配置），也集中写在这里。
    console.log("[Workbench] started");

    /**
     * ws：
     * - 类型：IWebSocketService
     * - 数据来源：IoC 容器单例（EService.IWebSocketService 对应实现类）
     * - 用途：启动 WebSocket 连接
     * - 流向：ws.start() -> WebSocketService 内部连接与消息分发
     */
    const ws = getServiceSync<IWebSocketService>(EService.IWebSocketService);

    /**
     * ws.start：
     * - 预期行为：建立 WebSocket 连接，注册 onmessage/onclose 等回调
     * - 后续数据流：
     *   server -> ws.onmessage -> WebSocketService -> 各业务 service state 更新 -> UI subscribe 重渲染
     */
    ws.start();
  }
}
