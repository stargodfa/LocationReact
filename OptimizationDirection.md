# 现有可能缺点与后续优化方向（按优先级）

## P0 可靠性与时序风险

* **服务实例化时机不可控**

  * 现状：`service-info.ts` 顶层 `new XxxService()`，模块加载即实例化。部分 service 在类字段初始化里 `getServiceSync`，仍可能在容器完全就绪前触发依赖获取。
  * 风险：启动偶发空指针，热更新时覆盖全局 registry 后状态错乱。
  * 优化：把 services 改为“工厂注册”或延迟实例化。Environment 内按需创建并注入依赖。

* **重复启动 WS 的职责重叠**

  * 现状：`WorkbenchService.start()` 调 `ws.start()`，`App.tsx` 也调 `ws.start()`。
  * 风险：重复连接逻辑分散，初始化命令发送时机不确定。
  * 优化：只保留一个入口。建议 Workbench 负责启动与初始命令发送，App 只订阅状态展示。

* **MapConfigService 的 sender 注入依赖 WS start 时序**

  * 现状：`WebSocketService.start()` 才 `bindSender` 注入 sendFn。
  * 风险：UI 在 WS 未 start 前调用 `setMeterToPixel` 会本地生效但不上报。
  * 优化：容器层做依赖注入。或 MapConfigService 内部直接依赖 IWebSocketService。或 sendFn 做队列缓冲直到 connected。

## P1 协议与接口一致性

* **接口语义与实现不一致**

  * 例：`IMapConfigService.setMeterToPixel` 注释写“来自 WS”，实现是“UI 写入并上报后端”。
  * 例：`IBeaconListService.removeMac` 注释写“手动删除”，实现转调 `removeBeacon` 会发命令。
  * 优化：统一接口语义。拆分 `applyFromServer()` 与 `setByUser()`，或用明确命名 `set...Local` `set...Remote`。

* **EService 命名规则不统一**

  * 现状：有的 value 是类名，有的是接口名。
  * 风险：维护成本高，容易注册与获取 key 不一致。
  * 优化：统一规则，例如全部用实现类名或全部用接口名。

* **协议字段不够“类型化”**

  * 现状：大量 `msg:any` + 手工字段容错，缺少统一的消息定义。
  * 风险：后端字段变更不易发现，运行时 silent fail。
  * 优化：定义 `WsMessage` 联合类型与 schema 校验。每个 cmd 有独立类型与解析函数。

## P2 性能与渲染压力

* **BLE 列表的去重逻辑可能不符合预期**

  * 现状：`bleLatestList` 用 `if (!seen.has(mac)) seen.set(mac, row)`，依赖列表顺序“最新在前”才成立。
  * 风险：若未来 push 顺序变化或服务端批量下发，显示会变成“最旧”。
  * 优化：显式按时间/seq 取最大，或 Map 覆盖写 `seen.set(mac,row)` 保留最后一次。

* **频繁 JSON stringify/parse**

  * 现状：BluetoothDataService 存 string，UI 再 parse 做过滤和展示。
  * 风险：高频数据时 CPU/GC 压力大。
  * 优化：DataRow 存结构化对象 `rawObj/parsedObj`，展示时再 stringify。或在 service 内缓存 parsed 结构。

* **拖拽锚点高频发包**

  * 现状：MapsManager 用 rAF 节流但仍可能每帧发送。
  * 风险：WS 带宽浪费，后端写库压力。
  * 优化：增加最小位移阈值与发送间隔（例如 50ms），松手强制发送最终值。

## P3 状态一致性与可观察性

* **缺少“请求-响应”的关联与确认**

  * 现状：命令发送后没有 requestId/ack，靠整表或推送最终一致。
  * 风险：丢包或后端拒绝时，前端乐观状态与真实状态不一致。
  * 优化：协议增加 `req_id` 与 `cmd_ack/err`，前端维护 pending 队列与失败回滚。

* **emit/subscribe 异常隔离不一致**

  * 现状：有的 service emit 包 try/catch，有的（BeaconListService）没有。
  * 风险：一个 listener 抛错会影响其它订阅者。
  * 优化：统一在所有 emit 中隔离异常，并可选上报日志。

* **日志缺少统一开关与分级**

  * 现状：大量 console.log，生产环境噪声。
  * 优化：增加 logger 抽象，按环境控制级别与采样。

## P4 代码结构与可维护性

* **WS 分发顺序与“handled”语义脆弱**

  * 现状：services 数组固定顺序，`handled = s.ingestFrame(msg) || handled`。
  * 风险：同一消息被多个 service “部分消费”时不好管理，或误判 unknown。
  * 优化：建立 cmd -> handler 映射表或路由器。每个 cmd 明确唯一归属或广播策略。

* **UI 内联样式过多**

  * 现状：App/MapsManager/LocationView 大量 inline style。
  * 风险：难主题化，难复用，难全局调整。
  * 优化：抽 CSS module 或 styled 组件，统一布局与主题变量。

## 建议的落地顺序（最小改动路径）

1. P0：去掉 App.tsx 的 `ws.start()`，只保留 Workbench 启动与初始命令发送。
2. P0：把 `MapConfigService` 改为直接依赖 `IWebSocketService`，取消 bindSender 注入。
3. P1：统一接口注释与方法命名，拆分“WS下发应用”和“UI设置上报”。
4. P2：BluetoothDataService 改为存结构化对象，减少 parse/stringify。
5. P3：协议加 `req_id` 与 ack，Beacon 删除与比例设置做确认与失败回滚。
