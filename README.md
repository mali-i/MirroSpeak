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

## AI 个人笔记（Qwen-Omni BYOK）

使用阿里云百炼模型输出内容概览、主题笔记、可复用素材及待确认内容。支持的模型直接理解视频画面与音轨。默认模型 `qwen3.8-omni-flash`，设置中通过下拉列表选择模型，不再手填模型 ID；可选 Qwen3.8-Omni-Flash、Qwen3.5-Omni-Plus 和 Qwen3.5-Omni-Flash。模型的音画能力由明确配置决定，不根据名称猜测；旧配置中不在列表的模型需重新选择后保存。采用阿里云文档中的 OpenAI SDK / Chat Completions 协议，流式输出文本；不会自动重试收费请求。

1. 在 Settings → AI 个人笔记填写百炼工作空间的完整 OpenAI 兼容 API Base URL（通常以 `/compatible-mode/v1` 结尾）及同地域的 API Key，保存后测试基础连接。地址从自己的百炼控制台复制；应用不猜测工作空间 ID。
2. 在 Gallery 打开已录制的视频，同意本次提交后生成笔记。费用计入自己的阿里云账户。
3. 本地视频不超过 6 MiB 时直接 Base64 编码，超过时使用本机 ffmpeg 压缩临时副本；编码后必须小于 10 MB。压缩保留完整时长，画面降为最大 320 像素、每秒 2 帧，音频降为单声道 16 kHz AAC / 24 kbps，可能丢失快速动作、细节及部分声音信息。原片不变，临时副本在成功、失败和取消后清理。压缩仍过大时不会发起请求。
4. 为保留大视频原始质量，可在视频页填写同一视频的 HTTPS 公网链接（例如 OSS 签名链接）。模型直接读取原始视频的画面与音轨；用户需确保与本地文件一致、链接有效期足够。应用不会上传到或删除对象存储文件。链接不作为配置或报告元数据保存。
5. 应用首版支持最长 15 分钟 / 本地原视频最大 2 GB。模型自身的时长、大小、输入 token 等限制仍适用。公网视频与本地 Base64 限制不同，请以官方文档为准。

报告支持时间点回看、原视频关键帧、本地编辑、历史版本和 Markdown 导出。时间点由模型生成，请回看核实。只有正常完成且内容、时间点校验通过才保存；有正文但 JSON 无效时缓存响应，支持本地重新解析，不重复收费调用。空响应、截断或无完成状态不能恢复为完整报告。

基础连接测试仅查询模型目录，不证明额度、视频或音轨理解可用。Key 在 Electron 主进程中使用系统安全存储加密；改用本服务后，旧服务商配置和 Key 不会用于新的请求，既有本地报告仍可查看。请求使用 Electron 系统代理网络通道，禁止自动跟随 HTTP 重定向并隐藏服务商原始错误正文中的敏感信息。

校验、压缩、上传、等待、接收输出和保存展示阶段状态；压缩及上传显示当前阶段实际进度，不虚构模型分析百分比。可取消任务，取消后等待本地资源清理。

官方参考：[Qwen-Omni](https://help.aliyun.com/zh/model-studio/qwen-omni)。

### 笔记返回格式 v2

返回 `schemaVersion: 2`、`title`、`summary`、`notes`、`materials`、`uncertainties`。主题笔记含 `title`、`takeaway`、`text`；素材含 `type`（观点／案例／方法）、`title`、`text`；待确认内容含 `title`、`text`。每项均通过 `sources` 提供 1–20 个 `startSeconds` / `endSeconds` 来源范围，保存时转换为毫秒。各列表最多 100 项，超限直接拒绝，不截断；笔记至少一项，其余可为空。主题导航从笔记生成，不单独生成章节。保留说话者视角，不强制改写成用户第一人称。旧格式不转换，需重新分析生成新版笔记。

### 视频时间点批注

在视频回顾页的播放器下方点击「添加批注」，自动暂停并记录当前时间；可修改时间、填写文字，并添加多个 HTTP / HTTPS 来源链接。文字和链接可以分别使用。批注按视频时间排序，点击时间点暂停定位，引用通过系统浏览器打开。支持原地编辑、删除及 10 秒内撤销删除。

批注本地保存于视频记录，无需配置 AI 或生成报告；重新分析、切换报告版本和应用内重命名均不会改变批注。批注仅显示在对应视频页，不包含缩略图，不进入 AI 报告或 Markdown 导出。

批注列表默认折叠，可点击标题手动展开。播放经过批注时间点时，对应批注自动显示 5 秒；同一时间的多条批注会一起显示，拖动进度不会触发沿途批注。
