// BeaconPositionService.ts
import { getServiceSync } from "@spring4js/container-browser";
import StateBase from "../lib/service/StateBase";
import IBeaconPositionService, {
    BeaconCoord,
    IBeaconPositionState,
} from "../service-api/IBeaconPositionService";
import IWebSocketService from "../service-api/IWebSocketService";
import EService from "../service-config/EService";

// 统一通过 WebSocketService 发命令给后端
const wsService = getServiceSync<IWebSocketService>(EService.IWebSocketService);

export default class BeaconPositionService
    extends StateBase<IBeaconPositionState>
    implements IBeaconPositionService
{
    constructor() {
        super({ anchors: {} });
    }

    /** 前端手动设置 / 更新坐标 + 通知服务器 */
    setCoord = (mac: string, x: number, y: number): void => {
        if (!mac) return;

        const next = { ...this.getState().anchors };
        next[mac] = { mac, x, y };
        this.setState({ anchors: next });

        // 按你之前 app.js 的协议发送
        wsService.send({
            cmd: "SetBeaconPosition",
            mac,
            x,
            y,
            mode: "manual",
        });
    };

    /** 清除某个 mac，本地 + 可选通知服务器 */
    clearCoord = (mac: string): void => {
        if (!mac) return;

        const next = { ...this.getState().anchors };
        delete next[mac];
        this.setState({ anchors: next });

        wsService.send({
            cmd: "ClearCurrentBeaconPosition",
            mac,
            scope: "manual",
        });
    };

    /** 清除所有锚点，本地 + 通知服务器 */
    clearAll = (): void => {
        this.setState({ anchors: {} });

        wsService.send({
            cmd: "ClearAllBeaconPositions",
            scope: "all",
        });
    };

    /** 获取所有坐标点列表 */
    getAllCoords = (): BeaconCoord[] => {
        const anchors = this.getState().anchors;
        wsService.send({
            cmd: "GetBeaconPositions",
        });
        return Object.values(anchors);
    }

    /** 设置默认坐标点 */
    setDefaultCoords = (): void => {
        wsService.send({
        cmd: "SetDefaultBeaconPosition",

        });   
    };

    /** 从服务器加载预测坐标点 */
    loadFromServer = (items: BeaconCoord[]): void => {
        const next = { ...this.getState().anchors };

        items.forEach(i => {
            if (!i || !i.mac) return;
            next[i.mac] = { mac: i.mac, x: i.x, y: i.y };
        });

        this.setState({ anchors: next });
    };
}
