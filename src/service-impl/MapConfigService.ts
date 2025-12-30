/**
 * src/service-impl/MapConfigService.ts
 *
 * MapConfigService 的职责：
 * - 维护地图比例配置 MapConfigState（目前只有 meterToPixel）
 * - 给 UI 提供 getState()/subscribe() 读取与订阅
 * - 给 UI 提供 setMeterToPixel()：本地更新 + 通过 WebSocket 上报后端
 * - 给 WebSocketService 提供 ingestFrame(msg)：消费后端下发的 MapScale 更新
 * - 提供 bindSender(fn)：由 WebSocketService.start() 注入“发送函数”，实现 service -> WS 的反向调用
 *
 * 数据流（端到端）：
 * 1) 后端 -> 前端（下发比例）
 *    WS msg { cmd:"MapScale", meter_to_pixel:number }
 *      -> WebSocketService.handleMessage()
 *      -> MapConfigService.ingestFrame(msg)
 *      -> normalize -> setMeterToPixelLocal
 *      -> emit -> UI subscribe 回调 -> setMeterToPixel(state.meterToPixel)
 *
 * 2) 前端 -> 后端（用户修改比例）
 *    UI 调用 mapConfigService.setMeterToPixel(v)
 *      -> normalize -> setMeterToPixelLocal -> emit -> UI 立即刷新
 *      -> sendToServer -> sendFn({cmd:"SetMapScale", meter_to_pixel:value})
 *      -> WebSocketService.send() -> 后端处理并持久化/广播
 */

import IMapConfigService, {
  MapConfigState,
} from "../service-api/IMapConfigService";

/**
 * CMD_SET_MAP_SCALE：
 * - 数据来源：前后端协议约定（字符串 cmd）
 * - 用途：前端向后端提交比例的命令名
 * - 流向：sendToServer() 发出 { cmd: "SetMapScale", meter_to_pixel: ... }
 *
 * 你注释里写“后端需要实现该 cmd”，表示当前协议依赖后端配合。
 */
const CMD_SET_MAP_SCALE = "SetMapScale";

type SendFn = (msg: any) => void;

export default class MapConfigService implements IMapConfigService {
  /**
   * state：
   * - MapConfigState 的内存状态
   * - 当前只有 meterToPixel
   * - 数据来源：
   *   1) 初始默认值 300
   *   2) ingestFrame(msg) 从后端下发更新
   *   3) setMeterToPixel(value) 来自 UI 更新
   * - 用途：统一提供给 UI 的“单一数据源”
   * - 流向：getState()/subscribe() -> UI
   */
  private state: MapConfigState = {
    meterToPixel: 300,
  };

  /**
   * listeners：
   * - 订阅者集合（UI 注册的回调）
   * - 数据来源：subscribe(listener)
   * - 用途：state 变化时通知 UI
   * - 流向：emit() -> listeners 回调
   */
  private listeners = new Set<(s: MapConfigState) => void>();

  /**
   * sendFn：
   * - 由 WebSocket 入口注入的“发送函数”
   * - 数据来源：WebSocketService.start() 里 mapConfig.bindSender(...)
   * - 用途：让 MapConfigService 能在内部调用 sendToServer() 发 WS 消息
   * - 流向：sendToServer() -> this.sendFn(payload) -> WebSocketService.send(payload)
   *
   * 关键事实：
   * - sendFn 为 null 时，MapConfigService 只会本地更新，不会上报后端。
   */
  private sendFn: SendFn | null = null;

  /**
   * bindSender：
   * - 调用方：WebSocketService.start()
   * - 输入：fn(msg)
   * - 用途：把 WebSocketService.send 注入进来
   * - 流向：this.sendFn = fn
   */
  bindSender(fn: SendFn) {
    this.sendFn = fn;
  }

  /**
   * getState：
   * - 调用方：UI 初始化时读取（MapsManager/LocationView）
   * - 返回：当前 state 引用
   * - 用途：提供快照，避免等待 subscribe 回放
   */
  getState(): MapConfigState {
    return this.state;
  }

