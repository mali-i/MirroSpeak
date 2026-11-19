# 🎙️ MirroSpeak

**MirroSpeak** 是一款专为**即兴演讲练习**、**思维整理**与**视频日志**设计的桌面应用程序。它结合了视频录制与实时语音转写功能，帮助你面对镜头（Mirror）自信表达（Speak），记录每一个灵感瞬间。

## ✨ 核心特性

- **📹 沉浸式录制**：简洁的录制界面，让你专注于面对镜头的自我表达与叙述。
- **📝 演讲大纲 (Outline)**：录制时可参考侧边大纲，辅助思维梳理，不再忘词。
- **🖼️ 视频回廊 (Gallery)**：内置视频管理库，轻松回顾与播放历史录像。
- **🔒 本地优先**：所有视频与文本数据存储在本地，充分保护你的隐私。

## 🛠️ 技术栈

本项目基于 modern Web 技术栈构建：

- **Core**: [Electron](https://www.electronjs.org/)
- **Frontend**: [Vue 3](https://vuejs.org/) + [Vite](https://vitejs.dev/)
- **Styling**: [Tailwind CSS](https://tailwindcss.com/)
- **Data**: [Electron Store](https://github.com/sindresorhus/electron-store)

## 🚀 快速开始

### 安装依赖

```bash
npm install
```

### 启动开发环境

```bash
npm run start
```

### 打包构建

```bash
npm run make
```

### macOS 分发构建

```bash
npm run package:app
npm run package:app:mas
npm run make:dmg
npm run make:mas
npm run upload
```

- `package:app` / `package:app:mas` 只生成已签名的 `.app` 中间产物。
- `upload` 会通过 `xcrun altool` 自动查找 `out/mas/make/` 下的 `.pkg` 并上传到 App Store Connect。
- 如果 Apple ID 绑定了多个 provider，可额外设置环境变量 `APPLE_PROVIDER_PUBLIC_ID`。
- `dmg` 输出目录：`out/dmg/make/`
- `mas pkg` 输出目录：`out/mas/make/`
- 对应的中间 `.app` 打包目录分别位于：`out/dmg/`、`out/mas/`
- 使用 `Apple Distribution` 签名的 MAS `.app` 不能作为本地双击运行的测试对象；这类产物需要通过 App Store / TestFlight 重签与分发后再验证启动。
- 如果需要在本机直接测试 MAS 签名行为，应改用 `Apple Development` 证书配合开发用 provisioning profile 重新签名。

## AI 个人笔记（BYOK MVP）

1. 在 **Settings → AI 个人笔记** 填写 API Base URL 和自己的 Gemini API Key，保存并测试连接。默认模型为 `gemini-3.8-flash`，可修改为账户可访问、支持视频和结构化输出的 Gemini 模型。
2. 在 **Gallery** 打开视频，勾选本次上传说明后生成笔记。视频与音轨直接发送至所配置的 API 服务（内联模式可能使用本地压缩副本）；费用记在用户的 API 账户，应用没有代理计费服务。
3. 查看概览、章节、观点素材与忠实梳理的个人笔记。点击时间点回看；前六个章节的画面在播放器加载后提取并保存在本机。笔记支持编辑与 Markdown 导出（当前导出文字和时间点）。
4. 重新分析会新增报告版本，保留之前的编辑。在“已保存的个人笔记”中可以打开历史报告。

### 自定义 API Base URL

默认使用 `https://generativelanguage.googleapis.com`。中转站可填写服务根地址（例如 `https://relay.example/gemini`），也可粘贴以 `/v1beta` 结尾的地址；应用会保留路径前缀并拼接 Gemini API 路径。支持 HTTPS，本机 localhost 服务可用 HTTP。

中转站必须支持 Gemini 原生 `generateContent` 和结构化 JSON 输出。Files 模式另需支持 `upload/v1beta/files` 可恢复上传、文件状态与删除；内联模式无需 Files API。官方及通用 Gemini 代理使用 `x-goog-api-key`；TeamoRouter 自动使用文档要求的 `Authorization: Bearer`，并通过 `/v1/models` 测试 Key 和模型目录；仅提供 OpenAI Chat Completions 兼容接口的服务暂不支持。上传会话必须返回同源地址，应用不会携带 Key 跟随 HTTP 重定向。

更换 Base URL 时需要重新输入对应 Key。远端清理记录保留上传时的服务地址，只有配置回对应地址和 Key 后才重试，不会把旧服务的清理请求转发给新服务。

### TeamoRouter

可点击设置中的“使用 TeamoRouter 地址”，或填写 `https://api.teamorouter.com`（不加 `/v1`），模型填写服务商目录中的 Gemini 模型 ID。基础连接仅查询模型目录，不生成内容、不发送视频，不能证明视频能力可用。自动模式对 TeamoRouter 使用内联视频，直接通过 `generateContent` 提交，不再依赖会重定向的 Files 上传路径。接入文档未明确保证内联视频及结构化输出兼容性，仍需真实账户实测，不应将目录查询成功视为视频接入成功。

来源：[TeamoRouter API 接入文档](https://teamorouter.com/docs/api-integration)。

### 视频提交方式

设置可选自动、内联视频和 Files API。自动模式下 TeamoRouter 使用内联，其余地址保持 Files 模式；也可手动选择。内联视频体积不超过 12 MiB 时直接编码提交，较大文件使用已安装的系统 `ffmpeg` 压缩临时副本，目标最大 320 像素、每秒 2 帧，完整时间轴和音频时长保留。音频会转为单声道 16 kHz AAC（32 kbps），快速动作和细小视觉内容可能丢失。原片不变，临时副本在完成、失败或取消后清理。

内联 JSON 请求受应用的 20 MiB 上限约束，超过上限不发送；中转站可能有更低的限制。未找到 `ffmpeg` 时，大视频会显示依赖缺失提示；无需压缩的小视频仍可直接提交。当前未把 ffmpeg 打包进应用，分发版本尤其是 MAS 仍需另行解决工具打包与沙箱兼容性。

### 分析进度

播放器中显示校验、素材准备、上传、理解整理、保存和清理的阶段状态及累计用时。视频指纹读取和 ffmpeg 压缩显示当前阶段的实际比例；内联请求通过 Electron 上传字节数显示传输进度，发送完成后切换为模型等待状态。Files 流式传输未提供实时比例时显示活动状态和体积，不虚构整体完成百分比。失败保留失败阶段，取消后等待临时文件清理；清理警告与已保存的报告分开显示。

### 网络连接

AI 请求使用 Electron Chromium 网络栈，跟随系统代理/PAC 配置。DNS、连接重置、代理、超时和证书错误会显示对应原因；不会通过关闭证书校验来绕过连接问题。

### 数据与边界

- Key 通过 Electron `safeStorage` 加密，独立于通用配置保存；渲染页面仅获取是否已配置，不获取已保存 Key。
- 报告在应用用户数据目录的 `video-notes.json` 中保存。视频使用稳定 ID 和完整 SHA-256 指纹关联。应用内改名会更新路径；外部改名后打开视频会按指纹恢复关联。
- 外部移动后，历史笔记仍可查看；使用“重新定位”选择原视频并校验。剪辑、转码或内容替换后不复用旧报告时间点。相同文件副本共用内容身份，当前仅记录最近打开的位置。
- 首版最长 15 分钟、最大 2 GB，一次分析一个视频；不自动上传、不自动重试收费请求。指纹校验需要读取完整文件，较大视频会有等待时间。
- 时间点与整理内容由模型生成，需要回看核实；不提供逐字转写准确性保证，也不补充原视频之外的事实。
- 上传完成取得远端文件 ID 后，分析成功、失败或取消均尝试删除临时文件。删除失败的文件 ID 保存在本地，可用“测试基础连接”重试清理。上传未完成或应用被强制退出时无法保证立即删除远端数据，仍受服务商数据政策约束。
- 当前报告存储依赖本机应用数据；不包含跨设备迁移包、批量分析、文章化改写或媒体生成。

参考：[Gemini 视频理解](https://ai.google.dev/gemini-api/docs/generate-content/video-understanding)、[结构化输出](https://ai.google.dev/gemini-api/docs/structured-output)、[Gemini 3.8 Flash](https://ai.google.dev/gemini-api/docs/models/gemini-3.8-flash)。

### 验证

```bash
npm test
npx vite build --config vite.renderer.config.mjs --outDir /tmp/mirrospeak-renderer-check
```

测试使用本地临时文件和模拟服务商响应，覆盖视频身份、时间点校验、上传与报告解析、报告版本/编辑、重新定位及远端清理恢复；不发送真实视频，也不产生 API 费用。实际模型质量和费用需要使用自己的 Key 与代表性视频验证。
