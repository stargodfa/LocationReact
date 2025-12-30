/**
 * src/service-config/service-info.ts
 *
 * service-info 的职责：
 * - 定义“服务注册表”（service 映射表）
 * - Environment 在启动阶段读取该对象，把 key -> instance 注册到 IoC 容器（ServiceRegistry）
 * - 之后所有 getServiceSync(EService.xxx) 都会返回这里注册的单例实例
 *
 * 本文件决定了：
 * 1) 全局单例有哪些
 * 2) 每个 service 的实现类是谁
 * 3) 各 service 的生命周期（整个页面生命周期内常驻）
 *
 * 数据流（初始化）：
 * main.tsx -> new Environment({ services }) -> env.init() -> env.setToGlobal()
 *   -> ServiceRegistry 内可通过 EService key 取到本表注册的实例
 *
 * 注意（事实）：
 * - 这里使用 `new XxxService()` 在模块加载时就会实例化。
 * - 如果某个 Service 的构造函数里立刻 getServiceSync 取其它 service，会在 “Environment 注册完成之前”
 *   触发依赖获取，存在潜在时序风险。
 * - 你已经在部分 service 里把 getServiceSync 放到“类字段初始化”或“方法调用时”，减少了顶层 import 即触发 DI 的风险。
 *   但这仍然取决于实例化时机（本文件加载就实例化）。
 */

import EService from "./EService";

/**
 * 各 service 的实现类：
 * - 数据来源：src/service-impl/*
 * - 用途：提供具体实现给 IoC 注册
 * - 流向：services 对象里的 value
 */
import WorkbenchService from "../service-impl/WorkbenchService";
import BluetoothDataService from "../service-impl/BluetoothDataService";
import BeaconPositionService from "../service-impl/BeaconPositionService";
import LocateResultService from "../service-impl/LocateResultService";
import WebSocketService from "../service-impl/WebSocketService";
import MapService from "../service-impl/MapService";
import MapConfigService from "../service-impl/MapConfigService";
import BeaconListService from "../service-impl/BeaconListService";

/**
 * services：
 * - key：EService 枚举值（字符串或 symbol，取决于你的 EService.ts 定义）
 * - value：对应 service 的单例实例
 *
 * Environment 会读取该对象并注册所有服务：
 * - 数据来源：main.tsx 传入 new Environment({ services })
 * - 用途：构建全局 service 容器
 * - 流向：getServiceSync(EService.xxx) 的返回值
 */
const services = {
  /**
   * IWorkbenchService：
   * - 实际 WorkbenchService 只做“一次性初始化入口”，目前仅调用 ws.start()
   * - 数据流：main.tsx init() -> workbenchService.start()
   */
  [EService.IWorkbenchService]: new WorkbenchService(),

  /**
   * IWebSocketService：
   * - WebSocket 连接管理与消息广播分发入口
   * - 数据流：
   *   UI/Workbench -> ws.start()
   *   后端消息 -> ws.onmessage -> handleMessage -> 各 ingestFrame
   */
  [EService.IWebSocketService]: new WebSocketService(),

  /**
   * IBluetoothDataService：
   * - 消费后端透传 BLE 消息（msg.raw）并维护实时表
   * - UI：RealtimeData 订阅并展示
   */
  [EService.IBluetoothDataService]: new BluetoothDataService(),

  /**
   * IBeaconPositionService：
   * - 锚点坐标管理（手动设置、清除、拉取、默认）
   * - UI：MapsManager 拖拽/输入更新；LocationView 渲染锚点
   */
  [EService.IBeaconPositionService]: new BeaconPositionService(),

  /**
   * ILocateResultService：
   * - 消费 RelayLocated 定位结果并维护 results[mac] 最新值
   * - UI：RealtimeData 显示定位表；LocationView 渲染定位框
   */
  [EService.ILocateResultService]: new LocateResultService(),

  /**
   * IMapService：
   * - 消费 MapList 并维护 maps 数组
   * - UI：MapsManager/LocationView 的地图下拉与 mapSrc 拼接
   */
  [EService.IMapService]: new MapService(),

  /**
   * IMapConfigService：
   * - 消费 MapScale 并维护 meterToPixel
   * - UI：MapsManager 输入或标定后 setMeterToPixel -> 本地更新 + WS 上报
   * - 依赖：WebSocketService.start() 会调用 bindSender 注入 send
   */
  [EService.IMapConfigService]: new MapConfigService(),

  /**
   * IBeaconListService：
   * - 消费 Beacon/Mac list 整表与增量消息并维护 macList
   * - UI：MapsManager 的 beacon 选择下拉；删除时 removeBeacon -> WS + 乐观更新
   * - 备用：refresh() 可走 HTTP endpoints 拉取
   */
  [EService.IBeaconListService]: new BeaconListService(),
};

export default services;
