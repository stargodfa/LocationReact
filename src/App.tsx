import React, { useState, useEffect } from "react";
import { Button, Space, Tag } from "antd";

// import DeviceStatus from "./views/device-status/DeviceStatus";
import RealtimeData from "./views/realtime-data/RealtimeData";
import MapsManager from "./views/maps-manager/MapsManager";
import LocationView from "./views/location-view/LocationView";

import { getServiceSync } from "@spring4js/container-browser";
import IWebSocketService, { WSStatus } from "./service-api/IWebSocketService";
import EService from "./service-config/EService";

/* ===== UI 持久化 key ===== */
const UI_PERSIST_KEY = "ble_ui_state";

/* ===== 读取持久化 ===== */
function loadPersistedView(): string {
  try {
    const raw = localStorage.getItem(UI_PERSIST_KEY);
    if (!raw) return "MapsManager";
    const obj = JSON.parse(raw);
    return obj.activeView || "MapsManager";
  } catch {
    return "MapsManager";
  }
}

/* ===== 写入持久化 ===== */
function savePersistedView(activeView: string) {
  try {
    localStorage.setItem(
      UI_PERSIST_KEY,
      JSON.stringify({ activeView })
    );
  } catch {}
}

const App: React.FC = () => {
  /* ===== 当前画面（从 localStorage 恢复） ===== */
  const [activeView, setActiveView] = useState<string>(
    loadPersistedView()
  );

  const [currentTime, setCurrentTime] = useState<string>(
    new Date().toLocaleTimeString()
  );

  const [wsStatus, setWsStatus] = useState<WSStatus>("disconnected");

  /* ===== activeView 变化时持久化 ===== */
  useEffect(() => {
    savePersistedView(activeView);
  }, [activeView]);

  /* ===== WebSocket + 时间 ===== */
  useEffect(() => {
    const wsService = getServiceSync<IWebSocketService>(
      EService.IWebSocketService
    );

    const off = wsService.subscribe((s) => {
      setWsStatus(s);

      if (s === "connected") {
        wsService.send({ cmd: "GetMapList" });
        // wsService.send({ cmd: "GetMapScale" });
        wsService.send({ cmd: "GetBeaconList" });
      }
    });

    const timer = setInterval(() => {
      setCurrentTime(new Date().toLocaleTimeString());
    }, 1000);

    return () => {
      off();
      clearInterval(timer);
    };
  }, []);

  const renderWsStatusTag = () => {
    let color: "default" | "success" | "error" | "processing" = "default";
    let text = "";

    switch (wsStatus) {
      case "connecting":
        color = "processing";
        text = "WS 连接中";
        break;
      case "connected":
        color = "success";
        text = "WS 已连接";
        break;
      case "disconnected":
        color = "error";
        text = "WS 未连接";
        break;
      default:
        text = "WS 未知";
    }

    return <Tag color={color}>{text}</Tag>;
  };

  return (
    <div style={{ paddingTop: 70, minHeight: "100vh", background: "#f5f5f5" }}>
      <div
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          width: "100%",
          height: 60,
          background: "#001529",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 20px",
          color: "#fff",
          zIndex: 1000,
        }}
      >
        <div style={{ fontSize: 18, fontWeight: "bold" }}>
          桌椅蓝牙定位
        </div>

        <div
          style={{
            position: "absolute",
            left: "50%",
            transform: "translateX(-50%)",
          }}
        >
          <Space>
            <Button
              type={activeView === "RealtimeData" ? "primary" : "default"}
              onClick={() => setActiveView("RealtimeData")}
            >
              画面一：实时数据
            </Button>

            <Button
              type={activeView === "MapsManager" ? "primary" : "default"}
              onClick={() => setActiveView("MapsManager")}
            >
              画面二：地图管理
            </Button>

            <Button
              type={activeView === "LocationView" ? "primary" : "default"}
              onClick={() => setActiveView("LocationView")}
            >
              画面三：定位显示
            </Button>
          </Space>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {renderWsStatusTag()}
          <div>{currentTime}</div>
        </div>
      </div>

      <div>
        {activeView === "RealtimeData" && <RealtimeData />}
        {activeView === "MapsManager" && <MapsManager />}
        {activeView === "LocationView" && <LocationView />}
      </div>
    </div>
  );
};

export default App;
