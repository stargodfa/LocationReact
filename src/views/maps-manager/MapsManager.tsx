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

type CalibPoint = {
  // wrap 内的渲染坐标（px）
  rx: number;
  ry: number;
  // 原图像素坐标（natural image px）
  ix: number;
  iy: number;
};

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

  /* -------- 比例标定（地图点选） -------- */
  const [calibMode, setCalibMode] = useState(false);
  const [calibPoints, setCalibPoints] = useState<CalibPoint[]>([]);
  const [calibModalOpen, setCalibModalOpen] = useState(false);
  const [calibMeters, setCalibMeters] = useState<number>(1);
  const [calibPixelDist, setCalibPixelDist] = useState<number>(0);

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

  /* ================= 布局：左右独立容器（不使用栅格） ================= */
  const wsNotReady = mapList.length === 0;
  const leftWidthPx = wsNotReady ? 400 : 400;

  /* ================= 比例标定：进入/退出 ================= */
  const startCalibrate = () => {
    if (!mapSrc) return;
    setCalibMode(true);
    setCalibPoints([]);
    setCalibModalOpen(false);
    setCalibMeters(1);
    setCalibPixelDist(0);
  };

  const cancelCalibrate = () => {
    setCalibMode(false);
    setCalibPoints([]);
    setCalibModalOpen(false);
    setCalibMeters(1);
    setCalibPixelDist(0);
  };

  /* ================= 比例标定：地图点击取点 ================= */
  const handleMapClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!calibMode) return;

    const wrap = wrapRef.current;
    if (!wrap) return;

    // 必须已经计算出布局
    if (renderSize.width <= 0 || renderSize.height <= 0) return;
    if (scale.sx <= 0 || scale.sy <= 0) return;

    const rect = wrap.getBoundingClientRect();
    const rx = e.clientX - rect.left;
    const ry = e.clientY - rect.top;

    // 只允许点在图片实际显示区域内（排除 contain 留白）
    const inImg =
      rx >= offset.left &&
      rx <= offset.left + renderSize.width &&
      ry >= offset.top &&
      ry <= offset.top + renderSize.height;

    if (!inImg) return;

    // 转换到原图像素坐标（top-left 原点）
    const ix = (rx - offset.left) / scale.sx;
    const iy = (ry - offset.top) / scale.sy;

    setCalibPoints((prev) => {
      if (prev.length >= 2) return prev;

      const next = [...prev, { rx, ry, ix, iy }];

      if (next.length === 2) {
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
  const confirmCalibrate = () => {
    if (calibPoints.length !== 2) return;
    if (!calibMeters || calibMeters <= 0) return;
    if (!calibPixelDist || calibPixelDist <= 0) return;

    const newM2P = calibPixelDist / calibMeters;

    // 保留两位小数，避免 UI 抖动
    const fixed = Number(newM2P.toFixed(2));

    setMeterToPixel(fixed);
    mapConfigService.setMeterToPixel(fixed);

    setCalibModalOpen(false);
    setCalibMode(false);
    setCalibPoints([]);
  };

  /* ================= 渲染 ================= */
  return (
    <div style={{ padding: "0 16px 16px" }}>
      <style>{`
        .mm-layout {
          display: flex;
          gap: 16px;
          align-items: stretch;
        }
        .mm-left {
          flex: 0 0 var(--mm-left-width);
          width: var(--mm-left-width);
          max-width: var(--mm-left-width);
        }
        .mm-right {
          flex: 1 1 auto;
          min-width: 0;
        }
        @media (max-width: 992px) {
          .mm-layout { flex-direction: column; }
          .mm-left { width: 100%; max-width: none; flex: 0 0 auto; }
          .mm-right { width: 100%; }
        }
      `}</style>

      <Title level={4}>画面二 · 地图管理</Title>

      <div
        className="mm-layout"
        style={{ ["--mm-left-width" as any]: `${leftWidthPx}px` }}
      >
        {/* 左侧独立容器 */}
        <div className="mm-left">
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

              <Space style={{ width: "100%" }}>
                <Input
                  type="number"
                  value={meterToPixel}
                  onChange={(e) => setMeterToPixel(Number(e.target.value))}
                  onBlur={() => mapConfigService.setMeterToPixel(meterToPixel)}
                  style={{ flex: 1 }}
                />
                <Button
                  onClick={startCalibrate}
                  disabled={!mapSrc}
                >
                  标定地图比例
                </Button>
              </Space>

              {calibMode && (
                <Text type="warning" style={{ fontSize: 12 }}>
                  标定模式：请在地图上点击两点，然后输入两点的实际距离（米）。
                </Text>
              )}
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
                    popupMatchSelectWidth={false as any}
                    dropdownStyle={{ minWidth: 180 }}
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
                <Button onClick={handleClearCurrent}>清除</Button>

                <Popconfirm
                  title="确认删除该Beacon列表信息？"
                  okText="删除"
                  cancelText="取消"
                  onConfirm={handleDeleteMac}
                  disabled={!selectedMac}
                >
                  <Button danger disabled={!selectedMac}>
                    删除
                  </Button>
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
        </div>

        {/* 右侧独立容器 */}
        <div className="mm-right">
          <Card
            title="地图预览"
            size="small"
            extra={
              calibMode ? (
                <Space>
                  <Button onClick={() => setCalibPoints([])}>重选两点</Button>
                  <Button danger onClick={cancelCalibrate}>退出标定</Button>
                </Space>
              ) : null
            }
          >
            <div
              ref={wrapRef}
              onClick={handleMapClick}
              style={{
                width: "100%",
                height: "calc(100vh - 220px)",
                minHeight: 400,
                position: "relative",
                overflow: "hidden",
                border: "1px solid #ddd",
                background: "#fff",
                cursor: calibMode ? "crosshair" : "default",
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
                      userSelect: "none",
                    }}
                  />

                  {/* ====== 标定点与连线（仅在标定模式显示） ====== */}
                  {calibMode && (
                    <>
                      {/* 连线 */}
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

                      {/* 点 */}
                      {calibPoints.map((p, i) => (
                        <React.Fragment key={i}>
                          <div
                            style={{
                              position: "absolute",
                              left: p.rx,
                              top: p.ry,
                              width: 12,
                              height: 12,
                              background: i === 0 ? "rgba(0,0,255,0.9)" : "rgba(0,0,255,0.6)",
                              borderRadius: "50%",
                              transform: "translate(-50%, -50%)",
                              pointerEvents: "none",
                              boxShadow: "0 0 0 2px rgba(255,255,255,0.8)",
                            }}
                          />
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
                              transform: "translate(0, 0)",
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

                  {/* ====== Anchor 点（设置 pointerEvents:none，避免干扰标定点击） ====== */}
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
                            pointerEvents: "none",
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
                              pointerEvents: "none",
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
        </div>
      </div>

      {/* ===== 标定确认对话框 ===== */}
      <Modal
        title="设置地图比例"
        open={calibModalOpen}
        onCancel={cancelCalibrate}
        onOk={confirmCalibrate}
        okText="确认并更新比例"
        cancelText="取消"
        destroyOnClose
      >
        <Space direction="vertical" style={{ width: "100%" }}>
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
            <Text>
              预览结果：1 米 ≈ {(calibPixelDist / calibMeters).toFixed(2)} px
            </Text>
          )}
        </Space>
      </Modal>
    </div>
  );
};

export default MapsManager;
