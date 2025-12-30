/**
 * src/service-api/IBeaconPositionService.ts
 *
 * IBeaconPositionService 的职责（接口层面）：
 * - 定义“锚点坐标（anchors）状态管理”的数据结构与能力：
 *   1) getState()/subscribe()：读取与订阅 anchors 状态
 *   2) setCoord/clearCoord/clearAll：前端对锚点坐标的写操作（通常需要同步到后端）
 *   3) getAllCoords/setDefaultCoords/loadFromServer：与后端交互或批量写入的能力
 *   4) ingestFrame(msg)：供 WebSocketService 广播调用，消费后端下发的锚点列表
 *
 * 端到端数据流（典型）：
 * - UI（MapsManager）拖拽/输入 -> setCoord -> 本地 anchors 更新 -> UI 渲染红点
 *                         -> （实现类）WS send SetBeaconPosition -> 后端保存
 * - 后端 -> WS 推送 BeaconPositions(items) -> ingestFrame -> loadFromServer -> anchors 更新 -> UI 渲染
 */

/**
 * BeaconCoord：
 * - 单个锚点的世界坐标（单位：米）
 * - 数据来源：
 *   1) UI 输入/拖拽生成
 *   2) 后端 BeaconPositions 下发
 * - 用途：Map 视图中渲染锚点位置与调试显示
 */
export interface BeaconCoord {
  /**
   * mac：
   * - 锚点设备唯一标识
   * - anchors 的 key 通常也用同一个 mac 字符串
   */
  mac: string;

  /**
   * x, y：
   * - 世界坐标（单位：米）
   * - 用途：在地图上计算像素坐标绘制锚点
   */
  x: string extends never ? never : number; // 仅说明：类型为 number
  y: number;
}

/**
 * IBeaconPositionState：
 * - anchors：Record<string, BeaconCoord>
 * - 表达“按 mac 索引的锚点集合”
 *
 * 设计含义（事实）：
 * - 该结构天然表达“每个 mac 最新一份坐标”
 * - 不保存历史变化
 */
export interface IBeaconPositionState {
  anchors: Record<string, BeaconCoord>;
}

export default interface IBeaconPositionService {
  /**
   * getState：
   * - 调用方：UI 初始化读一次
   * - 返回：当前 anchors 快照
   */
  getState(): IBeaconPositionState;

  /**
   * subscribe：
   * - 订阅 anchors 状态变化
   * - 调用方：MapsManager/LocationView
   * - 返回 unsubscribe
   */
  subscribe(listener: (s: IBeaconPositionState) => void): () => void;

  /**
   * setCoord：
   * - 输入：mac, x, y（单位：米）
   * - 调用方：UI（MapsManager）
   * - 用途：更新某个锚点坐标
   *
   * 注意（事实）：接口不规定是否通知后端，但你的实现会 WS send SetBeaconPosition。
   */
  setCoord(mac: string, x: number, y: number): void;

  /**
   * clearCoord：
   * - 输入：mac
   * - 用途：删除单个锚点坐标
   * - 实现通常会本地删除并通知后端清除
   */
  clearCoord(mac: string): void;

  /**
   * clearAll：
   * - 用途：清空所有锚点
   * - 实现通常会本地清空并通知后端清除
   */
  clearAll(): void;

  /**
   * getAllCoords：
   * - 返回：当前 anchors 的列表快照
   * - 语义上是“读”，但你的实现里还会顺带向后端发 GetBeaconPositions 请求。
   * - 这属于接口语义的隐藏副作用点，后续若要清晰可拆成：
   *   - requestAllCoords(): void（只请求）
   *   - getAllCoords(): BeaconCoord[]（纯读取）
   */
  getAllCoords(): BeaconCoord[];

  /**
   * setDefaultCoords：
   * - 用途：请求后端恢复默认锚点
   * - 后端预期：随后下发 BeaconPositions 更新前端
   */
  setDefaultCoords(): void;

  /**
   * loadFromServer：
   * - 输入：items（通常是后端下发的锚点列表）
   * - 用途：批量写入 anchors
   *
   * 注意（事实）：接口名暗示来源是 server，但它本质是“批量写入”的 setter。
   */
  loadFromServer(items: BeaconCoord[]): void;

  /**
   * ingestFrame：
   * - WebSocket 广播入口
   * - 调用方：WebSocketService.handleMessage
   * - 返回：是否消费该 msg
   *
   * 典型识别：
   * - msg.cmd === "BeaconPositions"
   * - msg.items 是 BeaconCoord[]
   */
  ingestFrame(msg: any): boolean;
}
