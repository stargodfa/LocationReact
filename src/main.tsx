// main.tsx
// import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'

// Ant Design 样式
import 'antd/dist/reset.css'
import './index.css'

import Environment from './lib/env/Environment'
import services from './service-config/service-info'
import { getServiceSync } from '@spring4js/container-browser'
import IWorkbenchService from './service-api/IWorkbenchService'
import EService from './service-config/EService'

const workbenchService = getServiceSync<IWorkbenchService>(EService.IWorkbenchService)

async function init() {

  /**
   * 1. 创建 Environment，并注册所有服务
   *    这一步会把 services 映射写入 ServiceRegistry
   */
  const env = new Environment({
    services: services,
  })

  /**
   * 2. 执行 Environment.init()
   *    可用于异步加载配置（当前为空）
   */
  await env.init()

  /**
   * 3. 挂载 Environment 到 window._szGlobal.environment
   *    以后 getGEnvironmentSync() 也能访问
   */
  env.setToGlobal()

  /**
   * 4. Environment 已经完成注册，现在才能安全获取服务实例
   *    之前放在文件顶部获取是错误的，因为当时 registry 还没创建
   */


  /**
   * 5. 启动工作台服务（整个应用的初始化入口）
   */
  await workbenchService.start()

  /**
   * 6. 渲染 React App
   */
  ReactDOM.createRoot(document.getElementById('root')!).render(
    <App />
  )
}

init()
