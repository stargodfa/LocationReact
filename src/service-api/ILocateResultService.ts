/**
 * src/service-api/ILocateResultService.ts
 */

/* ================= AnchorInfo ================= */

export interface AnchorInfo {
  mac: string;
  x: number;
  y: number;
  rssi: number;
  dist?: number;
}

/* ================= LocateRecord ================= */

export interface LocateRecord {
  mac: string;
  x: number;
  y: number;
  rssi: number;
  devType?: string;
  anchors: AnchorInfo[];
  ts?: number;
}

/* ================= State ================= */

/**
 * ILocateResultState
 *
 * 结构升级说明：
 * - resultsByMap：按 mapId 分桶
 * - 每个 mapId 下仍然是：
 *     mac -> LocateRecord（只保留最新一条）
 */
export interface ILocateResultState {
  resultsByMap: {
    [mapId: string]: {
      [mac: string]: LocateRecord;
    };
  };
}

/* ================= Service Interface ================= */

export default interface ILocateResultService {
  /**
   * getState：
   * - 返回当前定位结果状态快照
   */
  getState(): ILocateResultState;

  /**
   * subscribe：
   * - 订阅定位结果变化
   */
  subscribe(listener: (s: ILocateResultState) => void): () => void;

  /**
   * pushLocate：
   * - 写入一条定位结果
   * - mapId 决定写入哪个地图桶
   */
  pushLocate(mapId: string, rec: LocateRecord): void;

  /**
   * clear：
   * - 若不传 mapId：清空全部
   * - 若传 mapId：仅清空该地图
   */
  clear(mapId?: string): void;

  /**
   * ingestFrame：
   * - WebSocket 广播入口
   * - 期望 msg 中包含 mapId
   */
  ingestFrame(msg: any): boolean;
}
