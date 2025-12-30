/**
 * src/service-impl/BluetoothDataService.ts
 *
 * BluetoothDataService 的职责：
 * - 维护 BLE 实时数据列表 realTimeDataList（最多 200 条，头插新数据）
 * - 维护出现过的 macList（去重）
 * - 提供 pushRow()/clearRealTimeDataList() 给 UI 或其它模块调用
 * - 提供 ingestFrame(msg) 给 WebSocketService 广播调用
 *   识别并消费后端透传的 BLE 消息（msg.raw 对象且包含 raw.mac）
 *
 * 数据流（端到端）：
 * 后端 WS 推送: { raw:{mac,rssi,...}, parsed?:{...} }
 *   -> WebSocketService.handleMessage() parse
 *   -> BluetoothDataService.ingestFrame(msg) 命中 raw.mac
 *   -> 组装 DataRow（补 key/time/raw/parsed）
 *   -> pushRow -> StateBase.setState -> UI 订阅刷新
 *
 * UI 使用点：
 * - RealtimeData.tsx：订阅 bluetoothDataService，展示 realTimeDataList
 */

import StateBase from "../lib/service/StateBase";
import IBluetoothDataService, {
  IData,
  DataRow,
} from "../service-api/IBluetoothDataService";

export default class BluetoothDataService
  extends StateBase<IData>
  implements IBluetoothDataService
{
  /**
   * rowSeq：
   * - 数据来源：服务内部自增计数
   * - 用途：生成 DataRow.key（Table rowKey 的稳定标识之一）
   * - 流向：ingestFrame -> const key = this.rowSeq++ -> row.key
   *
   * 关键事实：
   * - rowSeq 只在页面生命周期内单调递增，不会持久化。
   * - clearRealTimeDataList() 不会重置 rowSeq（清表后 key 继续增长）。
   */
  private rowSeq = 1;

  /**
   * constructor：
   * - 初始化 IData state：
   *   realTimeDataList: []
   *   macList: []
   * - 数据来源：本地默认值
   * - 流向：getState()/subscribe() 的初始回放
   */
  constructor() {
    super({
      realTimeDataList: [],
      macList: [],
    });
  }

  /**
   * pushRow：
   * - 输入：row（单条 DataRow）
   * - 数据来源：
   *   1) ingestFrame(msg) 收到 BLE 消息后组装 row
   *   2) 也可能被其它模块直接调用（当前未展示）
   *
   * 行为：
   * 1) 取出 prev 列表
   * 2) 头插新 row
   * 3) 截断最多 200 条（slice(0,200)）
   * 4) 更新 macList：把 row.mac 放到最前并用 Set 去重
   * 5) setState({ realTimeDataList, macList }) 通知订阅者
   *
   * 数据流：
   * row -> nextList/macList -> setState -> UI（RealtimeData 表格刷新）
   */
  pushRow(row: DataRow): void {
    const prev = this.getState().realTimeDataList;

    // 头插新数据，保留最近 200 条
    const nextList = [row, ...prev].slice(0, 200);

    // 更新 macList：把新 mac 放前面 + 去重
    const macList = Array.from(new Set([row.mac, ...this.getState().macList]));

    this.setState({
      realTimeDataList: nextList,
      macList,
    });
  }

  /**
   * clearRealTimeDataList：
   * - 用途：清空实时 BLE 表
   * - 数据来源：UI（RealtimeData 的“清空列表”按钮）
   * - 流向：setState -> UI 订阅者收到空数组
   *
   * 注意（事实说明）：
   * - rowSeq 不会被重置，因此清空后下一条数据的 key 不会从 1 重新开始。
   */
  clearRealTimeDataList(): void {
    this.setState({
      realTimeDataList: [],
      macList: [],
    });
  }

  /**
   * ingestFrame：
   * - 调用方：WebSocketService.handleMessage 广播
   * - 输入：msg（JSON.parse 后对象）
   * - 返回：boolean 是否处理
   *
   * 识别规则：
   * - msg.raw 存在且是 object
   * - msg.raw.mac 是 string
   *
   * 组装 DataRow 字段说明：
   * - key：
   *   数据来源：rowSeq 自增
   *   用途：表格行唯一标识（配合 rowKey）
   * - time：
   *   数据来源：new Date().toLocaleTimeString()
   *   用途：显示接收时间（前端本地时间）
   * - mac：
   *   数据来源：msg.raw.mac
   * - rssi：
   *   数据来源：msg.raw.rssi（number 或可转 number）
   * - raw：
   *   数据来源：msg.raw 对象 -> JSON.stringify 存储为字符串
   *   用途：表格“原始数据”列展示
   * - parsed：
   *   数据来源：msg.parsed（若存在）-> JSON.stringify；否则 "-"
   *   用途：表格“解析数据”列展示
   *
   * 数据流：
   * msg -> row -> pushRow -> setState -> UI
   */
  ingestFrame(msg: any): boolean {
    if (!msg || typeof msg !== "object") return false;

    // 普通 BLE 数据：来自服务器透传 raw
    if (msg.raw && typeof msg.raw === "object" && typeof msg.raw.mac === "string") {
      const key = this.rowSeq++;

      const row: DataRow = {
        key,
        time: new Date().toLocaleTimeString(),
        mac: msg.raw.mac,
        rssi:
          typeof msg.raw.rssi === "number"
            ? msg.raw.rssi
            : Number(msg.raw.rssi ?? 0),
        raw: JSON.stringify(msg.raw),
        parsed: msg.parsed ? JSON.stringify(msg.parsed) : "-",
      };

      this.pushRow(row);
      return true;
    }

    return false;
  }
}
