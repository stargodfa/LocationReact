/**
 * src/views/maps-manager/MapsManager.tsx
 *
 * 组件职责（画面二：地图管理）：
 * 1) 从 MapService 获取地图列表，允许选择地图并预览地图图片。
 * 2) 从 MapConfigService 获取并设置“1 米 = 像素”比例（meterToPixel）。
 *    - 支持手动输入提交
 *    - 支持两点标定：在地图上点两点 + 输入实际米数 -> 计算比例并提交
 * 3) 从 BeaconListService 获取 Beacon MAC 列表，提供 Beacon 的增删。
 * 4) 从 BeaconPositionService 获取锚点坐标列表 anchors，并在地图上渲染为红点。
 *    - 支持拖拽红点实时更新坐标（并通过 service 上报到后端）
 *    - 支持手动输入坐标设置/清除/清空所有/导入默认/读取记录
 *
 * 数据流总览（核心链路）：
 * - WebSocket/HTTP -> 各 service 内部更新 state
 * - 本组件 subscribe(service) -> setState -> React 重新渲染
 *
 * 具体：
 * MapService.state.maps -> mapList -> 选择 selectedMapId -> mapScale(URL) -> <img src=...>
 * MapConfigService.state.meterToPixel -> meterToPixel -> 坐标换算与渲染
 * BeaconPositionService.state.anchors -> anchorList -> 地图上红点位置 -> 拖拽 -> setCoord(mac,x,y) 上报
 * BeaconListService.state.macList -> beaconMacList -> 下拉选择/删除等操作
 */

import React, { useState, useEffect, useRef } from "react";
import {
  Card,
  Space,
  Typography,
  Button,
  Select,
  Input,
  Popconfirm,
  Modal,
  InputNumber,
} from "antd";

import { getServiceSync } from "@spring4js/container-browser";

/**
 * IBeaconPositionService：
 * - 数据来源：IoC 容器单例
 * - 提供 anchors 坐标状态、setCoord/clearCoord/clearAll/setDefaultCoords/getAllCoords 等方法
 * - 这些方法通常会通过 WebSocket/HTTP 与后端交互（取决于实现）
 */
import IBeaconPositionService from "../../service-api/IBeaconPositionService";

/**
 * IMapService：
 * - 提供地图列表 maps（id/name/url/file等）
 */
import IMapService from "../../service-api/IMapService";

/**
 * IMapConfigService：
 * - 提供地图比例 meterToPixel，并允许更新
 */
import IMapConfigService from "../../service-api/IMapConfigService";

/**
 * IBeaconListService：
 * - 提供 Beacon MAC 列表 macList
 * - removeBeacon(mac) 删除列表项（可能同步到后端）
 */
import IBeaconListService from "../../service-api/IBeaconListService";

/**
 * EService：服务 key
 */
import EService from "../../service-config/EService";

/**
 * 以下 4 个 service 在模块顶层通过 IoC 获取为单例：
 * - 数据来源：Environment 注册的 service-info
 * - 用途：给组件内部读 state / subscribe / 调用方法
 *
 * 注意（事实说明）：
 * - 顶层 getServiceSync 要求容器已初始化。
 * - 你 main.tsx 里先 init env 再 render，通常可满足。
 */
const beaconPositionService = getServiceSync<IBeaconPositionService>(
  EService.IBeaconPositionService
);
const mapService = getServiceSync<IMapService>(EService.IMapService);
const mapConfigService = getServiceSync<IMapConfigService>(
  EService.IMapConfigService
);
const beaconListService = getServiceSync<IBeaconListService>(
  EService.IBeaconListService
);

/**
 * antd Typography / Select 的子组件别名
 */
const { Title, Text } = Typography;
const { Option } = Select;

/**
 * HTTP_BASE：
 * - 数据来源：浏览器 location.hostname
 * - 用途：拼接后端图片服务地址（8082）
 * - 流向：setmapScale(HTTP_BASE + map.url) -> <img src={mapScale}>
 *
 * 注意：
 * - 这里固定用 http 和端口 8082
 * - 如果后端走 https 或端口变化，需要环境变量化（后续再优化）
 */
const HTTP_BASE = `http://${location.hostname}:8082`;

/* ================= 类型 ================= */

/**
 * AnchorItem：
 * - 地图上一个锚点/信标的位置对象（单位米）
 * - mac：设备标识
 * - x/y：米单位坐标
 * 数据来源：BeaconPositionService.state.anchors 的 values
 * 用途：渲染红点 + 拖拽更新
 */
interface AnchorItem {
  mac: string;
  x: number;
  y: number;
}

/**
 * MapItem：
 * - 地图列表项
 * - id/name/file/url：由后端定义
 * 数据来源：MapService.state.maps
 * 用途：下拉选择地图 + 拼接图片 URL 预览
 */
interface MapItem {
  id: string;
  name: string;
  file: string;
  url: string;
}

/**
 * CalibPoint：
 * - 标定模式下用户点击的一个点
 * - rx/ry：点在“容器坐标系”中的坐标（相对 wrap 左上角的像素）
 * - ix/iy：点在“原始图片坐标系”中的坐标（相对原图左上角的像素）
 *
 * 数据来源：鼠标点击事件 + 当前缩放/偏移参数
 * 用途：用两个点计算原图像素距离 calibPixelDist
 */
type CalibPoint = {
  rx: number;
  ry: number;
  ix: number;
  iy: number;
};

/**
 * XY：
 * - 统一用于“米单位坐标”
 * 数据来源：clientToMeters() 换算结果或 anchors 本身
 * 用途：拖拽预览和上报 setCoord
 */
type XY = { x: number; y: number };

/**
 * round2：
 * - 把数字四舍五入到 2 位小数
 * 数据来源：输入 v
 * 用途：拖拽实时更新时减少抖动与数据噪声（坐标精度固定）
 * 流向：clientToMeters() 输出
 */
const round2 = (v: number) => Math.round(v * 100) / 100;

/* ===== 本画面 UI 持久化 key ===== */
const UI_KEY = "ui.mapsManager.mapId";

/* ================= 组件 ================= */

