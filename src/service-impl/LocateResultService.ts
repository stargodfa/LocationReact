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
    super({ resultsByMap: {} });
  }

  /* ============================================================
   * pushLocate
   * ============================================================ */
  pushLocate(mapId: string, rec: LocateRecord): void {
    if (!mapId || !rec || !rec.mac) return;

    const state = this.getState();
    const byMap = state.resultsByMap[mapId] || {};

    const nextByMap = {
      ...state.resultsByMap,
      [mapId]: {
        ...byMap,
        [rec.mac]: rec,
      },
    };

    this.setState({ resultsByMap: nextByMap });
  }

  /* ============================================================
   * clear
   * ============================================================ */
  clear(mapId?: string): void {
    if (!mapId) {
      this.setState({ resultsByMap: {} });
      return;
    }

    const next = { ...this.getState().resultsByMap };
    delete next[mapId];
    this.setState({ resultsByMap: next });
  }

  /* ============================================================
   * ingestFrame
   * ============================================================ */
  ingestFrame(msg: any): boolean {
    if (!msg || typeof msg !== "object") return false;
    if (msg.cmd !== "RelayLocated") return false;

    const mapId =
      typeof msg.mapId === "string" && msg.mapId
        ? msg.mapId
        : "room1"; // 容错默认

    const mac = msg.target_mac;
    if (typeof mac !== "string" || mac.length === 0) return false;

    const x = typeof msg.x === "number" ? msg.x : Number(msg.x);
    const y = typeof msg.y === "number" ? msg.y : Number(msg.y);

    const rec: LocateRecord = {
      mac,
      x: Number.isFinite(x) ? x : 0,
      y: Number.isFinite(y) ? y : 0,
      rssi:
        typeof msg.rssi === "number" ? msg.rssi : Number(msg.rssi ?? 0),
      devType: msg.dev_type,
      anchors: Array.isArray(msg.anchors) ? msg.anchors : [],
      ts: Date.now(),
    };

    this.pushLocate(mapId, rec);
    return true;
  }
}
