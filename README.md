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

使用阿里云百炼模型输出内容概览、章节、观点素材及个人笔记。Omni 模型直接理解音画；Qwen4-Max 等非 Omni 模型先由本地 Whisper base 转写原视频音轨，再将带时间点的文字与视频一并提交，保留所选模型。默认模型 `qwen3.8-omni-flash`，设置中通过下拉列表选择模型，不再手填模型 ID；可选 Qwen3.8-Omni-Flash、Qwen4-Max、Qwen3.5-Omni-Plus 和 Qwen3.5-Omni-Flash。模型的音画能力由明确配置决定，不根据名称猜测；旧配置中不在列表的模型需重新选择后保存。采用阿里云文档中的 OpenAI SDK / Chat Completions 协议，流式输出文本；不会自动重试收费请求。

1. 在 Settings → AI 个人笔记填写百炼工作空间的完整 OpenAI 兼容 API Base URL（通常以 `/compatible-mode/v1` 结尾）及同地域的 API Key，保存后测试基础连接。地址从自己的百炼控制台复制；应用不猜测工作空间 ID。
2. 在 Gallery 打开已录制的视频，同意本次提交后生成笔记。费用计入自己的阿里云账户。
3. 本地视频不超过 6 MiB 时直接 Base64 编码，超过时使用本机 ffmpeg 压缩临时副本；编码后必须小于 10 MB。压缩保留完整时长，画面降为最大 320 像素、每秒 2 帧，音频降为单声道 16 kHz AAC / 24 kbps，可能丢失快速动作、细节及部分声音信息。原片不变，临时副本在成功、失败和取消后清理。压缩仍过大时不会发起请求。
4. 为保留大视频原始质量，可在视频页填写同一视频的 HTTPS 公网链接（例如 OSS 签名链接）。模型直接读取原始视频的画面与音轨；用户需确保与本地文件一致、链接有效期足够。应用不会上传到或删除对象存储文件。链接不作为配置或报告元数据保存。
5. 应用首版支持最长 15 分钟 / 本地原视频最大 2 GB。模型自身的时长、大小、输入 token 等限制仍适用。公网视频与本地 Base64 限制不同，请以官方文档为准。

报告支持时间点回看、原视频关键帧、本地编辑、历史版本和 Markdown 导出。时间点由模型生成，请回看核实。只有正常完成且内容、时间点校验通过才保存；有正文但 JSON 无效时缓存响应，支持本地重新解析，不重复收费调用。空响应、截断或无完成状态不能恢复为完整报告。

基础连接测试仅查询模型目录，不证明额度、视频或音轨理解可用。Key 在 Electron 主进程中使用系统安全存储加密；改用本服务后，旧服务商配置和 Key 不会用于新的请求，既有本地报告仍可查看。请求使用 Electron 系统代理网络通道，禁止自动跟随 HTTP 重定向并隐藏服务商原始错误正文中的敏感信息。

校验、压缩、上传、等待、接收输出和保存展示阶段状态；压缩及上传显示当前阶段实际进度，不虚构模型分析百分比。可取消任务，取消后等待本地资源清理。

官方参考：[Qwen-Omni](https://help.aliyun.com/zh/model-studio/qwen-omni)。

### Qwen4-Max 的本地语音转写

电脑需安装 `ffmpeg` 与 Python `openai-whisper`（可执行命令 `whisper`）。首次使用下载约 140 MiB 的 Whisper base 模型，下载走应用系统代理网络通道并校验 SHA-256；音轨在本地提取和转写，不额外调用云端语音 API。转写文字会与视频一起发送给所选模型，计入该模型输入 token；额度适用范围以百炼账户为准。中文语音识别可能有错字、漏字，需回看原视频核对。

模型和按原视频 SHA-256 标识的转写结果保存在应用数据目录 `speech-cache`，重复分析可复用转写。临时 WAV 文件在成功、失败或取消后删除。无音轨、无可用讲话文字或转写失败时停止，不提交云端收费请求；原有报告保留。公网视频链接方式仍从当前关联的本地原视频转写讲话，请确保二者内容相同。
