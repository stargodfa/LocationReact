import React, { useState, useEffect } from "react";
import { Button, Space, Tag } from "antd";
import RealtimeData from "./views/realtime-data/RealtimeData";
import MapsManager from "./views/maps-manager/MapsManager";
import LocationView from "./views/location-view/LocationView";

import { getServiceSync } from "@spring4js/container-browser";
import IWebSocketService, {
  WSStatus,
} from "./service-api/IWebSocketService";
import EService from "./service-config/EService";

const App: React.FC = () => {
  const [activeView, setActiveView] = useState<string>("MapsManager");
  const [currentTime, setCurrentTime] = useState<string>(
    new Date().toLocaleTimeString()
  );
  const [wsStatus, setWsStatus] = useState<WSStatus>("disconnected");

  useEffect(() => {
    const wsService = getServiceSync<IWebSocketService>(
      EService.IWebSocketService
    );

    wsService.start();

    // 订阅 WS 状态
    const off = wsService.subscribe((s) => {
      setWsStatus(s);

      // ⚠️ 只在「已连接」时发送一次
      if (s === "connected") {
        wsService.send({ cmd: "GetMapList" });
        wsService.send({ cmd: "GetMapScale" });
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
      {/* 顶部栏 */}
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

      {/* 页面内容 */}
      <div>
        {activeView === "RealtimeData" && <RealtimeData />}
        {activeView === "MapsManager" && <MapsManager />}
        {activeView === "LocationView" && <LocationView />}
      </div>
    </div>
  );
};

export default App;
