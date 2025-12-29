import React, { useEffect, useMemo, useState } from "react";
import {
  Card,
  Row,
  Col,
  Space,
  Input,
  Select,
  Typography,
  Button,
  Table,
} from "antd";
import EService from "../../service-config/EService";
import IBluetoothDataService, { IData } from "../../service-api/IBluetoothDataService";
import ILocateResultService, {
  ILocateResultState,
  LocateRecord,
} from "../../service-api/ILocateResultService";
import { getServiceSync } from "@spring4js/container-browser";

const { Title, Text } = Typography;
const { Option } = Select;

const bluetoothDataService =
  getServiceSync<IBluetoothDataService>(EService.IBluetoothDataService);

const locateService =
  getServiceSync<ILocateResultService>(EService.ILocateResultService);

/* ----------------- 安全 JSON ----------------- */
function safeJsonParse(text: string) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/* ============================================================
   设备类型判定（仿旧 JS 的 extractFields）
============================================================ */
function detectDevType(rawObj: any, parsedObj: any): string {
  if (parsedObj?.devType || parsedObj?.dev_type) {
    return parsedObj.devType || parsedObj.dev_type;
  }

  if (typeof parsedObj?.vendor === "number") {
    if (parsedObj.vendor === 1) return "MWC01";
    if (parsedObj.vendor === 2) return "MBT02";
  }

  const frameType = rawObj?.type || parsedObj?.type || "";
  if (String(frameType).toLowerCase() === "beacon") {
    return "BEACON";
  }

  return "unknown";
}

/* ============================================================
   广播类型判定（只用于 BLE 表格过滤）
============================================================ */
function detectFrameType(rawObj: any, parsedObj: any): string {
  return rawObj?.type || parsedObj?.type || "";
}

