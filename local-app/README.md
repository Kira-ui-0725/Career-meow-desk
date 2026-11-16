# 本地 ChatGPT 版

这是求职喵务局的本机运行入口。根据 [OpenAI 官方开源工具登录说明](https://developers.openai.com/siwc/token-sharing-open-source/sign-in)，符合条件的 ChatGPT Plus / Pro 用户可在浏览器授权本地应用使用其 ChatGPT 订阅，无须另配 OpenAI API Platform 密钥。授权是否成功及可用模型以登录后的实际返回为准。

## 启动

1. 安装 Node.js 20 或更新版本。
2. 在 `.` 目录运行 `node local-app/server.mjs`。
3. 在本机浏览器打开 `http://127.0.0.1:4173`，到“今日总览”点击“使用 ChatGPT 登录”，按 OpenAI 页面完成登录与授权。
4. 回到“每日安排”，输入事项，选择账号可用的模型，点击“用 ChatGPT 生成草案”；核对时长并把事项放入小时表后再确认保存。

服务只监听本机 `127.0.0.1`。如果 4173 端口被占用，可设置 `CHATGPT_LOCAL_PORT` 后再运行，并用对应端口打开网页。浏览器地址须用 `127.0.0.1`，因为授权回调使用这个地址。

## 数据与边界

- ChatGPT 连接凭证保存在本机 `~/.config/job-search-planner-chatgpt/`，不在网页、浏览器存储或仓库中；求职记录仍保存在当前浏览器，不因登录而跨设备同步。
- 本地服务把你输入的任务文字、选定日期和当天已记录的笔面事件发送给 OpenAI 生成草案。提交前请自行判断是否包含不想发送的个人信息。
- 模型请求使用官方 [Responses API](https://developers.openai.com/siwc/token-sharing-open-source/models-and-inference) 的订阅授权流程；只在收到完整结果后才显示草案。使用量可到 [ChatGPT 用量设置](https://chatgpt.com/settings/usage)查看。
- 录音转写不在本次接入范围内。官方当前的 [预览限制](https://developers.openai.com/siwc/token-sharing-open-source/preview-limitations)不支持这个授权流程的音频输入和转写接口。
- GitHub Pages 仍只运行静态网页；需要 ChatGPT 订阅能力的使用者须在自己的电脑上运行这个本地服务。`server/` 目录中的自带 API 密钥方案仍是独立选项。

## 检查

运行 `node --test local-app/server.test.mjs` 可检查身份凭证校验、模型输出处理和草案格式。测试不连接 OpenAI，也不证明真实账号登录已成功。

## 登录失败时

登录回调页会区分“换取登录凭证”“校验身份签名”“保存本机连接”几个阶段，并显示 OpenAI 返回的 HTTP 状态。若出现 `403` 且提示当前网络出口不在支持地区，说明本机服务的请求被 OpenAI 拒绝；同一网络下反复登录不能解决。请对照 [OpenAI 支持地区说明](https://developers.openai.com/api/docs/supported-countries)。这与是否拥有 ChatGPT 账号或 API 密钥是不同的问题。

暂时无法连接时，网页的“本地拆分”仍可使用；也可在每日安排页可见的“其他 AI 服务”配置区填写自己部署的兼容模型服务地址和访问码。不要把模型密钥填入网页。
