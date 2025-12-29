// LocateResultService.ts
import StateBase from "../lib/service/StateBase";
import ILocateResultService, {
  ILocateResultState,
  LocateRecord,
} from "../service-api/ILocateResultService";

export default class LocateResultService
  extends StateBase<ILocateResultState>
  implements ILocateResultService
{
  constructor() {
    super({ results: {} });
  }

  pushLocate(rec: LocateRecord): void {
    if (!rec || !rec.mac) return;

    const next = { ...this.getState().results };
    next[rec.mac] = rec;

    this.setState({ results: next });
  }

  clear(): void {
    this.setState({ results: {} });
  }

  /** WebSocket 广播入口。返回 true 表示已处理该消息 */
  ingestFrame(msg: any): boolean {
    if (!msg || typeof msg !== "object") return false;

    if (msg.cmd !== "RelayLocated") return false;

    const mac = msg.target_mac;
    if (typeof mac !== "string" || mac.length === 0) return false;

    // x/y/rssi 类型容错
    const x = typeof msg.x === "number" ? msg.x : Number(msg.x);
    const y = typeof msg.y === "number" ? msg.y : Number(msg.y);

    const rec: LocateRecord = {
      mac,
      x: Number.isFinite(x) ? x : 0,
      y: Number.isFinite(y) ? y : 0,
      rssi: typeof msg.rssi === "number" ? msg.rssi : Number(msg.rssi ?? 0),
      devType: msg.dev_type,
      anchors: Array.isArray(msg.anchors) ? msg.anchors : [],
      ts: Date.now(),
    };

    this.pushLocate(rec);
    return true;
  }
}
