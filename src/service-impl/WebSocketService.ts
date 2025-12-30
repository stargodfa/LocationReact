// src/service-impl/WebSocketService.ts
//
// WebSocketService 的职责：
// 1) 维护浏览器到后端的 WebSocket 连接（连接、断开、自动重连）。
// 2) 提供 send() 给 UI 或其它 service 用于向后端发命令。
// 3) 提供 subscribe() 广播 WS 连接状态给 UI（connected/connecting/disconnected）。
// 4) 收到后端消息后，只做 JSON.parse + “广播分发”：把消息交给各业务 service 的 ingestFrame() 处理。
//    本类不做任何业务判断，不直接更新 UI state。
// 5) 把 send() 注入给 MapConfigService（bindSender），让 MapConfigService 可以通过 WS 上报 MapScale。

import { getServiceSync } from "@spring4js/container-browser";
import EService from "../service-config/EService";
import IWebSocketService, { WSStatus } from "../service-api/IWebSocketService";
import IBluetoothDataService from "../service-api/IBluetoothDataService";
import IBeaconPositionService from "../service-api/IBeaconPositionService";
import ILocateResultService from "../service-api/ILocateResultService";
import IMapService from "../service-api/IMapService";
import IMapConfigService from "../service-api/IMapConfigService";
import IBeaconListService from "../service-api/IBeaconListService";

/**
 * IngestibleService：
 * - 约束“可接收 WS 消息并尝试消费”的 service 形态
 * - ingestFrame(msg) 返回 boolean：
 *   true  表示该 service 识别并处理了该 msg
 *   false 表示不认识该 msg 或不处理
 *
 * 数据来源：WebSocketService 内部广播的 msg（JSON 对象）
 * 数据流：ws.onmessage -> handleMessage -> ingestFrame(msg) -> service 更新自身 state -> UI 订阅刷新
 */
type IngestibleService = {
  ingestFrame: (msg: any) => boolean;
};

/**
 * BindableSender：
 * - 可选接口：允许某个 service 接收一个 sender 函数
 * - 用途：把 WebSocketService.send 注入给该 service
 * - 当前只对 MapConfigService 使用，用于上报 map scale 配置
 */
type BindableSender = {
  bindSender?: (fn: (msg: any) => void) => void;
};

export default class WebSocketService implements IWebSocketService {
  /**
   * ws：
   * - WebSocket 实例
   * - 数据来源：new WebSocket(url)
   * - 用途：维护连接状态与收发
   * - 流向：
   *   send() -> ws.send()
   *   ws.onmessage -> handleMessage()
   */
  private ws: WebSocket | null = null;

  /**
   * reconnectTimer：
   * - 数据来源：window.setTimeout
   * - 用途：断线后 1 秒重连的计时器句柄
   * - 流向：connect() 中 clearTimeout/重置；onclose 中 setTimeout
   */
  private reconnectTimer: number | null = null;

  /**
   * listeners：
   * - 数据来源：subscribe(listener) 注册
   * - 用途：向 UI 广播连接状态变化
   * - 流向：emitStatus(status) 遍历调用
   */
  private listeners = new Set<(s: WSStatus) => void>();

  /**
   * boundOnce：
   * - 数据来源：start() 内设置
   * - 用途：保证“bindSender 注入”只做一次
   * - 流向：start() 首次执行时为 false，之后固定 true
   */
  private boundOnce = false;

  /* ============================================================
   * 依赖的业务 service（用于 ingestFrame 消息消费）
   *
   * 数据来源：IoC 容器
   * 用途：WS 收到 msg 后依次投递给它们
   * 流向：handleMessage -> services[] -> ingestFrame(msg)
   * ============================================================ */

  /**
   * ble：
   * - 蓝牙实时数据 service（期望实现 ingestFrame）
   * - 数据来源：容器中的 IBluetoothDataService 实现
   * - 用途：处理 BLE 广播类消息，更新 realTimeDataList 等
   */
  private ble = getServiceSync<IBluetoothDataService>(
    EService.IBluetoothDataService
  ) as unknown as IngestibleService;

  /**
   * anchors：
   * - 锚点坐标 service（期望实现 ingestFrame）
   * - 数据来源：容器中的 IBeaconPositionService 实现
   * - 用途：处理锚点坐标同步类消息，更新 anchors map
   */
  private anchors = getServiceSync<IBeaconPositionService>(
    EService.IBeaconPositionService
  ) as unknown as IngestibleService;

  /**
   * locate：
   * - 定位结果 service（期望实现 ingestFrame）
   * - 数据来源：容器中的 ILocateResultService 实现
   * - 用途：处理 RelayLocated 等定位结果消息，更新 results map
   */
  private locate = getServiceSync<ILocateResultService>(
    EService.ILocateResultService
  ) as unknown as IngestibleService;

