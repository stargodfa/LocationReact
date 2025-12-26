export interface MapItem {
    id: string;
    name: string;
    file: string;
    url: string;
}

export default interface IMapService {
    getState(): { maps: MapItem[] };
    subscribe(fn: (maps: MapItem[]) => void): () => void;
    loadFromServer(maps: MapItem[]): void;
}
