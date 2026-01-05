import React, { useEffect, useMemo, useRef, useState } from "react";
import { Card, Row, Col, Space, Typography, Input, Button, Table, Tag, InputNumber } from "antd";

import { getServiceSync } from "@spring4js/container-browser";
import IBluetoothDataService, { IData } from "../../service-api/IBluetoothDataService";
import EService from "../../service-config/EService";

const { Title, Text } = Typography;

/* ================= services ================= */

const bluetoothDataService = getServiceSync<IBluetoothDataService>(EService.IBluetoothDataService);

/* ================= utils ================= */

function safeJsonParse(text: string) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function detectFrameType(row: any): string {
  const rawObj = safeJsonParse(row?.raw);
  const parsedObj = safeJsonParse(row?.parsed);
  const t = rawObj?.type ?? parsedObj?.type ?? row?.type ?? "";
  return String(t).toLowerCase();
}

function pickTsMs(row: any): number | undefined {
  // 优先用消息自带 ts（如果 service 没带 ts，就退化到 Date.now）
  if (typeof row?.ts === "number") return row.ts;

  const rawObj = safeJsonParse(row?.raw);
  if (typeof rawObj?.ts === "number") return rawObj.ts;

  const parsedObj = safeJsonParse(row?.parsed);
  if (typeof parsedObj?.ts === "number") return parsedObj.ts;

  return undefined;
}

function fmtAge(ms: number) {
  if (ms < 0) return "0ms";
  if (ms < 1000) return `${ms} ms`;
  return `${(ms / 1000).toFixed(1)} s`;
}

type DeviceRow = {
  mac: string;
  lastComboTs: number; // 本地时间戳（ms）
  ageMs: number;
  online: boolean;
  comboCount: number;
  lastRssi?: number;
  lastSeenText: string;
};

const DEFAULT_WINDOW_SEC = 5; // 默认 5 秒内收到 combo 认为在线

