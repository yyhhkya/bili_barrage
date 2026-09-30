# B站弹幕助手 (Electron)

多账号 B 站直播助手：发送弹幕、点赞、挂榜、定时任务。

这是 Electron 重写版，代替仓库根目录的 Python + pywebview 版本。后端是纯 Node，不再需要 Python 运行时。

## 开发

```bash
npm install
npm run dev          # electron-vite 开发模式，渲染层有 HMR
npm run typecheck    # 主进程 + 渲染层分别做类型检查
```

## 打包

```bash
npm run build:win    # 产出 dist/bili-barrage-Setup-<version>.exe
```

产物：

| 文件 | 用途 |
|---|---|
| `bili-barrage-Setup-3.0.0.exe` | NSIS 安装包 |
| `latest.yml` | electron-updater 读取的版本清单 |
| `bili-barrage-Setup-3.0.0.exe.blockmap` | 差分更新用 |

发版时这三个都要上传到 GitHub Release 的对应 tag。

## 自动更新

走 `electron-updater` + GitHub provider：启动时查 `latest.yml`，比较版本，就地下载，退出时安装。

镜像测速（`gh-proxy.org` / `ghproxy.net`）只服务于**手动下载**：electron-updater 不接受 URL 前缀，接不了镜像。连不上 GitHub 时用测速挑一条线路，交给系统浏览器下载。

## 数据位置

安装到 Program Files 后程序目录不可写，所有用户数据放在 `%APPDATA%\bili-barrage\`：

```
%APPDATA%\bili-barrage\
├── config.json       账号、定时任务、当日点赞计数
├── logs\
│   ├── latest.log    本次运行
│   └── YYYY-MM-DD-N.log   历史归档，保留 7 天
└── emoji-cache\      表情图片缓存，按 URL 的 sha1 命名
```

## 从旧版迁移

不写迁移代码。装了新版后，到「账号管理」用**导入旧版配置**选中旧的 `config.json`，账号和定时任务会按 access_key 去重后导入。也可以直接把旧文件拷到上面的目录。

## 结构

```
src/
├── main/                  Electron 主进程（Node 运行时）
│   ├── index.ts           生命周期、窗口、退出时清理
│   ├── ipc.ts             IPC 通道注册
│   ├── updater.ts         更新检查、下载、镜像测速
│   ├── bili/              纯 API 层，不依赖 electron
│   │   ├── constants.ts   端点、密钥、UA、时间常量
│   │   ├── http.ts        fetch 封装、超时、二进制抓取
│   │   ├── sign.ts        md5 签名
│   │   ├── endpoints.ts   所有 B 站接口
│   │   └── ws.ts          直播间 WebSocket 二进制协议
│   └── core/              纯业务层，不依赖 electron
│       ├── app.ts         状态中枢、配置读写、点赞计数
│       ├── logger.ts      日志轮转 + 环形缓冲
│       ├── config.ts      config.json 读写
│       ├── watch.ts       挂榜（WS 心跳 + HTTP 心跳）
│       ├── tasks.ts       定时任务、弹幕发送、点赞
│       ├── emoticons.ts   表情抓取 + 磁盘缓存
│       ├── qrlogin.ts     扫码登录
│       └── concurrency.ts 并发限流
├── preload/               contextBridge → window.api
├── renderer/              React + Tailwind
│   └── src/
│       ├── styles/tokens.css   设计 token（唯一色彩来源）
│       ├── lib/                store、toast、工具
│       ├── components/ui/      基础组件
│       ├── components/app/     业务组件
│       └── pages/              六个页面
└── shared/types.ts        三端共享类型
```

`bili/` 和 `core/` 两层不 import 任何 electron 模块。它们跑在主进程里，但保持可独立测试、可抽出。

## 设计约定

暖色可爱风：奶油底 + 金色强调 + 暖棕文字。取自参考插画的色系。

- **唯一强调色** 金色 `#F5C542`，用于主按钮、激活态导航图标、品牌标记
- **主按钮是金色配深棕字**，不是白字。金色对白色只有 1.62:1，白字放上去彻底不达 WCAG AA；深棕 `#4A3728` 配同一块金色是 6.93:1。按钮带一层深金色的"下唇"阴影，读起来像软乎乎的实体按键
- **语义色暖化**：成功 `#3F7D3A`、警告 `#9C5F0A`、危险 `#C0392B`，都往暖里偏，免得在奶油底上发脏
- **圆角一套**：6px 小控件 / 12px 交互控件 / 18px 容器 / 22px 浮层 / 全圆角徽标
- **字体** Baloo 2（圆体，仅标题和品牌名，拉丁字符）+ Geist（正文）+ Geist Mono（数字、房间号、access_key、日志）。中文一律走系统字体，所以 Baloo 2 只用在标题上，避免中文回退时字形跳变
- **图标** 全部来自 `@phosphor-icons/react`，无 emoji、无手写 SVG
- 所有文字/背景组合都过了 WCAG AA 4.5:1，并且是拿**真实渲染后的 DOM** 复核的，不只是查 token 文件

### 字体

