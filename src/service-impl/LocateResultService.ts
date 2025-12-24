// LocateResultService.ts
import StateBase from "../lib/service/StateBase";
import ILocateResultService, {
    ILocateResultState,
    LocateRecord
} from "../service-api/ILocateResultService";

export default class LocateResultService
    extends StateBase<ILocateResultState>
    implements ILocateResultService {

    constructor() {
        super({ results: {} });
    }

    pushLocate(rec: LocateRecord): void {
        if (!rec || !rec.mac) return;

        const next = { ...this.getState().results };
        next[rec.mac] = rec;

        this.setState({ results: next });
    }

    clear(): void {
        this.setState({ results: {} });
    }
}