const DeviceStatus: React.FC = () => {
  const [blueData, setBlueData] = useState<IData>(bluetoothDataService.getState());

  // 过滤
  const [macFilter, setMacFilter] = useState("");

  // 在线窗口
  const [windowSec, setWindowSec] = useState<number>(DEFAULT_WINDOW_SEC);

  // 用 ref 做稳定聚合缓存：mac -> info
  const macMapRef = useRef<
    Record<
      string,
      {
        lastComboTs: number; // Date.now() 的时间戳
        comboCount: number;
        lastRssi?: number;
      }
    >
  >({});

  // tick 用来刷新 age/online
  const [tick, setTick] = useState(0);

  /* ================= subscribe ================= */

  useEffect(() => bluetoothDataService.subscribe(setBlueData), []);

  /* ================= ingest data ================= */

  useEffect(() => {
    const list = blueData.realTimeDataList || [];
    if (list.length === 0) return;

    // 从尾部扫，尽量只处理最新的若干条也行，但这里全扫更稳
    for (let i = 0; i < list.length; i++) {
      const row = list[i];
      const mac = row?.mac;
      if (!mac) continue;

      const frameType = detectFrameType(row);
      if (frameType !== "combo") continue;

      const tsFromMsg = pickTsMs(row);
      // 这里必须用“本地时间”来判断在线窗口，否则 msg.ts 是单调时间会无法与 Date.now 比较
      const nowLocal = Date.now();

      const rec = macMapRef.current[mac] || { lastComboTs: 0, comboCount: 0, lastRssi: undefined };
      rec.lastComboTs = nowLocal;
      rec.comboCount += 1;
      if (typeof row?.rssi === "number") rec.lastRssi = row.rssi;

      macMapRef.current[mac] = rec;

      // 可选：用于调试 msg ts 是否存在
      void tsFromMsg;
    }
  }, [blueData]);

  /* ================= tick ================= */

  useEffect(() => {
    const t = window.setInterval(() => setTick((x) => x + 1), 1000);
    return () => window.clearInterval(t);
  }, []);

  /* ================= build table data ================= */

  const onlineWindowMs = Math.max(1, windowSec) * 1000;

  const tableData: DeviceRow[] = useMemo(() => {
    const now = Date.now();
    const rows: DeviceRow[] = Object.entries(macMapRef.current).map(([mac, rec]) => {
      const ageMs = now - rec.lastComboTs;
      const online = ageMs <= onlineWindowMs;

      const d = new Date(rec.lastComboTs);
      const hh = String(d.getHours()).padStart(2, "0");
      const mm = String(d.getMinutes()).padStart(2, "0");
      const ss = String(d.getSeconds()).padStart(2, "0");

      return {
        mac,
        lastComboTs: rec.lastComboTs,
        ageMs,
        online,
        comboCount: rec.comboCount,
        lastRssi: rec.lastRssi,
        lastSeenText: rec.lastComboTs ? `${hh}:${mm}:${ss}` : "-",
      };
    });

    rows.sort((a, b) => {
      // 在线优先，再按最近更新时间排序
      if (a.online !== b.online) return a.online ? -1 : 1;
      return b.lastComboTs - a.lastComboTs;
    });

    if (macFilter.trim()) {
      const q = macFilter.trim().toLowerCase();
      return rows.filter((r) => r.mac.toLowerCase().includes(q));
    }
    return rows;
  }, [tick, macFilter, onlineWindowMs]);

  /* ================= columns ================= */

  const columns: any[] = [
    {
      title: "状态",
      width: 90,
      render: (_: any, row: DeviceRow) => (row.online ? <Tag color="green">在线</Tag> : <Tag color="red">离线</Tag>),
    },
    { title: "MAC", dataIndex: "mac", width: 180 },
    {
      title: "距上次 combo",
      width: 140,
      render: (_: any, row: DeviceRow) => fmtAge(row.ageMs),
    },
    { title: "上次 combo 时间", dataIndex: "lastSeenText", width: 120 },
    { title: "combo 次数", dataIndex: "comboCount", width: 110 },
    {
      title: "最近 RSSI",
      width: 100,
      render: (_: any, row: DeviceRow) => (typeof row.lastRssi === "number" ? row.lastRssi : "-"),
    },
  ];

  return (
    <div style={{ padding: "0 16px 16px" }}>
      <Title level={4}>设备在线状态</Title>

      <Row gutter={16}>
        <Col xs={24} md={6}>
          <Card size="small" title="筛选与规则">
            <Space direction="vertical" style={{ width: "100%" }}>
              <div>
                <Text strong>MAC（模糊匹配）</Text>
                <Input
                  value={macFilter}
                  onChange={(e) => setMacFilter(e.target.value)}
                  placeholder="输入 MAC 片段"
                  style={{ marginTop: 4 }}
                />
              </div>

              <div>
                <Text strong>在线窗口（秒）</Text>
                <div style={{ marginTop: 4 }}>
                  <InputNumber
                    min={1}
                    max={3600}
                    value={windowSec}
                    onChange={(v) => setWindowSec(Number(v || 1))}
                    style={{ width: "100%" }}
                  />
                </div>
                <Text type="secondary">规则：窗口内收到该 MAC 的 combo 数据即在线</Text>
              </div>

              <Button
                onClick={() => {
                  macMapRef.current = {};
                  bluetoothDataService.clearRealTimeDataList();
                  setTick((x) => x + 1);
                }}
              >
                清空统计
              </Button>

              <Text type="secondary">
                当前：raw={(blueData.realTimeDataList || []).length}，devices={Object.keys(macMapRef.current).length}
              </Text>
            </Space>
          </Card>
        </Col>

        <Col xs={24} md={18}>
          <Card size="small" title="设备列表">
            <Table
              size="small"
              pagination={false}
              scroll={{ y: 750 }}
              rowKey={(r: DeviceRow) => r.mac}
              columns={columns}
              dataSource={tableData}
            />
          </Card>
        </Col>
      </Row>
    </div>
  );
};

export default DeviceStatus;
