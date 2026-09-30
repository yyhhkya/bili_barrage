# B站弹幕助手

B站直播间弹幕助手桌面应用。支持多账号管理、弹幕发送、直播间挂榜、自动点赞和定时任务。

## 功能

- **多账号管理**：手动添加 access_key，或扫码登录
- **发送弹幕**：向指定直播间发送弹幕，支持多账号并发或顺序发送
- **直播间挂榜**：维持直播间在线状态，支持多账号多房间
- **自动点赞**：批量点赞，可自定义次数
- **定时任务**：按间隔自动循环发送弹幕

## 技术栈

- **壳**：Electron
- **后端**：Node（无 Python 依赖）
- **前端**：React + Vite + TypeScript + Tailwind v4
- **API**：Bilibili 移动端 API

代码在 [`electron/`](electron/)，构建与开发说明见 [electron/README.md](electron/README.md)。

## 快速开始

```bash
cd electron
npm install
npm run dev          # 开发模式
npm run build:win    # 打包出 NSIS 安装包
```

## 数据位置

账号、任务和日志放在 `%APPDATA%\bili-barrage\`，不随程序目录走，所以覆盖安装不会丢配置。

## 致谢

- [fansMedalHelper](https://github.com/Venus-Yim/fansMedalHelper) — B站登录示例

## 许可

GPL-3.0，见 [LICENSE](LICENSE)。
