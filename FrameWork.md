当前架构特性与优势如下。

## 架构特性

* 单一 WS 入口。`WebSocketService` 负责连接管理，收包 parse，统一广播到各业务 service 的 `ingestFrame(msg)`。
* 业务状态服务化。每个领域一类 service，职责清晰：

  * `BluetoothDataService` 只管 BLE 实时表。
  * `LocateResultService` 只管定位结果最新值。
  * `BeaconPositionService` 只管锚点坐标和相关命令。
  * `MapService` 只管地图列表。
  * `MapConfigService` 只管比例 `meterToPixel`，并支持“WS 下发 + UI 上报”。
  * `BeaconListService` 只管 beacon 列表，支持 WS 推送与 HTTP 兜底。
* 轻量状态内核。用 `StateBase + zustand/vanilla` 做存储与订阅，不绑 React 生命周期。
* IoC 容器统一依赖获取。`Environment + ServiceRegistry + EService + getServiceSync` 让全局单例服务可复用。
* UI 三屏分离。RealtimeData, MapsManager, LocationView 分别聚焦数据观测，配置标定，定位可视化。

## 优势

* 低耦合。UI 不需要知道 WS 协议细节，主要订阅 service 状态。协议解析集中在各 service 的 `ingestFrame`。
* 易扩展。新增一种后端消息只需新增或修改一个 service 的 `ingestFrame`，不影响其它模块。
* 状态可复用。多个视图共享同一份状态源，不需要 props drilling，不需要 Redux 复杂样板。
* 即时性强。WS 推送直达状态服务，UI 订阅后即时重渲染，适合实时定位和实时 BLE。
* 可测试性较好。业务逻辑基本是纯函数式的“msg -> state 变更”，可用 mock msg 单测各 `ingestFrame`。
* 有兜底通道。Beacon 列表既可 WS 整表推送，也可 HTTP `refresh()` 拉取，降低后端改动风险。
* 交互闭环明确。配置类操作（锚点、比例、删除 beacon）由 service 发命令，后端回包再刷新状态，UI 只表现状态。
