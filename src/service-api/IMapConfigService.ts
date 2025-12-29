export type MapConfigState = {
    meterToPixel: number;
};

export default interface IMapConfigService {
    /** 获取当前状态（同步） */
    getState(): MapConfigState;

    /** 设置比例（来自 WS） */
    setMeterToPixel(value: number): void;

    /** 订阅配置变化 */
    subscribe(listener: (state: MapConfigState) => void): () => void;

    /** WebSocket 广播入口。返回 true 表示已处理该消息 */
    ingestFrame(msg: any): boolean;
}
