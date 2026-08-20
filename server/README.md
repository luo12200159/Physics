# 费曼物理服务端

`server` 目录包含两个彼此独立的服务：

- 班级业务服务：Fastify + PostgreSQL + Redis，默认开发端口 `8788`。教师建班、邀请码、成员关系、删除班级和学习同步都以该服务的持久化结果为准。
- 受控 AI 网关：`physics-ai-gateway.mjs`，默认开发端口 `8787`。它不承担班级功能。

v3.3.0 受控网关实现 `POST /v1/physics/solve`、`POST /v1/physics/tutor-turn` 与 `POST /v1/physics/generate-variants`。变式生成与交叉验证使用独立请求；缺少网关时客户端只使用可核验本地题模或审核题族，不把泛化文字任务描述为完整变式。

客户端不再把 `127.0.0.1:8787` 猜作班级服务。Windows/Android 安装包必须在构建时注入已部署的 HTTPS 班级服务地址，或由用户在“在线班级连接”中明确填写。

## 安装与检查

要求 Node.js `24.15.x`、pnpm `11.18.x`、PostgreSQL 和 Redis。仓库使用 `pnpm-lock.yaml`，不要改用其他包管理器生成锁文件。

```powershell
cd server
pnpm install --frozen-lockfile
Copy-Item .env.business.example .env.business
# 将 .env.business 中的数据库、Redis、密钥、CORS 等值改成真实配置
pnpm run migrate:up
pnpm run typecheck
pnpm run test:unit
pnpm run build
```

当前启动器读取进程环境变量，不会自动解析 `.env.business`。开发时应先把文件中的值载入当前终端环境，再运行：

```powershell
pnpm run dev
```

健康检查：`GET http://localhost:8788/health/live`。成功响应包含 `status: "ok"`、服务名和当前版本。

## 手机局域网调试

`.env.business.example` 的开发监听地址是 `0.0.0.0`，因此同一局域网手机可通过电脑的局域网 IP 访问 `8788`。同时必须：

1. 在 `CORS_ALLOWED_ORIGINS` 中加入前端的精确 origin；开发模式允许回环或 RFC 1918 私网 HTTP origin，生产模式只接受 HTTPS。
2. 放行本机防火墙的指定开发端口。
3. 在客户端显式开启“局域网 HTTP 开发模式”；正式 APK 不允许明文远程班级 API。

摄像头实时扫码在浏览器中通常要求 HTTPS 安全上下文。纯 HTTP 局域网测试仍可使用手工邀请码和二维码图片识别。

## 生产部署

- 班级业务服务置于 HTTPS 反向代理后，`BUSINESS_HOST` 可保持内网监听，公网只暴露代理端口。
- `CORS_ALLOWED_ORIGINS` 只列出实际 Windows WebView、Android appassets 或托管网页 origin，不使用通配符。
- PostgreSQL、Redis、JWT、邀请码 HMAC 和审计密钥必须使用持久且独立的生产凭据。
- 不在 URL、日志或二维码中写入 owner capability、access token、cookie、密码或完整邀请码。服务日志已对这些字段脱敏。
- 发布构建示例：

```powershell
.\tools\build_release.ps1 -ClassroomServerUrl https://classroom.example.com
.\android\tools\build_android.ps1 -ClassroomServerUrl https://classroom.example.com
```

## 班级接口

| 方法 | 路径 | 作用 |
| --- | --- | --- |
| `GET` | `/health/live` | 服务存活检查 |
| `POST` | `/v1/classes/anonymous` | 无预先账号建班；返回仅绑定该班级的 owner capability |
| `POST` | `/v1/classes` | 已登录应用用户建班 |
| `GET` | `/v1/classes` | 列出当前身份可访问的活动班级 |
| `GET` | `/v1/classes/:classId` | 读取有权访问的班级 |
| `DELETE` | `/v1/classes/:classId` | owner 删除班级并吊销邀请码、owner capability 和成员关系 |
| `POST` | `/v1/classes/:classId/invites` | owner 生成新学生邀请码；旧活动邀请码立即失效 |
| `POST` | `/v1/invites/join-anonymous` | 备注名 + 邀请码 + 设备标识加入，服务端签发 student 会话 |
| `POST` | `/v1/invites/join` | 已登录 student 用邀请码加入 |
| `GET` | `/v1/classes/:classId/roster` | owner 查看花名册 |
| `PATCH` | `/v1/memberships/:membershipId` | owner 管理成员 |
| `POST` | `/v1/classes/:classId/variant-sets/sync` | owner/教师同步已批准变式集，按稳定键去重 |
| `GET` | `/v1/classes/:classId/variant-sets` | 有权成员增量读取已批准变式集 |

除健康检查和两个匿名入口外，写请求需带项目既有的 `Idempotency-Key`。匿名学生的重复加入由 `(class_id, user_id)` 数据库唯一约束和服务逻辑做成幂等，不重复生成 membership。

## 数据库迁移

`migrations/002_classes.ts` 建立班级、成员和邀请码表；`008_class_membership_integrity.ts` 加强成员/分组完整性；`009_class_owner_capabilities.ts` 保存匿名教师的不可逆 capability 摘要；`010_variant_training.ts` 保存教师批准的班级变式集并建立班级内稳定去重约束。原始 owner token 只在创建响应中返回一次，不写入数据库。

升级现有数据库使用 `pnpm run migrate:up`。不要只修改 TypeScript model 而跳过迁移。

## 受控 AI 网关

复制 `.env.example` 的变量并设置 `OPENAI_API_KEY` 后运行：

```powershell
node .\physics-ai-gateway.mjs
```

AI 网关接口为 `/v1/physics/health`、`/v1/physics/solve`、`/v1/physics/tutor-turn`、`/v1/physics/generate-variants` 和 `/v1/physics/document-analysis`。模型输出保留人工复核边界，不能直接成为正式学情结论或未经审核的正式训练题。
