import { createStore, StoreApi } from 'zustand/vanilla'

/**
 * 状态基类。
 * 基于 zustand/vanilla 构建轻量级状态容器。
 * 子类继承后可拥有独立的状态管理能力。
 */
export default abstract class StateBase<T> {
    /** 内部的 zustand Store 实例 */
    protected __store: StoreApi<T>

    /**
     * 构造函数。
     * 创建一个 zustand 容器并初始化默认状态。
     *
     * @param initialState 初始状态对象
     */
    protected constructor(initialState: T) {
        this.__store = createStore<T>((set) => initialState)
    }

    /**
     * 更新状态。
     *
     * @param partial 可直接给出部分字段，或提供一个函数接收 prevState
     * @param replace 是否整体替换状态（默认为 false，仅合并）
     *
     * 用法示例：
     *   setState({ count: 1 })
     *   setState(prev => ({ count: prev.count + 1 }))
     */
    setState(
        partial: Partial<T> | ((prevState: T) => T | Partial<T>),
        replace?: boolean
    ) {
        this.__store.setState(partial, replace as any)
    }

    /**
     * 获取当前完整状态。
     */
    getState(): T {
        return this.__store.getState()
    }

    /**
     * 订阅状态变化。
     * 回调会在任意字段变化时触发。
     *
     * 返回值：取消订阅的函数。
     */
    subscribe(listener: (data: T) => void): () => void {
        return this.__store.subscribe(listener)
    }
}
