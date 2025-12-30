// // src/api/WebSocketClient.ts
// import { getServiceSync } from "@spring4js/container-browser";
// import IWebSocketService, { WSStatus } from "../service-api/IWebSocketService";
// import EService from "../service-config/EService";

// /**
//  * 这个文件现在只是一个“工具薄层”：
//  * - 不再自己 new WebSocket
//  * - 不再直接调用 Workbench
//  * - 全部转给底层 WebSocketService 处理
//  */

// // 缓存单例服务
// let wsSvc: IWebSocketService | null = null;

// function ensureWsService(): IWebSocketService {
//     if (!wsSvc) {
//         wsSvc = getServiceSync<IWebSocketService>(EService.IWebSocketService);
//     }
//     return wsSvc!;
// }

// /** 对外导出 WSStatus 类型，方便 UI 使用 */
// export type { WSStatus };

// /** 初始化 / 启动 WebSocket（内部会自动处理重连，多次调用安全） */
// export function initWebSocketClient(): void {
//     const svc = ensureWsService();
//     svc.start();
// }

// /** 发送一条消息到服务器（会自动 JSON.stringify） */
// export function sendWsMessage(data: any): void {
//     const svc = ensureWsService();
//     svc.send(data);
// }

// /**
//  * 订阅 WebSocket 状态变化：
//  *  - "connecting" | "connected" | "disconnected"
//  * 返回取消订阅函数。
//  */
// export function addWsStatusListener(
//     listener: (status: WSStatus) => void
// ): () => void {
//     const svc = ensureWsService();
//     return svc.subscribe(listener);
// }
