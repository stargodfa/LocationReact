/**
 * src/service-api/IMapConfigService.ts
 *
 * IMapConfigService 的职责（接口层面）：
 * - 定义“地图配置状态”的读取、订阅与更新能力。
 * - 当前配置只有一个字段：meterToPixel（米到像素的换算比例）。
 *
 * 在当前工程中的数据流位置：
 * - UI（MapsManager/LocationView）：
 *   - getState()/subscribe() 读取 meterToPixel
 *   - MapsManager 调用 setMeterToPixel(value) 触发本地更新并上报后端（由实现类决定）
 * - WebSocketService：
 *   - 广播后端消息给 ingestFrame(msg)，实现类识别 MapScale 并更新本地状态
 *
 * 注意（事实）：
 * - 接口层把 setMeterToPixel 注释为“来自 WS”，但你的实现 MapConfigService.setMeterToPixel
 *   实际是“UI 侧调用入口：本地更新 + 发给服务端”。
 *   也就是说：接口注释与实现语义不一致，后续需要统一命名或注释。
 */

export type MapConfigState = {
  /**
   * meterToPixel：
   * - 含义：1 米对应多少像素（px per meter）
   * - 数据来源：
   *   1) 后端下发 MapScale（ingestFrame）
   *   2) UI 设置/标定（setMeterToPixel）
   * - 用途：
   *   - MapsManager：把“米坐标”映射到地图像素坐标显示锚点
   *   - LocationView：世界坐标 -> 屏幕像素绘制锚点与定位框
   */
  meterToPixel: number;
};

export default interface IMapConfigService {
  /**
   * getState：
   * - 调用方：UI 初始化读一次
   * - 返回：MapConfigState
   * - 用途：同步快照
   */
  getState(): MapConfigState;

  /**
   * setMeterToPixel：
   * - 输入：value
   * - 调用方：UI（MapsManager）或其它模块
   * - 用途：更新 meterToPixel
   *
   * 注意（事实）：接口并未规定该方法是否会“发给服务端”。
   * 是否上报取决于实现类（你当前实现会发送 SetMapScale）。
   *
   * 建议后续（说明结构矛盾，不改代码）：
   * - 若要区分来源，可拆成：
   *   - setMeterToPixel(value) 代表 UI intent（会发给后端）
   *   - applyMeterToPixel(value) 代表 WS 下发（只本地更新）
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
   * - 调用方：WebSocketService.handleMessage 广播
   * - 输入：msg（JSON.parse 后对象）
   * - 返回：boolean 是否消费
   *
   * 典型识别：
   * - msg.cmd === "MapScale"
   * - msg.meter_to_pixel 为 number
   */
  ingestFrame(msg: any): boolean;
}
