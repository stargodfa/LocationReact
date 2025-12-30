/**
 * src/service-impl/BeaconPositionService.ts
 *
 * BeaconPositionService 的职责：
 * - 维护 anchors（锚点坐标）内存状态：{ [mac]: {mac,x,y} }
 * - 提供 setCoord/clearCoord/clearAll 等方法给 UI 调用（地图管理里拖拽/输入）
 * - 通过 IWebSocketService.send 向后端发送锚点相关命令（设置、清除、获取、恢复默认）
 * - 提供 ingestFrame(msg) 给 WebSocketService 广播调用
 *   识别并消费后端下发的 BeaconPositions 列表，写入 anchors 状态
 *
 * 数据流（端到端）：
 * 1) 前端 -> 后端（手动设点/拖拽）
 * UI (MapsManager) -> beaconPositionService.setCoord(mac,x,y)
 *   -> 本地 anchors 更新 + emit
 *   -> ws.send({cmd:"SetBeaconPosition",...})
 *   -> 后端保存/校验/广播（取决于后端实现）
 *
 * 2) 后端 -> 前端（下发锚点列表）
 * 后端 WS 推送: { cmd:"BeaconPositions", items:[{mac,x,y}, ...] }
 *   -> WebSocketService.handleMessage() parse
 *   -> BeaconPositionService.ingestFrame(msg)
 *   -> loadFromServer(items)
 *   -> setState({anchors}) -> UI 订阅刷新（MapsManager/LocationView 渲染红点）
 */

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
  /**
   * wsService：
   * - WebSocketService 单例
   * - 数据来源：IoC 容器 getServiceSync
   * - 用途：向后端发送锚点相关命令
   * - 流向：setCoord/clearCoord/clearAll/getAllCoords/setDefaultCoords -> wsService.send(payload)
   *
   * 注释“放到类内避免模块加载阶段触发 DI”的真实效果：
   * - 这行仍然在“实例化 BeaconPositionService 时”触发 DI，
   *   而不是在模块 import 时触发。
   * - 这通常比写在文件顶层更安全，因为 Environment.init 后容器才准备好。
   */
  private wsService = getServiceSync<IWebSocketService>(
    EService.IWebSocketService
  );

  /**
   * constructor：
   * - anchors 初始为空对象
   * - 数据来源：本地默认值
   * - 流向：getState()/subscribe() 初始回放
   */
  constructor() {
    super({ anchors: {} });
  }

  /**
   * setCoord：
   * - 输入：mac, x, y（单位：米）
   * - 调用方：
   *   - MapsManager 手动输入“设置”
   *   - MapsManager 拖拽锚点（实时持续调用）
   * - 用途：
   *   1) 立即更新本地 anchors（驱动 UI 立即刷新）
   *   2) 通知后端保存/更新该锚点（manual 模式）
   *
   * 本地数据流：
   * getState().anchors -> clone -> next[mac]={mac,x,y} -> setState -> UI
   *
   * 网络数据流：
   * wsService.send({cmd:"SetBeaconPosition", mac,x,y, mode:"manual"})
   */
  setCoord = (mac: string, x: number, y: number): void => {
    if (!mac) return;

    const next = { ...this.getState().anchors };
    next[mac] = { mac, x, y };
    this.setState({ anchors: next });

    this.wsService.send({
      cmd: "SetBeaconPosition",
      mac,
      x,
      y,
      mode: "manual",
    });
  };

  /**
   * clearCoord：
   * - 输入：mac
   * - 调用方：MapsManager “清除”
   * - 用途：
   *   1) 本地删除该 mac 的 anchor
   *   2) 通知后端清除该 mac 的 manual 坐标（scope:"manual"）
   *
   * 本地数据流：
   * clone anchors -> delete next[mac] -> setState -> UI
   *
   * 网络数据流：
   * wsService.send({cmd:"ClearCurrentBeaconPosition", mac, scope:"manual"})
   */
  clearCoord = (mac: string): void => {
    if (!mac) return;

    const next = { ...this.getState().anchors };
    delete next[mac];
    this.setState({ anchors: next });

    this.wsService.send({
      cmd: "ClearCurrentBeaconPosition",
      mac,
      scope: "manual",
    });
  };

  /**
   * clearAll：
   * - 调用方：MapsManager “清除所有锚标”
   * - 用途：
   *   1) 本地清空 anchors（立刻让 UI 不显示任何锚点）
   *   2) 通知后端清除所有锚点（scope:"all"）
   *
   * 数据流：
   * setState({anchors:{}}) -> UI
   * wsService.send({cmd:"ClearAllBeaconPositions", scope:"all"}) -> 后端
   */
  clearAll = (): void => {
    this.setState({ anchors: {} });

    this.wsService.send({
      cmd: "ClearAllBeaconPositions",
      scope: "all",
    });
  };

  /**
   * getAllCoords：
   * - 返回：当前本地 anchors 的列表快照（Object.values）
   * - 额外行为：会向后端发一次 GetBeaconPositions 请求
   * - 调用方：MapsManager “标定记录锚点”
   *
   * 数据流：
   * wsService.send({cmd:"GetBeaconPositions"}) -> 后端 -> 回 BeaconPositions -> ingestFrame -> loadFromServer
   * return Object.values(this.getState().anchors) -> 调用方（目前调用方并未使用返回值，只触发请求）
   */
  getAllCoords = (): BeaconCoord[] => {
    this.wsService.send({ cmd: "GetBeaconPositions" });
    return Object.values(this.getState().anchors);
  };

  /**
   * setDefaultCoords：
   * - 调用方：MapsManager “导入默认描点”
   * - 用途：通知后端加载/恢复默认锚点集合
   * - 后端预期：随后应下发 BeaconPositions 刷新前端
   */
  setDefaultCoords = (): void => {
    this.wsService.send({ cmd: "SetDefaultBeaconPosition" });
  };

  /**
   * loadFromServer：
   * - 输入：items（来自后端的锚点列表）
   * - 数据来源：ingestFrame(msg.cmd==="BeaconPositions")
   * - 用途：把后端的坐标合并进本地 anchors
   *
   * 合并策略（事实）：
   * - 以 mac 为 key 覆盖写
   * - 对于 items 未包含的 mac，本地原有的 anchor 会保留（因为是 merge，不是 replace）
   *
   * 数据流：
   * items -> next[mac]={...} -> setState -> UI
   */
  loadFromServer = (items: BeaconCoord[]): void => {
    const next = { ...this.getState().anchors };

    items.forEach((i) => {
      if (!i || !i.mac) return;
      next[i.mac] = { mac: i.mac, x: i.x, y: i.y };
    });

    this.setState({ anchors: next });
  };

  /**
   * ingestFrame：
   * - 调用方：WebSocketService.handleMessage 广播
   * - 输入：msg（JSON.parse 后对象）
   * - 返回：boolean 是否处理
   *
   * 识别规则：
   * - msg.cmd === "BeaconPositions"
   * - msg.items 是数组
   *
   * 数据流：
   * msg -> loadFromServer(items) -> setState -> UI
   */
  ingestFrame(msg: any): boolean {
    if (!msg || typeof msg !== "object") return false;

    if (msg.cmd === "BeaconPositions" && Array.isArray(msg.items)) {
      this.loadFromServer(msg.items as BeaconCoord[]);
      return true;
    }

    return false;
  }
}
