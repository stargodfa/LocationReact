import React, { useState, useEffect, useRef } from "react";
import {
    Card,
    Row,
    Col,
    Space,
    Typography,
    Button,
    Upload,
    Select,
    Input,
} from "antd";
import { UploadOutlined } from "@ant-design/icons";

import { getServiceSync } from "@spring4js/container-browser";
import IBluetoothDataService, { IData } from "../../service-api/IBluetoothDataService";
import IBeaconPositionService from "../../service-api/IBeaconPositionService";
import IWebSocketService from "../../service-api/IWebSocketService";
import EService from "../../service-config/EService";

const bluetoothDataService =
    getServiceSync<IBluetoothDataService>(EService.IBluetoothDataService);

const beaconPositionService =
    getServiceSync<IBeaconPositionService>(EService.IBeaconPositionService);

const wsService =
    getServiceSync<IWebSocketService>(EService.IWebSocketService);

const { Title, Text } = Typography;
const { Option } = Select;

const METER_TO_PIXEL = 20; // 像素与米的转换比例

// 默认平面图路径
const DEFAULT_MAP_SRC = "public/maps/2401-02.png";

interface AnchorItem {
    mac: string;
    x: number;
    y: number;
}

const MapsManager: React.FC = () => {
    const [selectedMac, setSelectedMac] = useState<string>("");
    const [x, setX] = useState<string>("");
    const [y, setY] = useState<string>("");
    const [anchorList, setAnchorList] = useState<AnchorItem[]>([]);
    const [beaconMacList, setBeaconMacList] = useState<string[]>([]);
    const [mapSrc, setMapSrc] = useState<string>(DEFAULT_MAP_SRC);
    const [mapFileName, setMapFileName] = useState<string>("floor-2D.png");

    // === 图片缩放 / 偏移 ===
    const imgRef = useRef<HTMLImageElement>(null);
    const wrapRef = useRef<HTMLDivElement>(null);

    const [scale, setScale] = useState({ sx: 1, sy: 1 });
    const [offset, setOffset] = useState({ left: 0, top: 0 });
    const [renderSize, setRenderSize] = useState({ width: 0, height: 0 });

    /** 计算图片在容器中的渲染大小与偏移（与画面三一致） */
    const computeImageLayout = () => {
        const img = imgRef.current;
        const wrap = wrapRef.current;
        if (!img || !wrap) return;

        const naturalW = img.naturalWidth;
        const naturalH = img.naturalHeight;
        if (!naturalW || !naturalH) return;

        const wrapW = wrap.clientWidth;
        const wrapH = wrap.clientHeight;
        if (!wrapW || !wrapH) return;

        const imgRatio = naturalW / naturalH;
        const wrapRatio = wrapW / wrapH;

        let renderedW = wrapW;
        let renderedH = wrapH;

        if (imgRatio > wrapRatio) {
            // 图片更“扁”，宽度撑满，高度按比例
            renderedW = wrapW;
            renderedH = renderedW / imgRatio;
        } else {
            // 图片更“高”，高度撑满，宽度按比例
            renderedH = wrapH;
            renderedW = renderedH * imgRatio;
        }

        const leftOffset = (wrapW - renderedW) / 2;
        const topOffset = (wrapH - renderedH) / 2;

        setScale({
            sx: renderedW / naturalW,
            sy: renderedH / naturalH,
        });

        setOffset({
            left: leftOffset,
            top: topOffset,
        });

        setRenderSize({
            width: renderedW,
            height: renderedH,
        });
    };

    /** 图片加载完成后计算缩放并拉取锚点 */
    const handleMapLoaded = () => {
        computeImageLayout();
        // 后续需要优化：仅拉取当前地图相关的锚点，且需要检测服务器已经连接上再发请求
        wsService.send({
            cmd: "GetBeaconPositions",
        });
    };

    // 窗口尺寸变化时重算布局
    useEffect(() => {
        window.addEventListener("resize", computeImageLayout);
        return () => window.removeEventListener("resize", computeImageLayout);
    }, []);

    /* ----------------- 加载服务器下发的锚点配置 ----------------- */
    useEffect(() => {
        setAnchorList(Object.values(beaconPositionService.getState().anchors));

        const unsub = beaconPositionService.subscribe((state) => {
            const arr = Object.values(state.anchors);
            setAnchorList(arr);
        });
        return unsub;
    }, []);

    /* ----------------- BLE 实时 MAC 稳定列表 ----------------- */
    useEffect(() => {
        const beaconCache = new Map<string, number>(); // mac -> lastSeen
        const TIMEOUT = 30000;
        const INTERVAL = 1000;

        const feedFromState = (state: IData) => {
            const now = Date.now();
            for (const row of state.realTimeDataList) {
                let raw: any = {};
                try {
                    raw = JSON.parse(row.raw || "{}");
                } catch {
                    // ignore
                }
                if (raw?.type === "beacon") {
                    const mac = raw.mac || raw.target_mac;
                    if (mac) beaconCache.set(mac, now);
                }
            }
        };

        // 初始化一次
        feedFromState(bluetoothDataService.getState());

        const unsubscribe = bluetoothDataService.subscribe((state: IData) => {
            feedFromState(state);
        });

        const rebuildList = () => {
            const now = Date.now();
            const next: string[] = [];
            for (const [mac, lastSeen] of beaconCache.entries()) {
                if (now - lastSeen <= TIMEOUT) next.push(mac);
                else beaconCache.delete(mac);
            }
            setBeaconMacList(next);
        };

        rebuildList();
        const timer = window.setInterval(rebuildList, INTERVAL);

        return () => {
            unsubscribe();
            window.clearInterval(timer);
        };
    }, []);

    /* ----------------- 设置单个坐标 ----------------- */
    const handleSendCoord = () => {
        if (!selectedMac || !x || !y) return;

        const nx = Number(x);
        const ny = Number(y);
        if (Number.isNaN(nx) || Number.isNaN(ny)) return;

        beaconPositionService.setCoord(selectedMac, nx, ny);
    };

    /* ----------------- 清除当前 ----------------- */
    const handleClearCurrent = () => {
        if (!selectedMac) return;
        beaconPositionService.clearCoord(selectedMac);
    };

    /* ----------------- 清除所有 ----------------- */
    const handleClearAll = () => {
        beaconPositionService.clearAll();
    };

    /* ----------------- 导入默认描点 ----------------- */
    const handleImportDefaultAnchors = () => {
        beaconPositionService.setDefaultCoords();
    };

    /* 标定记录锚点 */
    const handleUseRecordAnchors = () => {
        beaconPositionService.getAllCoords();
    };

    /* ----------------- 地图上传 ----------------- */
    const uploadProps = {
        beforeUpload: (file: File) => {
            const localUrl = URL.createObjectURL(file);
            setMapSrc(localUrl);
            setMapFileName(file.name);
            return false;
        },
        accept: "image/png,image/jpeg",
        showUploadList: false,
    };

    const handleUseDefault = () => {
        setMapSrc(DEFAULT_MAP_SRC);
        setMapFileName("floor-2D.png");
    };

    /* -------------------渲染------------------------------- */
    return (
        <div style={{ padding: "0 16px 16px" }}>
            <Space 
                orientation="vertical" 
                size={6} 
                style={{ marginBottom: 16 }}
                >
                <Space align="center">
                    <Title level={4} style={{ margin: 0 }}>
                    画面二 · 地图导入与配置
                    </Title>
                    <Text type="secondary">
                        导入地图、设置 Beacon 坐标，并在右侧平面图上完成布局。
                    </Text>
                </Space>
            </Space>

            <Row gutter={16}>
                {/* 左侧配置区域 */}
                <Col xs={24} md={6}>
                    <Card title="地图源文件导入" size="small" style={{ marginBottom: 16 }}>
                        <Space orientation="vertical" style={{ width: "100%" }}>
                            <Space>
                                <Text>当前平面图文件:</Text>
                                <Text strong>{mapFileName}</Text>
                            </Space>

                            <Upload {...uploadProps}>
                                <Button icon={<UploadOutlined />}>选择本地 PNG</Button>
                            </Upload>

                            <Button block onClick={handleUseDefault}>
                                使用默认平面图
                            </Button>

                            <Text type="secondary" style={{ fontSize: 12 }}>
                                默认示例：{DEFAULT_MAP_SRC}
                            </Text>
                        </Space>
                    </Card>

                    {/* Beacon 坐标设定 */}
                    <Card title="Beacon 坐标设定" size="small">
                        <Space orientation="vertical" style={{ width: "100%" }}>
                            <Text strong>选择 Beacon MAC：</Text>

                            <Select
                                value={selectedMac || undefined}
                                onChange={setSelectedMac}
                                disabled={beaconMacList.length === 0}
                                placeholder={
                                    beaconMacList.length === 0
                                        ? "暂无检测到的信标"
                                        : "请选择"
                                }
                                style={{ width: "100%" }}
                            >
                                {beaconMacList.map((mac) => (
                                    <Option key={mac} value={mac}>
                                        {mac}
                                    </Option>
                                ))}
                            </Select>

                            <Text strong>X 坐标 (m):</Text>
                            <Input
                                value={x}
                                onChange={(e) => setX(e.target.value)}
                                placeholder="例如 3.6"
                            />

                            <Text strong>Y 坐标 (m):</Text>
                            <Input
                                value={y}
                                onChange={(e) => setY(e.target.value)}
                                placeholder="例如 4.5"
                            />

                            <Space>
                                <Button type="primary" onClick={handleSendCoord}>
                                    设置坐标
                                </Button>
                                <Button onClick={handleClearCurrent}>
                                    清除当前
                                </Button>
                            </Space>

                            <Text strong>已设置坐标：</Text>
                            <div
                                style={{
                                    background: "#f8f8f8",
                                    padding: 8,
                                    borderRadius: 4,
                                    height: 150,
                                    overflowY: "auto",
                                    fontFamily: "monospace",
                                }}
                            >
                                {anchorList.length === 0 ? (
                                    <Text type="secondary">暂无坐标。</Text>
                                ) : (
                                    anchorList.map((a, idx) => (
                                        <div 
                                            key={idx}
                                            style={{
                                                whiteSpace: "nowrap",  // 关键：一行显示，不自动换行
                                            }}
                                        >
                                            {a.mac} → x={a.x} m，y={a.y} m
                                        </div>
                                    ))
                                )}
                            </div>
                        </Space>
                    </Card>
                </Col>

                {/* 右侧地图区域 */}
                <Col xs={24} md={18}>
                    <Card
                        size="small"
                        title="锚点布局"
                        styles={{ body: { padding: 8 } }}
                        extra={
                            <Space wrap>
                                <Button>检测最佳布局</Button>
                                <Button onClick={handleImportDefaultAnchors}>
                                    导入默认描点
                                </Button>
                                <Button onClick={handleUseRecordAnchors}>
                                    标定记录锚点
                                </Button>
                                <Button danger onClick={handleClearAll}>
                                    清除所有锚标
                                </Button>
                            </Space>
                        }
                    >
                        <div
                            ref={wrapRef}
                            style={{
                                width: "100%",
                                height: "calc(100vh - 220px)",
                                minHeight: 400,
                                border: "1px solid #ddd",
                                overflow: "hidden",
                                position: "relative",
                                background: "#fff",
                            }}
                        >
                            {mapSrc ? (
                                <>
                                    <img
                                        ref={imgRef}
                                        src={mapSrc}
                                        alt="map"
                                        onLoad={handleMapLoaded}
                                        style={{
                                            width: "100%",
                                            height: "100%",
                                            objectFit: "contain",
                                            display: "block",
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
                                            <React.Fragment key={idx}>
                                                {/* 红点 */}
                                                <div
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

                                                {/* MAC 文本 */}
                                                <div
                                                    style={{
                                                        position: "absolute",
                                                        left: px + 50,     // 文本放在点的右侧
                                                        top: py - 20,      // 稍微上移
                                                        color: "blue",
                                                        fontSize: 12,
                                                        background: "rgba(255,255,255,0.7)",
                                                        padding: "1px 3px",
                                                        borderRadius: 3,
                                                        pointerEvents: "none",
                                                        whiteSpace: "nowrap",
                                                        transform: "translate(-50%, -50%)",
                                                    }}
                                                >
                                                    {a.mac}
                                                </div>
                                            </React.Fragment>
                                        );
                                    })}

                                </>
                            ) : (
                                <Text type="secondary">尚未加载平面图</Text>
                            )}
                        </div>
                    </Card>
                </Col>
            </Row>
        </div>
    );
};

export default MapsManager;
