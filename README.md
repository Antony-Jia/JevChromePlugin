# Jev X & Weibo Reader

Chrome Manifest V3 扩展：在 X / Twitter 与微博信息流中提取帖子，调用 Jev 做结构化快速判断，并按本地综合分显示评分和彩色价值层。只有用户点击“深入解析”后，插件才会把帖子上下文发给 OpenAI-compatible 服务或 Ollama；启用 Tavily 时会先检索网页证据，再让 LLM 综合解释。

## 在 Chrome 中加载

1. 运行 `npm run build`，生成只包含扩展运行文件的 `dist` 目录。
2. 打开 `chrome://extensions` 并启用“开发者模式”。
3. 选择“加载已解压的扩展程序”，选中 `dist` 目录。
4. 打开扩展设置，填写 TypeSafe API Key、阅读偏好和 LLM 配置。
5. 在 X 或微博页面刷新标签页。扩展只在 `x.com`、`twitter.com` 和 `weibo.com` 运行。

默认 `host_permissions` 仅包含 TypeSafe API。保存 OpenAI-compatible 或 Ollama 配置后，点击“保存并测试 LLM 连接”会在用户操作中申请该服务的主机权限。远程自定义端点必须使用 HTTPS；本机 Ollama 可填 `http://localhost:11434/v1`。

## 开发与测试

```powershell
npm install
npm run build
npm run check
npm test
```

真实 API 连通性测试只发送固定的短连接测试文本，不读取 X 帖子：

```powershell
npm run test:integration
```

该脚本从本地 `.env` 读取 `TYPESAFE_API_KEY`、`OPENAI_COMPAT_BASE_URL`、`OPENAI_COMPAT_API_KEY` 和 `OPENAI_COMPAT_CHAT_MODEL`，输出只包含成功/失败、错误代码和耗时，不输出密钥或请求头。请勿把 `.env` 打包或提交。

## 数据与密钥

- TypeSafe、Tavily 和 LLM 请求只由扩展 service worker 发出；密钥保存在 `chrome.storage.local`，不传入页面 DOM 或 content script。
- Jev 缓存最多保留 7 天、最多 500 条；原帖上下文放在 `chrome.storage.session`，浏览器会话结束后清除。
- 帖子文本会发送给 TypeSafe 进行 Jev 判断。LLM 不会自动收到帖子；只有点击“深入解析”才发送。Tavily 默认关闭，启用后点击深入解析会把帖子文本作为搜索查询发送给 Tavily。
- LLM 输出以文本方式显示，不执行 HTML、脚本或模型指令。扩展不自动点赞、转发、关注或发帖。

## MVP 行为

- MutationObserver 发现动态帖子，IntersectionObserver 在距视口约一屏时触发分析；X 按 status ID、微博按 UID 与短 ID 组合去重。
- 一个 Jev 请求并行询问兴趣、技术创新、深读价值、信息密度、营销噪声和一手来源。
- 综合分、颜色级别、透明度和低置信度保护都在本地确定性计算；帖子正文始终清晰可读，右下角控件可关闭全页色层。
- 自动浏览逐帖推进，有每次 Session / 每分钟上限；滚轮、键盘、点击、触摸或选中文字会暂停。
- OpenAI-compatible 和 Ollama 共用 Chat Completions 适配器；深度分析非流式，在页面右侧固定悬浮面板中展示并支持复制。
- Tavily 可配置开关、Key、搜索深度和来源数；检索结果作为不可信证据交给 LLM，并以 `[S1]` 等编号显示可点击来源。搜索失败时会降级为普通 LLM 分析并显示提示。