  /**
   * setMeterToPixel：
   * - 调用方：UI（MapsManager 的 commitMeterToPixel）
   * - 输入：value（用户输入或标定计算）
   * - 行为：
   *   1) normalize：校验并固定两位小数
   *   2) setMeterToPixelLocal：只更新本地并 emit 给 UI
   *   3) sendToServer：通过 sendFn 发给后端（如果 sendFn 已绑定）
   *
   * 数据流：
   * UI -> setMeterToPixel -> emit (UI 立即刷新)
   *                  -> sendToServer -> WS -> 后端
   */
  setMeterToPixel(value: number): void {
    const fixed = this.normalize(value);
    if (fixed == null) return;

    // 本地状态不变则不继续（避免重复 emit/重复发送）
    if (!this.setMeterToPixelLocal(fixed)) return;

    // 关键：发送到服务端
    this.sendToServer(fixed);
  }

  /**
   * subscribe：
   * - 调用方：UI useEffect 中订阅
   * - 行为：
   *   1) 加入 listeners
   *   2) 立即回放当前 state（listener(this.state)）
   *   3) 返回 unsubscribe
   */
  subscribe(listener: (state: MapConfigState) => void): () => void {
    this.listeners.add(listener);
    listener(this.state);
    return () => this.listeners.delete(listener);
  }

  /**
   * ingestFrame：
   * - 调用方：WebSocketService.handleMessage 广播
   * - 输入：msg（JSON.parse 后的对象）
   * - 返回：boolean 表示是否消费了该消息
   *
   * 识别规则：
   * - msg.cmd === "MapScale"
   * - msg.meter_to_pixel 为 number
   *
   * 行为：
   * - normalize
   * - setMeterToPixelLocal（只本地更新，不回发，避免回环）
   *
   * 数据流：
   * 后端 -> WS -> ingestFrame -> emit -> UI
   */
  ingestFrame(msg: any): boolean {
    if (!msg || typeof msg !== "object") return false;

    // 服务端下发：只更新本地，不回发，避免回环
    if (msg.cmd === "MapScale" && typeof msg.meter_to_pixel === "number") {
      const fixed = this.normalize(msg.meter_to_pixel);
      if (fixed == null) return true; // msg 结构对但数值非法，仍认为“已处理”
      this.setMeterToPixelLocal(fixed);
      return true;
    }

    return false;
  }

  /* ================= private ================= */

  /**
   * normalize：
   * - 输入：v
   * - 输出：number（两位小数）或 null（非法）
   * - 校验：
   *   - 必须是有限数字
   *   - 必须 > 0
   * - 用途：统一约束 meterToPixel 的格式与合法性
   */
  private normalize(v: number): number | null {
    const n = Number(v);
    if (!Number.isFinite(n) || n <= 0) return null;
    return Number(n.toFixed(2));
  }

  /**
   * setMeterToPixelLocal：
   * - 只更新本地 state 并 emit
   * - 不做任何网络发送
   * - 返回：是否发生变化
   *
   * 数据流：
   * 修改 state -> emit -> UI 订阅者
   */
  private setMeterToPixelLocal(value: number): boolean {
    if (this.state.meterToPixel === value) return false;
    this.state.meterToPixel = value;
    this.emit();
    return true;
  }

  /**
   * sendToServer：
   * - 输入：meterToPixel（已 normalize）
   * - 前置条件：sendFn 已 bind
   * - 用途：把本地变更上报到后端
   * - 流向：this.sendFn(payload) -> WebSocketService.send(payload) -> 后端
   */
  private sendToServer(meterToPixel: number) {
    if (!this.sendFn) return;

    this.sendFn({
      cmd: CMD_SET_MAP_SCALE,
      meter_to_pixel: meterToPixel,
    });
  }

  /**
   * emit：
   * - 遍历所有订阅者回调并传出最新 state
   * - 用途：驱动 UI 更新
   * - 注意：单个 listener 报错会被吞掉，不影响其他 listener
   */
  private emit() {
    for (const fn of this.listeners) {
      try {
        fn(this.state);
      } catch {
        // ignore
      }
    }
  }
}
