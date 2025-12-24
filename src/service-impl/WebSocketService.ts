// WebSocketService.ts
import { getServiceSync } from "@spring4js/container-browser";
import IBluetoothDataService from "../service-api/IBluetoothDataService";
import IBeaconPositionService from "../service-api/IBeaconPositionService";
import ILocateResultService from "../service-api/ILocateResultService";
import IWebSocketService, { WSStatus } from "../service-api/IWebSocketService";
import EService from "../service-config/EService";

/**
 * WebSocketService
 * 负责维护 ws 连接、自动重连、状态通知，
 * 收到的消息直接分发给 3 个数据服务：
 *   - BluetoothDataService（实时表）
 *   - BeaconPositionService（信标坐标）
 *   - LocateResultService（定位结果）
 */
export default class WebSocketService implements IWebSocketService {
    private ws: WebSocket | null = null;
    private reconnectTimer: number | null = null;
    private listeners = new Set<(s: WSStatus) => void>();

    // ★ 新增：全局自增行号，避免重复 key
    private rowSeq = 1;

    // 依赖的三个数据服务
    private ble = getServiceSync<IBluetoothDataService>(EService.IBluetoothDataService);
    private anchors = getServiceSync<IBeaconPositionService>(EService.IBeaconPositionService);
    private locate = getServiceSync<ILocateResultService>(EService.ILocateResultService);

    /* ================== 对外接口 ================== */

    start(): void {
        this.connect();
    }

    send(data: any): void {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify(data));
            // console.log("[WS] sent:", data);
        } else {
            console.warn("[WS] socket not open, skip send:", data);
        }
    }

    subscribeStatus(listener: (status: WSStatus) => void): () => void {
        this.listeners.add(listener);

        // 立即推送一次当前状态
        const status: WSStatus =
            this.ws && this.ws.readyState === WebSocket.OPEN
                ? "connected"
                : this.ws && this.ws.readyState === WebSocket.CONNECTING
                ? "connecting"
                : "disconnected";
        listener(status);

        return () => this.listeners.delete(listener);
    }

    /* ================== 内部实现 ================== */

    private emitStatus(status: WSStatus) {
        this.listeners.forEach((fn) => {
            try {
                fn(status);
            } catch {
                // ignore
            }
        });
    }

    private connect() {
        // 已连接 / 正在连接 时不重复连
        if (
            this.ws &&
            (this.ws.readyState === WebSocket.OPEN ||
                this.ws.readyState === WebSocket.CONNECTING)
        ) {
            return;
        }

        if (this.reconnectTimer != null) {
            window.clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }

        const host = window.location.hostname || "localhost";
        const url = `ws://${host}:8081/ws`;

        console.log("[WS] connecting:", url);
        this.emitStatus("connecting");

        const ws = new WebSocket(url);
        this.ws = ws;

        ws.onopen = () => {
            console.log("[WS] connected");
            this.emitStatus("connected");
        };

        ws.onclose = () => {
            console.log("[WS] disconnected");
            this.ws = null;
            this.emitStatus("disconnected");

            // 简单重连策略
            this.reconnectTimer = window.setTimeout(() => this.connect(), 1000);
        };

        ws.onerror = (err) => {
            console.log("[WS] error:", err);
            // 真正的重连仍然由 onclose 统一处理
        };

        ws.onmessage = (ev) => {
            this.handleMessage(ev.data);
        };
    }

    /** 将一条原始 WS 消息分发到各数据服务 */
    private handleMessage(data: any) {
        // 1. 统一拿到字符串
        if (data instanceof Blob) {
            // 有些服务器会发二进制帧，这里兼容一下
            data.text().then((text) => this.handleMessage(text));
            return;
        }

        if (typeof data !== "string") {
            // console.warn("[WS] unsupported ws frame type:", typeof data, data);
            return;
        }

        const raw = data as string;

        let msg: any;
        try {
            msg = JSON.parse(raw);
        } catch (e) {
            return;
        }

        // ======== 以下保持你原来的三类分发逻辑 ========

        // RelayLocated → 定位结果服务
        if (msg.cmd === "RelayLocated") {
            this.locate.pushLocate({
                mac: msg.relay_mac,
                x: msg.x,
                y: msg.y,
                rssi: msg.rssi,
                devType: msg.dev_type,
                anchors: msg.anchors || [],
                ts: Date.now(),
            });
            console.log("[WS] received RelayLocated msg", msg);
            return;
        }

        // BeaconPositions → 信标坐标服务
        if (msg.cmd === "BeaconPositions" && Array.isArray(msg.items)) {
            this.anchors.loadFromServer(msg.items);
            // console.log("[WS] BeaconPositions", msg);
// 注意。貌似有一个地方重复发送了 BeaconPositions 消息
            return;
        }

        // 普通 BLE 数据 → 实时列表，来自开发板发给服务器的原始数据
        if (msg.raw && msg.raw.mac) {
            const key = this.rowSeq++;  // 每条自增一次，保证当前列表内唯一

            this.ble.pushRow({
                key,
                time: new Date().toLocaleTimeString(),
                mac: msg.raw.mac,
                rssi: msg.raw.rssi ?? 0,
                raw: JSON.stringify(msg.raw),
                parsed: msg.parsed ? JSON.stringify(msg.parsed) : "-",
            });
            return;
        }

        console.debug("[WS] unknown message:", msg);
    }
}
