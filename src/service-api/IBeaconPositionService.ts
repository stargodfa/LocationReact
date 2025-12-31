export interface BeaconCoord {
  mac: string;
  x: number;
  y: number;
}

export interface IBeaconPositionState {
  currentMapId: string | null;
  anchorsByMap: Record<string, Record<string, BeaconCoord>>;
}

export default interface IBeaconPositionService {
  getState(): IBeaconPositionState;

  subscribe(
    listener: (s: IBeaconPositionState) => void
  ): () => void;

  setCurrentMap(mapId: string): void;

  getCurrentAnchors(): Record<string, BeaconCoord>;

  setCoord(mac: string, x: number, y: number): void;

  clearCoord(mac: string): void;

  clearAll(): void;

  getAllCoords(): void;

  setDefaultCoords(): void;

  loadFromServer(mapId: string, items: BeaconCoord[]): void;

  ingestFrame(msg: any): boolean;
}
