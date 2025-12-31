import React, { useState, useEffect, useRef } from "react";
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

/* ===== 本画面 UI 持久化 key ===== */
const UI_KEY = "ui.locationView.mapId";

const LocationView: React.FC = () => {
  const [showMac, setShowMac] = useState(true);

  const [mapList, setMapList] = useState<any[]>([]);
  const [selectedMapId, setSelectedMapId] = useState<string | undefined>(() => {
    return localStorage.getItem(UI_KEY) || undefined;
  });
  const [mapSrc, setMapSrc] = useState("");

  const [meterToPixel, setMeterToPixel] = useState(300);
  const [anchors, setAnchors] = useState<any[]>([]);
  const [locPoints, setLocPoints] = useState<any[]>([]);

  const mapImgRef = useRef<HTMLImageElement>(null);
  const mapWrapRef = useRef<HTMLDivElement>(null);

  const [layout, setLayout] = useState({
    scale: 1,
    cropX: 0,
    cropY: 0,
    renderedW: 0,
    renderedH: 0,
  });

  /* ===== Map list ===== */
  useEffect(() => {
    setMapList(mapService.getState().maps);

    return mapService.subscribe((maps) => {
      setMapList(maps);

      if (!selectedMapId && maps.length > 0) {
        setSelectedMapId(maps[0].id);
      }
    });
  }, []);

  /* ===== selectedMapId → localStorage ===== */
  useEffect(() => {
    if (selectedMapId) {
      localStorage.setItem(UI_KEY, selectedMapId);
    }
  }, [selectedMapId]);

  /* ===== 切换地图 ===== */
  useEffect(() => {
    if (!selectedMapId) {
      setMapSrc("");
      return;
    }

    beaconPositionService.setCurrentMap(selectedMapId);
    mapConfigService.setCurrentMap(selectedMapId);
    mapConfigService.syncCurrentMapScale(); // ★ 同样加

    const map = mapList.find((m) => m.id === selectedMapId);
    if (!map) {
      setMapSrc("");
      return;
    }

    setMapSrc(HTTP_BASE + map.url);
  }, [selectedMapId, mapList]);

  /* ===== 比例 ===== */
  useEffect(() => {
    const sync = () => {
      const s = mapConfigService.getState();
      const v = s.meterToPixelByMap?.[selectedMapId!];
      if (typeof v === "number") setMeterToPixel(v);
    };

    if (selectedMapId) sync();
    return mapConfigService.subscribe(sync);
  }, [selectedMapId]);

  /* ===== anchors ===== */
  useEffect(() => {
    const sync = () => {
      const s = beaconPositionService.getState();
      setAnchors(
        Object.values(s.anchorsByMap?.[selectedMapId!] || {})
      );
    };

    if (selectedMapId) sync();
    return beaconPositionService.subscribe(sync);
  }, [selectedMapId]);

  /* ===== 定位结果 ===== */
  useEffect(() => {
    const sync = () => {
      const s = locateService.getState();
      setLocPoints(
        Object.values(s.resultsByMap?.[selectedMapId!] || {})
      );
    };

    if (selectedMapId) sync();
    return locateService.subscribe(sync);
  }, [selectedMapId]);

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

        <Select
          value={selectedMapId}
          onChange={setSelectedMapId}
          style={{ width: 240 }}
        >
          {mapList.map((m) => (
            <Option key={m.id} value={m.id}>
              {m.name}
            </Option>
          ))}
        </Select>
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
              <div
                key={i}
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
            );
          })}

          {locPoints.map((p, i) => {
            const { px, py } = worldToScreen(p.x, p.y);
            return (
              <div
                key={i}
                style={{
                  position: "absolute",
                  left: px,
                  top: py,
                  width: PREDICT_BOX_WIDTH,
                  height: PREDICT_BOX_HEIGHT,
                  border: "2px solid #0050ff",
                  transform: "translate(-50%, -50%)",
                }}
              />
            );
          })}
        </div>
      </Card>
    </div>
  );
};

export default LocationView;
