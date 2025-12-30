/**
 * src/service-config/EService.ts
 *
 * EService 的职责：
 * - 作为 IoC 容器（@spring4js/container-browser）里“服务标识符”的统一枚举。
 * - 所有 service 的注册与获取都通过这些 key 完成。
 *
 * 使用位置（数据流）：
 * 1) 注册（service-info.ts）
 *    services = { [EService.IWebSocketService]: new WebSocketService(), ... }
 *    -> Environment.init() 把 key->instance 写入 ServiceRegistry
 *
 * 2) 获取（任意地方）
 *    getServiceSync<IWebSocketService>(EService.IWebSocketService)
 *    -> 返回在 ServiceRegistry 里注册的同一个单例实例
 *
 * 注意（事实）：
 * - enum 的 value 是字符串，会成为 ServiceRegistry 的 key。
 * - value 命名不一致会导致“注册 key”和“获取 key”对不上，从而取不到实例。
 * - 你这里有几处 value 与枚举名/类名不完全一致（比如 IMapService 的 value 是 "IMapService"），
 *   但只要注册和获取都用同一个 EService 值，就不会出错。
 */

enum EService {
  /**
   * IWorkbenchService：
   * - key: "WorkbenchService"
   * - 用途：获取 WorkbenchService 单例
   * - 调用方：main.tsx（workbenchService.start）
   */
  IWorkbenchService = "WorkbenchService",

  /**
   * IWebSocketService：
   * - key: "WebSocketService"
   * - 用途：获取 WebSocketService 单例
   * - 调用方：WorkbenchService / App.tsx / 其它 service（BeaconPositionService、BeaconListService 等）
   */
  IWebSocketService = "WebSocketService",

  /**
   * IBluetoothDataService：
   * - key: "BluetoothDataService"
   * - 用途：获取 BluetoothDataService 单例
   * - 调用方：RealtimeData.tsx + WebSocketService 广播 ingestFrame
   */
  IBluetoothDataService = "BluetoothDataService",

  /**
   * IBeaconPositionService：
   * - key: "BeaconPositionService"
   * - 用途：获取 BeaconPositionService 单例
   * - 调用方：MapsManager/LocationView + WebSocketService 广播 ingestFrame
   */
  IBeaconPositionService = "BeaconPositionService",

  /**
   * ILocateResultService：
   * - key: "LocateResultService"
   * - 用途：获取 LocateResultService 单例
   * - 调用方：RealtimeData/LocationView + WebSocketService 广播 ingestFrame
   */
  ILocateResultService = "LocateResultService",

  /**
   * IMapService：
   * - key: "IMapService"
   * - 用途：获取 MapService 单例
   * - 调用方：MapsManager/LocationView + WebSocketService 广播 ingestFrame
   *
   * 注意（事实）：这里的 value 不是 "MapService" 而是 "IMapService"。
   * 只要 service-info.ts 也用同一个 key 注册，就没问题。
   */
  IMapService = "IMapService",

  /**
   * IMapConfigService：
   * - key: "IMapConfigService"
   * - 用途：获取 MapConfigService 单例
   * - 调用方：MapsManager/LocationView + WebSocketService 广播 ingestFrame
   */
  IMapConfigService = "IMapConfigService",

  /**
   * IBeaconListService：
   * - key: "IBeaconListService"
   * - 用途：获取 BeaconListService 单例
   * - 调用方：MapsManager + WebSocketService 广播 ingestFrame
   */
  IBeaconListService = "IBeaconListService",
}

export default EService;
