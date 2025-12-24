import React, { useState, useEffect, useRef } from "react";
import { Card, Row, Col, Space, Typography, Select, Button } from "antd";

import { getServiceSync } from "@spring4js/container-browser";
import IBeaconPositionService from "../../service-api/IBeaconPositionService";
import ILocateResultService from "../../service-api/ILocateResultService";
import IWebSocketService from "../../service-api/IWebSocketService";
import EService from "../../service-config/EService";

const { Title, Text } = Typography;
const { Option } = Select;

const METER_TO_PIXEL = 20; // 1 米 = 20 像素（根据实际地图比例调整）

const DEFAULT_2D_MAP = "public/maps/2401-02.png";
const DEFAULT_3D_MAP = "public/maps/2401-02.png";

// 右侧预测定位点矩形尺寸（像素），需要调整时只改这两个常量
const PREDICT_BOX_WIDTH = 20;
const PREDICT_BOX_HEIGHT = 15;

const beaconPositionService =
    getServiceSync<IBeaconPositionService>(EService.IBeaconPositionService);

const locateService =
    getServiceSync<ILocateResultService>(EService.ILocateResultService);

const wsService =
    getServiceSync<IWebSocketService>(EService.IWebSocketService);

const LocationView: React.FC = () => {
    const [roomFilter, setRoomFilter] = useState("all");
    const [deskFilter, setDeskFilter] = useState("all");

    const [anchors, setAnchors] = useState<any[]>([]);
    const [locPoints, setLocPoints] = useState<any[]>([]);

    // 左侧 2D 图
    const mapImgRef = useRef<HTMLImageElement>(null);
    const mapWrapRef = useRef<HTMLDivElement>(null);
    const [scale, setScale] = useState({ sx: 1, sy: 1 });
    const [offset, setOffset] = useState({ left: 0, top: 0 });
    const [renderSize, setRenderSize] = useState({ width: 0, height: 0 });

    // 右侧 3D 图
    const map3DImgRef = useRef<HTMLImageElement>(null);
    const map3DWrapRef = useRef<HTMLDivElement>(null);
    const [scale3D, setScale3D] = useState({ sx: 1, sy: 1 });
    const [offset3D, setOffset3D] = useState({ left: 0, top: 0 });
    const [renderSize3D, setRenderSize3D] = useState({ width: 0, height: 0 });

    // ------- 通用：按容器等比缩放并居中（左侧 2D） -------
    const computeImageLayout2D = () => {
        const img = mapImgRef.current;
        const wrap = mapWrapRef.current;
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
            renderedW = wrapW;
            renderedH = renderedW / imgRatio;
        } else {
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

    // ------- 通用：按容器等比缩放并居中（右侧 3D） -------
    const computeImageLayout3D = () => {
        const img = map3DImgRef.current;
        const wrap = map3DWrapRef.current;
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
            renderedW = wrapW;
            renderedH = renderedW / imgRatio;
        } else {
            renderedH = wrapH;
            renderedW = renderedH * imgRatio;
        }

        const leftOffset = (wrapW - renderedW) / 2;
        const topOffset = (wrapH - renderedH) / 2;

        setScale3D({
            sx: renderedW / naturalW,
            sy: renderedH / naturalH,
        });

        setOffset3D({
            left: leftOffset,
            top: topOffset,
        });

        setRenderSize3D({
            width: renderedW,
            height: renderedH,
        });
    };

    const handleMapLoaded2D = () => {
        computeImageLayout2D();
        wsService.send({ cmd: "GetBeaconPositions" });
    };

    const handleMapLoaded3D = () => {
        computeImageLayout3D();
    };

    // 窗口尺寸变化时，同时重算左右两边的布局
    useEffect(() => {
        const onResize = () => {
            computeImageLayout2D();
            computeImageLayout3D();
        };
        window.addEventListener("resize", onResize);
        return () => window.removeEventListener("resize", onResize);
    }, []);

    // 锚点同步
    useEffect(() => {
        setAnchors(Object.values(beaconPositionService.getState().anchors));

        const unsub = beaconPositionService.subscribe((state) => {
            setAnchors(Object.values(state.anchors));
        });

        return unsub;
    }, []);

    // 实时定位点同步
    useEffect(() => {
        setLocPoints(Object.values(locateService.getState().results));

        const unsub = locateService.subscribe((state) => {
            setLocPoints(Object.values(state.results));
        });

        return unsub;
    }, []);

    return (
        <div style={{ padding: "0 16px 16px" }}>
            <Space orientation="vertical" size={4} style={{ marginBottom: 12 }}>
                <Space align="center">
                    <Title level={4} style={{ margin: 0 }}>
                    画面三 · 定位显示
                    </Title>
                    <Text type="secondary">实时定位、实时描点与三维效果图展示。</Text>
                </Space>
            </Space>

            <Space size={16} style={{ marginBottom: 10 }}>
                <span>房间:</span>
                <Select value={roomFilter} onChange={setRoomFilter} style={{ width: 120 }}>
                    <Option value="all">全部房间</Option>
                </Select>

                <span>桌椅:</span>
                <Select value={deskFilter} onChange={setDeskFilter} style={{ width: 120 }}>
                    <Option value="all">全部桌椅</Option>
                </Select>

                <Button type="primary">示例定位</Button>
            </Space>

            <Row gutter={0} style={{ width: "100%", margin: 0 }}>
                {/* 左侧 2D 地图 */}
                <Col xs={24} md={12} style={{ padding: 8 }}>
                    <Card title="实时定位地图" size="small" styles={{ body: { padding: 0 } }}>
                        <div
                            ref={mapWrapRef}
                            style={{
                                width: "100%",
                                height: "calc(100vh - 220px)",
                                minHeight: 400,
                                border: "1px solid #ddd",
                                background: "#fff",
                                position: "relative",
                                overflow: "hidden",
                            }}
                        >
                            <img
                                ref={mapImgRef}
                                src={DEFAULT_2D_MAP}
                                alt="2D-map"
                                onLoad={handleMapLoaded2D}
                                style={{
                                    width: "100%",
                                    height: "100%",
                                    objectFit: "contain",
                                    display: "block",
                                    pointerEvents: "none",
                                }}
                            />

                            {/* 锚点：左下角为原点 */}
                            {anchors.map((a, idx) => {
                                const px =
                                    offset.left + a.x * scale.sx * METER_TO_PIXEL;
                                const py =
                                    offset.top +
                                    renderSize.height -
                                    a.y * scale.sy * METER_TO_PIXEL;

                                return (
                                    <React.Fragment key={"anc_" + idx}>
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
                                                border: "2px solid white",
                                            }}
                                        />

                                        <div
                                            style={{
                                                position: "absolute",
                                                left: px + 50,
                                                top: py - 20,
                                                color: "#000",
                                                fontSize: 12,
                                                background: "rgba(255,255,255,0.7)",
                                                padding: "1px 4px",
                                                borderRadius: 3,
                                                pointerEvents: "none",
                                                transform: "translate(-50%, -50%)",
                                                whiteSpace: "nowrap",
                                            }}
                                        >
                                            {a.mac}
                                        </div>
                                    </React.Fragment>
                                );
                            })}

                            {/* 实时定位点：左下角为原点（仍然用圆点） */}
                            {locPoints.map((p, idx) => {
                                const px =
                                    offset.left + p.x * scale.sx * METER_TO_PIXEL;
                                const py =
                                    offset.top +
                                    renderSize.height -
                                    p.y * scale.sy * METER_TO_PIXEL;

                                return (
                                    <React.Fragment key={"loc_" + idx}>
                                        <div
                                            style={{
                                                position: "absolute",
                                                left: px,
                                                top: py,
                                                width: 16,
                                                height: 16,
                                                background: "blue",
                                                borderRadius: "50%",
                                                transform: "translate(-50%, -50%)",
                                                border: "2px solid white",
                                            }}
                                        />

                                        <div
                                            style={{
                                                position: "absolute",
                                                left: px + 50,
                                                top: py - 20,
                                                color: "#000",
                                                fontSize: 12,
                                                background: "rgba(255,255,255,0.7)",
                                                padding: "1px 4px",
                                                borderRadius: 3,
                                                pointerEvents: "none",
                                                transform: "translate(-50%, -50%)",
                                                whiteSpace: "nowrap",
                                            }}
                                        >
                                            {p.mac}
                                        </div>
                                    </React.Fragment>
                                );
                            })}
                        </div>
                    </Card>
                </Col>

                {/* 右侧 3D 图 + 同步点绘制 */}
                <Col xs={24} md={12} style={{ padding: 8 }}>
                    <Card title="实时监控画面" size="small" styles={{ body: { padding: 0 } }}>
                        <div
                            ref={map3DWrapRef}
                            style={{
                                width: "100%",
                                height: "calc(100vh - 220px)",
                                minHeight: 400,
                                border: "1px solid #ddd",
                                background: "#fff",
                                overflow: "hidden",
                                position: "relative",
                            }}
                        >
                            <img
                                ref={map3DImgRef}
                                src={DEFAULT_3D_MAP}
                                alt="3D-map"
                                onLoad={handleMapLoaded3D}
                                style={{
                                    width: "100%",
                                    height: "100%",
                                    objectFit: "contain",
                                    display: "block",
                                    pointerEvents: "none",
                                }}
                            />

                            {/* 右侧 3D 图上的锚点 */}
                            {anchors.map((a, idx) => {
                                const px =
                                    offset.left + a.x * scale.sx * METER_TO_PIXEL;
                                const py =
                                    offset.top +
                                    renderSize.height -
                                    a.y * scale.sy * METER_TO_PIXEL;

                                return (
                                    <React.Fragment key={"anc3d_" + idx}>
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
                                                border: "2px solid white",
                                            }}
                                        />

                                        <div
                                            style={{
                                                position: "absolute",
                                                left: px + 50,
                                                top: py - 20,
                                                color: "#000",
                                                fontSize: 12,
                                                background: "rgba(255,255,255,0.7)",
                                                padding: "1px 4px",
                                                borderRadius: 3,
                                                pointerEvents: "none",
                                                transform: "translate(-50%, -50%)",
                                                whiteSpace: "nowrap",
                                            }}
                                        >
                                            {a.mac}
                                        </div>
                                    </React.Fragment>
                                );
                            })}

                            {/* 右侧 3D 图上的实时定位点：用矩形表示预测区域 */}
                            {locPoints.map((p, idx) => {
                                const px =
                                    offset3D.left +
                                    p.x * scale3D.sx * METER_TO_PIXEL;
                                const py =
                                    offset3D.top +
                                    renderSize3D.height -
                                    p.y * scale3D.sy * METER_TO_PIXEL;

                                return (
                                    <React.Fragment key={"loc3d_" + idx}>
                                        {/* 矩形预测框 */}
                                        <div
                                            style={{
                                                position: "absolute",
                                                left: px,
                                                top: py,
                                                width: PREDICT_BOX_WIDTH,
                                                height: PREDICT_BOX_HEIGHT,
                                                border: "2px solid blue",
                                                background: "rgba(0, 0, 255, 0.15)",
                                                boxSizing: "border-box",
                                                transform: "translate(-50%, -50%)",
                                            }}
                                        />

                                        {/* MAC 文本 */}
                                        <div
                                            style={{
                                                position: "absolute",
                                                left: px + PREDICT_BOX_WIDTH / 2 + 10,
                                                top: py - PREDICT_BOX_HEIGHT / 2 - 10,
                                                color: "#000",
                                                fontSize: 12,
                                                background: "rgba(255,255,255,0.7)",
                                                padding: "1px 4px",
                                                borderRadius: 3,
                                                pointerEvents: "none",
                                                transform: "translate(-50%, -50%)",
                                                whiteSpace: "nowrap",
                                            }}
                                        >
                                            {p.mac}
                                        </div>
                                    </React.Fragment>
                                );
                            })}
                        </div>
                    </Card>
                </Col>
            </Row>
        </div>
    );
};

export default LocationView;
