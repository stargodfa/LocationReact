/**
 * src/service-impl/BeaconListService.ts
 *
 * BeaconListService 的职责：
 * - 维护“可用 Beacon MAC 列表”的内存状态（macList）以及 loading/error/lastUpdatedAt
 * - 提供 getState()/subscribe() 给 UI 读取与订阅（MapsManager 的下拉框数据源）
 * - 提供 refresh()：通过 HTTP GET 从多个候选 endpoints 拉取 maclist（作为兜底/手动刷新能力）
 * - 提供 ingestFrame(msg)：供 WebSocketService 广播调用，消费后端推送的整表/增量消息并更新 state
 * - 提供 removeBeacon(mac)：对外删除接口，向后端发送 RemoveBeacon 命令，并本地乐观更新
 *
 * 数据流（端到端）：
 * 1) WS 整表：
 * 后端 -> {cmd:"MacList"/... , mac_list|macs|...:[...]}
 *   -> WebSocketService.handleMessage()
 *   -> BeaconListService.ingestFrame() 命中整表
 *   -> dedupSort -> emit({macList,...})
 *   -> UI subscribe 更新（MapsManager Select options）
 *
 * 2) WS 增量：
 * 后端 -> {cmd:"BeaconAdded", mac} 或 {cmd:"BeaconRemoved", mac}
 *   -> ingestFrame -> addMac/removeMacLocal -> emit -> UI
 *
 * 3) UI 删除：
 * UI -> removeBeacon(mac)
 *   -> wsService.send({cmd:"RemoveBeacon", mac})
 *   -> removeMacLocal 乐观更新 -> emit -> UI
 *   -> 后端随后可能再推 BeaconRemoved/整表（取决于协议）
 *
 * 4) HTTP 拉取（可选兜底）：
 * UI 或外部 -> refresh()
 *   -> 依次尝试 endpoints fetch
 *   -> 成功解析 mac list -> emit 更新
 */

import { getServiceSync } from "@spring4js/container-browser";
import IBeaconListService, {
  IBeaconListState,
  BeaconMac,
  BeaconListListener,
} from "../service-api/IBeaconListService";
import IWebSocketService from "../service-api/IWebSocketService";
import EService from "../service-config/EService";

/**
 * DEFAULT_ENDPOINTS：
 * - 数据来源：前端写死的候选 HTTP 接口路径
 * - 用途：refresh() 拉取 maclist 时的 fallback 列表
 * - 流向：this.endpoints 初始化值
 *
 * 注意（事实）：这些路径依赖你的后端路由是否存在，否则 refresh() 会失败。
 */
const DEFAULT_ENDPOINTS = ["/api/maclist", "/maclist", "/api/beacons/maclist"];

/**
 * normalizeMac：
 * - 输入：任意字符串（可能带冒号/短横线/空格）
 * - 输出：
 *   - 若提取出 12 个 hex 字符，则格式化为 AA:BB:CC:DD:EE:FF
 *   - 否则返回 input.toUpperCase()
 *
 * 数据来源：WS/HTTP 返回的 mac 或 UI 输入的 mac
 * 用途：统一 mac 存储格式，避免重复与大小写差异
 * 流向：dedupSort/addMac/removeMacLocal/removeBeacon
 */
function normalizeMac(input: string): string {
  const hex = input.replace(/[^0-9a-fA-F]/g, "").toUpperCase();
  if (hex.length !== 12) return input.toUpperCase();
  return hex.match(/.{2}/g)!.join(":");
}

/**
 * dedupSort：
 * - 输入：string[]
 * - 行为：
 *   1) normalizeMac
 *   2) Set 去重
 *   3) sort 升序
 *
 * 用途：统一所有“整表更新”的输出，保证稳定、无重复、格式一致
 * 流向：refresh()/ingestFrame()/setMacList()
 */
function dedupSort(list: string[]): string[] {
  const set = new Set<string>();
  for (const m of list) {
    if (!m) continue;
    set.add(normalizeMac(m));
  }
  return Array.from(set).sort();
}

/**
 * isStringArray：
 * - 输入：any
 * - 输出：类型谓词 x is string[]
 * - 用途：校验后端 JSON 格式是否是 string[]
 * - 流向：refresh()/ingestFrame()
 */
function isStringArray(x: any): x is string[] {
  return Array.isArray(x) && x.every((v) => typeof v === "string");
}

