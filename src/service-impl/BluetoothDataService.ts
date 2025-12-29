// BluetoothDataService.ts
import StateBase from "../lib/service/StateBase";
import IBluetoothDataService, { IData, DataRow } from "../service-api/IBluetoothDataService";

export default class BluetoothDataService
  extends StateBase<IData>
  implements IBluetoothDataService
{
  // 行号在服务内部维护
  private rowSeq = 1;

  constructor() {
    super({
      realTimeDataList: [],
      macList: [],
    });
  }

  pushRow(row: DataRow): void {
    const prev = this.getState().realTimeDataList;
    const nextList = [row, ...prev].slice(0, 200);

    const macList = Array.from(new Set([row.mac, ...this.getState().macList]));

    this.setState({
      realTimeDataList: nextList,
      macList,
    });
  }

  clearRealTimeDataList(): void {
    this.setState({
      realTimeDataList: [],
      macList: [],
    });
  }

  /** WebSocket 广播入口。返回 true 表示已处理该消息 */
  ingestFrame(msg: any): boolean {
    if (!msg || typeof msg !== "object") return false;

    // 普通 BLE 数据：来自服务器透传 raw
    if (msg.raw && typeof msg.raw === "object" && typeof msg.raw.mac === "string") {
      const key = this.rowSeq++;

      const row: DataRow = {
        key,
        time: new Date().toLocaleTimeString(),
        mac: msg.raw.mac,
        rssi: typeof msg.raw.rssi === "number" ? msg.raw.rssi : Number(msg.raw.rssi ?? 0),
        raw: JSON.stringify(msg.raw),
        parsed: msg.parsed ? JSON.stringify(msg.parsed) : "-",
      };

      this.pushRow(row);
      return true;
    }

    return false;
  }
}
