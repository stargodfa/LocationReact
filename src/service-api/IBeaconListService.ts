/**
 * src/service-api/IBeaconListService.ts
 *
 * IBeaconListService 的职责（接口层面）：
 * - 定义“Beacon MAC 列表状态管理”的数据结构与能力：
 *   1) getState()/subscribe()：读取与订阅 macList、loading、error、lastUpdatedAt
 *   2) refresh()：从服务器拉取一次完整列表（HTTP 方式的兜底通道）
 *   3) setMacList/addMac/removeMac：手动写入能力（调试或特殊场景）
 *   4) removeBeacon(mac)：对外删除 beacon 的业务动作（通常需要通知后端）
 *   5) ingestFrame(msg)：供 WebSocketService 广播调用，消费后端整表/增量推送
 *
 * 端到端数据流（典型）：
 * - 后端 WS 整表/增量 -> ingestFrame -> 更新 state -> UI 订阅刷新
 * - UI 删除 -> removeBeacon -> （实现类）WS send RemoveBeacon + 本地乐观更新 -> UI 刷新
 * - UI/外部触发兜底 -> refresh -> HTTP fetch -> 更新 state -> UI 刷新
 */

// BeaconMac：语义别名，表示一个规范化后的 MAC 字符串
export type BeaconMac = string;

/**
 * IBeaconListState：
 * - service 的整体状态
 * - macList：当前可用 beacon 列表
 * - loading：refresh() 期间为 true
 * - error：refresh() 或解析失败的错误字符串
 * - lastUpdatedAt：最后一次成功更新的时间戳（通常是 Date.now）
 */
export interface IBeaconListState {
  macList: BeaconMac[];
  loading: boolean;
  error?: string;
  lastUpdatedAt?: number;
}

export type BeaconListListener = (state: IBeaconListState) => void;

export default interface IBeaconListService {
  /**
   * getState：
   * - 调用方：UI 初始化读一次
   * - 返回：当前 IBeaconListState 快照
   */
  getState(): IBeaconListState;

  /**
   * subscribe：
   * - 输入：listener(state)
   * - 输出：unsubscribe
   * - 用途：状态变化时驱动 UI 更新（例如 MapsManager 的 Select options）
   */
  subscribe(listener: BeaconListListener): () => void;

  /**
   * refresh：
   * - 语义：从服务器拉取一次完整列表（通常是 HTTP GET）
   * - 返回：Promise<void>（异步完成后更新 state 并通知订阅者）
   *
   * 数据流（实现层常见）：
   * refresh() -> loading=true -> fetch -> macList 更新/错误写入 -> loading=false -> emit
   */
  refresh(): Promise<void>;

  /**
   * setMacList：
   * - 手动整表替换
   * - 调用方：调试/特殊场景
   * - 用途：直接覆盖当前 macList 并通知订阅者
   */
  setMacList(list: BeaconMac[]): void;

  /**
   * addMac：
   * - 手动增量新增
   * - 调用方：调试/特殊场景 或 WS 增量消息处理
   * - 用途：把一个 mac 加入列表（实现通常会去重/排序/规范化）
   */
  addMac(mac: BeaconMac): void;

  /**
   * removeMac：
   * - 手动删除（一般不用）
   * - 调用方：调试/特殊场景
   *
   * 注意（事实）：
   * - 你当前实现 BeaconListService 中把 removeMac(mac) 兼容为 removeBeacon(mac)。
   *   也就是说在实现里 removeMac 会“发命令给服务器并乐观更新”，不再是纯本地删除。
   * - 因此接口注释“手动删除（一般不用）”与实现语义存在偏差。
   */
  removeMac(mac: BeaconMac): void;

  /**
   * removeBeacon：
   * - 对外业务动作：删除某个 beacon
   * - 典型实现：
   *   1) 发送 WS 命令 {cmd:"RemoveBeacon", mac}
   *   2) 本地乐观移除 macList
   */
  removeBeacon(mac: string): void;

  /**
   * ingestFrame：
   * - WebSocket 广播入口
   * - 调用方：WebSocketService.handleMessage
   * - 返回：是否消费该 msg
   *
   * 典型识别：
   * - 整表：MacList/BeaconMacList/BeaconList/BeaconMacs
   * - 增量：BeaconAdded/MacAdded/BeaconRemoved/MacRemoved
   */
  ingestFrame(msg: any): boolean;
}
