// src/service-api/IBeaconListService.ts

export type BeaconMac = string;

export interface IBeaconListState {
    macList: BeaconMac[];
    loading: boolean;
    error?: string;
    lastUpdatedAt?: number;
}

export type BeaconListListener = (state: IBeaconListState) => void;

export default interface IBeaconListService {
    /** 当前状态快照 */
    getState(): IBeaconListState;

    /** 订阅状态变化，返回取消订阅函数 */
    subscribe(listener: BeaconListListener): () => void;

    /** 从服务器拉取一次完整列表 */
    refresh(): Promise<void>;

    /** 手动整表替换（一般不用，留给调试/特殊场景） */
    setMacList(list: BeaconMac[]): void;

    /** 手动增量（一般不用） */
    addMac(mac: BeaconMac): void;

    /** 手动删除（一般不用） */
    removeMac(mac: BeaconMac): void;
    
    /** 手动删除某个 MAC 地址 */
    removeBeacon(mac: string): void;

    /** WebSocket 广播入口。返回 true 表示已处理该消息 */
    ingestFrame(msg: any): boolean;
}
