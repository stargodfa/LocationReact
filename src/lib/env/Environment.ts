/**
 * src/lib/env/Environment.ts
 *
 * Environment 的职责：
 * - 创建并持有一个 ServiceRegistry（spring4js 的服务注册中心）
 * - 把 service-info.ts 提供的 services 映射表一次性注册进 registry
 * - 将该 registry 设置为 spring4js 的“全局容器”（setServiceRegistry）
 * - （可选）提供 init() 做异步初始化
 * - （可选）把 Environment 实例挂到 window._szGlobal.environment 供调试读取
 *
 * 在当前工程中的数据流位置（启动链路）：
 * main.tsx
 *   -> new Environment({ services })              // 1) 创建 registry 并注册所有服务
 *   -> await env.init()                           // 2) 预留：异步初始化
 *   -> env.setToGlobal()                          // 3) window._szGlobal.environment = env
 *   -> getServiceSync(...) 开始安全可用           // 4) 全局 registry 已设定
 *
 * 关键事实：
 * - ServiceRegistry 在构造函数里立刻 register + setServiceRegistry。
 * - 这意味着 Environment 一旦 new 出来，getServiceSync 就会指向这套 registry。
 * - 如果有多个 Environment 实例，后创建的会覆盖全局 registry（全局单例语义）。
 */

import { ServiceRegistry, setServiceRegistry } from "@spring4js/container-browser";

/**
 * IOptions：
 * - Environment 构造参数类型
 * - services：
 *   - 数据来源：src/service-config/service-info.ts export default services
 *   - 结构：Record<string, any>，key 是服务名（EService 枚举值），value 是 service 单例实例
 *   - 流向：serviceRegistry.registerServiceBatch(services) 写入容器
 */
export interface IOptions {
  /** 需要注册到容器中的服务集合，格式：{ 服务名: 实例 } */
  services: Record<string, any>;
}

/**
 * Environment：
 * - 作为“服务容器的包装器”，把 IoC 注册中心的创建、批量注册、全局挂载集中到一个地方
 */
export default class Environment {
  /**
   * options：
   * - 数据来源：new Environment(options) 传入
   * - 用途：保存构造参数（目前只用到 services）
   * - 流向：主要用于构造阶段 registerServiceBatch
   */
  private options: IOptions;

  /**
   * serviceRegistry：
   * - 数据来源：new ServiceRegistry()
   * - 用途：作为当前 Environment 的注册中心实例
   * - 流向：
   *   - getService(name) 从这里取服务
   *   - setServiceRegistry(this.serviceRegistry) 把它设为 spring4js 全局容器
   */
  private serviceRegistry: ServiceRegistry;

  /**
   * constructor(options)
   *
   * 步骤与数据流：
   * 1) 保存 options
   * 2) 创建新的 ServiceRegistry（独立容器实例）
   * 3) 批量注册所有服务实例（options.services）
   * 4) 将该 registry 设为 spring4js 全局 registry（影响 getServiceSync 的返回）
   *
   * 关键事实：
   * - registerServiceBatch 注册的是“实例”，因此所有 service 都是单例对象。
   * - 这些实例在 service-info.ts 中已经 new 出来，Environment 这里只是登记引用。
   */
  constructor(options: IOptions) {
    this.options = options;

    /** 创建一个新的服务注册中心 */
    this.serviceRegistry = new ServiceRegistry();

    /** 批量注册传入的所有服务 */
    this.serviceRegistry.registerServiceBatch(options.services);

    /** 把注册中心设置为 spring4js 的全局容器 */
    setServiceRegistry(this.serviceRegistry);
  }

  /**
   * init：
   * - 预留的异步初始化入口
   * - 当前无实现
   *
   * 典型可放内容（说明数据流，不代表你现在有）：
   * - 拉取配置文件
   * - 读取本地缓存
   * - 预请求后端基础数据（地图列表/比例/Beacon 列表等）
   *
   * 注意（事实）：
   * - 你现在 main.tsx `await env.init()` 实际不会等待任何网络/IO。
   */
  async init(): Promise<void> {
    // 当前无实现
  }

  /**
   * getService<T>(name)
   * - 输入：name（服务名字符串，通常是 EService.xxx 的 value）
   * - 数据来源：调用方
   * - 用途：从本 Environment 的 serviceRegistry 获取服务实例
   * - 流向：返回给调用方
   *
   * 与 getServiceSync 的关系（事实）：
   * - getServiceSync 走的是“全局 registry”
   * - getService(name) 走的是“当前 Environment 实例的 registry”
   * - 这两者在你只创建一个 Environment 时等价
   */
  getService<T>(name: string): T {
    return this.serviceRegistry.getService<T>(name);
  }

  /**
   * setToGlobal：
   * - 用途：把 Environment 实例挂载到 window._szGlobal.environment
   * - 数据来源：this（当前 Environment）
   * - 流向：window 全局变量（方便在浏览器控制台调试）
   *
   * 数据结构：
   * window._szGlobal = window._szGlobal || {}
   * window._szGlobal.environment = this
   *
   * 注意（事实）：
   * - 这是调试便利手段，不是 spring4js 的必须步骤。
   * - 安全性：生产环境暴露全局对象可能增加被篡改风险（取决于威胁模型）。
   */
  setToGlobal() {
    (window as any)._szGlobal = (window as any)._szGlobal || {};
    const _szGlobal = (window as any)._szGlobal;
    _szGlobal.environment = this;
  }
}
