import IMapConfigService, { MapConfigState } from "../service-api/IMapConfigService";

export default class MapConfigService implements IMapConfigService {
  private state: MapConfigState = {
    meterToPixel: 300,
  };

  private listeners = new Set<(s: MapConfigState) => void>();

  getState(): MapConfigState {
    return this.state;
  }

  setMeterToPixel(value: number): void {
    if (this.state.meterToPixel === value) return;
    this.state.meterToPixel = value;
    this.emit();
  }

  subscribe(listener: (state: MapConfigState) => void): () => void {
    this.listeners.add(listener);
    listener(this.state);
    return () => this.listeners.delete(listener);
  }

  /** WebSocket 广播入口。返回 true 表示已处理该消息 */
  ingestFrame(msg: any): boolean {
    if (!msg || typeof msg !== "object") return false;

    if (msg.cmd === "MapScale" && typeof msg.meter_to_pixel === "number") {
      this.setMeterToPixel(msg.meter_to_pixel);
      return true;
    }

    return false;
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
