import EService from "./EService";

import WorkbenchService from "../service-impl/WorkbenchService";
import BluetoothDataService from "../service-impl/BluetoothDataService";
import BeaconPositionService from "../service-impl/BeaconPositionService";
import LocateResultService from "../service-impl/LocateResultService";
import WebSocketService from "../service-impl/WebSocketService";
import MapService from "../service-impl/MapService";
import MapConfigService from "../service-impl/MapConfigService";

/**
 * 服务映射表
 * Environment 会读取此对象并注册所有服务
 */
const services = {
    /** WebSocket 主服务（所有消息分发入口） */
    [EService.IWorkbenchService]: new WorkbenchService(),

    /** WebSocket 服务（负责维护 WS 连接和状态通知） */
    [EService.IWebSocketService]: new WebSocketService(),

    /** 实时 BLE 数据（raw + parsed） */
    [EService.IBluetoothDataService]: new BluetoothDataService(),

    /** 信标固定坐标（SetBeaconPosition / GetBeaconPositions） */
    [EService.IBeaconPositionService]: new BeaconPositionService(),

    /** 服务端定位结果 RelayLocated（实时 XY 坐标） */
    [EService.ILocateResultService]: new LocateResultService(),

    /** 地图管理服务（获取地图列表、上传地图等） */
    [EService.IMapService]: new MapService(),

    /** 地图配置服务（获取/保存地图相关配置，如比例尺等） */
    [EService.IMapConfigService]: new MapConfigService(),
};

export default services;
