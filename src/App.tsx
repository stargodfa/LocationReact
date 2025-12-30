/**
 * src/App.tsx
 *
 * 文件职责：
 * - 作为应用的“顶层 UI 容器”。
 * - 提供一个固定顶部栏，允许切换 3 个页面（RealtimeData / MapsManager / LocationView）。
 * - 在顶层启动 WebSocketService，订阅连接状态并在“连接成功”后发送一次初始化请求。
 * - 显示当前时间与 WebSocket 状态 Tag。
 *
 * 数据流总览：
 * 1) UI 交互：Button 点击 -> setActiveView() -> render 具体 View 组件
 * 2) 时间流：setInterval -> setCurrentTime() -> 顶部栏显示
 * 3) WS 流：
 *    Environment 已注册服务 -> getServiceSync(IWebSocketService) -> wsService.start()
 *    wsService.subscribe(status => setWsStatus(status))
 *    status === "connected" -> wsService.send(初始化命令) -> 服务端返回数据 -> 其他 service 处理 -> 各 view 展示
 */

import React, { useState, useEffect } from "react";
import { Button, Space, Tag } from "antd";

/**
 * 三个页面组件（视图层）
 * - RealtimeData：展示 WebSocket 推送的原始 BLE 数据或解析后的实时表
 * - MapsManager：地图/锚点/比例尺等配置管理
 * - LocationView：定位结果展示（可能是 2D/3D 地图叠加坐标）
 *
 * 数据来源：
 * - 它们通常不会直接从 App 接收业务数据（这里没有 props）
 * - 它们内部会从各自的 service 订阅状态或拉取数据
 */
import RealtimeData from "./views/realtime-data/RealtimeData";
import MapsManager from "./views/maps-manager/MapsManager";
import LocationView from "./views/location-view/LocationView";

/**
 * IoC 容器获取 service 的工具。
 * 数据来源：@spring4js/container-browser（你项目的依赖）
 * 用途：按 EService key 同步获取某个 service 的单例实例
 * 流向：在 useEffect 中获取 IWebSocketService 并调用其方法
 */
import { getServiceSync } from "@spring4js/container-browser";

/**
 * IWebSocketService：WebSocket 服务接口
 * - start()：启动连接（内部可能创建 WebSocket，设置回调，重连策略等）
 * - subscribe(cb)：订阅“连接状态”变化（connecting/connected/disconnected 等）
 * - send(msg)：向服务端发送命令（这里发送 GetMapList/GetMapScale/GetBeaconList）
 *
 * WSStatus：连接状态类型
 * - 数据来源：IWebSocketService.ts 内定义的 union type 或 enum
 * - 用途：限制 wsStatus 只能取合法值
 */
import IWebSocketService, { WSStatus } from "./service-api/IWebSocketService";

/**
 * EService：服务标识枚举
 * - 数据来源：./service-config/EService.ts
 * - 用途：作为 IoC 容器里的 key
 * - 流向：getServiceSync(EService.IWebSocketService) -> 返回 WS service 实例
 */
import EService from "./service-config/EService";

/**
 * App 组件
 * - React.FC：函数式组件类型标注（可选）
 */
