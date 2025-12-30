// src/main.tsx
/**
 * 入口文件职责：
 * 1) 加载全局样式（Ant Design reset + 项目 index.css）。
 * 2) 构建并初始化运行环境 Environment（负责创建/初始化 IoC 容器与服务注册表）。
 * 3) 从 IoC 容器获取“工作台服务” WorkbenchService，并调用 start() 启动全局业务。
 * 4) 挂载 React 根组件 App 到 DOM 的 #root。
 *
 * 数据流概览：
 * services(service-info.ts) -> Environment(注册到容器/registry) -> getServiceSync(从容器取服务实例)
 * -> workbenchService.start()(初始化业务状态/订阅 WebSocket 等) -> ReactDOM.createRoot().render(<App />)
 */

// React 18 的 ReactDOM Root API
// 只负责“把 React 组件树渲染到某个 DOM 节点”，不包含业务初始化逻辑
import ReactDOM from "react-dom/client";

// 应用根组件。UI 从这里开始。
// App 内部会渲染各个 views，并通过 service 获取状态
import App from "./App";

/**
 * 样式导入（纯副作用 side-effect import）
 * - antd/dist/reset.css：Ant Design v5 的基础 reset，统一浏览器默认样式差异
 * - ./index.css：项目自己的全局 CSS（字体、背景、布局等）
 *
 * 这些导入不会导出变量，只是让打包器把 CSS 注入到最终页面
 */
import "antd/dist/reset.css";
import "./index.css";

/**
 * Environment：你项目自定义的运行环境封装
 * 典型职责（从你的注释推断）：
 * - 创建 ServiceRegistry / IoC 容器
 * - 按配置注册 service（接口 -> 实现）
 * - 提供 init() 进行异步初始化
 * - 提供 setToGlobal() 将 env 暴露到 window，全局可访问（调试或兼容旧代码）
 */
import Environment from "./lib/env/Environment";

/**
 * services：服务注册表配置（通常是一组 service 描述）
 * 数据来源：./service-config/service-info.ts
 * 用途：喂给 Environment，让其把服务映射写入 ServiceRegistry（IoC 容器）
 * 流向：Environment({ services }) -> registry/container
 */
import services from "./service-config/service-info";

/**
 * getServiceSync：从 @spring4js/container-browser 的 IoC 容器中“同步获取”服务实例
 * 注意：它依赖容器已创建且服务已注册，所以必须在 Environment 完成注册后再调用
 */
import { getServiceSync } from "@spring4js/container-browser";

/**
 * IWorkbenchService：工作台服务接口（应用级启动入口）
 * 一般负责：
 * - 启动全局数据流（如 WebSocket 连接、定时任务）
 * - 初始化 store/state
 * - 加载必要配置/地图/设备列表等（如果你的业务需要）
 */
import IWorkbenchService from "./service-api/IWorkbenchService";

/**
 * EService：服务标识枚举
 * 数据来源：./service-config/EService.ts
 * 用途：作为容器里服务的 key
 * 流向：getServiceSync(EService.IWorkbenchService) -> 返回对应实现类实例
 */
import EService from "./service-config/EService";

/**
 * init：整个应用启动链路
 * - 这里使用 async，是为了确保“环境初始化”和“业务启动”完成后再渲染 UI
 * - 这样 App 渲染时，service 状态更完整，避免一开始大量 undefined/空状态闪烁
 */
async function init() {
  /**
   * 1) 创建 Environment 实例
   *
   * 变量 env：
   * - 类型：Environment
   * - 数据来自：new Environment({ services })
   * - 用途：持有/管理服务注册表与初始化流程
   * - 流向：后续调用 env.init()、env.setToGlobal()
   *
   * 参数 services：
   * - 数据来自：./service-config/service-info.ts
   * - 用途：告诉 env “有哪些 service 需要注册到容器”
   * - 流向：Environment 内部写入 ServiceRegistry / IoC container
   */
  const env = new Environment({
    services: services,
  });

  /**
   * 2) 执行 env.init()
   *
   * 这里通常用于：
   * - 异步加载远端配置
   * - 读取本地缓存
   * - 做运行时能力检测
   *
   * 当前你的注释写“为空”，但仍保留 await：
   * - 好处：后续加异步初始化时不需要改 main.tsx 调用链
   */
  await env.init();

  /**
   * 3) 将 env 暴露到全局
   *
   * 数据流：
   * env -> window._szGlobal.environment（按你注释）
   *
   * 用途：
   * - 调试时在控制台访问 environment
   * - 兼容某些工具函数（如 getGEnvironmentSync()）直接取全局 env
   *
   * 风险提示（仅说明事实）：
   * - 全局暴露会增加耦合与“暗依赖”，但对调试很方便
   */
  env.setToGlobal();

  /**
   * 4) 从容器获取 WorkbenchService
   *
   * 关键点：
   * - 必须在 env 完成服务注册后再 getServiceSync
   * - 否则容器/registry 尚未创建，会取不到服务或抛错
   *
   * 变量 workbenchService：
   * - 类型：IWorkbenchService（实际是某个实现类实例）
   * - 数据来源：IoC 容器（由 Environment 注册 services 后生成）
   * - 用途：作为应用业务启动入口
   * - 流向：调用 workbenchService.start() 触发业务初始化
   */
  const workbenchService = getServiceSync<IWorkbenchService>(
    EService.IWorkbenchService
  );

  /**
   * 5) 启动工作台服务
   *
   * 数据流：
   * workbenchService.start() ->（内部）初始化状态/订阅数据源/连接 WebSocket/加载配置...
   *
   * 用途：
   * - 确保 UI 渲染前，全局核心能力已就绪（至少已经开始启动）
   */
  await workbenchService.start();

  /**
   * 6) 渲染 React App
   *
   * document.getElementById('root')：
   * - 数据来源：index.html 里的 <div id="root"></div>
   * - 用途：作为 React 组件树挂载点
   * - 流向：createRoot(rootEl).render(<App />)
   *
   * 非空断言 (!)：
   * - 告诉 TS “root 一定存在”
   * - 如果 index.html 没有 #root，运行时会报错
   */
  const rootEl = document.getElementById("root")!;
  ReactDOM.createRoot(rootEl).render(<App />);
}

// 触发启动
// 入口执行流：main.tsx 加载 -> 调用 init() -> 完成 env + service 启动 -> render
init();
