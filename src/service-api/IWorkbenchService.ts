/**
 * 工作台服务接口。
 * 只负责做一次性初始化（启动 WebSocket、初始化各数据服务等）。
 */
export default interface IWorkbenchService {
    /**
     * 应用启动时调用一次。
     * 内部可以启动 WebSocketService、做各种预加载。
     */
    start(): void;
}