export default class BeaconListService implements IBeaconListService {
  /**
   * wsService：
   * - WebSocketService 单例
   * - 数据来源：IoC 容器
   * - 用途：removeBeacon 时向后端发 RemoveBeacon 命令
   * - 流向：removeBeacon -> wsService.send(...)
   */
  private wsService = getServiceSync<IWebSocketService>(
    EService.IWebSocketService
  );

  /**
   * state：
   * - IBeaconListState 内存状态
   * - 字段：
   *   macList: string[]         当前可用 Beacon MAC 列表（已 normalize + 去重 + 排序）
   *   loading: boolean          refresh() 期间为 true
   *   error?: string            refresh() 或解析失败时写入
   *   lastUpdatedAt?: number    最近一次成功更新的时间戳（Date.now）
   *
   * 数据来源：
   * - 初始值：空列表
   * - WS 整表/增量：ingestFrame -> emit
   * - HTTP refresh：refresh() -> emit
   *
   * 流向：subscribe(listener) 回放/更新 -> UI
   */
  private state: IBeaconListState = {
    macList: [],
    loading: false,
  };

  /**
   * listeners：
   * - 订阅者集合（UI 注册回调）
   * - 数据来源：subscribe(listener)
   * - 流向：emit() 遍历通知
   */
  private listeners = new Set<BeaconListListener>();

  /**
   * endpoints：
   * - refresh() 拉取 maclist 的候选 URL 列表
   * - 数据来源：DEFAULT_ENDPOINTS
   * - 流向：refresh() for...of 逐个尝试
   */
  private endpoints: string[] = DEFAULT_ENDPOINTS;

  /**
   * getState：
   * - 调用方：UI 初始化时读一次
   * - 返回：state 快照引用
   */
  getState(): IBeaconListState {
    return this.state;
  }

  /**
   * subscribe：
   * - 输入：listener(state)
   * - 行为：
   *   1) 加入 listeners
   *   2) 立即回放当前 state
   *   3) 返回 unsubscribe
   *
   * 数据流：state -> listener -> UI setState -> 渲染
   */
  subscribe(listener: BeaconListListener): () => void {
    this.listeners.add(listener);
    listener(this.state);
    return () => this.listeners.delete(listener);
  }

  /**
   * emit：
   * - 输入：next（局部 state patch）
   * - 行为：this.state = { ...this.state, ...next } 合并更新
   * - 流向：listeners 回调
   *
   * 注意（事实）：这里不会 try/catch listener，任何 listener 抛错会中断后续 listener。
   */
  private emit(next: Partial<IBeaconListState>) {
    this.state = { ...this.state, ...next };
    for (const l of this.listeners) l(this.state);
  }

  /**
   * refresh：
   * - 异步 HTTP 拉取 maclist（兜底能力）
   * - 数据来源：this.endpoints
   * - 行为：
   *   1) emit loading=true 清 error
   *   2) 依次 fetch 每个 endpoint，直到成功解析出 list
   *   3) 成功：dedupSort + emit(macList, loading=false, lastUpdatedAt)
   *   4) 全失败：emit(loading=false, error=lastErr)
   *
   * 解析兼容：
   * - 允许多种字段名：mac_list/maclist/macs 或直接数组
   */
  async refresh(): Promise<void> {
    this.emit({ loading: true, error: undefined });

    let lastErr: any = null;

    for (const url of this.endpoints) {
      try {
        const resp = await fetch(url, { method: "GET" });
        if (!resp.ok) throw new Error(`HTTP ${resp.status} ${resp.statusText}`);

        const data = await resp.json();

        let list: string[] | null = null;
        if (isStringArray(data)) list = data;
        else if (isStringArray(data?.mac_list)) list = data.mac_list;
        else if (isStringArray(data?.maclist)) list = data.maclist;
        else if (isStringArray(data?.macs)) list = data.macs;

        if (!list) throw new Error("maclist response format invalid");

        this.emit({
          macList: dedupSort(list),
          loading: false,
          error: undefined,
          lastUpdatedAt: Date.now(),
        });
        return;
      } catch (e) {
        lastErr = e;
      }
    }

    this.emit({
      loading: false,
      error: lastErr ? String(lastErr) : "refresh failed",
    });
  }

