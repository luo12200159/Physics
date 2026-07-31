# 物理研习室 ChatGPT 受控服务端

此目录提供零第三方运行依赖的 Node.js 参考实现，供电脑端和 Android 端共同调用。客户端不会保存 OpenAI API 密钥。

## 本机验证

需要 Node.js 20 或更高版本。先在系统环境中设置 `OPENAI_API_KEY`，再运行：

```powershell
node .\server\physics-ai-gateway.mjs
```

教师模式中将服务端地址设为 `http://localhost:8787`，启用后测试连接。

## 对外部署要求

- 使用 HTTPS，并把服务绑定在认证反向代理之后。
- 设置 `PHYSICS_ALLOWED_ORIGINS`、`PHYSICS_GATEWAY_TOKEN`、模型白名单、限流和费用告警。
- API 密钥只放在服务端环境变量或密钥管理服务中，不提交到源码或安装包。
- 学生身份、权限、审计日志、数据保留期限和删除机制需由部署方实现。
- 上传文件属于未成年人学习数据时，应在取得必要授权后处理，且不得把未审核解析自动发布为正式题库。

接口：

- `POST /v1/physics/health`
- `POST /v1/physics/solve`
- `POST /v1/physics/document-analysis`

服务端使用 OpenAI Responses API 的结构化输出；解题结果仍会保留 `reviewRequired`，不把模型输出表述为教师审核结论。
