# B站弹幕助手

一个基于 pywebview 的 B站直播间弹幕助手桌面应用，支持多账号管理、弹幕发送、直播间挂榜、自动点赞和定时任务。

## 功能

- **多账号管理**：支持手动添加和扫码登录 B站账号
- **发送弹幕**：向指定直播间发送自定义弹幕，支持多账号同时发送
- **直播间挂榜**：自动维持直播间在线状态（心跳 + WebSocket），支持多账号多房间
- **自动点赞**：批量为主播点赞，可自定义次数
- **定时任务**：定时自动发送弹幕，支持自定义间隔

## 运行

```bash
# 安装 uv（如果还没有）
pip install uv

# 安装依赖并运行
uv sync
uv run python main.py
```

## 打包

```bash
uv pip install pyinstaller
uv run pyinstaller --onefile --windowed --name "bili_barrage" --add-data "web;web" --add-data "pyproject.toml;." main.py
```

打包后的 exe 文件在 `dist/` 目录下。

## 技术栈

- **后端**：Python + pywebview (Edge WebView2)
- **前端**：Vue 3 + Element Plus（暗色主题）
- **API**：Bilibili 移动端 API

## 致谢

- [fansMedalHelper](https://github.com/Venus-Yim/fansMedalHelper) — B站登录示例
