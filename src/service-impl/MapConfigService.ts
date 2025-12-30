import IMapConfigService, { MapConfigState } from "../service-api/IMapConfigService";

const CMD_SET_MAP_SCALE = "SetMapScale"; // 你后端需要实现该 cmd

type SendFn = (msg: any) => void;

export default class MapConfigService implements IMapConfigService {
  private state: MapConfigState = {
    meterToPixel: 300,
  };

  private listeners = new Set<(s: MapConfigState) => void>();

  // 由 WS 入口注入
  private sendFn: SendFn | null = null;

  /** 给 WebSocket 入口调用，绑定发送方法 */
  bindSender(fn: SendFn) {
    this.sendFn = fn;
  }

  getState(): MapConfigState {
    return this.state;
  }

  /**
   * UI 侧调用：本地更新 + 发给服务端
   */
  setMeterToPixel(value: number): void {
    const fixed = this.normalize(value);
    if (fixed == null) return;

    if (!this.setMeterToPixelLocal(fixed)) return;

    // 关键：发送到服务端
    this.sendToServer(fixed);
  }

  subscribe(listener: (state: MapConfigState) => void): () => void {
    this.listeners.add(listener);
    listener(this.state);
    return () => this.listeners.delete(listener);
  }

  /** WebSocket 广播入口。返回 true 表示已处理该消息 */
  ingestFrame(msg: any): boolean {
    if (!msg || typeof msg !== "object") return false;

    // 服务端下发：只更新本地，不回发，避免回环
    if (msg.cmd === "MapScale" && typeof msg.meter_to_pixel === "number") {
      const fixed = this.normalize(msg.meter_to_pixel);
      if (fixed == null) return true;
      this.setMeterToPixelLocal(fixed);
      return true;
    }

    return false;
  }

  /* ================= private ================= */

  private normalize(v: number): number | null {
    const n = Number(v);
    if (!Number.isFinite(n) || n <= 0) return null;
    return Number(n.toFixed(2));
  }

  /** 只更新本地 state + emit，不发给服务端。返回是否变化 */
  private setMeterToPixelLocal(value: number): boolean {
    if (this.state.meterToPixel === value) return false;
    this.state.meterToPixel = value;
    this.emit();
    return true;
  }

  private sendToServer(meterToPixel: number) {
    if (!this.sendFn) return;

    this.sendFn({
      cmd: CMD_SET_MAP_SCALE,
      meter_to_pixel: meterToPixel,
    });
  }

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
