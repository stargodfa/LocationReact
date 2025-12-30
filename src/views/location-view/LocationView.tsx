/**
 * src/views/location-view/LocationView.tsx
 *
 * 组件职责（画面三：定位显示）：
 * - 选择地图并以“cover”方式显示地图图片（铺满容器，超出部分裁剪）。
 * - 从 BeaconPositionService 获取 anchors（锚点坐标）并渲染为红色圆点。
 * - 从 LocateResultService 获取定位结果 results 并渲染为蓝色预测框。
 * - 从 MapConfigService 获取比例 meterToPixel（px/m），把“米坐标”换算到屏幕像素。
 * - 支持切换显示 MAC 标签。
 *
 * 数据流总览：
 * MapService.maps -> mapList -> selectedMapId -> mapSrc(URL) -> <img>
 * MapConfigService.meterToPixel -> meterToPixel -> worldToScreen 坐标换算
 * BeaconPositionService.anchors -> anchors[] -> 渲染红点
 * LocateResultService.results -> locPoints[] -> 渲染蓝框
 */

import React, { useState, useEffect, useRef } from "react";
import { Card, Space, Typography, Select, Button } from "antd";

import { getServiceSync } from "@spring4js/container-browser";
import IBeaconPositionService from "../../service-api/IBeaconPositionService";
import ILocateResultService from "../../service-api/ILocateResultService";
import IMapService from "../../service-api/IMapService";
import IMapConfigService from "../../service-api/IMapConfigService";
import EService from "../../service-config/EService";

/**
 * antd Typography/Select 子组件
 */
const { Title } = Typography;
const { Option } = Select;

/**
 * service 单例（从 IoC 容器获取）
 * 数据来源：Environment 注册后的容器
 * 用途：读取 state + subscribe 更新
 * 流向：useEffect 订阅 -> setState -> 触发渲染
 */
const beaconPositionService = getServiceSync<IBeaconPositionService>(
  EService.IBeaconPositionService
);
const locateService = getServiceSync<ILocateResultService>(
  EService.ILocateResultService
);
const mapService = getServiceSync<IMapService>(EService.IMapService);
const mapConfigService = getServiceSync<IMapConfigService>(
  EService.IMapConfigService
);

/**
 * HTTP_BASE：
 * - 数据来源：location.hostname（当前网页域名）
 * - 用途：拼接地图图片服务地址（8082）
 * - 流向：setMapSrc(HTTP_BASE + map.url) -> <img src={mapSrc}>
 */
const HTTP_BASE = `http://${location.hostname}:8082`;

/**
 * 预测框尺寸（像素）
 * - 数据来源：常量写死
 * - 用途：控制定位结果框显示尺寸
 * - 流向：蓝色预测框 div 的 width/height
 */
const PREDICT_BOX_WIDTH = 20;
const PREDICT_BOX_HEIGHT = 15;

