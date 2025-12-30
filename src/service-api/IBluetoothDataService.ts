/**
 * src/service-api/IBluetoothDataService.ts
 *
 * IBluetoothDataService 的职责（接口层面）：
 * - 定义“BLE 实时数据状态管理”的数据结构与能力：
 *   1) getState()/subscribe()：读取与订阅实时数据列表与 macList
 *   2) pushRow(row)：写入一条 DataRow（通常由 ingestFrame 生成）
 *   3) clearRealTimeDataList()：清空实时列表（UI 清表）
 *   4) ingestFrame(msg)：供 WebSocketService 广播调用，消费后端透传 BLE 消息
 *
 * 端到端数据流（典型）：
 * 后端 -> WS 推送 { raw:{mac,rssi,...}, parsed?:{...} }
 *   -> WebSocketService.handleMessage()
 *   -> IBluetoothDataService.ingestFrame(msg)
 *   -> pushRow(DataRow)
 *   -> subscribe 回调通知 UI（RealtimeData 表格刷新）
 */

/**
 * DataRow：
 * - UI 表格展示用的“单行数据结构”
 * - 注意：raw/parsed 在此接口里定义为 string，意味着 service 内会做 JSON.stringify，
 *   UI 若需要结构化展示需要再 JSON.parse（你当前 RealtimeData 就是这么做的）
 */
export interface DataRow {
  /**
   * key：
   * - 行唯一标识（通常是自增序号）
   * - 数据来源：BluetoothDataService 内部 rowSeq++
   * - 用途：Table rowKey 的稳定值之一，避免 React 列表 diff 混乱
   */
  key: number;

  /**
   * time：
   * - 展示用时间字符串
   * - 数据来源：前端接收时 new Date().toLocaleTimeString()
   * - 用途：在表格中显示接收时间（本地时间）
   */
  time: string;

  /**
   * mac：
   * - BLE 设备 MAC
   * - 数据来源：msg.raw.mac
   * - 用途：
   *   - 表格展示
   *   - 过滤条件
   *   - 维护 macList（出现过的设备列表）
   */
  mac: string;

  /**
   * rssi：
   * - 信号强度
   * - 数据来源：msg.raw.rssi（number 或可转 number）
   * - 用途：表格展示与后续筛选/诊断
   */
  rssi: number;

  /**
   * raw：
   * - 原始 BLE 数据的字符串化内容（通常是 JSON 字符串）
   * - 数据来源：service 内 JSON.stringify(msg.raw)
   * - 用途：表格“原始数据(raw)”列展示
   */
  raw: string;

  /**
   * parsed：
   * - 解析后的结构化数据字符串（通常是 JSON 字符串）或占位符 "-"
   * - 数据来源：service 内 JSON.stringify(msg.parsed) 或 "-"
   * - 用途：表格“解析数据(parsed)”列展示
   */
  parsed: string;
}

/**
 * IData：
 * - BluetoothDataService 的整体 state
 */
export interface IData {
  /**
   * realTimeDataList：
   * - 实时数据列表（通常最近 N 条，N 由实现类限制）
   * - 数据来源：pushRow/ingestFrame
   * - 用途：RealtimeData 表格的数据源
   */
  realTimeDataList: DataRow[];

  /**
   * macList：
   * - 出现过的 mac 列表（去重）
   * - 数据来源：pushRow 时从 row.mac 派生
   * - 用途：可作为 UI 下拉过滤候选（你当前 RealtimeData 用的是输入框过滤）
   */
  macList: string[];
}

export default interface IBluetoothDataService {
  /**
   * getState：
   * - 调用方：UI 初始化读一次
   * - 返回：IData 快照
   */
  getState(): IData;

  /**
   * subscribe：
   * - 输入：fn(state)
   * - 输出：unsubscribe
   * - 用途：state 更新时驱动 UI 重渲染
   */
  subscribe(fn: (s: IData) => void): () => void;

  /**
   * pushRow：
   * - 写入一条 DataRow
   * - 调用方：实现类 ingestFrame 或其它模块
   */
  pushRow(row: DataRow): void;

  /**
   * clearRealTimeDataList：
   * - 清空实时列表（如果保留清除功能）
   * - 调用方：UI（RealtimeData 清空按钮）
   */
  clearRealTimeDataList(): void;

  /**
   * ingestFrame：
   * - WebSocket 广播入口
   * - 调用方：WebSocketService.handleMessage
   * - 返回：是否消费该 msg
   */
  ingestFrame(msg: any): boolean;
}
