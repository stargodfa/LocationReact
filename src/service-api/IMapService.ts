/**
 * src/service-api/IMapService.ts
 *
 * IMapService 的职责（接口层面）：
 * - 定义“地图列表状态管理”的最小能力边界。
 * - UI 通过 getState()/subscribe() 获取地图列表并渲染下拉选择与地图图片 URL。
 * - WebSocketService 通过 ingestFrame(msg) 把后端消息广播给 MapService 消费。
 *
 * 数据流（端到端）：
 * 后端 -> {cmd:"MapList", maps:[MapItem...]}
 *   -> WebSocketService.handleMessage()
 *   -> IMapService.ingestFrame(msg) 识别并消费
 *   -> loadFromServer(maps) 更新内部状态
 *   -> subscribe 回调通知 UI
 */

export interface MapItem {
  /**
   * id：
   * - 地图唯一标识
   * - 数据来源：后端 MapList 消息
   * - 用途：
   *   - Select 的 value/key
   *   - UI 通过 selectedMapId 在 mapList 中查找对应地图
   */
  id: string;

  /**
   * name：
   * - 地图展示名称
   * - 数据来源：后端 MapList 消息
   * - 用途：Select 下拉展示文本
   */
  name: string;

  /**
   * file：
   * - 地图文件名或后端存储名（具体含义取决于后端）
   * - 数据来源：后端 MapList 消息
   * - 用途：目前 UI 未直接使用，可能用于管理页展示/上传管理
   */
  file: string;

  /**
   * url：
   * - 地图图片的可访问路径（通常是后端静态资源路由路径）
   * - 数据来源：后端 MapList 消息
   * - 用途：
   *   - MapsManager/LocationView 拼接 HTTP_BASE + url 作为 <img src>
   * - 数据流：
   *   url -> UI mapSrc/mapScale -> img 加载 -> computeLayout 计算比例/裁剪
   */
  url: string;
}

export default interface IMapService {
  /**
   * getState：
   * - 调用方：UI 初始化时读取一次
   * - 返回：{ maps }
   * - 用途：拿当前快照，避免等待 subscribe 回放
   */
  getState(): { maps: MapItem[] };

  /**
   * subscribe：
   * - 输入：fn(maps)
   * - 调用方：MapsManager/LocationView useEffect 订阅
   * - 输出：unsubscribe
   *
   * 数据流：
   * maps 更新 -> fn(maps) -> UI setMapList -> 重渲染
   */
  subscribe(fn: (maps: MapItem[]) => void): () => void;

  /**
   * loadFromServer：
   * - 输入：maps（新地图列表）
   * - 调用方：实现类通常在 ingestFrame 命中 MapList 后调用
   * - 用途：更新内部状态并通知订阅者
   *
   * 注意：接口命名为 loadFromServer，但它本质是“写入新列表”的 setter。
   * 是否来自 server 由调用方保证。
   */
  loadFromServer(maps: MapItem[]): void;

  /**
   * ingestFrame：
   * - 调用方：WebSocketService.handleMessage 广播
   * - 输入：msg（JSON.parse 后对象）
   * - 返回：boolean 是否消费
   *
   * 典型识别：
   * - msg.cmd === "MapList"
   * - msg.maps 为 MapItem[]
   */
  ingestFrame(msg: any): boolean;
}
