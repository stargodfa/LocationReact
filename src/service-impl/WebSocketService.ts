// WebSocketService.ts
import { getServiceSync } from "@spring4js/container-browser";
import EService from "../service-config/EService";
import IWebSocketService, { WSStatus } from "../service-api/IWebSocketService";
import IBluetoothDataService from "../service-api/IBluetoothDataService";
import IBeaconPositionService from "../service-api/IBeaconPositionService";
import ILocateResultService from "../service-api/ILocateResultService";
import IMapService from "../service-api/IMapService";
import IMapConfigService from "../service-api/IMapConfigService";
import IBeaconListService from "../service-api/IBeaconListService";

type IngestibleService = {
  ingestFrame: (msg: any) => boolean;
};

export default class WebSocketService implements IWebSocketService {
  private ws: WebSocket | null = null;
  private reconnectTimer: number | null = null;
  private listeners = new Set<(s: WSStatus) => void>();

  // 依赖的业务服务（都应该提供 ingestFrame）
  private ble = 
            getServiceSync<IBluetoothDataService>(EService.IBluetoothDataService) as unknown as IngestibleService;
  private anchors = 
            getServiceSync<IBeaconPositionService>(EService.IBeaconPositionService) as unknown as IngestibleService;
  private locate = 
            getServiceSync<ILocateResultService>(EService.ILocateResultService) as unknown as IngestibleService;
  private maps = 
            getServiceSync<IMapService>(EService.IMapService) as unknown as IngestibleService;
  private mapConfig = 
            getServiceSync<IMapConfigService>(EService.IMapConfigService) as unknown as IngestibleService;
  private beaconList = 
            getServiceSync<IBeaconListService>(EService.IBeaconListService) as unknown as IngestibleService;

  start(): void {
    this.connect();
  }

  send(data: any): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data));
    } else {
      console.warn("[WS] socket not open, skip send:", data);
    }
  }

  subscribe(listener: (status: WSStatus) => void): () => void {
    this.listeners.add(listener);

    const status: WSStatus =
      this.ws && this.ws.readyState === WebSocket.OPEN
        ? "connected"
        : this.ws && this.ws.readyState === WebSocket.CONNECTING
        ? "connecting"
        : "disconnected";

    listener(status);
    return () => this.listeners.delete(listener);
  }

  private emitStatus(status: WSStatus) {
    this.listeners.forEach((fn) => {
      try {
        fn(status);
      } catch {
        // ignore
      }
    });
  }

  private connect() {
    if (
      this.ws &&
      (this.ws.readyState === WebSocket.OPEN ||
        this.ws.readyState === WebSocket.CONNECTING)
    ) {
      return;
    }

    if (this.reconnectTimer != null) {
      window.clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    const host = window.location.hostname || "localhost";
    const url = `ws://${host}:8081/ws`;

    console.log("[WS] connecting:", url);
    this.emitStatus("connecting");

    const ws = new WebSocket(url);
    this.ws = ws;

    ws.onopen = () => {
      console.log("[WS] connected");
      this.emitStatus("connected");
    };

    ws.onclose = () => {
      console.log("[WS] disconnected");
      this.ws = null;
      this.emitStatus("disconnected");

      this.reconnectTimer = window.setTimeout(() => this.connect(), 1000);
    };

    ws.onerror = (err) => {
      console.log("[WS] error:", err);
    };

    ws.onmessage = (ev) => {
      this.handleMessage(ev.data);
    };
  }

  /** 只做 parse + 广播分发，不写业务判断 */
  private handleMessage(data: any) {
    if (data instanceof Blob) {
      data.text().then((text) => this.handleMessage(text));
      return;
    }

    if (typeof data !== "string") return;

    let msg: any;
    try {
      msg = JSON.parse(data);
    } catch {
      return;
    }

    // 可选：调试时打开，生产建议关闭或采样
    console.log("[WS] recv:", msg);

    // 广播到各业务服务，由它们自己判断 cmd/结构并更新状态
    const services: IngestibleService[] = [
      this.maps,
      this.mapConfig,
      this.locate,
      this.anchors,
      this.ble,
      this.beaconList,
    ].filter(Boolean) as IngestibleService[];

    let handled = false;
    for (const s of services) {
      try {
        handled = s.ingestFrame(msg) || handled;
      } catch (e) {
        console.warn("[WS] ingestFrame error:", e);
      }
    }

    if (!handled) {
      // 只在未知消息时打印，避免刷屏
      console.debug("[WS] unknown message:", msg);
    }
  }
}
