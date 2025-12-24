// WorkbenchService.ts
import { getServiceSync } from "@spring4js/container-browser";
import IWorkbenchService from "../service-api/IWorkbenchService";
import IWebSocketService from "../service-api/IWebSocketService";
import EService from "../service-config/EService";

/**
 * WorkbenchService
 * 只负责做一次性的系统初始化。
 * 比如：启动 WebSocketService，后面就不再参与数据分发。
 */
export default class WorkbenchService implements IWorkbenchService {
    start(): void {
        // 以后如果还有别的初始化（比如预加载配置），也集中写在这里。
        console.log("[Workbench] started");
        const ws = getServiceSync<IWebSocketService>(EService.IWebSocketService);
        ws.start();        
    }
}
