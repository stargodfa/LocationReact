// IWebSocketService.ts

export type WSStatus = "connecting" | "connected" | "disconnected";

/**
 * 纯 WebSocket 管理服务接口。
 * 只负责连接 / 重连 / 发送 / 状态通知。
 */
export default interface IWebSocketService {
    /** 启动连接（内部自动处理重连，重复调用是安全的） */
    start(): void;

    /** 发送一条 JSON 消息到服务端 */
    send(data: any): void;

    /**
     * 订阅 WebSocket 状态变化。
     * 返回取消订阅函数。
     */
    subscribe(listener: (status: WSStatus) => void): () => void;
}
