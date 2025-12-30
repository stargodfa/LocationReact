import { createStore, StoreApi } from "zustand/vanilla";

/**
 * StateBase<T>
 *
 * 这是你工程里所有“数据服务”的状态基类。
 * 目标是把“状态存储 + 订阅通知”抽成统一机制，让各业务 Service 只关心：
 * - ingestFrame(msg) 解析 WS 消息
 * - setState 更新状态
 * - UI subscribe 订阅状态并渲染
 *
 * 依赖：
 * - zustand/vanilla：不依赖 React。纯 JS/TS 状态容器。
 *
 * 数据流（统一模式）：
 * WebSocketService.handleMessage() 解析 msg
 *   -> 某个业务 Service.ingestFrame(msg)
 *   -> Service.setState(...) 更新 zustand store
 *   -> store 通知 subscribe(listener)
 *   -> React 组件 useEffect 里 setState(...) 触发重渲染
 */
export default abstract class StateBase<T> {
  /**
   * __store：
   * - 数据来源：构造函数里 createStore(...) 创建
   * - 类型：StoreApi<T>（zustand 的 vanilla store 实例）
   * - 用途：
   *   - 保存当前状态 T
   *   - 提供 setState / getState / subscribe 能力
   * - 流向：
   *   - setState() -> this.__store.setState(...)
   *   - getState() -> this.__store.getState()
   *   - subscribe() -> this.__store.subscribe(...)
   *
   * 说明：
   * - 这里用 protected，子类可以直接访问（如果你愿意暴露更底层能力）。
   * - 双下划线命名是“内部私有”语义约定，但 TS 层面不是 private。
   */
  protected __store: StoreApi<T>;

  /**
   * constructor(initialState)
   *
   * - 调用方：子类构造函数 super(initialState)
   * - 数据来源：initialState 由子类决定（例如 {results:{}} / {anchors:{}}）
   * - 用途：创建一个独立的 zustand store，并把初始状态写入 store
   * - 流向：initialState -> createStore(...) -> store.getState() 初始值
   *
   * 注意（事实）：
   * - zustand/vanilla 的 createStore initializer 允许接收 (set, get, api)。
   * - 这里写成 (set) => initialState，只是为了满足签名，不使用 set。
   */
  protected constructor(initialState: T) {
    this.__store = createStore<T>(() => initialState);
  }

  /**
   * setState(partial, replace?)
   *
   * - 调用方：子类（BluetoothDataService / LocateResultService 等）
   * - 数据来源：
   *   1) 直接传 Partial<T>：setState({ count: 1 })
   *   2) 传函数：setState(prev => ({ count: prev.count + 1 }))
   *
   * - 用途：更新 store 内的状态，并触发订阅者回调
   *
   * - replace 的意义（zustand 语义）：
   *   - replace=false（默认）：浅合并更新（merge）
   *   - replace=true：整体替换状态（replace）
   *
   * 数据流：
   * partial/producer -> __store.setState -> store 内部状态更新 -> subscribe(listener) 被触发
   *
   * 重要事实：
   * - 你工程里很多 service 用“clone + setState({xxx: next})”确保引用变化，触发 UI 更新。
   */
  setState(
    partial: Partial<T> | ((prevState: T) => T | Partial<T>),
    replace?: boolean
  ) {
    // zustand 的 setState 第二参是 replace（boolean）。
    // 这里 cast 是为了解决 TS 在不同 zustand 版本的类型签名差异。
    this.__store.setState(partial as any, replace as any);
  }

  /**
   * getState()
   *
   * - 调用方：
   *   - UI 初始化时读一次（useState(service.getState())）
   *   - service 内部更新时读取旧值（例如 pushRow 先读 prev）
   *
   * - 用途：同步获取当前完整状态快照
   * - 数据来源：__store 内部存储
   * - 流向：返回给调用方（UI 或 service）
   */
  getState(): T {
    return this.__store.getState();
  }

  /**
   * subscribe(listener)
   *
   * - 调用方：UI（React 组件 useEffect 中）
   * - 输入：listener(data)
   * - 输出：unsubscribe() 取消订阅函数
   *
   * - 用途：当 store 状态变化时通知调用方，驱动 UI setState -> 重渲染
   *
   * 数据流：
   * __store.setState -> zustand 通知 -> listener(newState, prevState) 被调用
   *   -> 你这里 listener 类型写成 (data:T)=>void
   *   -> zustand 实际可能传 (state, prevState) 两参，多余参数会被 JS 忽略
   */
  subscribe(listener: (data: T) => void): () => void {
    return this.__store.subscribe(listener as any);
  }
}