  /**
   * maps：
   * - 地图列表 service（期望实现 ingestFrame）
   * - 数据来源：容器中的 IMapService 实现
   * - 用途：处理地图列表消息（例如 GetMapList 响应），更新 maps 数组
   */
  private maps = getServiceSync<IMapService>(
    EService.IMapService
  ) as unknown as IngestibleService;

  /**
   * mapConfigRaw：
   * - 地图配置 service 的真实实例
   * - 目的：
   *   既要它 ingestFrame(msg) 处理“GetMapScale/MapScale”等消息
   *   也要它具备 bindSender(fn) 能力，把 ws.send 注入进去
   *
   * 数据来源：容器中的 IMapConfigService 实现
   * 用途：双接口组合（ingestFrame + bindSender）
   */
  private mapConfigRaw = getServiceSync<IMapConfigService>(
    EService.IMapConfigService
  ) as unknown as IngestibleService & BindableSender;

  /**
   * mapConfig：
   * - mapConfigRaw 的 ingestFrame 视角
   * - 用途：加入 services[] 列表进行消息分发
   */
  private mapConfig = this.mapConfigRaw as IngestibleService;

  /**
   * beaconList：
   * - Beacon 列表 service（期望实现 ingestFrame）
   * - 数据来源：容器中的 IBeaconListService 实现
   * - 用途：处理 Beacon 列表相关消息（GetBeaconList 响应），更新 macList
   */
  private beaconList = getServiceSync<IBeaconListService>(
    EService.IBeaconListService
  ) as unknown as IngestibleService;

  /* ============================================================
   * IWebSocketService 接口实现
   * ============================================================ */

  /**
   * start：
   * - 调用方：
   *   - WorkbenchService.start()
   *   - App.tsx useEffect（你当前代码里也会调用）
   * - 用途：
   *   1) 首次调用时把 sender 注入 mapConfigService（bindSender）
   *   2) 建立/确保 WebSocket 连接
   *
   * 数据流：
   * start() -> (bindSender once) -> connect()
   */
  start(): void {
    // 关键：只绑定一次，把 WS 的 send 注入给 MapConfigService
    if (!this.boundOnce) {
      this.boundOnce = true;

      /**
       * bindSender(fn)：
       * - 数据来源：mapConfigRaw（实现类可能定义该方法）
       * - 用途：让 MapConfigService 在内部调用 fn(obj) -> 实际走 WebSocketService.send(obj)
       * - 流向：MapConfigService.setMeterToPixel(...) -> bindSender 注入的 sender -> ws.send
       */
      if (typeof this.mapConfigRaw.bindSender === "function") {
        this.mapConfigRaw.bindSender((obj) => this.send(obj));
      } else {
        console.warn(
          "[WS] mapConfig has no bindSender(), cannot send MapScale to server"
        );
      }
    }

    // 建立连接（若已连接/连接中，connect() 内会直接 return）
    this.connect();
  }

