export interface DataRow {
    key: number;
    time: string;
    mac: string;
    rssi: number;
    raw: string;
    parsed: string;
}

export interface IData {
    realTimeDataList: DataRow[];
    macList: string[];
}

export default interface IBluetoothDataService {
    getState(): IData;
    subscribe(fn: (s: IData) => void): () => void;

    pushRow(row: DataRow): void;

    clearRealTimeDataList(): void;   // 如果要保留清除功能

    /** WebSocket 广播入口。返回 true 表示已处理该消息 */
    ingestFrame(msg: any): boolean;
}
