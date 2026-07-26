# OpenRead · 摸鱼阅读

> 一个 **网页浏览 + 本地电子书阅读** 二合一的桌面工具。灵感来自「墨鱼阅读」,但**完全用开源组件从零实现**,不含任何闭源代码,MIT 开源。

<p align="center"><i>多格式电子书阅读器 · 站点导航浏览器 · AI 网站聚合 · 透明摸鱼 / 自动隐藏 / 托盘 / 老板键 / 防截图 / 密码锁</i></p>

---

## ✨ 功能

### 📚 本地阅读器
- **格式**:EPUB / MOBI / AZW3 / FB2 / CBZ(foliate-js)、PDF(pdf.js)、TXT(自动识别 UTF-8 / GB18030)
- 书架(导入时自动提取**封面**、标题、作者)、**拖拽导入**、搜索、排序(最近阅读 / 标题 / 导入时间)
- 阅读进度记忆、目录跳转、**可拖动进度条**、字号 / 行距 / 主题(明亮 / 护眼 / 暗黑)

### ☁️ 网络书源(自定义 JS 书源)
- **导入书源 → 跨源搜索 → 看目录 → 读正文**,全在应用内完成
- 支持两种书源:**纯 JS 书源**(`.js`/`.txt`)与 **轻悦时光书源**(`.json`,外壳里 `html` 字段装整页脚本)
- 导入方式:**本地文件 / 粘贴代码 / 粘贴链接**
- 书源就是一段 **JS 脚本**(不是复杂规则 DSL),实现 `search / info / chapter / content` 即可
- 内置 `flutter_inappwebview.callHandler` 兼容桥,轻悦时光书源自带的 `Http`/`Cache` 类可直接工作
- 运行时注入 `Http`(主进程代发,免跨域、自动处理 GBK/GB18030)、`Cache`、`Cookie`、`parseHTMLSafely`、jQuery、CryptoJS
- **安全**:书源跑在隔离的沙箱 webview 里(独立 partition、contextIsolation),拿不到本机文件与应用 IPC
- 附示例书源 [`sample/书源示例-维基文库.js`](./sample/书源示例-维基文库.js)(基于公有领域的中文维基文库)

> ⚠️ 书源功能是**中立工具**,内容由你自行导入的书源提供;请使用**合法、已授权**的来源。本项目不内置任何盗版书源。

### 🌐 内嵌浏览器(导航启动页)
- 打开即**站点导航页**:搜索框 + 分类推荐(小说 / 视频 / 备考 / 财经 / AI)+ **我的站点**(自己添加,点即进)
- 多标签 `<webview>`、地址栏、前进 / 后退 / 刷新;各站登录状态持久保留

### 🤖 AI 面板
- 内嵌豆包 / DeepSeek / Kimi / 元宝 / 智谱官方网站(登录即用,**不代理、不经手任何 API Key**)

### 🫥 摸鱼 / 隐蔽(纯 Electron 原生能力)
- **透明摸鱼**:抠掉网页背景,只剩正文浮在桌面上;隐藏全部界面 / 标题栏,不暴露(Esc 退出)
- **自动隐藏**:鼠标移出窗口即隐、移回再现;点击别的窗口则锁定隐藏,只能从托盘 / 老板键唤回
- **常驻系统托盘图标**(左键显隐、右键菜单)
- **老板键** `Ctrl+Shift+X` 一键显隐(开关,默认关)、窗口置顶、**防截图录屏**、网页自动滚动
- **密码锁**:4–8 位 PIN,scrypt + 系统级 safeStorage,完全本地离线

## 🚀 下载使用

到 [Releases](../../releases) 下载最新版:
- `openread-x.y.z-setup.exe`(安装版)或 `openread-x.y.z-portable.exe`(免安装便携版)

> Windows 托盘图标默认被系统收进"隐藏图标"里,点任务栏时钟旁的 `^` 展开即可,可拖出常驻。

## 🛠️ 自己构建

前置:Node ≥ 20、[pnpm](https://pnpm.io) ≥ 10。

```bash
pnpm install
pnpm dev            # 开发模式(热更新)
pnpm build:win      # 打包 Windows(安装包 + 便携版,产物在 dist/)
```

发布新版本:改 `package.json` 的 `version` → `git tag vX.Y.Z` → `git push origin vX.Y.Z`,GitHub Actions 自动出 Release。

> 磁盘小可把缓存挪到别的盘:设环境变量 `ELECTRON_CACHE` / `ELECTRON_BUILDER_CACHE` / `NPM_CONFIG_CACHE`,并 `pnpm config set store-dir <path>`。

## 🧱 技术栈 / 架构

- **Electron 40** + **React 19** + **Vite**(electron-vite)+ **TailwindCSS 4** + **zustand** + **zod**
- 类型安全 IPC(`conveyor` 模式:每个域一套 schema + handler + api)
- 基于 MIT 模板 [`guasam/electron-react-app`](https://github.com/guasam/electron-react-app) 二次开发

```
lib/
  main/
    app.ts              主窗口、协议、托盘、窗口记忆装配
    tray.ts             常驻系统托盘图标
    autohide.ts         自动隐藏(离屏 peek + 失焦锁定)
    lock.ts             密码锁(scrypt + safeStorage)
    library.ts          书库(JSON 存储)
    window-state.ts     记忆窗口尺寸/位置
  conveyor/             类型安全 IPC(schemas / handlers / api)
    ├ window / app      窗口控制 / 系统
    ├ native            摸鱼:透明·置顶·防截图·老板键·自动隐藏
    ├ reader            阅读:文件对话框 / 读取 / 书库
    ├ browser           浏览器:弹窗转标签
    └ lock              密码锁
app/
  Shell.tsx             侧栏 + 三视图外壳
  features/
    reader/             foliate / pdf / txt 三个 viewer + 书架 + 封面提取 + 阅读设置
    browser/            导航启动页(NavHome)+ 多标签 <webview> + 透明摸鱼
    ai/                 AI 网站聚合
    native/             摸鱼工具条
    lock/               锁屏 + 密码锁设置
  store/                zustand:browserStore / readerStore / stealthStore / lockStore
```

## 📄 许可 & 声明

- 本项目以 **MIT** 开源(见 [LICENSE](./LICENSE)),部分版权归 `electron-react-app` 模板作者。
- 使用的开源库:foliate-js(MIT)、pdf.js(Apache-2.0)、Electron、React 等,版权归各自作者。
- 本项目**与「墨鱼阅读」及其开发者无任何关联**,不含其任何代码;仅在功能形态上受其启发,并用开源组件独立实现。