/* ============================================================
   组件
============================================================ */
const RealtimeData: React.FC = () => {
  // BLE 实时数据
  const [blueData, setBlueData] = useState<IData>(bluetoothDataService.getState());
  const tableData = blueData.realTimeDataList;

  // 定位结果（RelayLocated）来自 LocateResultService
  const [locState, setLocState] = useState<ILocateResultState>(locateService.getState());
  const locateList: LocateRecord[] = Object.values(locState.results || {});

  /* ----------------- 过滤条件 ----------------- */
  const [macFilter, setMacFilter] = useState("");
  const [devTypeFilter, setDevTypeFilter] = useState("MBT02");
  const [frameTypeFilter, setFrameTypeFilter] = useState("locate"); // 默认显示定位结果
  const [dataTypeFilter, setDataTypeFilter] = useState("parsed");
  const [displayMode, setDisplayMode] = useState<"string" | "json">("string");

  // frameType=locate 时，显示定位服务的数据表
  const isLocateView = frameTypeFilter === "locate";

  /* ----------------- 订阅服务 ----------------- */
  useEffect(() => {
    return bluetoothDataService.subscribe((data) => setBlueData(data));
  }, []);

  useEffect(() => {
    return locateService.subscribe((s) => setLocState(s));
  }, []);

  const handleClear = () => {
    bluetoothDataService.clearRealTimeDataList();
  };

  /* ============================================================
     广播类型选项限制：
     - BEACON 只能切换 beacon / locate
     - MBT02、MWC01 不显示 beacon
     - all 显示全部
  ============================================================ */
  const frameTypeOptions = useMemo(() => {
    if (devTypeFilter === "BEACON") {
      return [
        { value: "beacon", label: "beacon" },
      ];
    }

    if (devTypeFilter === "MBT02" || devTypeFilter === "MWC01") {
      return [
        { value: "all", label: "全部" },
        { value: "locate", label: "locate" },
        { value: "relay", label: "relay" },
        { value: "combo", label: "combo" },
      ];
    }

    return [
      { value: "all", label: "全部" },
      { value: "beacon", label: "beacon" },
      { value: "locate", label: "locate" },
      { value: "relay", label: "relay" },
      { value: "combo", label: "combo" },
    ];
  }, [devTypeFilter]);

  // devType 改变时，如果当前 frameType 不合法则自动修正
  useEffect(() => {
    const allowed = new Set(frameTypeOptions.map((o) => o.value));
    if (!allowed.has(frameTypeFilter)) {
      setFrameTypeFilter(allowed.has("locate") ? "locate" : frameTypeOptions[0].value);
    }
  }, [devTypeFilter, frameTypeOptions, frameTypeFilter]);

  /* ============================================================
     BLE：按 MAC 只保留最新一条（像 locate 一样“仅变化刷新”）
  ============================================================ */
  const bleLatestList = useMemo(() => {
    const seen = new Map<string, any>();
    for (const row of tableData) {
      const mac = row?.mac;
      if (!mac) continue;
      if (!seen.has(mac)) seen.set(mac, row);
    }
    return Array.from(seen.values()).sort((a, b) =>
      String(a.mac).localeCompare(String(b.mac))
    );
  }, [tableData]);

  /* ============================================================
     BLE 数据过滤（基于 bleLatestList）
  ============================================================ */
  const filteredData = bleLatestList.filter((row) => {
    const rawObj = safeJsonParse(row.raw);
    const parsedObj = safeJsonParse(row.parsed);

    const rowDev = detectDevType(rawObj, parsedObj);
    const rowFrame = detectFrameType(rawObj, parsedObj);

    if (macFilter && !row.mac.toLowerCase().includes(macFilter.toLowerCase())) return false;
    if (devTypeFilter !== "all" && rowDev !== devTypeFilter) return false;

    if (!isLocateView && frameTypeFilter !== "all" && rowFrame !== frameTypeFilter) return false;

    if (dataTypeFilter === "raw" && !row.raw) return false;
    if (dataTypeFilter === "parsed" && !row.parsed) return false;

    return true;
  });

  /* ============================================================
     定位结果过滤（LocateResultService）
  ============================================================ */
  const locateFiltered = locateList.filter((rec) => {
    if (macFilter && !rec.mac.toLowerCase().includes(macFilter.toLowerCase())) return false;
    if (devTypeFilter !== "all" && rec.devType && rec.devType !== devTypeFilter) return false;
    return true;
  });

  /* ============================================================
     raw / parsed 列显隐（只对 BLE 表有效）
  ============================================================ */
  const showRaw = !isLocateView && (dataTypeFilter === "all" || dataTypeFilter === "raw");
  const showParsed = !isLocateView && (dataTypeFilter === "all" || dataTypeFilter === "parsed");

  /* ----------------- BLE raw 列渲染 ----------------- */
  const renderRawText = (text: string) => {
    const json = safeJsonParse(text);

    if (displayMode === "json" && json) {
      return (
        <pre style={{ whiteSpace: "pre-wrap", wordBreak: "break-word", margin: 0, fontSize: 12 }}>
          {JSON.stringify(json, null, 2)}
        </pre>
      );
    }

    return (
      <pre style={{ whiteSpace: "pre-wrap", wordBreak: "break-word", margin: 0, fontSize: 12 }}>
        {text}
      </pre>
    );
  };

  /* ----------------- BLE parsed 列渲染 ----------------- */
  const renderParsedText = (text: string) => {
    const parsedObj = safeJsonParse(text);

    if (displayMode === "json" && parsedObj) {
      return (
        <pre style={{ whiteSpace: "pre-wrap", wordBreak: "break-word", margin: 0, fontSize: 12 }}>
          {JSON.stringify(parsedObj, null, 2)}
        </pre>
      );
    }

    return (
      <pre style={{ whiteSpace: "pre-wrap", wordBreak: "break-word", margin: 0, fontSize: 12 }}>
        {text}
      </pre>
    );
  };

  /* ----------------- BLE 表格列 ----------------- */
  const bleColumns: any[] = [
    { title: "时间", dataIndex: "time", width: 100 },
    { title: "MAC", dataIndex: "mac", width: 150 },
    { title: "RSSI", dataIndex: "rssi", width: 80 },
  ];

  if (showRaw) {
    bleColumns.push({
      title: "原始数据(raw)",
      dataIndex: "raw",
      width: 380,
      render: renderRawText,
    });
  }

  if (showParsed) {
    bleColumns.push({
      title: "解析数据(parsed)",
      dataIndex: "parsed",
      width: 380,
      render: renderParsedText,
    });
  }

  /* ----------------- LocateResult 定位信息渲染 ----------------- */
  const renderLocateInfo = (rec: LocateRecord) => {
    if (displayMode === "string") {
      return (
        <pre style={{ whiteSpace: "pre-wrap", wordBreak: "break-word", margin: 0, fontSize: 12 }}>
          {JSON.stringify(rec)}
        </pre>
      );
    }

    return (
      <pre style={{ whiteSpace: "pre-wrap", wordBreak: "break-word", margin: 0, fontSize: 12 }}>
        {JSON.stringify(rec, null, 2)}
      </pre>
    );
  };

  /* ----------------- LocateResult 表格列 ----------------- */
  const locateColumns: any[] = [
    {
      title: "时间",
      dataIndex: "ts",
      width: 120,
      render: (ts?: number) => (ts ? new Date(ts).toLocaleTimeString() : "-"),
    },
    { title: "MAC", dataIndex: "mac", width: 180 },
    { title: "X (m)", dataIndex: "x", width: 80 },
    { title: "Y (m)", dataIndex: "y", width: 80 },
    { title: "RSSI", dataIndex: "rssi", width: 80 },
    {
      title: "定位信息(JSON)",
      dataIndex: "_json",
      render: (_: any, rec: LocateRecord) => renderLocateInfo(rec),
    },
  ];

  const totalCount = isLocateView ? locateList.length : bleLatestList.length;
  const displayCount = isLocateView ? locateFiltered.length : filteredData.length;

  /* ============================================================
     UI
  ============================================================ */
  return (
    <div style={{ padding: "0 16px 16px" }}>
      <Space orientation="vertical" size={8} style={{ marginBottom: 8 }}>
        <Space align="center">
          <Title level={4} style={{ margin: 0 }}>
            画面一 · 实时数据列表
          </Title>
        </Space>
      </Space>

      <Row gutter={16}>
        {/* 左侧过滤区 */}
        <Col xs={24} md={3}>
          <Card title="过滤条件" size="small">
            <Space orientation="vertical" size={12} style={{ width: "100%" }}>
              {/* MAC */}
              <div>
                <Text strong>MAC（模糊匹配）</Text>
                <Input
                  value={macFilter}
                  onChange={(e) => setMacFilter(e.target.value.trim())}
                  placeholder="例如 24 或 30"
                  style={{ marginTop: 4 }}
                />
              </div>

              {/* 设备类型 */}
              <div>
                <Text strong>设备类型</Text>
                <Select
                  value={devTypeFilter}
                  onChange={setDevTypeFilter}
                  style={{ width: "100%", marginTop: 4 }}
                >
                  <Option value="all">全部</Option>
                  <Option value="BEACON">Beacon</Option>
                  <Option value="MBT02">MBT02</Option>
                  <Option value="MWC01">MWC01</Option>
                </Select>
              </div>

              {/* 广播类型 */}
              <div>
                <Text strong>广播类型</Text>
                <Select
                  value={frameTypeFilter}
                  onChange={setFrameTypeFilter}
                  style={{ width: "100%", marginTop: 4 }}
                >
                  {frameTypeOptions.map((o) => (
                    <Option key={o.value} value={o.value}>
                      {o.label}
                    </Option>
                  ))}
                </Select>
              </div>

              {/* 数据类型（只对 BLE 生效） */}
              <div>
                <Text strong>数据类型</Text>
                <Select
                  value={dataTypeFilter}
                  onChange={setDataTypeFilter}
                  style={{ width: "100%", marginTop: 4 }}
                  disabled={isLocateView}
                >
                  <Option value="all">全部</Option>
                  <Option value="raw">只看原始数据</Option>
                  <Option value="parsed">只看解析数据</Option>
                </Select>
              </div>

              {/* 显示模式 */}
              <div>
                <Text strong>显示模式</Text>
                <Select
                  value={displayMode}
                  onChange={setDisplayMode}
                  style={{ width: "100%", marginTop: 4 }}
                >
                  <Option value="string">紧凑字符串</Option>
                  <Option value="json">JSON 格式</Option>
                </Select>
              </div>
            </Space>
          </Card>
        </Col>

        {/* 右侧表格 */}
        <Col xs={24} md={21}>
          <Card
            size="small"
            title={
              <Space orientation="vertical" size={0}>
                <Text strong>
                  {isLocateView
                    ? "定位结果列表（LocateResultService）"
                    : "实时数据列表（BLE 广播）"}
                </Text>
                <Text type="secondary" style={{ fontSize: 12 }}>
                  共 {totalCount} 条，当前显示 {displayCount} 条。
                </Text>
              </Space>
            }
            extra={
              !isLocateView && (
                <Button size="small" onClick={handleClear}>
                  清空列表
                </Button>
              )
            }
          >
            <Table<any>
              size="small"
              columns={isLocateView ? locateColumns : bleColumns}
              dataSource={isLocateView ? locateFiltered : filteredData}
              pagination={false}
              scroll={{ y: 750 }}
              style={{ tableLayout: "fixed" }}
              rowKey={(row: any) => row.mac ?? row.key ?? `${row.mac}_${row.ts ?? ""}`}
            />
          </Card>
        </Col>
      </Row>
    </div>
  );
};

export default RealtimeData;
