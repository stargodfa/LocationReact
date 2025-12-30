/**
 * src/service-impl/MapService.ts
 *
 * MapService 的职责：
 * - 维护“地图列表 maps”的内存状态（MapItem[]）
 * - 提供 getState()/subscribe() 给 UI 读取与订阅
 * - 提供 ingestFrame(msg) 给 WebSocketService 广播调用
 *   识别并消费后端的 MapList 消息，然后更新 maps 并通知订阅者
 *
 * 数据流（端到端）：
 * 后端 WS 推送: { cmd: "MapList", maps: [...] }
 *   -> WebSocketService.handleMessage() parse
 *   -> MapService.ingestFrame(msg) 命中 cmd
 *   -> loadFromServer(maps) 更新 this.maps
 *   -> listeners.forEach 通知 UI
 *   -> MapsManager / LocationView 的 mapService.subscribe 回调触发 setMapList -> 重渲染
 */

import IMapService, { MapItem } from "../service-api/IMapService";

export default class MapService implements IMapService {
  /**
   * maps：
   * - 当前地图列表的内存缓存
   * - 数据来源：
   *   1) ingestFrame() 收到 MapList 消息
   *   2) loadFromServer() 被调用
   * - 用途：作为 UI 的单一数据源
   * - 流向：getState()/subscribe() -> 组件 state -> Select options / mapSrc 拼接
   */
  private maps: MapItem[] = [];

  /**
   * listeners：
   * - 订阅者集合（通常是 React 组件注册的回调）
   * - 数据来源：subscribe(fn) 注册
   * - 用途：当 maps 更新时通知所有订阅者
   * - 流向：loadFromServer() -> listeners.forEach(fn)
   */
  private listeners = new Set<(maps: MapItem[]) => void>();

  /**
   * getState：
   * - 调用方：React 组件初始化时读取一次（例如 MapsManager/LocationView）
   * - 返回：{ maps }
   * - 用途：提供当前快照，避免必须等待 subscribe 回调
   */
  getState() {
    return { maps: this.maps };
  }

  /**
   * subscribe：
   * - 输入：fn(maps)
   * - 调用方：React 组件 useEffect 中订阅
   * - 行为：
   *   1) 把 fn 加入 listeners
   *   2) 立即用当前 maps 回放一次（保证 UI 立即拿到数据）
   *   3) 返回 unsubscribe 函数用于组件卸载清理
   *
   * 数据流：
   * subscribe -> fn(this.maps) -> 组件 setMapList -> 渲染
   * loadFromServer -> listeners.forEach(fn) -> 组件更新
   */
  subscribe(fn: (maps: MapItem[]) => void) {
    this.listeners.add(fn);
    fn(this.maps);
    return () => this.listeners.delete(fn);
  }

  /**
   * loadFromServer：
   * - 输入：maps（新地图列表）
   * - 数据来源：
   *   - ingestFrame(msg) 命中 MapList 后调用
   * - 用途：
   *   1) 更新内部缓存 this.maps
   *   2) 广播给所有订阅者
   * - 流向：this.maps -> listeners -> UI
   */
  loadFromServer(maps: MapItem[]) {
    this.maps = maps;
    this.listeners.forEach((fn) => fn(this.maps));
  }

  /**
   * ingestFrame：
   * - 调用方：WebSocketService.handleMessage() 广播分发
   * - 输入：msg（已 JSON.parse 的对象）
   * - 返回：boolean
   *   true  表示识别并处理了该消息
   *   false 表示不认识该消息
   *
   * 识别规则：
   * - msg.cmd === "MapList"
   * - msg.maps 是数组
   *
   * 数据流：
   * msg -> ingestFrame -> loadFromServer -> listeners -> UI
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
