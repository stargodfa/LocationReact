import { ServiceRegistry, setServiceRegistry } from "@spring4js/container-browser";

/** Environment 需要的构造参数 */
export interface IOptions {
    /** 需要注册到容器中的服务集合，格式：{ 服务名: 实例 } */
    services: Record<string, any>
}

/** 环境容器。负责集中管理所有服务实例并挂载到全局 */
export default class Environment {
    private options: IOptions
    private serviceRegistry: ServiceRegistry

    constructor(options: IOptions) {
        this.options = options

        /** 创建一个新的服务注册中心 */
        this.serviceRegistry = new ServiceRegistry()
        
        /** 批量注册传入的所有服务 */
        this.serviceRegistry.registerServiceBatch(options.services)

        /** 把注册中心设置为 spring4js 的全局容器 */
        setServiceRegistry(this.serviceRegistry)
    }

    /** 预留的初始化函数。可执行异步配置读取或后台获取参数 */
    async init(): Promise<void> {
        // 当前无实现
    }

    /** 获取容器中的服务 */
    getService<T>(name: string): T {
        return this.serviceRegistry.getService<T>(name)
    }

    /** 将 Environment 实例挂载到浏览器全局变量 window._szGlobal 方便调试 */
    setToGlobal() {
        ;(window as any)._szGlobal = (window as any)._szGlobal || {}
        const _szGlobal = (window as any)._szGlobal
        _szGlobal.environment = this
    }
}
