结构清晰。下面按目录说明用途和使用方式。无情绪描述。

## 项目根目录

* **index.html**
  单页应用入口。Vite 在这里注入打包脚本。

* **package.json**
  项目依赖与脚本。`npm run dev` 启动开发，`npm run build` 打包。

* **vite.config.ts**
  前端构建配置。处理路径别名、静态资源、DevServer 等。

* **tsconfig*.json**
  TypeScript 配置，定义类型检查范围。

* **public/**
  静态资源目录。文件按原路径发布，不经构建处理。
  你这里存放地图图像 `public/maps/…`。

## src 目录（核心代码）

Vite 的默认源码入口。

### 1. **src/main.tsx**

渲染根组件 `<App />`。项目的启动文件。

### 2. **src/App.tsx**

应用全局布局与路由（如果使用 react-router）。控制“进入哪个页面显示哪个 View”。

---

## 视图层：src/views/

每个页面独立组件

### **views/realtime-data/**

* **RealtimeData.tsx**
  页面 1：实时 BLE 数据表。绑定 WebSocket 输出，渲染列表。

### **views/maps-manager/**

* **MapsManager.tsx**
  页面 2：地图管理。负责地图选择、锚点管理、坐标录入。

### **views/location-view/**

* **LocationView.tsx**
  页面 3：定位展示。显示实时坐标，画点。

使用方式：

```tsx
import LocationView from "./views/location-view/LocationView";
```

---

## WebSocket：src/api/

### **WebSocketClient.tsx**

集中封装 WebSocket 连接、重连、消息广播等逻辑。

优势：

* 页面不需要自己处理底层连接
* 可多处复用
* 拆分通讯层与 UI 层

---

## 服务层：src/service-api / src/service-impl

面向接口设计。

### service-api/

* **IBluetoothDataService.ts**
* **IWorkbenchService.ts**

定义抽象接口，约束服务功能。

### service-impl/

* **BluetoothDataService.ts**
* **WorkbenchService.ts**

接口的具体实现。数据处理逻辑放这里。

优势：

* UI 与业务彻底解耦
* 测试简单
* 替换实现不影响界面

---

## lib：环境与基础服务

### **lib/env/**

* **Environment.ts**
  提供环境变量、服务器地址等。

* **global-fn.ts**
  全局辅助函数。

### **lib/service/**

* **StateBase.ts**
  通用状态类。Page 之间共享状态可继承此类。

优势：
抽象共性，减少重复代码。

---

## assets

图标或固定资源，如 `react.svg`。

---

# 架构优势总结

1. **清晰的分层**

   * 视图（views）
   * 服务 API（service-api）
   * 服务实现（service-impl）
   * 基础工具（lib）
   * 通讯层（api/WebSocketClient）

2. **逻辑隔离**
   UI 与业务不限绑定，可单独替换。

3. **可扩展性强**
   新增页面只需在 views 下放置一个组件。

4. **Vite 构建速度快**
   静态资源按 public 发布，热更新快。

5. **TypeScript 接口驱动**
   降低错误，增强自动补全。

6. **WebSocket 独立模块**
   易测试、易维护，可被多个页面订阅。

你现在已经具备：
**前端 View 层 → 统一 WebSocket 通道 → 抽象服务层 → 地图资源层**
这是企业级项目常用的标准组件化结构。

需要我画一张架构图或给出“新增一个页面”的示例流程吗。
