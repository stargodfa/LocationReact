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

    /** 地图管理服务（获取地图列表、上传地图等） */
    IMapService = "IMapService",

    /** 地图配置服务（获取/保存地图相关配置，如比例尺等） */
    IMapConfigService = "IMapConfigService",

    /** 信标列表服务（获取信标 MAC 列表） */
    IBeaconListService = "IBeaconListService",
}

export default EService;
