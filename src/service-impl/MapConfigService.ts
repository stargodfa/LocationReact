import IMapConfigService, {
  MapConfigState,
} from "../service-api/IMapConfigService";

type SendFn = (msg: any) => void;

export default class MapConfigService implements IMapConfigService {
  private state: MapConfigState = {
    currentMapId: null,
    meterToPixelByMap: {},
  };

  private listeners = new Set<(s: MapConfigState) => void>();
  private sendFn: SendFn | null = null;

  bindSender(fn: SendFn) {
    this.sendFn = fn;
  }

  /* ================= map binding ================= */

  setCurrentMap(mapId: string) {
    if (!mapId) return;
    if (this.state.currentMapId === mapId) return;

    this.state.currentMapId = mapId;

    if (!(mapId in this.state.meterToPixelByMap)) {
      this.state.meterToPixelByMap[mapId] = 300;
    }

    this.emit();

    // 关键：切换地图时主动向服务端拉比例
    if (this.sendFn) {
      this.sendFn({
        cmd: "GetMapScale",
        mapId,
      });
    }
  }

  /* ================= public ================= */

  getState(): MapConfigState {
    return this.state;
  }

  subscribe(listener: (state: MapConfigState) => void): () => void {
    this.listeners.add(listener);
    listener(this.state);
    return () => this.listeners.delete(listener);
  }

  setMeterToPixel(value: number): void {
    const mapId = this.state.currentMapId;
    if (!mapId) return;

    const fixed = this.normalize(value);
    if (fixed == null) return;

    if (!this.setMeterToPixelLocal(mapId, fixed)) return;

    this.sendToServer(mapId, fixed);
  }

  ingestFrame(msg: any): boolean {
    if (!msg || typeof msg !== "object") return false;

    if (msg.cmd === "MapScale") {
      const mapId = msg.map_id ?? msg.mapId;
      if (typeof mapId !== "string") return true;
      if (typeof msg.meter_to_pixel !== "number") return true;

      const fixed = this.normalize(msg.meter_to_pixel);
      if (fixed == null) return true;

      this.setMeterToPixelLocal(mapId, fixed);
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

  private setMeterToPixelLocal(mapId: string, value: number): boolean {
    if (this.state.meterToPixelByMap[mapId] === value) return false;

    this.state.meterToPixelByMap[mapId] = value;
    this.emit();
    return true;
  }

  private sendToServer(mapId: string, meterToPixel: number) {
    if (!this.sendFn) return;

    this.sendFn({
      cmd: "SetMapScale",
      mapId,
      meter_to_pixel: meterToPixel,
    });
  }

  private emit() {
    for (const fn of this.listeners) {
      try {
        fn(this.state);
      } catch {}
    }
  }
}