const App: React.FC = () => {
  /**
   * activeView：当前显示哪个页面
   * - 类型：string（实际约束为 3 个值：RealtimeData/MapsManager/LocationView）
   * - 数据来源：初始化写死为 "MapsManager"
   * - 用途：决定渲染哪个 view 组件、哪个按钮高亮
   * - 流向：render 时的条件渲染 + Button type
   */
  const [activeView, setActiveView] = useState<string>("MapsManager");

  /**
   * currentTime：顶部栏显示的当前时间字符串
   * - 类型：string
   * - 数据来源：new Date().toLocaleTimeString()（浏览器本地时间）
   * - 用途：顶部栏展示“当前时刻”，用于调试或操作提示
   * - 流向：render 顶部栏右侧 <div>{currentTime}</div>
   */
  const [currentTime, setCurrentTime] = useState<string>(
    new Date().toLocaleTimeString()
  );

  /**
   * wsStatus：WebSocket 连接状态
   * - 类型：WSStatus（由 IWebSocketService 导出）
   * - 数据来源：初始值手工设为 "disconnected"
   * - 更新来源：wsService.subscribe 回调里的 status s
   * - 用途：
   *   1) 顶部栏 Tag 显示连接状态
   *   2) 当状态变为 "connected" 时触发一次初始化命令发送
   * - 流向：renderWsStatusTag() 的 switch
   */
  const [wsStatus, setWsStatus] = useState<WSStatus>("disconnected");

  /**
   * useEffect（只执行一次）
   * 触发条件：依赖数组是 []，表示组件首次挂载后执行，卸载时清理
   *
   * 在这里做两类“全局副作用”：
   * 1) 启动 WebSocketService 并订阅状态
   * 2) 启动一个 1 秒定时器更新时间显示
   */
  useEffect(() => {
    /**
     * wsService：WebSocket 服务实例（单例）
     * - 数据来源：IoC 容器（前面 main.tsx 里的 Environment 注册）
     * - 用途：统一管理 WebSocket 连接和消息发送
     * - 流向：
     *   wsService.start() 启动连接
     *   wsService.subscribe() 订阅状态
     *   wsService.send() 发送初始化命令
     */
    const wsService = getServiceSync<IWebSocketService>(
      EService.IWebSocketService
    );

    /**
     * 启动 WebSocket
     * - 典型内部行为（根据常见实现推断）：
     *   创建 WebSocket 实例 -> 设置 onopen/onmessage/onclose/onerror -> 维护状态 -> 可选重连
     * - 数据流：start() -> 连接状态变化 -> subscribe 回调 -> setWsStatus
     */
    // wsService.start();这里注释掉，避免重复启动连接

    /**
     * off：取消订阅函数（unsubscribe）
     * - 数据来源：wsService.subscribe() 的返回值
     * - 用途：组件卸载时释放监听，避免内存泄漏与重复订阅
     * - 流向：return cleanup 中执行 off()
     *
     * subscribe 回调参数 s：
     * - 类型：WSStatus
     * - 数据来源：WebSocketService 内部状态机
     * - 用途：驱动 UI 展示 + 驱动“连接后初始化请求”
     */
    const off = wsService.subscribe((s) => {
      /**
       * 更新 React 状态，触发 App 重新渲染，顶部 Tag 变化。
       * 数据流：s -> setWsStatus(s) -> wsStatus -> renderWsStatusTag()
       */
      setWsStatus(s);

      /**
       * 连接建立后发送初始化命令（仅在状态进入 connected 时触发）
       *
       * 注意这里的“仅发送一次”是基于注释意图，但实现上仍可能重复：
       * - 如果服务内部断线重连，状态会再次变成 connected，这里会再次发送。
       * - 是否允许重发取决于业务需求。
       *
       * send 的数据来源：
       * - 这里构造的是命令对象 { cmd: "GetMapList" } 等
       * - 最终由 wsService.send(...) 序列化为字符串并通过 WebSocket 发给服务端（推断）
       *
       * 预期服务端返回的数据流（按你项目域推断）：
       * - GetMapList -> 返回地图列表 -> MapService/MapConfigService/BeaconListService 等更新状态 -> MapsManager 展示
       * - GetMapScale -> 返回比例尺/缩放参数 -> MapConfigService 更新 -> 地图渲染用
       * - GetBeaconList -> 返回锚点/Beacon 列表 -> BeaconListService 更新 -> 地图管理/定位显示用
       */
      if (s === "connected") {
        wsService.send({ cmd: "GetMapList" });
        wsService.send({ cmd: "GetMapScale" });
        wsService.send({ cmd: "GetBeaconList" });
      }
    });

    /**
     * timer：定时器句柄
     * - 数据来源：setInterval 返回值（number）
     * - 用途：每秒更新 currentTime
     * - 流向：cleanup 时 clearInterval(timer)
     */
    const timer = setInterval(() => {
      /**
       * 每秒取一次本地时间字符串
       * 数据来源：浏览器系统时间 new Date()
       * 用途：展示
       * 流向：setCurrentTime -> render 顶部栏
       */
      setCurrentTime(new Date().toLocaleTimeString());
    }, 1000);

    /**
     * cleanup：组件卸载时执行
     * - off()：取消 wsStatus 订阅
     * - clearInterval：停止计时器，避免组件卸载后仍在 setState
     *
     * 注意：
     * - 这里没有 wsService.stop()/close()，说明 WS 连接生命周期可能由 service 自己管理，
     *   或设计上 WS 应贯穿应用整个生命周期，不随 App 卸载（通常 App 不会卸载）。
     */
    return () => {
      off();
      clearInterval(timer);
    };
  }, []);

  /**
   * renderWsStatusTag：
   * - 用途：把 wsStatus 映射成 antd Tag 的颜色和显示文案
   * - 数据来源：wsStatus（React state）
   * - 流向：JSX 顶部栏右侧 {renderWsStatusTag()}
   */
  const renderWsStatusTag = () => {
    /**
     * color：Tag 颜色枚举
     * - 数据来源：根据 wsStatus 的 switch 赋值
     * - 用途：视觉反馈连接状态
     */
    let color: "default" | "success" | "error" | "processing" = "default";

    /**
     * text：Tag 显示文本
     * - 数据来源：根据 wsStatus 的 switch 赋值
     * - 用途：告诉用户当前 WS 状态
     */
    let text = "";

    /**
     * switch(wsStatus)：
     * - 数据来源：wsStatus 由 wsService.subscribe 更新
     * - 用途：状态 -> UI 表达
     */
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

    /** 输出 Tag 组件 */
    return <Tag color={color}>{text}</Tag>;
  };

  /**
   * JSX 布局：
   * - 外层 div：留出顶部栏高度 paddingTop:70，避免内容被 fixed 顶栏遮挡
   * - 顶部栏：position:fixed 固定在页面顶部
   * - 中间按钮组：切换 activeView
   * - 右侧：显示 WS 状态 + 时间
   * - 页面内容：按 activeView 条件渲染对应组件
   */
  return (
    <div style={{ paddingTop: 70, minHeight: "100vh", background: "#f5f5f5" }}>
      {/* 顶部栏（固定） */}
      <div
        style={{
          position: "fixed", // 固定定位，不随页面滚动
          top: 0,
          left: 0,
          width: "100%", // 覆盖全宽
          height: 60, // 顶栏高度
          background: "#001529", // 深色背景（类似 antd Layout Header）
          display: "flex",
          alignItems: "center", // 垂直居中
          justifyContent: "space-between", // 左右两端分布
          padding: "0 20px", // 左右内边距
          color: "#fff", // 顶栏文字颜色
          zIndex: 1000, // 保证盖在页面内容之上
        }}
      >
        {/* 左侧标题（静态文案） */}
        <div style={{ fontSize: 18, fontWeight: "bold" }}>桌椅蓝牙定位</div>

        {/* 中间：视图切换按钮组 */}
        <div
          style={{
            position: "absolute", // 绝对定位到顶栏中间
            left: "50%",
            transform: "translateX(-50%)",
          }}
        >
          <Space>
            {/* RealtimeData 按钮：
                - 点击：setActiveView("RealtimeData") -> activeView 更新 -> 重新渲染 -> 显示 RealtimeData 组件
                - type：当前激活则 primary，否则 default
             */}
            <Button
              type={activeView === "RealtimeData" ? "primary" : "default"}
              onClick={() => setActiveView("RealtimeData")}
            >
              画面一：实时数据
            </Button>

            {/* MapsManager 按钮 */}
            <Button
              type={activeView === "MapsManager" ? "primary" : "default"}
              onClick={() => setActiveView("MapsManager")}
            >
              画面二：地图管理
            </Button>

            {/* LocationView 按钮 */}
            <Button
              type={activeView === "LocationView" ? "primary" : "default"}
              onClick={() => setActiveView("LocationView")}
            >
              画面三：定位显示
            </Button>
          </Space>
        </div>

        {/* 右侧：WS 状态 + 当前时间 */}
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {/* renderWsStatusTag：
              数据来源：wsStatus（由 wsService.subscribe 更新）
              用途：显示连接状态
           */}
          {renderWsStatusTag()}

          {/* currentTime：
              数据来源：setInterval 每秒更新
              用途：显示当前时间
           */}
          <div>{currentTime}</div>
        </div>
      </div>

      {/* 页面内容区域：
          - 根据 activeView 条件渲染
          - 组件内部自行从 service 获取数据
       */}
      <div>
        {activeView === "RealtimeData" && <RealtimeData />}
        {activeView === "MapsManager" && <MapsManager />}
        {activeView === "LocationView" && <LocationView />}
      </div>
    </div>
  );
};

export default App;
