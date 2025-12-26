import IMapConfigService, {
    MapConfigState,
} from "../service-api/IMapConfigService";

export default class MapConfigService implements IMapConfigService {
    private state: MapConfigState = {
        meterToPixel: 300,
    };

    private listeners = new Set<(s: MapConfigState) => void>();

    getState(): MapConfigState {
        return this.state;
    }

    setMeterToPixel(value: number): void {
        if (this.state.meterToPixel === value) return;
        this.state.meterToPixel = value;
        this.emit();
    }

    subscribe(listener: (state: MapConfigState) => void): () => void {
        this.listeners.add(listener);
        // 立即推送一次当前状态
        listener(this.state);
        return () => this.listeners.delete(listener);
    }

    private emit() {
        for (const fn of this.listeners) {
            try {
                fn(this.state);
            } catch {
                // ignore
            }
        }
    }
}
