// ILocateResultService.ts

export interface AnchorInfo {
    mac: string;
    x: number;
    y: number;
    rssi: number;
    dist?: number;
}

export interface LocateRecord {
    mac: string;        // relay_mac
    x: number;
    y: number;
    rssi: number;
    devType?: string;
    anchors: AnchorInfo[];
    ts?: number;
}

export interface ILocateResultState {
    results: Record<string, LocateRecord>;  
}

export default interface ILocateResultService {
    getState(): ILocateResultState;
    subscribe(listener: (s: ILocateResultState) => void): () => void;

    /** 新增 RelayLocated 定位结果 */
    pushLocate(rec: LocateRecord): void;

    /** 清除所有定位结果 */
    clear(): void;
}
