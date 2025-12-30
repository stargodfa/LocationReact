/**
 * src/service-impl/LocateResultService.ts
 *
 * LocateResultService 的职责：
 * - 维护“定位结果”的内存状态 results（按 mac 索引的最新一条 LocateRecord）
 * - 提供 pushLocate()/clear() 给 UI 或其它 service 操作
 * - 提供 ingestFrame(msg) 给 WebSocketService 广播调用
 *   识别并消费后端定位消息 cmd="RelayLocated"，解析为 LocateRecord 后写入 results
 *
 * 数据流（端到端）：
 * 后端 WS 推送: { cmd:"RelayLocated", target_mac, x, y, rssi, dev_type, anchors }
 *   -> WebSocketService.handleMessage() parse
 *   -> LocateResultService.ingestFrame(msg) 命中 cmd
 *   -> 构造 LocateRecord（并补 ts）
 *   -> pushLocate(rec) 更新 results[mac]
 *   -> StateBase.setState -> notify subscribers
 *   -> RealtimeData / LocationView 订阅 locateService 得到最新 results 并渲染
 */

import StateBase from "../lib/service/StateBase";
import ILocateResultService, {
  ILocateResultState,
  LocateRecord,
} from "../service-api/ILocateResultService";

export default class LocateResultService
  extends StateBase<ILocateResultState>
  implements ILocateResultService
{
  /**
   * constructor：
   * - 初始化 StateBase 的初始 state
   * - results 为空对象，表示当前还没有任何 mac 的定位记录
   *
   * 数据来源：本地初始化常量
   * 流向：getState()/subscribe() 的初始回放
   */
  constructor() {
    super({ results: {} });
  }

  /**
   * pushLocate：
   * - 输入：rec（单条定位记录）
   * - 数据来源：
   *   1) ingestFrame(msg) 转换生成 rec
   *   2) 其它调用方也可能直接 pushLocate（目前没看到别处）
   * - 用途：
   *   - 每个 mac 只保留最新一条记录（覆盖写）
   * - 流向：
   *   - this.getState().results -> clone -> next[mac]=rec -> this.setState({results:next})
   *
   * 关键行为：
   * - 使用浅拷贝创建 next，保证 state 对象引用变化，触发订阅者更新
   */
  pushLocate(rec: LocateRecord): void {
    if (!rec || !rec.mac) return;

    const next = { ...this.getState().results };
    next[rec.mac] = rec;

    this.setState({ results: next });
  }

  /**
   * clear：
   * - 用途：清空所有定位结果
   * - 数据来源：外部调用（UI 或调试）
   * - 流向：setState({results:{}}) -> 订阅者收到空表
   */
  clear(): void {
    this.setState({ results: {} });
  }

  /**
   * ingestFrame：
   * - 调用方：WebSocketService.handleMessage 广播分发
   * - 输入：msg（JSON.parse 后对象）
   * - 返回：boolean 是否处理
   *
   * 识别规则：
   * - msg.cmd === "RelayLocated"
   * - msg.target_mac 为非空 string
   *
   * 字段解析（容错）：
   * - x/y：允许 number 或 string，非有限数则置 0
   * - rssi：允许 number 或可 Number() 的值，默认 0
   * - anchors：必须是数组，否则置 []
   * - devType：直接取 msg.dev_type（不做类型校验）
   * - ts：使用 Date.now()（本地接收时间，不是后端时间戳）
   *
   * 数据流：
   * msg -> rec -> pushLocate -> StateBase.setState -> UI
   */
  ingestFrame(msg: any): boolean {
    if (!msg || typeof msg !== "object") return false;

    // 只消费定位结果消息
    if (msg.cmd !== "RelayLocated") return false;

    // target_mac 是 results 的 key
    const mac = msg.target_mac;
    if (typeof mac !== "string" || mac.length === 0) return false;

    // x/y 类型容错：number 或 string
    const x = typeof msg.x === "number" ? msg.x : Number(msg.x);
    const y = typeof msg.y === "number" ? msg.y : Number(msg.y);

    /**
     * rec：
     * - LocateRecord 标准化结果
     * - 数据来源：msg 字段 + 本地 Date.now()
     * - 用途：存入 results[mac]，供 UI 渲染
     */
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
