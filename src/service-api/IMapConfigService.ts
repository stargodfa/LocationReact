/**
 * src/service-api/IMapConfigService.ts
 *
 * IMapConfigService（按地图隔离的地图配置接口）
 *
 * 设计要点：
 * - 地图配置是“按 mapId 分区”的状态，而不是全局唯一
 * - UI 必须先指定 currentMapId，所有读写才有明确作用域
 * - WebSocket 下发的 MapScale 也必须带 map_id
 */

export type MapConfigState = {
  /**
   * currentMapId：
   * - 当前正在操作 / 展示的地图 ID
   * - 数据来源：
   *   - UI 切换地图时调用 setCurrentMap(mapId)
   * - 用途：
   *   - 决定 setMeterToPixel 作用于哪张地图
   *   - UI 渲染时读取对应 mapId 的比例
   */
  currentMapId: string | null;

  /**
   * meterToPixelByMap：
   * - 各地图独立的比例配置
   * - key：mapId
   * - value：1 米对应的像素数
   *
   * 数据来源：
   * - 后端下发 MapScale(map_id, meter_to_pixel)
   * - UI 在当前地图下设置 / 标定
   */
  meterToPixelByMap: Record<string, number>;
};

export default interface IMapConfigService {
  /**
   * getState：
   * - 调用方：UI 初始化 / subscribe 回调
   * - 返回：完整 MapConfigState
   */
  getState(): MapConfigState;

  /**
   * setCurrentMap：
   * - 输入：mapId
   * - 调用方：UI（MapsManager 切换地图时）
   * - 用途：
   *   - 切换当前配置作用域
   *   - 若该地图尚无比例配置，初始化默认值
   */
  setCurrentMap(mapId: string): void;

  /**
   * setMeterToPixel：
   * - 输入：value（px / meter）
   * - 调用方：UI（MapsManager）
   * - 语义：
   *   - 更新“当前地图”的比例
   *   - 是否上报后端由实现类决定
   *
   * 前置条件：
   * - currentMapId 必须已设置
   */
  setMeterToPixel(value: number): void;

  /**
   * subscribe：
   * - 输入：listener(state)
   * - 输出：unsubscribe
   * - 用途：配置变化时通知 UI 重渲染
   */
  subscribe(listener: (state: MapConfigState) => void): () => void;

  /**
   * ingestFrame：
   * - 调用方：WebSocketService.handleMessage
   * - 输入：msg（JSON.parse 后对象）
   * - 返回：是否消费该消息
   *
   * 典型识别：
   * - msg.cmd === "MapScale"
   * - msg.map_id 为 string
   * - msg.meter_to_pixel 为 number
   */
  ingestFrame(msg: any): boolean;
}