  /**
   * send：
   * - 输入：任意 data（对象）
   * - 数据来源：
   *   - UI（例如 App.tsx 连接后发 GetMapList/GetMapScale/GetBeaconList）
   *   - MapConfigService（通过 bindSender 注入）
   * - 用途：向后端发送 JSON 字符串消息
   * - 流向：ws.send(JSON.stringify(data))
   *
   * 行为约束：
   * - 仅在 ws.readyState === OPEN 时发送
   * - 否则仅 warn，不排队不重试
   */
  send(data: any): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data));
    } else {
      console.warn("[WS] socket not open, skip send:", data);
    }
  }

  /**
   * subscribe：
   * - 输入：listener(status)
   * - 数据来源：UI（App.tsx 顶部状态 Tag）
   * - 用途：订阅连接状态变化
   * - 返回：unsubscribe 函数
   *
   * 立即回放：
   * - subscribe 立刻用当前 ws.readyState 推一条 status 给 listener
   * - 让 UI 不用等待下一次 emitStatus
   *
   * 流向：
   * - onopen/onclose/connect() 里 emitStatus -> listeners 回调
   */
  subscribe(listener: (status: WSStatus) => void): () => void {
    this.listeners.add(listener);

    // 根据当前 ws.readyState 计算一个“即时状态”
    const status: WSStatus =
      this.ws && this.ws.readyState === WebSocket.OPEN
        ? "connected"
        : this.ws && this.ws.readyState === WebSocket.CONNECTING
        ? "connecting"
        : "disconnected";

    // 立即通知订阅者当前状态
    listener(status);

    // 返回取消订阅函数
    return () => this.listeners.delete(listener);
  }

  /**
   * emitStatus：
   * - 内部广播状态
   * - 数据来源：connect()/onopen/onclose
   * - 流向：listeners.forEach(fn(status))
   */
  private emitStatus(status: WSStatus) {
    this.listeners.forEach((fn) => {
      try {
        fn(status);
      } catch {
        // 忽略单个 listener 报错，避免影响其他订阅者
      }
    });
  }

  /* ============================================================
   * 连接管理
   * ============================================================ */

  /**
   * connect：
   * - 用途：建立 WebSocket 连接，并绑定事件回调
   * - 连接地址：
   *   ws://{window.location.hostname}:8081/ws
   *
   * 重连策略：
   * - onclose 时：1 秒后 setTimeout 调用 connect()
   * - connect() 内部如果发现已 OPEN 或 CONNECTING，会直接 return（避免重复连接）
   */
  private connect() {
    // 若已连接或正在连接，则不重复创建
    if (
      this.ws &&
      (this.ws.readyState === WebSocket.OPEN ||
        this.ws.readyState === WebSocket.CONNECTING)
    ) {
      return;
    }

    // 若存在未触发的重连计时器，先清掉
    if (this.reconnectTimer != null) {
      window.clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    // 计算连接 URL
    const host = window.location.hostname || "localhost";
    const url = `ws://${host}:8081/ws`;

    console.log("[WS] connecting:", url);
    this.emitStatus("connecting");

    // 创建 WebSocket 实例并保存
    const ws = new WebSocket(url);
    this.ws = ws;

    /**
     * onopen：
     * - 数据来源：浏览器 WebSocket 事件
     * - 用途：标记 connected 并通知 UI
     */
    ws.onopen = () => {
      console.log("[WS] connected");
      this.emitStatus("connected");
    };

    /**
     * onclose：
     * - 数据来源：浏览器 WebSocket 事件
     * - 用途：
     *   1) 清空 this.ws
     *   2) 通知 UI disconnected
     *   3) 启动 1 秒后重连
     */
    ws.onclose = () => {
      console.log("[WS] disconnected");
      this.ws = null;
      this.emitStatus("disconnected");

      this.reconnectTimer = window.setTimeout(() => this.connect(), 1000);
    };

    /**
     * onerror：
     * - 数据来源：浏览器 WebSocket 事件
     * - 用途：仅打印日志，不改变状态（状态变化通常靠 onclose）
     */
    ws.onerror = (err) => {
      console.log("[WS] error:", err);
    };

    /**
     * onmessage：
     * - 数据来源：后端推送消息（string 或 Blob）
     * - 用途：转交给 handleMessage 做 parse + 分发
     */
    ws.onmessage = (ev) => {
      this.handleMessage(ev.data);
    };
  }

  /* ============================================================
   * 消息接收与分发
   * ============================================================ */

  /**
   * handleMessage：
   * - 输入：data（WebSocketMessageEvent.data，可能是 Blob 或 string）
   * - 用途：
   *   1) 规范化为 string
   *   2) JSON.parse 得到 msg 对象
   *   3) 按固定顺序广播给各 service.ingestFrame(msg)
   *   4) 记录是否被任何 service 处理
   *
   * 数据流：
   * ws.onmessage -> handleMessage(data)
   *   -> parse msg
   *   -> services[] 逐个 ingestFrame
   *   -> service 内部更新 state
   *   -> UI subscribe(service) 更新
   */
  private handleMessage(data: any) {
    // 若是 Blob，异步转成 text 后递归调用自身
    if (data instanceof Blob) {
      data.text().then((text) => this.handleMessage(text));
      return;
    }

    // 只处理 string
    if (typeof data !== "string") return;

    // JSON.parse
    let msg: any;
    try {
      msg = JSON.parse(data);
    } catch {
      return;
    }

    // 打印所有收到的消息（调试用）
    console.log("[WS] recv:", msg);

    /**
     * services：
     * - 固定顺序投递
     * - 数据来源：本类构造阶段从容器拿到的 service 单例
     * - 用途：广播尝试消费
     *
     * 顺序含义（仅陈述）：
     * - maps/mapConfig 在前，可能先处理地图相关 cmd
     * - locate/anchors/ble/beaconList 依次处理其他域
     */
    const services: IngestibleService[] = [
      this.maps,
      this.mapConfig,
      this.locate,
      this.anchors,
      this.ble,
      this.beaconList,
    ].filter(Boolean) as IngestibleService[];

    /**
     * handled：
     * - 记录是否至少有一个 service 处理了该 msg
     * - 用于调试未知消息
     */
    let handled = false;

    for (const s of services) {
      try {
        // ingestFrame 返回 true 表示该 service 消费了消息
        handled = s.ingestFrame(msg) || handled;
      } catch (e) {
        console.warn("[WS] ingestFrame error:", e);
      }
    }

    // 没人处理的消息打印 debug，便于发现后端新增协议
    if (!handled) {
      console.debug("[WS] unknown message:", msg);
    }
  }
}
