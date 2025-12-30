```
my-web/
├─ eslint.config.js
├─ node_modules/
├─ package-lock.json
├─ package.json
├─ README.md
├─ tsconfig.app.json
├─ tsconfig.node.json
├─ tsconfig.json
├─ vite.config.ts
├─ index.html
├─ public/
│  └─ vite.svg
└─ src/
   ├─ App.css
   ├─ App.tsx
   ├─ assets/
   ├─ index.css
   ├─ main.tsx
   └─ pages/
```

---

## 根目录文件说明

1. **`package.json`**

   * 项目的核心配置文件，记录项目名称、版本、依赖包、开发/构建脚本等。
   * 例子：

     ```json
     {
       "name": "my-web",
       "version": "0.0.0",
       "scripts": {
         "dev": "vite",
         "build": "vite build",
         "preview": "vite preview"
       },
       "dependencies": {
         "react": "^18.0.0",
         "react-dom": "^18.0.0",
         "antd": "^5.0.0"
       }
     }
     ```

2. **`package-lock.json`**

   * 记录了具体的依赖版本，保证不同机器安装的一致性。

3. **`node_modules/`**

   * 存放所有安装的 npm 包。

4. **`vite.config.ts`**

   * Vite 的配置文件，用于配置开发服务器、代理、构建优化等。

5. **`index.html`**

   * 项目的入口 HTML 文件。
   * Vite 会在开发时自动注入打包后的 JS 文件，例如 `main.tsx`。

6. **`eslint.config.js`**

   * ESLint 配置文件，用于定义代码风格检查规则。

7. **`tsconfig.json`** / **`tsconfig.app.json`** / **`tsconfig.node.json`**

   * TypeScript 配置文件，指定编译选项和包含/排除的目录。
   * `tsconfig.app.json` 一般用于应用代码，`tsconfig.node.json` 用于 Node 环境或脚本。

8. **`README.md`**

   * 项目说明文档。

---

## `public/` 目录

* 静态资源目录，存放不会被打包处理的文件，比如图标、favicon、静态图片等。
* `vite.svg` 是默认的 Vite logo，用于示例。

---

## `src/` 目录

这是前端代码的主目录。

1. **`main.tsx`**

   * React 入口文件，将 `App.tsx` 挂载到 HTML 中的 `#root` 节点。
   * 示例：

     ```ts
     import React from "react";
     import ReactDOM from "react-dom/client";
     import App from "./App";
     import "./index.css";

     ReactDOM.createRoot(document.getElementById("root")!).render(
       <React.StrictMode>
         <App />
       </React.StrictMode>
     );
     ```

2. **`App.tsx`**

   * 主组件文件，负责渲染页面的核心 UI。
   * 你之前写的 `WebSocketClient` 和 Ant Design 测试卡片都放在这里。

3. **`App.css`**

   * `App.tsx` 对应的样式文件。

4. **`index.css`**

   * 全局样式文件，通常用来重置样式或设置全局字体、颜色等。

5. **`assets/`**

   * 用来存放图片、图标、字体等前端资源，Vite 会在构建时处理这些文件。

6. **`pages/`**

   * 存放业务页面或组件，例如你写的 `WebSocketClient.tsx` 就在这里。
   * 方便项目结构清晰，后续可以放更多页面组件。

---

## 项目启动和运行

1. 安装依赖：

```bash
npm install
```

2. 启动开发服务器：

```bash
npm run dev
```

3. 默认访问：

```
http://localhost:5173
```

---

简而言之：

* **根目录**：配置 + npm 依赖
* **public/**：静态资源，不被打包
* **src/**：前端应用代码（入口 `main.tsx` → 主组件 `App.tsx` → 页面组件 `pages/` + 样式 `*.css` + 资源 `assets/`）

