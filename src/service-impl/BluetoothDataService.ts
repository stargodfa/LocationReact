// BluetoothDataService.ts
import StateBase from "../lib/service/StateBase";
import IBluetoothDataService, {
    IData,
    DataRow
} from "../service-api/IBluetoothDataService";

export default class BluetoothDataService
    extends StateBase<IData>
    implements IBluetoothDataService {

    constructor() {
        super({
            realTimeDataList: [],
            macList: []
        });
    }

    pushRow(row: DataRow): void {
        const prev = this.getState().realTimeDataList;
        const nextList = [row, ...prev].slice(0, 200); // 限制 200 行

        const macList = Array.from(
            new Set([row.mac, ...this.getState().macList])
        );

        this.setState({
            realTimeDataList: nextList,
            macList
        });
    }

    clearRealTimeDataList(): void {
        this.setState({
            realTimeDataList: [],
            macList: []
        });
    }
}
