import React, { useState, useEffect, useRef } from "react";
import {
    Card,
    Row,
    Col,
    Space,
    Typography,
    Button,
    Select,
    Input,
} from "antd";

import { getServiceSync } from "@spring4js/container-browser";
import IBluetoothDataService, { IData } from "../../service-api/IBluetoothDataService";
import IBeaconPositionService from "../../service-api/IBeaconPositionService";
import IMapService from "../../service-api/IMapService";
import EService from "../../service-config/EService";

const bluetoothDataService =
    getServiceSync<IBluetoothDataService>(EService.IBluetoothDataService);
const beaconPositionService =
    getServiceSync<IBeaconPositionService>(EService.IBeaconPositionService);
const mapService =
    getServiceSync<IMapService>(EService.IMapService);

const { Title, Text } = Typography;
const { Option } = Select;

const HTTP_BASE = `http://${location.hostname}:8082`;
const METER_TO_PIXEL = 20;

/* ================= 类型 ================= */

interface AnchorItem {
    mac: string;
    x: number;
    y: number;
}

interface MapItem {
    id: string;
    name: string;
    file: string;
    url: string;
}

/* ================= 组件 ================= */

const MapsManager: React.FC = () => {
    /* -------- 地图 -------- */
    const [mapList, setMapList] = useState<MapItem[]>([]);
    const [selectedMapId, setSelectedMapId] = useState<string>();
    const [mapSrc, setMapSrc] = useState<string>("");

    /* -------- Beacon -------- */
    const [selectedMac, setSelectedMac] = useState("");
    const [x, setX] = useState("");
    const [y, setY] = useState("");
    const [anchorList, setAnchorList] = useState<AnchorItem[]>([]);
    const [beaconMacList, setBeaconMacList] = useState<string[]>([]);

    /* -------- 地图渲染 -------- */
    const imgRef = useRef<HTMLImageElement>(null);
    const wrapRef = useRef<HTMLDivElement>(null);

    const [scale, setScale] = useState({ sx: 1, sy: 1 });
    const [offset, setOffset] = useState({ left: 0, top: 0 });
    const [renderSize, setRenderSize] = useState({ width: 0, height: 0 });

    /* =====================================================
       地图列表：只从 MapService 订阅（不发 WS、不 mock）
       ===================================================== */
    useEffect(() => {
        // 立即取一次已有缓存（App.tsx 可能已拉到）
        setMapList(mapService.getState().maps);

        const unsub = mapService.subscribe((maps) => {
            setMapList(maps);
            if (!selectedMapId && maps.length > 0) {
                setSelectedMapId(maps[0].id);
            }
        });

        return unsub;
    }, []);

    /* =====================================================
       选中地图 → 切换图片（纯前端行为）
       ===================================================== */
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

    /* =====================================================
       图片加载 / 窗口变化：只负责布局计算
       ===================================================== */
    const computeImageLayout = () => {
        const img = imgRef.current;
        const wrap = wrapRef.current;
        if (!img || !wrap) return;

        const iw = img.naturalWidth;
        const ih = img.naturalHeight;
        const cw = wrap.clientWidth;
        const ch = wrap.clientHeight;
        if (!iw || !ih || !cw || !ch) return;

        const imgRatio = iw / ih;
        const wrapRatio = cw / ch;

        let rw = cw;
        let rh = ch;
        if (imgRatio > wrapRatio) {
            rh = rw / imgRatio;
        } else {
            rw = rh * imgRatio;
        }

        setScale({ sx: rw / iw, sy: rh / ih });
        setOffset({ left: (cw - rw) / 2, top: (ch - rh) / 2 });
        setRenderSize({ width: rw, height: rh });
    };

    useEffect(() => {
        window.addEventListener("resize", computeImageLayout);
        return () => window.removeEventListener("resize", computeImageLayout);
    }, []);

    /* =====================================================
       Anchor 同步（原逻辑不动）
       ===================================================== */
    useEffect(() => {
        setAnchorList(Object.values(beaconPositionService.getState().anchors));
        return beaconPositionService.subscribe((s) =>
            setAnchorList(Object.values(s.anchors))
        );
    }, []);

    /* =====================================================
       BLE MAC 列表（原逻辑不动）
       ===================================================== */
    useEffect(() => {
        const cache = new Map<string, number>();
        const TIMEOUT = 30000;

        const feed = (state: IData) => {
            const now = Date.now();
            for (const row of state.realTimeDataList) {
                try {
                    const raw = JSON.parse(row.raw || "{}");
                    if (raw?.type === "beacon" && raw.mac) {
                        cache.set(raw.mac, now);
                    }
                } catch {}
            }
        };

        feed(bluetoothDataService.getState());
        const unsub = bluetoothDataService.subscribe(feed);

        const timer = setInterval(() => {
            const now = Date.now();
            setBeaconMacList(
                [...cache.entries()]
                    .filter(([, t]) => now - t < TIMEOUT)
                    .map(([m]) => m)
            );
        }, 1000);

        return () => {
            unsub();
            clearInterval(timer);
        };
    }, []);

    /* =====================================================
       坐标操作（原逻辑不动）
       ===================================================== */
    const handleSendCoord = () => {
        const nx = Number(x);
        const ny = Number(y);
        if (!selectedMac || Number.isNaN(nx) || Number.isNaN(ny)) return;
        beaconPositionService.setCoord(selectedMac, nx, ny);
    };

    const handleClearCurrent = () => {
        if (selectedMac) beaconPositionService.clearCoord(selectedMac);
    };

    const handleClearAll = () => {
        beaconPositionService.clearAll();
    };

    /* ================= 渲染 ================= */
    return (
        <div style={{ padding: "0 16px 16px" }}>
            <Title level={4}>画面二 · 地图管理</Title>

            <Row gutter={16}>
                {/* 左侧 */}
                <Col xs={24} md={8} lg={7} xl={6}>
                    <Card title="房间地图选择" size="small" style={{ marginBottom: 16 }}>
                        <Select
                            value={selectedMapId}
                            onChange={setSelectedMapId}
                            disabled={mapList.length === 0}
                            placeholder={
                                mapList.length === 0
                                    ? "服务器暂无地图"
                                    : "请选择地图"
                            }
                            style={{ width: "100%", minWidth: 220 }}
                            dropdownMatchSelectWidth={false}
                        >
                            {mapList.map((m) => (
                                <Option key={m.id} value={m.id}>
                                    {m.name}
                                </Option>
                            ))}
                        </Select>
                    </Card>

                    <Card title="Beacon 坐标设定" size="small">
                        <Space direction="vertical" style={{ width: "100%" }}>
                            <Select
                                value={selectedMac || undefined}
                                onChange={setSelectedMac}
                                placeholder="选择 Beacon"
                                disabled={beaconMacList.length === 0}
                            >
                                {beaconMacList.map((mac) => (
                                    <Option key={mac} value={mac}>
                                        {mac}
                                    </Option>
                                ))}
                            </Select>

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

                            <Space>
                                <Button type="primary" onClick={handleSendCoord}>
                                    设置
                                </Button>
                                <Button onClick={handleClearCurrent}>
                                    清除
                                </Button>
                            </Space>

                            <Button danger onClick={handleClearAll}>
                                清除所有锚点
                            </Button>
                        </Space>
                    </Card>
                </Col>

                {/* 右侧地图 */}
                <Col xs={24} md={16} lg={17} xl={18}>
                    <Card title="地图预览" size="small">
                        <div
                            ref={wrapRef}
                            style={{
                                width: "100%",
                                height: "calc(100vh - 220px)",
                                minHeight: 400,
                                position: "relative",
                                overflow: "hidden",
                                border: "1px solid #ddd",
                                background: "#fff",
                            }}
                        >
                            {mapSrc ? (
                                <>
                                    <img
                                        ref={imgRef}
                                        src={mapSrc}
                                        onLoad={computeImageLayout}
                                        style={{
                                            width: "100%",
                                            height: "100%",
                                            objectFit: "contain",
                                            pointerEvents: "none",
                                        }}
                                    />

                                    {anchorList.map((a, idx) => {
                                        const px =
                                            offset.left + a.x * scale.sx * METER_TO_PIXEL;
                                        const py =
                                            offset.top +
                                            renderSize.height -
                                            a.y * scale.sy * METER_TO_PIXEL;

                                        return (
                                            <div
                                                key={idx}
                                                style={{
                                                    position: "absolute",
                                                    left: px,
                                                    top: py,
                                                    width: 10,
                                                    height: 10,
                                                    background: "red",
                                                    borderRadius: "50%",
                                                    transform: "translate(-50%, -50%)",
                                                }}
                                            />
                                        );
                                    })}
                                </>
                            ) : (
                                <Text type="secondary">尚未选择地图</Text>
                            )}
                        </div>
                    </Card>
                </Col>
            </Row>
        </div>
    );
};

export default MapsManager;
