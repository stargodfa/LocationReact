import { getServiceSync } from "@spring4js/container-browser";
import StateBase from "../lib/service/StateBase";
import IBeaconPositionService, {
  BeaconCoord,
  IBeaconPositionState,
} from "../service-api/IBeaconPositionService";
import IWebSocketService from "../service-api/IWebSocketService";
import EService from "../service-config/EService";

export default class BeaconPositionService
  extends StateBase<IBeaconPositionState>
  implements IBeaconPositionService
{
  private wsService = getServiceSync<IWebSocketService>(
    EService.IWebSocketService
  );

  constructor() {
    super({
      currentMapId: null,
      anchorsByMap: {},
    });
  }

  private requireMapId(): string {
    const { currentMapId } = this.getState();
    if (!currentMapId) {
      throw new Error("currentMapId not set");
    }
    return currentMapId;
  }

  setCurrentMap = (mapId: string): void => {
    const state = this.getState();
    this.setState({
      currentMapId: mapId,
      anchorsByMap: {
        ...state.anchorsByMap,
        [mapId]: state.anchorsByMap[mapId] || {},
      },
    });
  };

  getCurrentAnchors(): Record<string, BeaconCoord> {
    const mapId = this.requireMapId();
    return this.getState().anchorsByMap[mapId] || {};
  }

  setCoord = (mac: string, x: number, y: number): void => {
    if (!mac) return;
    const mapId = this.requireMapId();
    const state = this.getState();
    const next = { ...(state.anchorsByMap[mapId] || {}) };

    next[mac] = { mac, x, y };

    this.setState({
      anchorsByMap: {
        ...state.anchorsByMap,
        [mapId]: next,
      },
    });

    this.wsService.send({
      cmd: "SetBeaconPosition",
      mapId,
      mac,
      x,
      y,
    });
  };

  clearCoord = (mac: string): void => {
    if (!mac) return;
    const mapId = this.requireMapId();
    const state = this.getState();
    const next = { ...(state.anchorsByMap[mapId] || {}) };

    delete next[mac];

    this.setState({
      anchorsByMap: {
        ...state.anchorsByMap,
        [mapId]: next,
      },
    });

    this.wsService.send({
      cmd: "ClearCurrentBeaconPosition",
      mapId,
      mac,
      scope: "manual",
    });
  };

  clearAll = (): void => {
    const mapId = this.requireMapId();
    const state = this.getState();

    this.setState({
      anchorsByMap: {
        ...state.anchorsByMap,
        [mapId]: {},
      },
    });

    this.wsService.send({
      cmd: "ClearAllBeaconPositions",
      mapId,
    });
  };

  getAllCoords = (): void => {
    const mapId = this.requireMapId();

    this.wsService.send({
      cmd: "GetBeaconPositions",
      mapId,
    });

    // return Object.values(
    //   this.getState().anchorsByMap[mapId] || {}
    // );
  };

  setDefaultCoords = (): void => {
    const mapId = this.requireMapId();
    const state = this.getState();

    // ① 先清空当前地图，避免 UI 停留旧点
    this.setState({
      anchorsByMap: {
        ...state.anchorsByMap,
        [mapId]: {},
      },
    });

    // ② 通知服务器重置
    this.wsService.send({
      cmd: "SetDefaultBeaconPosition",
      mapId,
    });
  };

  loadFromServer(mapId: string, items: BeaconCoord[]): void {
    console.log("[BeaconPositionService] load", mapId, items);

    const next: Record<string, BeaconCoord> = {};
    items.forEach((i) => {
      if (!i?.mac) return;
      next[i.mac] = { mac: i.mac, x: i.x, y: i.y };
    });

    const state = this.getState();
    this.setState({
      anchorsByMap: {
        ...state.anchorsByMap,
        [mapId]: next,
      },
    });
  }


  ingestFrame(msg: any): boolean {
    if (!msg || msg.cmd !== "BeaconPositions") return false;

    const mapId = msg.mapId ?? msg.map_id;
    if (!mapId || !Array.isArray(msg.items)) return false;

    this.loadFromServer(mapId, msg.items);
    return true;
  }
}
