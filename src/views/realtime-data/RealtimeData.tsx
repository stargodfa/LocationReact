import React, { useEffect, useMemo, useRef, useState } from "react";
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

import { getServiceSync } from "@spring4js/container-browser";
import IBluetoothDataService, {
  IData,
} from "../../service-api/IBluetoothDataService";
import ILocateResultService, {
  ILocateResultState,
  LocateRecord,
} from "../../service-api/ILocateResultService";
import EService from "../../service-config/EService";

const { Title, Text } = Typography;
const { Option } = Select;

/* ================= services ================= */

const bluetoothDataService = getServiceSync<IBluetoothDataService>(
  EService.IBluetoothDataService
);
const locateService = getServiceSync<ILocateResultService>(
  EService.ILocateResultService
);

/* ================= utils ================= */

function safeJsonParse(text: string) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function detectDevType(rawObj: any, parsedObj: any): string {
  if (parsedObj?.devType || parsedObj?.dev_type) {
    return parsedObj.devType || parsedObj.dev_type;
  }
  if (typeof parsedObj?.vendor === "number") {
    if (parsedObj.vendor === 1) return "MWC01";
    if (parsedObj.vendor === 2) return "MBT02";
  }
  const frameType = rawObj?.type || parsedObj?.type || "";
  if (String(frameType).toLowerCase() === "beacon") return "BEACON";
  return "unknown";
}

function detectFrameType(rawObj: any, parsedObj: any): string {
  return rawObj?.type || parsedObj?.type || "";
}

/* ============================================================ */