  /**
   * ingestFrame：
   * - 调用方：WebSocketService.handleMessage 广播
   * - 输入：msg（JSON.parse 后对象）
   * - 返回：boolean 是否处理
   *
   * 支持的协议形态：
   * A) 整表推送：
   *   cmd in ["MacList","BeaconMacList","BeaconList","BeaconMacs"]
   *   maclist 字段可能是：mac_list/maclist/macs/list/items/beaconlist
   *
   * B) 增量新增：
   *   cmd in ["BeaconAdded","MacAdded"]
   *   mac 字段可能是：mac/target_mac/addr
   *
   * C) 增量删除：
   *   cmd in ["BeaconRemoved","MacRemoved"]
   *   mac 字段可能是：mac/target_mac/addr
   *   注意：这里只做本地移除，不发删除命令（因为它是“回包路径”）
   *
   * 数据流：
   * msg -> (dedupSort/addMac/removeMacLocal) -> emit -> UI
   */
  ingestFrame(msg: any): boolean {
    if (!msg || typeof msg !== "object") return false;

    const cmd = String(msg.cmd ?? "");

    // 整表推送
    if (
      cmd === "MacList" ||
      cmd === "BeaconMacList" ||
      cmd === "BeaconList" ||
      cmd === "BeaconMacs"
    ) {
      const macListField =
        msg.mac_list ??
        msg.maclist ??
        msg.macs ??
        msg.list ??
        msg.items ??
        msg.beaconlist ??
        null;

      if (isStringArray(macListField)) {
        this.emit({
          macList: dedupSort(macListField),
          lastUpdatedAt: Date.now(),
          error: undefined,
        });
      }
      return true;
    }

    // 增量新增
    if (cmd === "BeaconAdded" || cmd === "MacAdded") {
      const mac = msg.mac ?? msg.target_mac ?? msg.addr;
      if (typeof mac === "string") this.addMac(mac);
      return true;
    }

    // 增量删除（这里只做本地移除，不发删除命令）
    if (cmd === "BeaconRemoved" || cmd === "MacRemoved") {
      const mac = msg.mac ?? msg.target_mac ?? msg.addr;
      if (typeof mac === "string") this.removeMacLocal(mac);
      return true;
    }

    return false;
  }

  /**
   * setMacList：
   * - 输入：list（mac 字符串数组）
   * - 用途：对外直接整表替换（调用方可来自 UI/测试）
   * - 流向：dedupSort -> emit -> UI
   */
  setMacList(list: BeaconMac[]): void {
    this.emit({
      macList: dedupSort(list),
      lastUpdatedAt: Date.now(),
      error: undefined,
    });
  }

  /**
   * addMac：
   * - 输入：mac
   * - 用途：本地新增并去重排序
   * - 数据来源：WS 增量消息或外部调用
   * - 流向：emit -> UI
   */
  addMac(mac: BeaconMac): void {
    const n = normalizeMac(mac);
    const next = new Set(this.state.macList);
    next.add(n);
    this.emit({
      macList: Array.from(next).sort(),
      lastUpdatedAt: Date.now(),
      error: undefined,
    });
  }

  /**
   * removeMacLocal：
   * - 仅本地移除，不发命令
   * - 调用方：ingestFrame 删除回包路径
   * - 用途：与 removeBeacon 区分，避免“收到后端删除通知又反向发一次删除命令”
   */
  private removeMacLocal(mac: BeaconMac): void {
    const n = normalizeMac(mac);
    const next = this.state.macList.filter((m) => m !== n);
    this.emit({
      macList: next,
      lastUpdatedAt: Date.now(),
      error: undefined,
    });
  }

  /**
   * removeBeacon：
   * - 对外删除接口：会发命令给服务器，并乐观更新本地列表
   * - 调用方：MapsManager 的“删除”按钮（handleDeleteMac）
   *
   * 数据流：
   * UI -> removeBeacon(mac)
   *   -> wsService.send({cmd:"RemoveBeacon", mac})
   *   -> removeMacLocal(mac) 本地立即移除
   *   -> 后端后续可能再推 BeaconRemoved/整表，前端 ingestFrame 再次移除（幂等）
   */
  removeBeacon(mac: BeaconMac): void {
    const n = normalizeMac(mac);
    if (!n) return;

    // 1) 发给服务器
    this.wsService.send({ cmd: "RemoveBeacon", mac: n });

    // 2) 本地乐观更新
    this.removeMacLocal(n);
  }

  /**
   * removeMac：
   * - 兼容旧代码入口
   * - 实际转调 removeBeacon
   */
  removeMac(mac: BeaconMac): void {
    this.removeBeacon(mac);
  }
}
