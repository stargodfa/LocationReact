/**
 * src/service-api/ILocateResultService.ts
 *
 * ILocateResultService 的职责（接口层面）：
 * - 定义“定位结果状态管理”的数据结构与最小能力：
 *   1) getState()/subscribe()：读取与订阅当前定位结果集合
 *   2) pushLocate(rec)：写入一条定位结果（通常按 mac 覆盖最新值）
 *   3) clear()：清空所有结果
 *   4) ingestFrame(msg)：供 WebSocketService 广播调用，消费后端定位消息
 *
 * 端到端数据流（典型）：
 * 后端 -> {cmd:"RelayLocated", target_mac, x,y,rssi, dev_type, anchors:[...]}
 *   -> WebSocketService.handleMessage()
 *   -> ILocateResultService.ingestFrame(msg)
 *   -> pushLocate(LocateRecord)
 *   -> subscribe 回调通知 UI（RealtimeData/LocationView）
 */

/**
 * AnchorInfo：
 * - 表示“单个锚点对本次定位计算的观测信息”
 * - 数据来源：后端 RelayLocated 消息里的 anchors 数组（你实现里 msg.anchors）
 * - 用途：
 *   - RealtimeData：展示 anchors 明细（JSON）
 *   - 后续可用于调试定位算法（哪个锚点 rssi/距离异常）
 */
export interface AnchorInfo {
  /**
   * mac：
   * - 锚点设备 MAC
   * - 用途：识别是哪一个 anchor 的观测
   */
  mac: string;

  /**
   * x, y：
   * - 锚点在世界坐标系下的位置（单位：米）
   * - 用途：定位算法调试展示
   */
  x: number;
  y: number;

  /**
   * rssi：
   * - 该锚点测到 target/relay 的信号强度
   * - 数据来源：后端观测值
   */
  rssi: number;

  /**
   * dist：
   * - 可选字段：锚点到目标的估算距离（单位通常是米）
   * - 是否存在取决于后端是否计算/下发
   */
  dist?: number;
}

/**
 * LocateRecord：
 * - 表示“某个目标 mac 的一条定位结果记录”
 * - 你当前实现是“每个 mac 只保留最新值”，用 results[mac] 覆盖
 */
export interface LocateRecord {
  /**
   * mac：
   * - 目标设备标识（你注释写 relay_mac）
   * - 数据来源：后端字段（实现里用 msg.target_mac 赋值）
   * - 用途：results 的 key，UI 显示标签
   */
  mac: string;

  /**
   * x, y：
   * - 定位解算出的世界坐标（单位：米）
   * - 数据来源：后端 RelayLocated 的 x/y
   * - 用途：LocationView 绘制定位框；RealtimeData 表格显示
   */
  x: number;
  y: number;

  /**
   * rssi：
   * - 该次定位关联的 rssi（可能是汇总或目标端 RSSI，取决于协议定义）
   * - 数据来源：后端 RelayLocated 的 rssi
   */
  rssi: number;

  /**
   * devType：
   * - 可选：设备类型（例如 MBT02/MWC01/BEACON）
   * - 数据来源：后端字段（实现里直接取 msg.dev_type）
   * - 用途：RealtimeData 过滤与显示
   */
  devType?: string;

  /**
   * anchors：
   * - 锚点观测列表（AnchorInfo[]）
   * - 数据来源：后端 RelayLocated 的 anchors
   * - 用途：调试展示与后续质量评估
   */
  anchors: AnchorInfo[];

  /**
   * ts：
   * - 可选时间戳
   * - 在你当前实现中：ts = Date.now()（前端接收时间）
   * - 若后端提供时间戳，未来可改为后端时间，便于一致性
   */
  ts?: number;
}

/**
 * ILocateResultState：
 * - 维护一个 results map：key 为 mac，value 为 LocateRecord
 *
 * 设计含义（事实）：
 * - 该结构天然表达“每个 mac 最新一条记录”
 * - 不保存历史轨迹
 */
export interface ILocateResultState {
  results: Record<string, LocateRecord>;
}

export default interface ILocateResultService {
  /**
   * getState：
   * - 返回当前定位结果集合快照
   * - 调用方：UI 初始化读一次
   */
  getState(): ILocateResultState;

  /**
   * subscribe：
   * - 订阅定位结果集合变化
   * - 调用方：RealtimeData/LocationView
   * - 返回 unsubscribe
   */
  subscribe(listener: (s: ILocateResultState) => void): () => void;

  /**
   * pushLocate：
   * - 写入一条定位记录
   * - 调用方：实现类 ingestFrame 或其它模块
   * - 典型行为：results[rec.mac] = rec（覆盖）
   */
  pushLocate(rec: LocateRecord): void;

  /**
   * clear：
   * - 清空所有定位结果
   */
  clear(): void;

  /**
   * ingestFrame：
   * - WebSocket 广播入口
   * - 调用方：WebSocketService.handleMessage
   * - 返回：是否消费该 msg
   */
  ingestFrame(msg: any): boolean;
}
