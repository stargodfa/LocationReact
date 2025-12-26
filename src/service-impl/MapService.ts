import IMapService, { MapItem } from "../service-api/IMapService";

export default class MapService implements IMapService {
    private maps: MapItem[] = [];
    private listeners = new Set<(maps: MapItem[]) => void>();

    getState() {
        return { maps: this.maps };
    }

    subscribe(fn: (maps: MapItem[]) => void) {
        this.listeners.add(fn);
        fn(this.maps);
        return () => this.listeners.delete(fn);
    }

    loadFromServer(maps: MapItem[]) {
        this.maps = maps;
        this.listeners.forEach((fn) => fn(this.maps));
    }
}
