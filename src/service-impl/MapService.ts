import IMapService, { MapItem } from "../service-api/IMapService";

export default class MapService implements IMapService {
  private maps: MapItem[] = [];
  private listeners = new Set<(maps: MapItem[]) => void>();

  getState() {
    return { maps: this.maps };
  }

  subscribe(fn: (maps: MapItem[]) => void) {
    this.listeners.add(fn);
    fn(this.maps);
    return () => this.listeners.delete(fn);
  }

  loadFromServer(maps: MapItem[]) {
    this.maps = maps;
    this.listeners.forEach((fn) => fn(this.maps));
  }

  /**
   * 供 WebSocketService 广播调用
   * 返回 true 表示本服务处理了该消息
   */
  ingestFrame(msg: any): boolean {
    if (!msg || typeof msg !== "object") return false;

    if (msg.cmd === "MapList" && Array.isArray(msg.maps)) {
      this.loadFromServer(msg.maps as MapItem[]);
      return true;
    }

    return false;
  }
}