- **界面字体：站酷快乐体（ZCOOL KuaiLe）** —— 圆润可爱，自带拉丁字形，所以中英文是同一个声音，不会出现"可爱中文 + 中性英文"的混排跳变。SIL OFL 可商用。按 unicode-range 切成 94 片，浏览器只加载真正用到的片
- **Geist Mono** 保留给需要逐字对齐的数据：房间号、access_key、计数、时间戳、日志正文。圆体用在这些地方是帮倒忙
- 站酷快乐体**只有一个字重**。所以全局设了 `font-synthesis: none` —— 否则 `font-medium` 会被浏览器合成伪粗体，中文字形直接糊掉。层级改由字号和颜色承载

### 图标

`resources/icon.svg` 是唯一源头，`icon.ico` / `icon.png` 由脚本生成：

```bash
npx electron scripts/make-icon.cjs
```

用 Electron 自己栅格化（同一套渲染引擎），避免引入 `sharp`（原生模块，每次升 Electron 都要重编）或 ImageMagick（每台打包机都得装）。细节见 `resources/README.md`。

### 窗口

无边框。标题栏由渲染层自绘（`components/app/TitleBar.tsx`），最小化 / 最大化 / 关闭走 IPC。拖动区用 `-webkit-app-region: drag`，按钮必须显式 `no-drag` 否则点不动；双击拖动区切换最大化，这是 Windows 用户的肌肉记忆，自绘标题栏容易漏掉。

标题栏文字居中分两步：`leading-none` + `block` 先把 CJK 的行框塌掉（否则 `items-center` 居中的是带下伸部的行框），再补 `translate-y-px` 抵消字体 ascent/descent 不对称造成的 1.25px 偏移。最终偏差 0.25px，亚像素级。

### 动效

用 **Motion**（`motion/react`）。`MOTION_INTENSITY` = 5：状态反馈 + 布局连续性，不做编排。

Vocabulary 集中在 `lib/motion.ts`，组件从那里取 spring/变体，不各写各的：

| 位置 | 动效 | 传达什么 |
|---|---|---|
| 侧栏激活块 | `layoutId` 共享元素滑动 | 我在哪。**只有行高亮块在滑**；图标金块就地淡入，不跟着飞 |
| 页面切换 | 方向性进出场 | 往下切内容从下方升入，往上切从上方降入。方向由导航顺序推出，不需要每个页面配置 |
| 对话框 / 气泡 | scale + fade 进出场 | 从触发点长出来，不是凭空出现 |
| Toast | 从右侧滑入 | 状态变化 |
| 任务状态胶囊 | layout 过渡 + 颜色渐变 | 真状态变化（停止→启动中→运行中） |
| 点赞计数 | 数字滚动（motion value） | 数值变化 |
| 挂榜状态卡片 | layout + 进出场 | 挂榜增删 |

页面切换用 `mode="wait"`：任何时刻只挂载一个页面。这些页面各自持有定时器和 IPC 订阅，交叉淡入会让订阅翻倍（多跑一次扫码轮询、多冲一次日志缓冲）。退场 70ms、进场 220ms，刻意不等长 —— 等长会让切换感觉慢半拍，而且此时侧栏激活块早就到位了。

页面内容按 id 从 `PAGES` 取，不是渲染时 `NAV.find()` 查出来的。因为 AnimatePresence 会保留退场元素，如果内容是查出来的，那个元素会一边带着旧的 key 一边渲染新页面组件，退场动效演的就是错的内容。

刻意不做：滚动揭示、视差、入场编排（每次切页都演一遍，第三次就烦）、无限装饰循环。

两条硬约束：

1. **只动 `transform` 和 `opacity`**，不动 `width`/`height`/`top`/`left`，否则绕过合成器、掉帧
2. **`prefers-reduced-motion` 必须兜住**，走 `lib/use-reduced-motion.ts`。注意**没有直接用 Motion 自带的 `useReducedMotion()`** —— 它内部是 `useState(prefersReducedMotion.current)`，只在挂载时读一次、且丢弃了 setter（他们源码里还留着 TODO）。也就是说运行中改系统设置不会生效。Electron 窗口常常开着好几天，这个不能将就，所以自己订阅了 media query

## 行为对齐说明

以下行为是有意保留的，和 Python 版一致：

- **WebSocket 是只发的**：没有 message handler，收到的包（含 op-3 人气值）全部丢弃，也不重连。挂榜靠独立的 60 秒 HTTP 心跳维持。解析人气值和断线重连是后续增强，不在本次范围
- **弹幕不做长度切分**，原样发送
- **扫码登录**只判断 `code == 0`，过期码（86038）会一直返回 `pending` 而不是报过期。取消按钮是出口
- **限速**：顺序模式账号间间隔 0.5 秒；并发模式无间隔
- **点赞计数**只保留当天，按 `日期|房间|access_key` 存进 config.json

有意的改动：

- 轮询改成推送。旧版渲染层每 5 秒查状态、每 500 毫秒查日志，现在由主进程主动推事件
- IPC 统一传结构化对象。旧版有 9 个方法返回 JSON 字符串、前端再 `parse`，这层没了
- `threading` / `ThreadPoolExecutor` 换成单事件循环 + `Promise.all` 限流，旧版那批无锁竞态（`WatchManager` 的字典并发读写、迭代中改动抛 `RuntimeError`）自然消失

## 待补

- [x] `resources/icon.ico` —— 已生成（7 档尺寸，16→256）
- [ ] 代码签名证书。现在 `no signing info identified`，安装时会有 SmartScreen 警告
