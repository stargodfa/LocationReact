/**
 * src/views/location-view/LocationView.tsx
 */

import React, { useState, useEffect, useRef, useMemo } from "react";
import { Card, Space, Typography, Select, Button } from "antd";

import { getServiceSync } from "@spring4js/container-browser";
import IBeaconPositionService from "../../service-api/IBeaconPositionService";
import ILocateResultService from "../../service-api/ILocateResultService";
import IMapService from "../../service-api/IMapService";
import IMapConfigService from "../../service-api/IMapConfigService";
import EService from "../../service-config/EService";

const { Title } = Typography;
const { Option } = Select;

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

const HTTP_BASE = `http://${location.hostname}:8082`;

const PREDICT_BOX_WIDTH = 20;
const PREDICT_BOX_HEIGHT = 15;

const UI_KEY = "ui.locationView.mapId";

const LocationView: React.FC = () => {
  const [showMac, setShowMac] = useState(true);

  /* ===== 地图 ===== */
  const [mapList, setMapList] = useState<any[]>([]);
  const [selectedMapId, setSelectedMapId] = useState<string | undefined>(() => {
    return localStorage.getItem(UI_KEY) || undefined;
  });
  const [mapSrc, setMapSrc] = useState("");

  /* ===== 比例 ===== */
  const [meterToPixel, setMeterToPixel] = useState(300);

  /* ===== 数据 ===== */
  const [anchors, setAnchors] = useState<any[]>([]);
  const [locPoints, setLocPoints] = useState<any[]>([]);

  /* ===== 目标搜索 ===== */
  const [selectedTargetMac, setSelectedTargetMac] = useState<string>();

  const mapImgRef = useRef<HTMLImageElement>(null);
  const mapWrapRef = useRef<HTMLDivElement>(null);

  const [layout, setLayout] = useState({
    scale: 1,
    cropX: 0,
    cropY: 0,
    renderedW: 0,
    renderedH: 0,
  });

  /* ================= Map list ================= */
  useEffect(() => {
    setMapList(mapService.getState().maps);
    return mapService.subscribe((maps) => {
      setMapList(maps);
      if (!selectedMapId && maps.length > 0) {
        setSelectedMapId(maps[0].id);
      }
    });
  }, []);

  /* ================= 记忆当前地图 ================= */
  useEffect(() => {
    if (selectedMapId) {
      localStorage.setItem(UI_KEY, selectedMapId);
    }
  }, [selectedMapId]);

  /* ================= 切换地图（手动） ================= */
  useEffect(() => {
    if (!selectedMapId) {
      setMapSrc("");
      return;
    }

    beaconPositionService.setCurrentMap(selectedMapId);
    mapConfigService.setCurrentMap(selectedMapId);

    const map = mapList.find((m) => m.id === selectedMapId);
    if (!map) {
      setMapSrc("");
      return;
    }

    setMapSrc(HTTP_BASE + map.url);
  }, [selectedMapId, mapList]);

  /* ================= 比例同步 ================= */
  useEffect(() => {
    const sync = () => {
      const s = mapConfigService.getState();
      const v = s.meterToPixelByMap?.[selectedMapId!];
      if (typeof v === "number") setMeterToPixel(v);
    };

    if (selectedMapId) sync();
    return mapConfigService.subscribe(sync);
  }, [selectedMapId]);

  /* ================= anchors ================= */
  useEffect(() => {
    const sync = () => {
      const s = beaconPositionService.getState();
      setAnchors(Object.values(s.anchorsByMap?.[selectedMapId!] || {}));
    };
    if (selectedMapId) sync();
    return beaconPositionService.subscribe(sync);
  }, [selectedMapId]);

  /* ================= 定位结果 ================= */
  useEffect(() => {
    const sync = () => {
      const s = locateService.getState();
      setLocPoints(Object.values(s.resultsByMap?.[selectedMapId!] || {}));
    };
    if (selectedMapId) sync();
    return locateService.subscribe(sync);
  }, [selectedMapId]);

  /* ================= 目标 MAC 列表（实时） ================= */
  const targetMacList = useMemo(() => {
    const all = locateService.getState().resultsByMap || {};
    const macSet = new Set<string>();
    Object.values(all).forEach((m: any) =>
      Object.keys(m || {}).forEach((mac) => macSet.add(mac))
    );
    return Array.from(macSet);
  }, [locPoints]);

  /* ================= 搜索目标并跳转地图 ================= */
  const handleSearchTarget = () => {
    if (!selectedTargetMac) return;

    const all = locateService.getState().resultsByMap || {};
    for (const mapId of Object.keys(all)) {
      if (all[mapId]?.[selectedTargetMac]) {
        setSelectedMapId(mapId);
        return;
      }
    }
  };

  /* ================= 布局计算 ================= */
  const computeCoverLayout = () => {
    const img = mapImgRef.current;
    const wrap = mapWrapRef.current;
    if (!img || !wrap) return;

    const iw = img.naturalWidth;
    const ih = img.naturalHeight;
    const cw = wrap.clientWidth;
    const ch = wrap.clientHeight;
    if (!iw || !ih || !cw || !ch) return;

    const scale = Math.max(cw / iw, ch / ih);
    const renderedW = iw * scale;
    const renderedH = ih * scale;

    setLayout({
      scale,
      renderedW,
      renderedH,
      cropX: (renderedW - cw) / 2,
      cropY: (renderedH - ch) / 2,
    });
  };

  useEffect(() => {
    const onResize = () => computeCoverLayout();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const worldToScreen = (x: number, y: number) => {
    const px = x * meterToPixel * layout.scale - layout.cropX;
    const py =
      layout.renderedH -
      y * meterToPixel * layout.scale -
      layout.cropY;
    return { px, py };
  };

  return (
    <div style={{ padding: "0 16px 16px" }}>
      <Space align="center" size={12} style={{ marginBottom: 8 }}>
        <Title level={4} style={{ margin: 0 }}>
          画面三 · 定位显示
        </Title>

        <Button size="small" onClick={() => setShowMac((v) => !v)}>
          {showMac ? "隐藏 MAC" : "显示 MAC"}
        </Button>

        {/* 地图选择 */}
        <Select
          value={selectedMapId}
          onChange={setSelectedMapId}
          style={{ width: 220 }}
        >
          {mapList.map((m) => (
            <Option key={m.id} value={m.id}>
              {m.name}
            </Option>
          ))}
        </Select>

        {/* 目标选择 + 搜索 */}
        <Select
          value={selectedTargetMac}
          onChange={setSelectedTargetMac}
          placeholder="选择目标 MAC"
          allowClear
          style={{ width: 220 }}
        >
          {targetMacList.map((mac) => (
            <Option key={mac} value={mac}>
              {mac}
            </Option>
          ))}
        </Select>

        <Button type="primary" onClick={handleSearchTarget}>
          搜索
        </Button>
      </Space>

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
          {mapSrc && (
            <img
              ref={mapImgRef}
              src={mapSrc}
              onLoad={computeCoverLayout}
              style={{ width: "100%", height: "100%", objectFit: "cover" }}
            />
          )}

          {anchors.map((a, i) => {
            const { px, py } = worldToScreen(a.x, a.y);
            return (
              <React.Fragment key={i}>
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
                  }}
                />
                {showMac && (
                  <div
                    style={{
                      position: "absolute",
                      left: px + 50,
                      top: py - 15,
                      fontSize: 12,
                      background: "rgba(255,255,255,0.75)",
                      padding: "1px 4px",
                      borderRadius: 3,
                    }}
                  >
                    {a.mac}
                  </div>
                )}
              </React.Fragment>
            );
          })}

          {locPoints.map((p, i) => {
            const { px, py } = worldToScreen(p.x, p.y);
            return (
              <React.Fragment key={i}>
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
                      left: px + 24,
                      top: py - 16,
                      fontSize: 12,
                      background: "rgba(255,255,255,0.75)",
                      padding: "1px 4px",
                      borderRadius: 3,
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