const MapsManager: React.FC = () => {
  /* -------- 地图（从 MapService 来）-------- */

  /**
   * mapList：
   * - 类型：MapItem[]
   * - 初始数据来源：[]（空）
   * - 更新来源：mapService.subscribe
   * - 用途：渲染“地图选择下拉”
   * - 流向：<Select>{mapList.map(...)}，以及 selectedMapId->mapScale
   */
  const [mapList, setMapList] = useState<MapItem[]>([]);

  /**
   * selectedMapId：
   * - 类型：string | undefined
   * - 数据来源：
   *   - 用户在 Select 里选择
   *   - 或 mapService.subscribe 时自动默认选第一个 map（prev ?? maps[0].id）
   * - 用途：决定当前预览哪张地图
   * - 流向：useEffect([selectedMapId,mapList]) -> setmapScale
   */
  const [selectedMapId, setSelectedMapId] = useState<string | undefined>(() => {
    return localStorage.getItem(UI_KEY) || undefined;
  });

  /**
   * mapScale：
   * - 类型：string
   * - 数据来源：HTTP_BASE + map.url
   * - 用途：作为 <img src> 显示地图图片
   * - 流向：<img src={mapScale}>
   *
   * 变量名 mapScale 实际保存的是“地图图片 URL”，不是比例值。
   * 这里只注解不改名。
   */
  const [mapScale, setmapScale] = useState<string>("");

  /* -------- Beacon（坐标输入 + 列表）-------- */

  /**
   * selectedBeacon：
   * - 数据来源：Beacon 下拉框选择的 MAC
   * - 用途：作为“设置/清除/删除”的目标 MAC
   * - 流向：handleSendCoord/handleClearCurrent/handleDeleteMac
   */
  const [selectedBeacon, setselectedBeacon] = useState("");

  /**
   * x/y：
   * - 数据来源：两个 Input 输入框（字符串）
   * - 用途：手动输入 Beacon 的坐标（米）
   * - 流向：handleSendCoord -> Number(x/y) -> beaconPositionService.setCoord()
   */
  const [x, setX] = useState("");
  const [y, setY] = useState("");

  /**
   * anchorList：
   * - 数据来源：beaconPositionService.state.anchors 的 values
   * - 用途：渲染地图上的红点（可拖拽）
   * - 流向：anchorList.map(...) 渲染；拖拽时以 a.x/a.y 作默认值
   */
  const [anchorList, setAnchorList] = useState<AnchorItem[]>([]);

  /**
   * beaconMacList：
   * - 数据来源：beaconListService.state.macList
   * - 用途：Beacon 下拉列表可选项
   * - 流向：<Select>{beaconMacList.map(...)}，以及 selectedBeacon 合法性校验
   */
  const [beaconMacList, setBeaconMacList] = useState<string[]>([]);

  /**
   * showMac：
   * - 数据来源：用户点击“隐藏/显示 MAC”
   * - 用途：决定地图上锚点标签是否显示 mac + (x,y)
   * - 流向：{showMac && <div>...</div>}
   */
  const [showMac, setShowMac] = useState(true);

  /* -------- 地图渲染（DOM 引用 + 渲染参数）-------- */

  /**
   * imgRef：
   * - 指向 <img> DOM 节点
   * - 数据来源：React ref 绑定
   * - 用途：读 naturalWidth/naturalHeight（原图像素尺寸）
   * - 流向：computeImageLayout() 使用
   */
  const imgRef = useRef<HTMLImageElement>(null);

  /**
   * wrapRef：
   * - 指向地图外层容器 div
   * - 数据来源：React ref 绑定
   * - 用途：读 clientWidth/clientHeight/boundingClientRect，用于坐标换算
   * - 流向：computeImageLayout()/handleMapClick()/clientToMeters()
   */
  const wrapRef = useRef<HTMLDivElement>(null);

  /**
   * meterToPixel：
   * - 含义：1 米对应多少像素（px/m）
   * - 数据来源：
   *   - mapConfigService.state.meterToPixel（订阅同步）
   *   - 用户输入或标定后 commitMeterToPixel 更新
   * - 用途：
   *   - 米坐标 <-> 像素坐标换算（渲染锚点、拖拽换算）
   * - 流向：
   *   - clientToMeters() 使用
   *   - 渲染锚点位置 px/py 计算使用
   */
  const [meterToPixel, setMeterToPixel] = useState<number>(300);

  /**
   * scale：
   * - 含义：原图像素到“渲染后图片像素”的缩放比例
   * - sx/sy：
   *   sx = 渲染宽 / 原图宽
   *   sy = 渲染高 / 原图高
   * - 数据来源：computeImageLayout() 根据容器尺寸与图片尺寸计算
   * - 用途：在“容器坐标”和“原图坐标”之间转换
   * - 流向：handleMapClick()/clientToMeters()/锚点渲染 px/py 计算
   */
  const [scale, setScale] = useState({ sx: 1, sy: 1 });

  /**
   * offset：
   * - 含义：图片在容器中居中显示时，左上角的偏移量（像素）
   * - 数据来源：computeImageLayout() 计算 (cw-rw)/2, (ch-rh)/2
   * - 用途：把“容器坐标”对齐到“图片渲染区域坐标”
   * - 流向：handleMapClick()/clientToMeters()/锚点渲染 px/py 计算
   */
  const [offset, setOffset] = useState({ left: 0, top: 0 });

  /**
   * renderSize：
   * - 含义：图片在容器里最终渲染的宽高（像素）
   * - 数据来源：computeImageLayout()
   * - 用途：
   *   - 限制点击/拖拽落点必须在图片渲染区域内
   *   - 用于从 y 坐标计算“底部为 0”的米坐标（my 计算）
   * - 流向：handleMapClick()/clientToMeters()/锚点渲染 py 计算
   */
  const [renderSize, setRenderSize] = useState({ width: 0, height: 0 });

  /* -------- 比例标定（地图点选）-------- */

  /**
   * calibMode：
   * - 数据来源：用户点击“标定地图比例”进入；取消/确认退出
   * - 用途：
   *   - 控制 UI 行为（点击地图选点、禁用拖拽）
   * - 流向：handleMapClick()/UI 提示/锚点 pointerEvents
   */
  const [calibMode, setCalibMode] = useState(false);

  /**
   * calibPoints：
   * - 数据来源：calibMode 下用户在地图点击选点
   * - 用途：存储最多两点，用于计算像素距离
   * - 流向：渲染标定点/连线；confirmCalibrate 计算比例
   */
  const [calibPoints, setCalibPoints] = useState<CalibPoint[]>([]);

  /**
   * calibModalOpen：
   * - 数据来源：选满两点后打开
   * - 用途：控制 Modal 显示
   * - 流向：<Modal open={calibModalOpen} ...>
   */
  const [calibModalOpen, setCalibModalOpen] = useState(false);

  /**
   * calibMeters：
   * - 数据来源：Modal 内 InputNumber 输入的实际米数
   * - 用途：计算 meterToPixel = calibPixelDist / calibMeters
   * - 流向：confirmCalibrate()
   */
  const [calibMeters, setCalibMeters] = useState<number>(1);

  /**
   * calibPixelDist：
   * - 数据来源：两点选完后，根据原图坐标 ix/iy 计算 hypot(dx,dy)
   * - 用途：作为像素距离参与比例计算
   * - 流向：Modal 显示、confirmCalibrate()
   */
  const [calibPixelDist, setCalibPixelDist] = useState<number>(0);

  /* -------- 拖拽锚点（实时更新）-------- */

  /**
   * draggingMac：
   * - 数据来源：startDrag(mac) 设置；endDrag() 清空
   * - 用途：
   *   - 控制 UI 提示“正在拖拽”
   *   - 控制锚点颜色与 cursor
   * - 流向：渲染 anchor 点的 isDragging 判定
   */
  const [draggingMac, setDraggingMac] = useState<string | null>(null);

  /**
   * dragPreview：
   * - 数据结构：Record<mac, {x,y}>
   * - 数据来源：拖拽过程中 scheduleDragSend/flushDragSend 更新
   * - 用途：
   *   - 在拖拽时立即在 UI 上显示“预览坐标”，不依赖 service 回推
   * - 流向：渲染 anchor 点位置时优先用 dragPreview[mac]
   */
  const [dragPreview, setDragPreview] = useState<Record<string, XY>>({});

  /**
   * dragRef：
   * - 用途：保存拖拽过程中的“非渲染状态”，避免频繁 setState 导致抖动
   * - 数据来源：startDrag/onDragMove/onDragUp 更新
   *
   * 字段说明：
   * - mac：当前正在拖拽的锚点 mac
   * - pointerId：PointerEvent 的 pointerId，用于 pointer capture（跟踪同一指针）
   * - raf：requestAnimationFrame 句柄，用于把高频 pointermove 合并到一帧一次发送
   * - pending：等待发送的最新坐标（米）
   * - lastSent：上一次已发送坐标（米），用于去重避免重复 setCoord
   *
   * 流向：flushDragSend()/scheduleDragSend() 使用
   */
  const dragRef = useRef<{
    mac: string | null;
    pointerId: number | null;
    raf: number | null;
    pending: XY | null;
    lastSent: XY | null;
  }>({ mac: null, pointerId: null, raf: null, pending: null, lastSent: null });

  useEffect(() => {
    if (selectedMapId) {
      localStorage.setItem(UI_KEY, selectedMapId);
    }
  }, [selectedMapId]);

  /* ================= 地图列表（MapService -> mapList/selectedMapId） ================= */
  useEffect(() => {
    // 初始读取一次当前 state
    setMapList(mapService.getState().maps);

    /**
     * 订阅地图列表变化：
     * - 数据来源：mapService 内部 state 更新（通常由 WS GetMapList 返回）
     * - 用途：刷新 mapList，并在首次有数据时自动选择第一个地图
     * - 流向：setMapList + setSelectedMapId
     */
    const unsub = mapService.subscribe((maps) => {
      setMapList(maps);

      setSelectedMapId((prev) => {
        const next = prev ?? (maps.length > 0 ? maps[0].id : undefined);
        if (next) {
          beaconPositionService.setCurrentMap(next);
        }
        return next;
      });
    });
    return unsub;
  }, []);

  /* ================= 比例同步（MapConfigService -> meterToPixel） ================= */
  useEffect(() => {
    const sync = () => {
      const s = mapConfigService.getState();
      if (!s.currentMapId) return;
      const v = s.meterToPixelByMap[s.currentMapId];
      if (typeof v === "number") {
        setMeterToPixel(v);
      }
    };

    sync();
    return mapConfigService.subscribe(sync);
  }, []);

  /* ================= 切换地图（selectedMapId + mapList -> mapScale URL） ================= */
  useEffect(() => {
    if (!selectedMapId) {
      setmapScale("");
      return;
    }

    beaconPositionService.setCurrentMap(selectedMapId);
    mapConfigService.setCurrentMap(selectedMapId);
    mapConfigService.syncCurrentMapScale(); // ★ 新增

    const map = mapList.find((m) => m.id === selectedMapId);
    if (!map) {
      setmapScale("");
      return;
    }

    setmapScale(HTTP_BASE + map.url);
  }, [selectedMapId, mapList]);


  /* ================= 图片布局计算：把“原图”按 contain 缩放到容器 ================= */

  /**
   * computeImageLayout：
   * - 读 img.naturalWidth/Height 获取原图尺寸（像素）
   * - 读 wrap.clientWidth/Height 获取容器尺寸（像素）
   * - 计算：
   *   - renderSize：最终渲染的图片宽高（rw/rh）
   *   - scale：rw/iw 与 rh/ih（原图 -> 渲染图缩放）
   *   - offset：图片在容器内居中后的左上角偏移（像素）
   *
   * 数据来源：
   * - DOM 尺寸（imgRef/wrapRef）
   *
   * 用途：
   * - 标定点击：容器坐标 <-> 原图坐标换算
   * - 拖拽换算：容器坐标 -> 米坐标
   * - 锚点渲染：米坐标 -> 容器坐标
   */
  const computeImageLayout = () => {
    const img = imgRef.current;
    const wrap = wrapRef.current;
    if (!img || !wrap) return;

    const iw = img.naturalWidth;  // 原图宽（px）
    const ih = img.naturalHeight; // 原图高（px）
    const cw = wrap.clientWidth;  // 容器宽（px）
    const ch = wrap.clientHeight; // 容器高（px）
    if (!iw || !ih || !cw || !ch) return;

    const imgRatio = iw / ih;    // 原图宽高比
    const wrapRatio = cw / ch;   // 容器宽高比

    // rw/rh：渲染后图片宽高（按 objectFit: contain 的逻辑）
    let rw = cw;
    let rh = ch;
    if (imgRatio > wrapRatio) rh = rw / imgRatio;
    else rw = rh * imgRatio;

    // scale：原图像素 -> 渲染图像素比例
    setScale({ sx: rw / iw, sy: rh / ih });

    // offset：渲染图在容器内居中显示时的偏移
    setOffset({ left: (cw - rw) / 2, top: (ch - rh) / 2 });

    // renderSize：渲染图最终大小
    setRenderSize({ width: rw, height: rh });
  };

  /**
   * 窗口 resize 时重新计算布局
   * 数据来源：window resize 事件
   * 流向：computeImageLayout -> setScale/setOffset/setRenderSize
   */
  useEffect(() => {
    window.addEventListener("resize", computeImageLayout);
    return () => window.removeEventListener("resize", computeImageLayout);
  }, []);

  /* ================= Anchor 同步（BeaconPositionService -> anchorList） ================= */
  useEffect(() => {
    if (!selectedMapId) {
      setAnchorList([]);
      return;
    }

    const sync = () => {
      const s = beaconPositionService.getState();
      setAnchorList(
        Object.values(s.anchorsByMap[selectedMapId] || {})
      );
    };

    // 初次同步
    sync();

    // 订阅 service 变化
    return beaconPositionService.subscribe(sync);
  }, [selectedMapId]);

  /* ================= Beacon MAC 列表同步（BeaconListService -> beaconMacList） ================= */
  useEffect(() => {
    // 初始读取
    setBeaconMacList(beaconListService.getState().macList);

    /**
     * 订阅 MAC 列表变化：
     * - 数据来源：beaconListService state 更新（来自后端 GetBeaconList 或 removeBeacon）
     * - 用途：刷新下拉列表
     * - 流向：setBeaconMacList -> Select options
     */
    const unsub = beaconListService.subscribe((s) => setBeaconMacList(s.macList));
    return unsub;
  }, []);

  /**
   * selectedBeacon 合法性校验：
   * - 当 macList 变化导致当前 selectedBeacon 不存在时，自动清空选择
   * - 数据来源：beaconMacList 与 selectedBeacon
   * - 流向：setselectedBeacon("")
   */
  useEffect(() => {
    if (!selectedBeacon) return;
    if (beaconMacList.includes(selectedBeacon)) return;
    setselectedBeacon("");
  }, [beaconMacList, selectedBeacon]);

  /* ================== 提交比例：统一入口（会发给服务端） ================== */

  /**
   * commitMeterToPixel：
   * - 输入：v（用户输入或标定计算得到的 px/m 值）
   * - 数据来源：
   *   - 输入框 onBlur / onPressEnter
   *   - 标定 confirmCalibrate
   * - 用途：
   *   1) 本地 UI 立刻更新 meterToPixel
   *   2) 调用 mapConfigService.setMeterToPixel(fixed) 让全局配置更新并上报后端
   * - 流向：
   *   setMeterToPixel -> clientToMeters/渲染
   *   mapConfigService.setMeterToPixel -> service -> WS/后端 -> 其他页面同步
   */
  const commitMeterToPixel = (v: number) => {
    const fixed = Number(Number(v).toFixed(2)); // 固定两位小数
    if (!Number.isFinite(fixed) || fixed <= 0) return;

    // setMeterToPixel(fixed);             // UI 立即反映
    mapConfigService.setMeterToPixel(fixed); // 通过 service 上报/同步
  };

  /* ================= 坐标操作（手动输入/删除/清空/导入） ================= */

  /**
   * handleSendCoord：
   * - 数据来源：selectedBeacon + x/y 输入框
   * - 用途：手动设置某个 Beacon 的坐标（米）
   * - 流向：beaconPositionService.setCoord(mac,nx,ny) -> service 上报/更新 -> anchorList 刷新
   */
  const handleSendCoord = () => {
    const nx = Number(x);
    const ny = Number(y);
    if (!selectedBeacon || Number.isNaN(nx) || Number.isNaN(ny)) return;
    beaconPositionService.setCoord(selectedBeacon, nx, ny);
  };

  /**
   * handleDeleteMac：
   * - 数据来源：selectedBeacon
   * - 用途：从 Beacon 列表中删除该 MAC
   * - 流向：beaconListService.removeBeacon -> service 更新 macList -> beaconMacList 更新 -> UI 下拉刷新
   */
  const handleDeleteMac = () => {
    if (selectedBeacon) beaconListService.removeBeacon(selectedBeacon);
  };

  /**
   * handleClearCurrent：
   * - 数据来源：selectedBeacon
   * - 用途：清除该 Beacon 的坐标
   * - 流向：beaconPositionService.clearCoord -> anchors 更新 -> anchorList 更新
   */
  const handleClearCurrent = () => {
    if (selectedBeacon) beaconPositionService.clearCoord(selectedBeacon);
  };

  /**
   * handleClearAll：
   * - 用途：清除所有锚点坐标
   * - 数据来源：用户点击按钮
   * - 流向：
   *   setDragPreview({}) 清空拖拽预览
   *   beaconPositionService.clearAll() -> anchors 清空 -> anchorList 更新
   */
  const handleClearAll = () => {
    setDragPreview({});
    beaconPositionService.clearAll();
  };

  /**
   * handleImportDefaultAnchors：
   * - 用途：导入默认锚点坐标（内置默认值）
   * - 流向：service setDefaultCoords -> anchors 更新 -> UI 刷新
   */
  const handleImportDefaultAnchors = () => {
    setDragPreview({});
    beaconPositionService.setDefaultCoords();
  };

  /**
   * handleUseRecordAnchors：
   * - 用途：从后端/记录读取锚点坐标（名称暗示“标定记录”）
   * - 流向：service getAllCoords -> anchors 更新 -> UI 刷新
   */
  const handleUseRecordAnchors = () => {
    setDragPreview({});
    beaconPositionService.getAllCoords();
  };

  /* ================= 布局：左右独立容器 ================= */

  /**
   * wsNotReady：
   * - 数据来源：mapList.length === 0
   * - 用途：用于判断“WS 数据是否还没回来导致地图列表空”
   * - 当前 leftWidthPx 逻辑没有分支效果（两边都是 400）
   * - 这里只注解，不改。
   */
  const wsNotReady = mapList.length === 0;
  const leftWidthPx = wsNotReady ? 400 : 400;

  /* ================= 比例标定：进入/退出 ================= */

  /**
   * startCalibrate：
   * - 数据来源：用户点击“标定地图比例”
   * - 前置条件：必须有 mapScale（已选择地图并有图片 URL）
   * - 行为：
   *   - endDrag() 结束任何拖拽
   *   - 进入 calibMode
   *   - 清空标定点与相关状态
   * - 流向：calibMode -> handleMapClick 生效 + UI 提示 + 禁用拖拽
   */
  const startCalibrate = () => {
    if (!mapScale) return;
    endDrag();
    setCalibMode(true);
    setCalibPoints([]);
    setCalibModalOpen(false);
    setCalibMeters(1);
    setCalibPixelDist(0);
  };

  /**
   * cancelCalibrate：
   * - 数据来源：用户取消或关闭 Modal
   * - 用途：退出标定模式并清空相关状态
   * - 流向：calibMode=false -> 恢复拖拽
   */
  const cancelCalibrate = () => {
    setCalibMode(false);
    setCalibPoints([]);
    setCalibModalOpen(false);
    setCalibMeters(1);
    setCalibPixelDist(0);
  };

  /* ================= 比例标定：地图点击取点 ================= */

  /**
   * handleMapClick：
   * - 触发：用户点击地图容器（wrapRef div）
   * - 生效条件：calibMode === true
   *
   * 输入事件 e：
   * - 数据来源：React MouseEvent
   * - 提供 clientX/clientY（视口坐标）
   *
   * 行为：
   * 1) 把 client 坐标换算为容器内部坐标 rx/ry
   * 2) 判断点击是否落在图片渲染区域内（inImg）
   * 3) 将容器坐标 rx/ry 换算为原图坐标 ix/iy（除以 scale）
   * 4) 收集两点后，计算两点在原图上的像素距离 calibPixelDist
   * 5) 打开 Modal 让用户输入实际米数 calibMeters
   */
  const handleMapClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!calibMode) return;

    const wrap = wrapRef.current;
    if (!wrap) return;

    // 未完成布局计算时，不能做坐标换算
    if (renderSize.width <= 0 || renderSize.height <= 0) return;
    if (scale.sx <= 0 || scale.sy <= 0) return;

    const rect = wrap.getBoundingClientRect();
    const rx = e.clientX - rect.left; // 容器坐标 x
    const ry = e.clientY - rect.top;  // 容器坐标 y

    // 判断是否点击在图片渲染区域（contain 后可能有边）
    const inImg =
      rx >= offset.left &&
      rx <= offset.left + renderSize.width &&
      ry >= offset.top &&
      ry <= offset.top + renderSize.height;

    if (!inImg) return;

    // 换算为原图坐标（像素）
    const ix = (rx - offset.left) / scale.sx;
    const iy = (ry - offset.top) / scale.sy;

    setCalibPoints((prev) => {
      if (prev.length >= 2) return prev; // 最多两点

      const next = [...prev, { rx, ry, ix, iy }];

      if (next.length === 2) {
        // 两点原图像素距离
        const dx = next[1].ix - next[0].ix;
        const dy = next[1].iy - next[0].iy;
        const pd = Math.hypot(dx, dy);
        setCalibPixelDist(pd);
        setCalibModalOpen(true);
      }

      return next;
    });
  };

  /* ================= 比例标定：确认设置 ================= */

  /**
   * confirmCalibrate：
   * - 前置条件：必须正好两点，且米数与像素距离均 > 0
   * - 计算：meterToPixel = calibPixelDist / calibMeters
   * - 流向：commitMeterToPixel -> mapConfigService.setMeterToPixel -> 后端同步
   * - 退出标定模式并清空点
   */
  const confirmCalibrate = () => {
    if (calibPoints.length !== 2) return;
    if (!calibMeters || calibMeters <= 0) return;
    if (!calibPixelDist || calibPixelDist <= 0) return;

    commitMeterToPixel(calibPixelDist / calibMeters);

    setCalibModalOpen(false);
    setCalibMode(false);
    setCalibPoints([]);
  };

  /* ================= 拖拽：坐标换算（client -> meters） ================= */

  /**
   * clientToMeters：
   * - 输入：clientX/clientY（视口坐标，来自 PointerEvent）
   * - 输出：{x,y}（米坐标），并四舍五入两位小数
   *
   * 数据来源：
   * - wrapRef.getBoundingClientRect() 获取容器位置
   * - scale/offset/renderSize/meterToPixel 当前渲染参数
   *
   * 用途：
   * - 拖拽时把鼠标位置换算为地图坐标（米）
   *
   * 坐标系约定（从公式推断）：
   * - x：从左往右增大
   * - y：从下往上增大
   *   因为 my 使用了 renderSize.height - (ry - offset.top)
   */
  const clientToMeters = (clientX: number, clientY: number): XY | null => {
    const wrap = wrapRef.current;
    if (!wrap) return null;

    // 必要参数未准备好时直接返回
    if (renderSize.width <= 0 || renderSize.height <= 0) return null;
    if (scale.sx <= 0 || scale.sy <= 0) return null;
    if (!meterToPixel || meterToPixel <= 0) return null;

    const rect = wrap.getBoundingClientRect();
    let rx = clientX - rect.left; // 容器坐标 x
    let ry = clientY - rect.top;  // 容器坐标 y

    // 把拖拽点 clamp 在图片渲染区域内
    const minX = offset.left;
    const maxX = offset.left + renderSize.width;
    const minY = offset.top;
    const maxY = offset.top + renderSize.height;

    if (rx < minX) rx = minX;
    if (rx > maxX) rx = maxX;
    if (ry < minY) ry = minY;
    if (ry > maxY) ry = maxY;

    // 容器坐标 -> 米坐标
    const mx = (rx - offset.left) / (scale.sx * meterToPixel);
    const my =
      (renderSize.height - (ry - offset.top)) / (scale.sy * meterToPixel);

    return { x: round2(mx), y: round2(my) };
  };

  /**
   * flushDragSend：
   * - 用途：在 requestAnimationFrame 回调中执行一次“合并后的发送”
   * - 数据来源：dragRef.current.pending 的最新坐标
   * - 去重：如果 pending 与 lastSent 相同则不发送
   * - 流向：
   *   1) setDragPreview 立即刷新 UI 中锚点位置
   *   2) beaconPositionService.setCoord(mac,x,y) 上报并更新 anchors
   */
  const flushDragSend = () => {
    const st = dragRef.current;
    st.raf = null;
    if (!st.mac || !st.pending) return;

    const mac = st.mac;
    const { x, y } = st.pending;

    // 去重：坐标未变化不发送
    if (st.lastSent && st.lastSent.x === x && st.lastSent.y === y) return;
    st.lastSent = { x, y };

    // UI 预览坐标（不等 service 回推）
    setDragPreview((prev) => ({ ...prev, [mac]: { x, y } }));

    // 通过 service 上报坐标（service 内部可能会发 WS/HTTP）
    beaconPositionService.setCoord(mac, x, y);
  };

  /**
   * scheduleDragSend：
   * - 用途：把高频 pointermove 合并为“一帧一次发送”
   * - 数据来源：onDragMove 计算的 xy
   * - 流向：dragRef.pending + requestAnimationFrame(flushDragSend)
   */
  const scheduleDragSend = (mac: string, xy: XY) => {
    const st = dragRef.current;
    st.mac = mac;
    st.pending = xy;
    if (st.raf != null) return;
    st.raf = window.requestAnimationFrame(flushDragSend);
  };

  /**
   * onDragMove：
   * - 触发：window pointermove
   * - 数据来源：PointerEvent ev（clientX/clientY）
   * - 用途：持续更新 pending 坐标并合并发送
   * - 流向：clientToMeters -> scheduleDragSend
   */
  const onDragMove = (ev: PointerEvent) => {
    const mac = dragRef.current.mac;
    if (!mac) return;
    const xy = clientToMeters(ev.clientX, ev.clientY);
    if (!xy) return;
    scheduleDragSend(mac, xy);
  };

  /**
   * onDragUp：
   * - 触发：window pointerup / pointercancel
   * - 用途：在结束前做一次最终 flush，然后 endDrag 清理监听与状态
   */
  const onDragUp = (ev: PointerEvent) => {
    const mac = dragRef.current.mac;

    if (mac) {
      const xy = clientToMeters(ev.clientX, ev.clientY);
      if (xy) {
        dragRef.current.pending = xy;
        flushDragSend();
      }
    }
    endDrag();
  };

  /**
   * endDrag：
   * - 用途：统一结束拖拽，清理 raf、清空 dragRef 状态、移除 window 事件监听
   * - 数据流：
   *   - draggingMac -> null（UI 恢复）
   *   - dragPreview 删除对应 mac（结束后去掉预览覆盖，交给 service anchors 真实值）
   */
  function endDrag() {
    const st = dragRef.current;
    const mac = st.mac;

    if (st.raf != null) {
      cancelAnimationFrame(st.raf);
      st.raf = null;
    }

    st.pending = null;
    st.lastSent = null;
    st.mac = null;
    st.pointerId = null;

    setDraggingMac(null);

    if (mac) {
      setDragPreview((prev) => {
        const next = { ...prev };
        delete next[mac];
        return next;
      });
    }

    window.removeEventListener("pointermove", onDragMove);
    window.removeEventListener("pointerup", onDragUp, true);
    window.removeEventListener("pointercancel", onDragUp, true);
  }

  /**
   * 组件卸载时确保结束拖拽并清理事件监听
   */
  useEffect(() => {
    return () => endDrag();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * startDrag：
   * - 输入：mac（锚点标识）
   * - 输出：onPointerDown handler
   * - 前置条件：
   *   - calibMode 为 true 时禁止拖拽
   *   - 没有 mapScale 时不允许拖拽（没有地图）
   *
   * 数据来源：用户对红点的 PointerDown
   * 流向：
   * - 设置 draggingMac
   * - 写入 dragRef.current.mac/pointerId
   * - 注册 window pointermove/pointerup 监听
   */
  const startDrag = (mac: string) => (e: React.PointerEvent<HTMLDivElement>) => {
    if (calibMode) return;
    if (!mapScale) return;

    e.preventDefault();
    e.stopPropagation();

    // 试图捕获指针，确保拖拽不丢事件（不同浏览器可能抛异常）
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // ignore
    }

    setDraggingMac(mac);

    dragRef.current.mac = mac;
    dragRef.current.pointerId = e.pointerId;
    dragRef.current.pending = null;
    dragRef.current.lastSent = null;

    window.addEventListener("pointermove", onDragMove);
    window.addEventListener("pointerup", onDragUp, true);
    window.addEventListener("pointercancel", onDragUp, true);
  };

  /* ================= 渲染 ================= */
  return (
    <div style={{ padding: "0 16px 16px" }}>
      {/* 内联样式表：
          - 定义左右布局与响应式行为
          - 数据来源：静态字符串
          - 流向：插入到 DOM 作为 <style>，影响当前页面 className 命中的元素
       */}
      <style>{`
        .mm-layout { display:flex; gap:16px; align-items:stretch; }
        .mm-left { flex:0 0 var(--mm-left-width); width:var(--mm-left-width); max-width:var(--mm-left-width); }
        .mm-right { flex:1 1 auto; min-width:0; }
        @media (max-width: 992px) {
          .mm-layout { flex-orientation: column; }
          .mm-left { width: 100%; max-width: none; flex: 0 0 auto; }
          .mm-right { width: 100%; }
        }
        .mm-beacon-popup { min-width: 180px; }
      `}</style>

      <Title level={4}>画面二 · 地图管理</Title>

      <div
        className="mm-layout"
        /**
         * CSS 变量 --mm-left-width：
         * - 数据来源：leftWidthPx（目前固定 400）
         * - 用途：控制左侧面板宽度
         * - 流向：.mm-left width/max-width
         */
        style={{ ["--mm-left-width" as any]: `${leftWidthPx}px` }}
      >
        {/* 左侧：控制面板 */}
        <div className="mm-left">
          {/* 地图选择 */}
          <Card title="房间地图选择" size="small" style={{ marginBottom: 16 }}>
            <Select
              value={selectedMapId}
              onChange={setSelectedMapId} // 用户选择 -> selectedMapId -> mapScale 更新
              disabled={mapList.length === 0} // 地图列表未加载时禁用
              placeholder="请选择地图"
              style={{ width: "100%" }}
            >
              {mapList.map((m) => (
                <Option key={m.id} value={m.id}>
                  {m.name}
                </Option>
              ))}
            </Select>
          </Card>

          {/* 比例设置 */}
          <Card title="地图比例设置" size="small" style={{ marginBottom: 16 }}>
            <Space orientation="vertical" style={{ width: "100%" }}>
              <Text>1 米 = 像素</Text>

              <Space style={{ width: "100%" }}>
                <Input
                  type="number"
                  value={meterToPixel}
                  /**
                   * onChange：
                   * - 数据来源：用户输入
                   * - 用途：更新本地 meterToPixel（注意仅更新 state，不自动提交）
                   */
                  onChange={(e) => setMeterToPixel(Number(e.target.value))}
                  /**
                   * onBlur/onPressEnter：
                   * - 数据来源：失焦/回车
                   * - 用途：真正提交比例到 service 并上报后端
                   */
                  onBlur={() => commitMeterToPixel(meterToPixel)}
                  onPressEnter={() => commitMeterToPixel(meterToPixel)}
                  style={{ flex: 1 }}
                />
                <Button onClick={startCalibrate} disabled={!mapScale}>
                  标定地图比例
                </Button>
              </Space>

              {/* 状态提示：calibMode 时提醒点两点 */}
              {calibMode ? (
                <Text type="warning" style={{ fontSize: 12 }}>
                  标定模式：点击两点输入米数。拖拽锚点已禁用。
                </Text>
              ) : (
                <Text type="secondary" style={{ fontSize: 12 }}>
                  提示：按住红色信标点拖动，松开即保存并实时上报。
                  手动输入比例后，按回车或移出输入框生效。
                </Text>
              )}
            </Space>
          </Card>

          {/* Beacon 坐标设定 */}
          <Card title="Beacon 坐标设定" size="small">
            <Space orientation="vertical" style={{ width: "100%" }}>
              <Space style={{ width: "100%" }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <Select
                    value={selectedBeacon || undefined}
                    onChange={setselectedBeacon}
                    placeholder="选择 Beacon"
                    disabled={beaconMacList.length === 0}
                    style={{ width: "100%" }}
                    popupMatchSelectWidth={false as any}
                    classNames={{ popup: { root: "mm-beacon-popup" } }}
                    optionLabelProp="value"
                  >
                    {beaconMacList.map((mac) => (
                      <Option key={mac} value={mac}>
                        <span style={{ whiteSpace: "nowrap" }}>{mac}</span>
                      </Option>
                    ))}
                  </Select>
                </div>

                {/* showMac 开关：只影响地图标签显示 */}
                <Button onClick={() => setShowMac((v) => !v)}>
                  {showMac ? "隐藏 MAC" : "显示 MAC"}
                </Button>
              </Space>

              {/* x/y 手动输入（米） */}
              <Input
                value={x}
                onChange={(e) => setX(e.target.value)}
                placeholder="X (m)"
              />
              <Input
                value={y}
                onChange={(e) => setY(e.target.value)}
                placeholder="Y (m)"
              />

              {/* 坐标操作按钮 */}
              <Space>
                <Button type="primary" onClick={handleSendCoord}>
                  设置
                </Button>
                <Button onClick={handleClearCurrent}>清除</Button>

                {/* 删除 Beacon 列表项，需要确认 */}
                <Popconfirm
                  title="确认删除该Beacon列表信息？"
                  okText="删除"
                  cancelText="取消"
                  onConfirm={handleDeleteMac}
                  disabled={!selectedBeacon}
                >
                  <Button danger disabled={!selectedBeacon}>
                    删除
                  </Button>
                </Popconfirm>
              </Space>

              {/* 批量操作 */}
              <Space wrap>
                <Button onClick={handleImportDefaultAnchors}>导入默认描点</Button>
                <Button onClick={handleUseRecordAnchors}>标定记录锚点</Button>
                <Button danger onClick={handleClearAll}>
                  清除所有锚标
                </Button>
              </Space>
            </Space>
          </Card>
        </div>

        {/* 右侧：地图预览与锚点渲染 */}
        <div className="mm-right">
          <Card
            title="地图预览"
            /**
             * extra：
             * - calibMode：显示“重选两点/退出标定”
             * - draggingMac：显示正在拖拽的 mac
             */
            size="small"
            extra={
              calibMode ? (
                <Space>
                  <Button onClick={() => setCalibPoints([])}>重选两点</Button>
                  <Button danger onClick={cancelCalibrate}>
                    退出标定
                  </Button>
                </Space>
              ) : draggingMac ? (
                <Text type="warning" style={{ fontSize: 12 }}>
                  正在拖拽：{draggingMac}
                </Text>
              ) : null
            }
          >
            <div
              ref={wrapRef}
              onClick={handleMapClick} // 标定模式下：点击取点
              style={{
                width: "100%",
                height: "calc(100vh - 220px)",
                minHeight: 400,
                position: "relative",
                overflow: "hidden",
                border: "1px solid #ddd",
                background: "#fff",
                cursor: calibMode
                  ? "crosshair"
                  : draggingMac
                  ? "grabbing"
                  : "default",
              }}
            >
              {mapScale ? (
                <>
                  {/* 地图图片 */}
                  <img
                    ref={imgRef}
                    src={mapScale}
                    onLoad={computeImageLayout} // 图片加载后才能知道 naturalWidth/Height
                    style={{
                      width: "100%",
                      height: "100%",
                      objectFit: "contain",
                      pointerEvents: "none", // 让点击/拖拽事件落在外层 wrap 上
                      userSelect: "none",
                    }}
                  />

                  {/* 标定点与连线：只在 calibMode 下显示 */}
                  {calibMode && (
                    <>
                      {calibPoints.length === 2 && (
                        <svg
                          style={{
                            position: "absolute",
                            inset: 0,
                            pointerEvents: "none",
                          }}
                        >
                          <line
                            x1={calibPoints[0].rx}
                            y1={calibPoints[0].ry}
                            x2={calibPoints[1].rx}
                            y2={calibPoints[1].ry}
                            stroke="rgba(0,0,255,0.7)"
                            strokeWidth={2}
                          />
                        </svg>
                      )}

                      {calibPoints.map((p, i) => (
                        <React.Fragment key={i}>
                          {/* 选点圆点 */}
                          <div
                            style={{
                              position: "absolute",
                              left: p.rx,
                              top: p.ry,
                              width: 12,
                              height: 12,
                              background:
                                i === 0
                                  ? "rgba(0,0,255,0.9)"
                                  : "rgba(0,0,255,0.6)",
                              borderRadius: "50%",
                              transform: "translate(-50%, -50%)",
                              pointerEvents: "none",
                              boxShadow: "0 0 0 2px rgba(255,255,255,0.8)",
                            }}
                          />
                          {/* 选点标签 */}
                          <div
                            style={{
                              position: "absolute",
                              left: p.rx + 16,
                              top: p.ry - 12,
                              fontSize: 12,
                              background: "rgba(255,255,255,0.85)",
                              padding: "1px 6px",
                              borderRadius: 4,
                              whiteSpace: "nowrap",
                              pointerEvents: "none",
                              border: "1px solid rgba(0,0,0,0.08)",
                            }}
                          >
                            点{i + 1}
                          </div>
                        </React.Fragment>
                      ))}
                    </>
                  )}

                  {/* 可拖拽锚点：anchorList 来自 BeaconPositionService */}
                  {anchorList.map((a) => {
                    /**
                     * ax/ay：
                     * - 数据来源：
                     *   - 拖拽中：dragPreview[a.mac]（即时预览坐标）
                     *   - 否则：a.x/a.y（service 提供的坐标）
                     * - 用途：统一用于渲染点位与标签
                     */
                    const p = dragPreview[a.mac];
                    const ax = p ? p.x : a.x;
                    const ay = p ? p.y : a.y;

                    /**
                     * px/py：锚点在容器中的像素位置
                     * - 数据来源：ax/ay + scale + offset + meterToPixel + renderSize.height
                     * - 用途：把米坐标映射到屏幕像素坐标
                     * - 坐标系：
                     *   px：左 -> 右
                     *   py：上 -> 下（所以用 renderSize.height - ay*...）
                     */
                    const px = offset.left + ax * scale.sx * meterToPixel;
                    const py =
                      offset.top +
                      renderSize.height -
                      ay * scale.sy * meterToPixel;

                    const isDragging = draggingMac === a.mac;

                    return (
                      <React.Fragment key={a.mac}>
                        {/* 红点本体：PointerDown 开始拖拽 */}
                        <div
                          onPointerDown={startDrag(a.mac)}
                          style={{
                            position: "absolute",
                            left: px,
                            top: py,
                            width: 14,
                            height: 14,
                            background: isDragging ? "#fa541c" : "red",
                            borderRadius: "50%",
                            transform: "translate(-50%, -50%)",
                            cursor: calibMode
                              ? "not-allowed"
                              : isDragging
                              ? "grabbing"
                              : "grab",
                            boxShadow: isDragging
                              ? "0 0 0 3px rgba(250,84,28,0.25)"
                              : "0 0 0 2px rgba(255,255,255,0.8)",
                            zIndex: isDragging ? 5 : 2,
                            pointerEvents: calibMode ? "none" : "auto",
                          }}
                          title={`拖拽 ${a.mac}`}
                        />

                        {/* 标签：显示 mac + 坐标（可开关） */}
                        {showMac && (
                          <div
                            style={{
                              position: "absolute",
                              left: px + 55,
                              top: py - 15,
                              fontSize: 12,
                              background: "rgba(255,255,255,0.7)",
                              padding: "1px 4px",
                              borderRadius: 3,
                              whiteSpace: "nowrap",
                              transform: "translate(-50%, -50%)",
                              pointerEvents: "none",
                              zIndex: isDragging ? 5 : 2,
                            }}
                          >
                            {a.mac} ({ax.toFixed(2)}, {ay.toFixed(2)})
                          </div>
                        )}
                      </React.Fragment>
                    );
                  })}
                </>
              ) : (
                <Text type="secondary">尚未选择地图</Text>
              )}
            </div>
          </Card>
        </div>
      </div>

      {/* 标定确认对话框：输入实际米数，确认后更新 meterToPixel */}
      <Modal
        title="设置地图比例"
        open={calibModalOpen}
        onCancel={cancelCalibrate}
        onOk={confirmCalibrate}
        okText="确认并更新比例"
        cancelText="取消"
        destroyOnHidden
      >
        <Space orientation="vertical" style={{ width: "100%" }}>
          <Text>已选择两点。</Text>
          <Text type="secondary">
            两点像素距离（原图 px）：{calibPixelDist ? calibPixelDist.toFixed(2) : "-"}
          </Text>

          <Space align="center">
            <Text>两点实际距离（米）</Text>
            <InputNumber
              min={0.01}
              value={calibMeters}
              onChange={(v) => setCalibMeters(Number(v ?? 0))}
              style={{ width: 160 }}
            />
          </Space>

          <Text type="secondary" style={{ fontSize: 12 }}>
            计算方式：1米像素 = 像素距离 / 实际米数
          </Text>

          {calibMeters > 0 && calibPixelDist > 0 && (
            <Text>预览结果：1 米 ≈ {(calibPixelDist / calibMeters).toFixed(2)} px</Text>
          )}
        </Space>
      </Modal>
    </div>
  );
};

export default MapsManager;
