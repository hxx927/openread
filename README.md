# OpenRead · 摸鱼阅读

> 一个 **网页浏览 + 本地电子书阅读** 二合一的桌面工具。灵感来自「墨鱼阅读」,但**完全用开源组件从零实现**,不含任何闭源代码,MIT 开源。

<p align="center"><i>EPUB / MOBI / AZW3 / FB2 / CBZ / PDF / TXT 阅读器 · 多标签内嵌浏览器 · AI 网站聚合 · 透明摸鱼 / 老板键 / 防截图</i></p>

---

## ✨ 功能

- 📚 **本地阅读器**
  - EPUB / MOBI / AZW3 / FB2 / CBZ —— 基于 [foliate-js](https://github.com/johnfactotum/foliate-js)
  - PDF —— 基于 [pdf.js](https://github.com/mozilla/pdf.js)
  - TXT —— 自动识别 UTF-8 / GB18030(中文)
  - 书架、阅读进度记忆、目录跳转、字号 / 行距 / 主题(明亮 / 护眼 / 暗黑)
- 🌐 **内嵌多标签浏览器**(Electron `<webview>`)
  - 标签、地址栏、前进 / 后退 / 刷新、快捷站点;登录状态持久保留
- 🤖 **AI 面板**:内嵌豆包 / DeepSeek / Kimi / 元宝 / 智谱官方网站(登录即用,本应用不代理、不经手任何 API Key)
- 🫥 **摸鱼 / 隐蔽**(纯 Electron 原生能力)
  - 窗口透明度、窗口置顶、**防截图录屏**(`setContentProtection`)、**老板键** `Ctrl+Shift+X` 一键显隐

## 🖼️ 界面

左侧竖排导航:**书架 / 浏览 / AI**,底部常驻**摸鱼工具条**。无边框深色窗口。

## 🚀 下载使用

- **普通用户**:到 [Releases](../../releases) 下载 `openread-x.y.z-setup.exe`(安装版)或 `openread-x.y.z-portable.exe`(免安装便携版)。
- 安装包由 GitHub Actions 自动构建(见 `.github/workflows/release.yml`):推送 `v*` 标签即出一份 Release。

## 🛠️ 自己构建

前置:Node ≥ 20、[pnpm](https://pnpm.io) ≥ 10。

```bash
pnpm install
pnpm dev            # 开发模式(热更新)
pnpm build:win      # 打包 Windows(安装包 + 便携版,产物在 dist/)
pnpm build:mac      # 打包 macOS
pnpm build:linux    # 打包 Linux
```

发布新版本:改 `package.json` 的 `version` → `git tag v0.1.0` → `git push --tags`,CI 自动出 Release。

> 磁盘小可把缓存挪到别的盘:设环境变量 `ELECTRON_CACHE` / `ELECTRON_BUILDER_CACHE` / `NPM_CONFIG_CACHE`,并 `pnpm config set store-dir <path>`。开发期本应用的运行数据写在项目旁的 `.openread-userdata/`。

## 🧱 技术栈 / 架构

- **Electron 40** + **React 19** + **Vite**(electron-vite)+ **TailwindCSS 4** + **zustand** + **zod**
- 类型安全 IPC(`conveyor` 模式:每个域一套 schema + handler + api)
- 基于 MIT 模板 [`guasam/electron-react-app`](https://github.com/guasam/electron-react-app) 二次开发

```
lib/
  main/            主进程:窗口、协议、书库(JSON)
  conveyor/        类型安全 IPC(schemas / handlers / api)
    ├ native-*     摸鱼:透明 / 置顶 / 防截图 / 老板键
    ├ reader-*     阅读:文件对话框 / 读取 / 书库
    └ browser-*    浏览器:弹窗转标签
app/
  Shell.tsx        侧栏 + 三视图外壳
  features/
    reader/        foliate / pdf / txt 三个 viewer + 书架 + 阅读设置
    browser/       多标签 <webview> 浏览器
    ai/            AI 网站聚合
    native/        摸鱼工具条
  store/           zustand:browserStore / readerStore
```

## 📄 许可 & 声明

- 本项目以 **MIT** 开源(见 [LICENSE](./LICENSE)),部分版权归 `electron-react-app` 模板作者。
- 使用的开源库:foliate-js(MIT)、pdf.js(Apache-2.0)、Electron、React 等,版权归各自作者。
- 本项目**与「墨鱼阅读」及其开发者无任何关联**,不含其任何代码;仅在功能形态上受其启发,并用开源组件独立实现。
