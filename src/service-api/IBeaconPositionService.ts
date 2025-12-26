// IBeaconPositionService.ts
export interface BeaconCoord {
    mac: string;
    x: number;
    y: number;
}

export interface IBeaconPositionState {
    anchors: Record<string, BeaconCoord>;
}

export default interface IBeaconPositionService {
    getState(): IBeaconPositionState;
    subscribe(listener: (s: IBeaconPositionState) => void): () => void;

    /** 前端手动设置坐标 */
    setCoord(mac: string, x: number, y: number): void;

    /** 清除某个 mac */
    clearCoord(mac: string): void;

    /** 清除所有 */
    clearAll(): void;

    /* 从服务器获取所有坐标点列表 */
    getAllCoords(): BeaconCoord[];

    /* 设置默认坐标点 */
    setDefaultCoords(): void;

    /* 从服务器加载预测坐标点 */
    loadFromServer(items: BeaconCoord[]): void;
}
