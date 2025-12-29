import React, { useState, useEffect, useRef } from "react";
import { Card, Row, Col, Space, Typography, Button, Select, Input, Popconfirm} from "antd";

import { getServiceSync } from "@spring4js/container-browser";
import IBeaconPositionService from "../../service-api/IBeaconPositionService";
import IMapService from "../../service-api/IMapService";
import IMapConfigService from "../../service-api/IMapConfigService";
import IBeaconListService from "../../service-api/IBeaconListService";
import EService from "../../service-config/EService";

const beaconPositionService =
  getServiceSync<IBeaconPositionService>(EService.IBeaconPositionService);
const mapService = getServiceSync<IMapService>(EService.IMapService);
const mapConfigService =
  getServiceSync<IMapConfigService>(EService.IMapConfigService);
const beaconListService =
  getServiceSync<IBeaconListService>(EService.IBeaconListService);

const { Title, Text } = Typography;
const { Option } = Select;

const HTTP_BASE = `http://${location.hostname}:8082`;

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
  const [showMac, setShowMac] = useState(true);

  /* -------- 地图渲染 -------- */
  const imgRef = useRef<HTMLImageElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  const [meterToPixel, setMeterToPixel] = useState<number>(300);
  const [scale, setScale] = useState({ sx: 1, sy: 1 });
  const [offset, setOffset] = useState({ left: 0, top: 0 });
  const [renderSize, setRenderSize] = useState({ width: 0, height: 0 });

  /* ================= 地图列表 ================= */
  useEffect(() => {
    setMapList(mapService.getState().maps);
    const unsub = mapService.subscribe((maps) => {
      setMapList(maps);
      setSelectedMapId((prev) => prev ?? (maps.length > 0 ? maps[0].id : undefined));
    });
    return unsub;
  }, []);

  /* ================= 比例同步 ================= */
  useEffect(() => {
    setMeterToPixel(mapConfigService.getState().meterToPixel);
    return mapConfigService.subscribe((s) => setMeterToPixel(s.meterToPixel));
  }, []);

  /* ================= 切换地图 ================= */
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

  /* ================= 图片布局 ================= */
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
    if (imgRatio > wrapRatio) rh = rw / imgRatio;
    else rw = rh * imgRatio;

    setScale({ sx: rw / iw, sy: rh / ih });
    setOffset({ left: (cw - rw) / 2, top: (ch - rh) / 2 });
    setRenderSize({ width: rw, height: rh });
  };

  useEffect(() => {
    window.addEventListener("resize", computeImageLayout);
    return () => window.removeEventListener("resize", computeImageLayout);
  }, []);

  /* ================= Anchor 同步 ================= */
  useEffect(() => {
    setAnchorList(Object.values(beaconPositionService.getState().anchors));
    return beaconPositionService.subscribe((s) =>
      setAnchorList(Object.values(s.anchors))
    );
  }, []);

  /* ================= Beacon MAC 列表（来自服务器 maclist） ================= */
  useEffect(() => {
    setBeaconMacList(beaconListService.getState().macList);

    const unsub = beaconListService.subscribe((s) => {
      setBeaconMacList(s.macList);
    });

    beaconListService.refresh().catch(() => {});

    return unsub;
  }, []);

  /* 可选：列表变化后修正当前选择 */
  useEffect(() => {
    if (!selectedMac) return;
    if (beaconMacList.includes(selectedMac)) return;
    setSelectedMac("");
  }, [beaconMacList, selectedMac]);

  /* ================= 坐标操作 ================= */
  const handleSendCoord = () => {
    const nx = Number(x);
    const ny = Number(y);
    if (!selectedMac || Number.isNaN(nx) || Number.isNaN(ny)) return;
    beaconPositionService.setCoord(selectedMac, nx, ny);
  };

  const handleDeleteMac = () => {
    if (selectedMac) beaconListService.removeBeacon(selectedMac);
  };

  const handleClearCurrent = () => {
    if (selectedMac) beaconPositionService.clearCoord(selectedMac);
  };

  const handleClearAll = () => {
    beaconPositionService.clearAll();
  };

  const handleImportDefaultAnchors = () => {
    beaconPositionService.setDefaultCoords();
  };

  const handleUseRecordAnchors = () => {
    beaconPositionService.getAllCoords();
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

          <Card title="地图比例设置" size="small" style={{ marginBottom: 16 }}>
            <Space direction="vertical" style={{ width: "100%" }}>
              <Text>1 米 = 像素</Text>
              <Input
                type="number"
                value={meterToPixel}
                onChange={(e) => setMeterToPixel(Number(e.target.value))}
                onBlur={() => mapConfigService.setMeterToPixel(meterToPixel)}
              />
            </Space>
          </Card>

          <Card title="Beacon 坐标设定" size="small">
            <Space direction="vertical" style={{ width: "100%" }}>
              <Space style={{ width: "100%" }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                    <Select
                    value={selectedMac || undefined}
                    onChange={setSelectedMac}
                    placeholder="选择 Beacon"
                    disabled={beaconMacList.length === 0}
                    style={{ width: "100%" }}
                    // antd v4 用 dropdownMatchSelectWidth，v5 用 popupMatchSelectWidth
                    popupMatchSelectWidth={false as any}
                    dropdownStyle={{ minWidth: 180 }} // 可按需调大
                    optionLabelProp="value"
                    >
                    {beaconMacList.map((mac) => (
                        <Option key={mac} value={mac}>
                        <span style={{ whiteSpace: "nowrap" }}>{mac}</span>
                        </Option>
                    ))}
                    </Select>
                </div>
                    <Button onClick={() => setShowMac((v) => !v)}>
                        {showMac ? "隐藏 MAC" : "显示 MAC"}
                    </Button>
                </Space>


              <Input value={x} onChange={(e) => setX(e.target.value)} placeholder="X (m)" />
              <Input value={y} onChange={(e) => setY(e.target.value)} placeholder="Y (m)" />

              <Space>
                <Button type="primary" onClick={handleSendCoord}>
                    设置
                </Button>
                <Button onClick={handleClearCurrent}>
                    清除
                </Button>
                
                <Popconfirm
                    title="确认删除该Beacon列表信息？"
                    okText="删除"
                    cancelText="取消"
                    onConfirm={handleDeleteMac}
                    disabled={!selectedMac}
                >
                    <Button danger disabled={!selectedMac}>删除</Button>
                </Popconfirm>
              </Space>

              <Space wrap>
                <Button onClick={handleImportDefaultAnchors}>导入默认描点</Button>
                <Button onClick={handleUseRecordAnchors}>标定记录锚点</Button>
                <Button danger onClick={handleClearAll}>
                  清除所有锚标
                </Button>
              </Space>
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
                    const px = offset.left + a.x * scale.sx * meterToPixel;
                    const py =
                      offset.top +
                      renderSize.height -
                      a.y * scale.sy * meterToPixel;

                    return (
                      <React.Fragment key={idx}>
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
                        {showMac && (
                          <div
                            style={{
                              position: "absolute",
                              left: px + 50,
                              top: py - 15,
                              fontSize: 12,
                              background: "rgba(255,255,255,0.7)",
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
