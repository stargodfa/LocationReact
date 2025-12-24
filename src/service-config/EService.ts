/**
 * 服务名称枚举。
 * 用于在 container-browser 中注册和获取服务。
 */
enum EService {
    /** 工作台服务（系统启动入口，WebSocket 管理及数据分发） */
    IWorkbenchService = "WorkbenchService",

    /** WebSocket 服务（负责维护 WS 连接和状态通知） */
    IWebSocketService = "WebSocketService",

    /** 实时 BLE 数据（raw + parsed 的实时帧） */
    IBluetoothDataService = "BluetoothDataService",

    /** 信标固定坐标（SetBeaconPosition、GetBeaconPositions 的状态管理） */
    IBeaconPositionService = "BeaconPositionService",

    /** 服务器定位结果（RelayLocated 数据） */
    ILocateResultService = "LocateResultService",
}

export default EService;
