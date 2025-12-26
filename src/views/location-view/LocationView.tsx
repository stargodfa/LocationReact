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

const beaconPositionService =
    getServiceSync<IBeaconPositionService>(EService.IBeaconPositionService);
const locateService =
    getServiceSync<ILocateResultService>(EService.ILocateResultService);
const mapService =
    getServiceSync<IMapService>(EService.IMapService);
const mapConfigService =
    getServiceSync<IMapConfigService>(EService.IMapConfigService);

const HTTP_BASE = `http://${location.hostname}:8082`;

const PREDICT_BOX_WIDTH = 20;
const PREDICT_BOX_HEIGHT = 15;

const LocationView: React.FC = () => {
    /* ===== UI 状态 ===== */
    const [showMac, setShowMac] = useState(true);

    /* ===== 地图相关 ===== */
    const [mapList, setMapList] = useState<any[]>([]);
    const [selectedMapId, setSelectedMapId] = useState<string>();
    const [mapSrc, setMapSrc] = useState<string>("");

    /* ===== 比例 ===== */
    const [meterToPixel, setMeterToPixel] = useState<number>(300);

    /* ===== 数据 ===== */
    const [anchors, setAnchors] = useState<any[]>([]);
    const [locPoints, setLocPoints] = useState<any[]>([]);

    /* ===== DOM / 布局 ===== */
    const mapImgRef = useRef<HTMLImageElement>(null);
    const mapWrapRef = useRef<HTMLDivElement>(null);

    const [layout, setLayout] = useState({
        scale: 1,
        cropX: 0,
        cropY: 0,
        renderedW: 0,
        renderedH: 0,
    });

    /* ===== 地图列表 ===== */
    useEffect(() => {
        setMapList(mapService.getState().maps);
        return mapService.subscribe((maps) => {
            setMapList(maps);
            if (!selectedMapId && maps.length > 0) {
                setSelectedMapId(maps[0].id);
            }
        });
    }, []);

    /* ===== 地图比例 ===== */
    useEffect(() => {
        setMeterToPixel(mapConfigService.getState().meterToPixel);
        return mapConfigService.subscribe((s) =>
            setMeterToPixel(s.meterToPixel)
        );
    }, []);

    /* ===== 切换地图 ===== */
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
        setMapSrc(HTTP_BASE + map.url);
    }, [selectedMapId, mapList]);

    /* ===== cover 模式 + 裁剪补偿 ===== */
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

        const cropX = (renderedW - cw) / 2;
        const cropY = (renderedH - ch) / 2;

        setLayout({ scale, cropX, cropY, renderedW, renderedH });
    };

    useEffect(() => {
        const onResize = () => computeCoverLayout();
        window.addEventListener("resize", onResize);
        return () => window.removeEventListener("resize", onResize);
    }, []);

    /* ===== Anchor / Locate 同步 ===== */
    useEffect(() => {
        setAnchors(Object.values(beaconPositionService.getState().anchors));
        return beaconPositionService.subscribe((s) =>
            setAnchors(Object.values(s.anchors))
        );
    }, []);

    useEffect(() => {
        setLocPoints(Object.values(locateService.getState().results));
        return locateService.subscribe((s) =>
            setLocPoints(Object.values(s.results))
        );
    }, []);

    /* ===== 世界坐标 → 屏幕坐标 ===== */
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
                            style={{
                                width: "100%",
                                height: "100%",
                                objectFit: "cover",
                                display: "block",
                                pointerEvents: "none",
                            }}
                        />
                    )}

                    {/* ===== 锚点 ===== */}
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
                                            background:
                                                "rgba(255,255,255,0.75)",
                                            padding: "1px 4px",
                                            borderRadius: 3,
                                            whiteSpace: "nowrap",
                                            transform:
                                                "translate(-50%, -50%)",
                                        }}
                                    >
                                        {a.mac}
                                    </div>
                                )}
                            </React.Fragment>
                        );
                    })}

                    {/* ===== 定位预测 ===== */}
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
                                        background:
                                            "rgba(0,80,255,0.25)",
                                        transform:
                                            "translate(-50%, -50%)",
                                    }}
                                />
                                {showMac && (
                                    <div
                                        style={{
                                            position: "absolute",
                                            left:
                                                px +
                                                PREDICT_BOX_WIDTH / 2 +
                                                14,
                                            top:
                                                py -
                                                PREDICT_BOX_HEIGHT / 2 -
                                                10,
                                            fontSize: 12,
                                            color: "#000",
                                            background:
                                                "rgba(255,255,255,0.75)",
                                            padding: "1px 4px",
                                            borderRadius: 3,
                                            whiteSpace: "nowrap",
                                            transform:
                                                "translate(-50%, -50%)",
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