const RealtimeData: React.FC = () => {
  /* ================= state ================= */

  const [blueData, setBlueData] = useState<IData>(
    bluetoothDataService.getState()
  );
  const [locState, setLocState] = useState<ILocateResultState>(
    locateService.getState()
  );

  /* ===== 过滤条件（UI 不变） ===== */
  const [macFilter, setMacFilter] = useState("");
  const [devTypeFilter, setDevTypeFilter] = useState("MBT02");
  const [frameTypeFilter, setFrameTypeFilter] = useState("locate");
  const [dataTypeFilter, setDataTypeFilter] = useState("parsed");
  const [displayMode, setDisplayMode] = useState<"string" | "json">("string");

  const isLocateView = frameTypeFilter === "locate";

  /* ================= subscribe ================= */

  useEffect(() => {
    return bluetoothDataService.subscribe(setBlueData);
  }, []);

  useEffect(() => {
    return locateService.subscribe(setLocState);
  }, []);

  /* ================= Locate（稳定） ================= */

  const locateList: LocateRecord[] = useMemo(() => {
    const out: LocateRecord[] = [];
    const byMap = locState.resultsByMap || {};
    Object.values(byMap).forEach((m) =>
      Object.values(m).forEach((rec) => out.push(rec))
    );
    return out;
  }, [locState]);

  const locateFiltered = locateList.filter((rec) => {
    if (
      macFilter &&
      !rec.mac.toLowerCase().includes(macFilter.toLowerCase())
    )
      return false;

    if (devTypeFilter !== "all" && rec.devType && rec.devType !== devTypeFilter)
      return false;

    return true;
  });

  /* ================= BLE（稳定核心） ================= */

  const macOrderRef = useRef<string[]>([]);
  const macRowMapRef = useRef<Record<string, any>>({});

  useEffect(() => {
    for (const row of blueData.realTimeDataList) {
      const mac = row?.mac;
      if (!mac) continue;

      if (!macRowMapRef.current[mac]) {
        macOrderRef.current.push(mac);
      }

      macRowMapRef.current[mac] = {
        ...macRowMapRef.current[mac],
        ...row,
      };
    }
  }, [blueData]);

  const bleStableList = useMemo(() => {
    return macOrderRef.current
      .map((mac) => macRowMapRef.current[mac])
      .filter(Boolean);
  }, [blueData]);

  const filteredData = bleStableList.filter((row) => {
    const rawObj = safeJsonParse(row.raw);
    const parsedObj = safeJsonParse(row.parsed);

    const rowDev = detectDevType(rawObj, parsedObj);
    const rowFrame = detectFrameType(rawObj, parsedObj);

    if (
      macFilter &&
      !row.mac.toLowerCase().includes(macFilter.toLowerCase())
    )
      return false;

    if (devTypeFilter !== "all" && rowDev !== devTypeFilter) return false;

    if (
      frameTypeFilter !== "all" &&
      frameTypeFilter !== "locate" &&
      rowFrame !== frameTypeFilter
    )
      return false;

    if (dataTypeFilter === "raw" && !row.raw) return false;
    if (dataTypeFilter === "parsed" && !row.parsed) return false;

    return true;
  });

  /* ================= 广播类型选项（规则不变） ================= */

  const frameTypeOptions = useMemo(() => {
    if (devTypeFilter === "BEACON") {
      return [{ value: "beacon", label: "beacon" }];
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

  useEffect(() => {
    const allowed = new Set(frameTypeOptions.map((o) => o.value));
    if (!allowed.has(frameTypeFilter)) {
      setFrameTypeFilter(
        allowed.has("locate") ? "locate" : frameTypeOptions[0].value
      );
    }
  }, [frameTypeOptions, frameTypeFilter]);

  /* ================= columns ================= */

  const renderJson = (obj: any) => (
    <pre
      style={{
        margin: 0,
        fontSize: 12,
        whiteSpace: "pre-wrap",
        wordBreak: "break-word",
      }}
    >
      {displayMode === "json"
        ? JSON.stringify(obj, null, 2)
        : JSON.stringify(obj)}
    </pre>
  );

  const bleColumns: any[] = [
    { title: "时间", dataIndex: "time", width: 100 },
    { title: "MAC", dataIndex: "mac", width: 160 },
    { title: "RSSI", dataIndex: "rssi", width: 80 },
  ];

  if (dataTypeFilter === "all" || dataTypeFilter === "raw") {
    bleColumns.push({
      title: "原始数据(raw)",
      dataIndex: "raw",
      render: (t: string) => renderJson(safeJsonParse(t) ?? t),
    });
  }

  if (dataTypeFilter === "all" || dataTypeFilter === "parsed") {
    bleColumns.push({
      title: "解析数据(parsed)",
      dataIndex: "parsed",
      render: (t: string) => renderJson(safeJsonParse(t) ?? t),
    });
  }

  const locateColumns: any[] = [
    {
      title: "时间",
      dataIndex: "ts",
      width: 120,
      render: (ts?: number) =>
        ts ? new Date(ts).toLocaleTimeString() : "-",
    },
    { title: "MAC", dataIndex: "mac", width: 160 },
    { title: "X", dataIndex: "x", width: 80 },
    { title: "Y", dataIndex: "y", width: 80 },
    { title: "RSSI", dataIndex: "rssi", width: 80 },
    {
      title: "定位信息",
      render: (_: any, rec: LocateRecord) => renderJson(rec),
    },
  ];

  /* ================= render ================= */

  return (
    <div style={{ padding: "0 16px 16px" }}>
      <Title level={4}>画面一 · 实时数据列表</Title>

      <Row gutter={16}>
        {/* 左侧过滤区（UI 不变） */}
        <Col xs={24} md={3}>
          <Card title="过滤条件" size="small">
            <Space direction="vertical" style={{ width: "100%" }}>
              <div>
                <Text strong>MAC（模糊匹配）</Text>
                <Input
                  value={macFilter}
                  onChange={(e) => setMacFilter(e.target.value.trim())}
                  placeholder="例如 24 或 30"
                  style={{ marginTop: 4 }}
                />
              </div>

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

              <div>
                <Text strong>数据类型</Text>
                <Select
                  value={dataTypeFilter}
                  onChange={setDataTypeFilter}
                  disabled={isLocateView}
                  style={{ width: "100%", marginTop: 4 }}
                >
                  <Option value="all">全部</Option>
                  <Option value="raw">只看原始数据</Option>
                  <Option value="parsed">只看解析数据</Option>
                </Select>
              </div>

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
            title={isLocateView ? "定位结果" : "BLE 实时数据"}
            extra={
              !isLocateView && (
                <Button
                  size="small"
                  onClick={() =>
                    bluetoothDataService.clearRealTimeDataList()
                  }
                >
                  清空列表
                </Button>
              )
            }
          >
            <Table
              size="small"
              pagination={false}
              scroll={{ y: 750 }}
              rowKey={(row: any) => row.mac}
              columns={isLocateView ? locateColumns : bleColumns}
              dataSource={isLocateView ? locateFiltered : filteredData}
            />
          </Card>
        </Col>
      </Row>
    </div>
  );
};

export default RealtimeData;