const LocationView: React.FC = () => {
  /* ===== UI 状态 ===== */

  /**
   * showMac：
   * - 数据来源：用户点击按钮
   * - 用途：决定是否显示锚点/定位点的 MAC 标签
   * - 流向：{showMac && <div>...</div>}
   */
  const [showMac, setShowMac] = useState(true);

  /* ===== 地图相关 ===== */

  /**
   * mapList：
   * - 数据来源：MapService.state.maps
   * - 用途：渲染地图选择下拉
   * - 流向：Select options + selectedMapId 联动
   */
  const [mapList, setMapList] = useState<any[]>([]);

  /**
   * selectedMapId：
   * - 数据来源：
   *   - 用户选择
   *   - 首次加载 maps 时自动选择 maps[0].id（如果之前没选）
   * - 用途：决定当前地图
   * - 流向：useEffect -> setMapSrc
   */
  const [selectedMapId, setSelectedMapId] = useState<string>();

  /**
   * mapSrc：
   * - 数据来源：HTTP_BASE + map.url
   * - 用途：作为地图图片 <img src>
   * - 流向：<img src={mapSrc} ...>
   */
  const [mapSrc, setMapSrc] = useState<string>("");

  /* ===== 比例 ===== */

  /**
   * meterToPixel：
   * - 含义：1 米对应多少像素（px/m）
   * - 数据来源：MapConfigService.state.meterToPixel
   * - 用途：世界坐标(米) -> 像素坐标换算
   * - 流向：worldToScreen()
   */
  const [meterToPixel, setMeterToPixel] = useState<number>(300);

  /* ===== 数据 ===== */

  /**
   * anchors：
   * - 数据来源：BeaconPositionService.state.anchors 的 values
   * - 用途：渲染红色锚点
   * - 流向：anchors.map 渲染
   */
  const [anchors, setAnchors] = useState<any[]>([]);

  /**
   * locPoints：
   * - 数据来源：LocateResultService.state.results 的 values
   * - 用途：渲染定位预测框
   * - 流向：locPoints.map 渲染
   */
  const [locPoints, setLocPoints] = useState<any[]>([]);

  /* ===== DOM / 布局 ===== */

  /**
   * mapImgRef：
   * - 指向 <img> DOM
   * - 数据来源：ref 绑定
   * - 用途：读取 naturalWidth/Height（原图尺寸）
   * - 流向：computeCoverLayout() 使用
   */
  const mapImgRef = useRef<HTMLImageElement>(null);

  /**
   * mapWrapRef：
   * - 指向地图容器 div
   * - 数据来源：ref 绑定
   * - 用途：读取 clientWidth/clientHeight（容器尺寸）
   * - 流向：computeCoverLayout() 使用
   */
  const mapWrapRef = useRef<HTMLDivElement>(null);

  /**
   * layout：
   * - 描述 objectFit: "cover" 模式下，原图如何缩放并裁剪到容器
   *
   * 字段解释：
   * - scale：
   *   原图 -> 渲染图的缩放比例（cover：取 max(cw/iw, ch/ih)）
   * - renderedW/renderedH：
   *   原图按 scale 缩放后的实际渲染尺寸（可能大于容器，产生裁剪）
   * - cropX/cropY：
   *   裁剪掉的部分（左右/上下）的一半，用于把“渲染图坐标”对齐回“容器坐标”
   *
   * 数据来源：computeCoverLayout() 计算
   * 用途：worldToScreen 换算时补偿 cover 裁剪偏移
   * 流向：worldToScreen()
   */
  const [layout, setLayout] = useState({
    scale: 1,
    cropX: 0,
    cropY: 0,
    renderedW: 0,
    renderedH: 0,
  });

  /* ===== 地图列表同步 ===== */
  useEffect(() => {
    /**
     * 初始读取 maps：
     * 数据来源：mapService.getState()
     */
    setMapList(mapService.getState().maps);

    /**
     * 订阅 maps 更新：
     * 数据来源：MapService 内部 state 变化（通常由 WS GetMapList 返回）
     * 用途：刷新 mapList；若未选中地图则默认选第一个
     * 流向：setMapList + setSelectedMapId
     *
     * 注意（事实说明）：
     * - 此 effect 依赖数组是 []，闭包中的 selectedMapId 永远是初次渲染时的值。
     * - 因为逻辑是 `if (!selectedMapId && maps.length > 0)`，
     *   若初值为 undefined，第一次订阅回调会选中 maps[0].id。
     * - 后续 selectedMapId 变化后，这个回调仍看到旧值，但不会影响“已选中”状态，
     *   因为 setSelectedMapId 只有在旧值为 falsy 时才触发。
     */
    return mapService.subscribe((maps) => {
      setMapList(maps);
      if (!selectedMapId && maps.length > 0) {
        setSelectedMapId(maps[0].id);
      }
    });
  }, []);

  /* ===== 地图比例同步 ===== */
  useEffect(() => {
    // 初始读取
    setMeterToPixel(mapConfigService.getState().meterToPixel);

    // 订阅比例变化
    return mapConfigService.subscribe((s) => setMeterToPixel(s.meterToPixel));
  }, []);

  /* ===== 切换地图：selectedMapId -> mapSrc ===== */
  useEffect(() => {
    if (!selectedMapId) {
      setMapSrc("");
      return;
    }

    const map = mapList.find((m) => m.id === selectedMapId);
    if (!map) {
      setMapSrc("");
      return;
    }

    // 拼接图片 URL
    setMapSrc(HTTP_BASE + map.url);
  }, [selectedMapId, mapList]);

  /* ===== cover 模式 + 裁剪补偿 ===== */

  /**
   * computeCoverLayout：
   * - 在 objectFit: "cover" 模式下，图片会铺满容器，可能会超出容器并被裁剪。
   * - 这里手动复现 cover 的数学逻辑，计算 scale 与 cropX/cropY。
   *
   * 数据来源：
   * - img.naturalWidth/Height（原图像素）
   * - wrap.clientWidth/Height（容器像素）
   *
   * 输出：
   * - scale：缩放比例
   * - renderedW/H：缩放后图片尺寸
   * - cropX/Y：超出容器被裁剪的偏移补偿
   *
   * 流向：layout -> worldToScreen
   */
  const computeCoverLayout = () => {
    const img = mapImgRef.current;
    const wrap = mapWrapRef.current;
    if (!img || !wrap) return;

    const iw = img.naturalWidth;
    const ih = img.naturalHeight;
    const cw = wrap.clientWidth;
    const ch = wrap.clientHeight;
    if (!iw || !ih || !cw || !ch) return;

    const scale = Math.max(cw / iw, ch / ih); // cover：取较大缩放保证铺满
    const renderedW = iw * scale;
    const renderedH = ih * scale;

    // 居中裁剪：多出来的一半在左/上，也等量在右/下
    const cropX = (renderedW - cw) / 2;
    const cropY = (renderedH - ch) / 2;

    setLayout({ scale, cropX, cropY, renderedW, renderedH });
  };

  /**
   * resize 重新计算 cover 布局
   */
  useEffect(() => {
    const onResize = () => computeCoverLayout();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  /* ===== Anchor / Locate 同步 ===== */

  /**
   * anchors 同步：
   * 数据来源：BeaconPositionService.state.anchors
   * 用途：地图上渲染锚点
   */
  useEffect(() => {
    setAnchors(Object.values(beaconPositionService.getState().anchors));
    return beaconPositionService.subscribe((s) =>
      setAnchors(Object.values(s.anchors))
    );
  }, []);

  /**
   * locPoints 同步：
   * 数据来源：LocateResultService.state.results
   * 用途：地图上渲染定位结果
   *
   * 注意（事实说明）：
   * - 若 results 是一个对象映射（mac -> record），Object.values 会得到“每 mac 一条最新值”。
   * - 这与 RealtimeData 的 locate 表行为一致。
   */
  useEffect(() => {
    setLocPoints(Object.values(locateService.getState().results));
    return locateService.subscribe((s) =>
      setLocPoints(Object.values(s.results))
    );
  }, []);

  /* ===== 世界坐标(米) → 屏幕坐标(px) ===== */

  /**
   * worldToScreen：
   * - 输入：x/y（米坐标）
   * - 数据来源：
   *   - anchors 的 a.x/a.y
   *   - locatePoints 的 p.x/p.y
   * - 输出：px/py（容器像素坐标，用于绝对定位）
   *
   * 换算逻辑：
   * 1) 米 -> 原图像素：x * meterToPixel, y * meterToPixel
   * 2) 原图像素 -> 渲染像素：再乘 layout.scale
   * 3) cover 裁剪补偿：减去 cropX/cropY
   * 4) y 轴翻转：
   *    使用 layout.renderedH - y*... 表示世界坐标 y=0 在“图底部”
   *
   * 流向：锚点红点与定位蓝框的 left/top
   */
  const worldToScreen = (x: number, y: number) => {
    const px = x * meterToPixel * layout.scale - layout.cropX;
    const py =
      layout.renderedH - y * meterToPixel * layout.scale - layout.cropY;
    return { px, py };
  };

  /* ===== 渲染 ===== */
  return (
    <div style={{ padding: "0 16px 16px" }}>
      {/* 顶部控制条：标题 + 显示开关 + 地图选择 */}
      <Space align="center" size={12} style={{ marginBottom: 8 }}>
        <Title level={4} style={{ margin: 0 }}>
          画面三 · 定位显示
        </Title>

        {/* showMac 开关 */}
        <Button size="small" onClick={() => setShowMac((v) => !v)}>
          {showMac ? "隐藏 MAC" : "显示 MAC"}
        </Button>

        {/* 地图选择 */}
        <Select
          value={selectedMapId}
          onChange={setSelectedMapId}
          disabled={mapList.length === 0}
          placeholder="选择房间地图"
          style={{ width: 240 }}
        >
          {mapList.map((m) => (
            <Option key={m.id} value={m.id}>
              {m.name}
            </Option>
          ))}
        </Select>
      </Space>

      {/* 地图展示容器 */}
      <Card size="small" styles={{ body: { padding: 0 } }}>
        <div
          ref={mapWrapRef}
          style={{
            width: "100%",
            height: "calc(100vh - 220px)",
            minHeight: 500,
            position: "relative",
            overflow: "hidden",
            background: "#000",
          }}
        >
          {/* 地图图片（cover） */}
          {mapSrc && (
            <img
              ref={mapImgRef}
              src={mapSrc}
              onLoad={computeCoverLayout} // 图片加载后计算 scale/crop
              style={{
                width: "100%",
                height: "100%",
                objectFit: "cover",
                display: "block",
                pointerEvents: "none",
              }}
            />
          )}

          {/* ===== 锚点渲染（红色圆点）===== */}
          {anchors.map((a, i) => {
            const { px, py } = worldToScreen(a.x, a.y);
            return (
              <React.Fragment key={"anc_" + i}>
                <div
                  style={{
                    position: "absolute",
                    left: px,
                    top: py,
                    width: 14,
                    height: 14,
                    background: "red",
                    borderRadius: "50%",
                    transform: "translate(-50%, -50%)",
                    border: "2px solid #fff",
                  }}
                />
                {showMac && (
                  <div
                    style={{
                      position: "absolute",
                      left: px + 50,
                      top: py - 15,
                      fontSize: 12,
                      color: "#000",
                      background: "rgba(255,255,255,0.75)",
                      padding: "1px 4px",
                      borderRadius: 3,
                      whiteSpace: "nowrap",
                      transform: "translate(-50%, -50%)",
                    }}
                  >
                    {a.mac}
                  </div>
                )}
              </React.Fragment>
            );
          })}

          {/* ===== 定位预测（蓝色框）===== */}
          {locPoints.map((p, i) => {
            const { px, py } = worldToScreen(p.x, p.y);
            return (
              <React.Fragment key={"loc_" + i}>
                <div
                  style={{
                    position: "absolute",
                    left: px,
                    top: py,
                    width: PREDICT_BOX_WIDTH,
                    height: PREDICT_BOX_HEIGHT,
                    border: "2px solid #0050ff",
                    background: "rgba(0,80,255,0.25)",
                    transform: "translate(-50%, -50%)",
                  }}
                />
                {showMac && (
                  <div
                    style={{
                      position: "absolute",
                      left: px + PREDICT_BOX_WIDTH / 2 + 14,
                      top: py - PREDICT_BOX_HEIGHT / 2 - 10,
                      fontSize: 12,
                      color: "#000",
                      background: "rgba(255,255,255,0.75)",
                      padding: "1px 4px",
                      borderRadius: 3,
                      whiteSpace: "nowrap",
                      transform: "translate(-50%, -50%)",
                    }}
                  >
                    {p.mac}
                  </div>
                )}
              </React.Fragment>
            );
          })}
        </div>
      </Card>
    </div>
  );
};

export default LocationView;
