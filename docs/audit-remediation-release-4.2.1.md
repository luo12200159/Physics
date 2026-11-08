# 费曼物理 v4.2.1-rc2 审查整改与验证边界

本候选由 `analysis-report.md` 与源码逐项核对后形成。Windows、Android 学生端和 Android 教师端共享修改后的 Web 核心；两份 Android 包独立构建。旧题目 ID、state v10 和 `.pslab` 格式未改变。

| 审查项 | 本版处理与证据 | 仍需处理 |
| --- | --- | --- |
| Windows 手工安装资源遗漏 | `安装应用.ps1` 补齐 6 项脚本/服务，`Launcher.cs` 校验教学脚本；隔离目录实际安装后核对 33 个脚本、4 个样式及班级服务。审查报告称当时已安装目录缺文件，但本次核查该目录已有三项教学脚本，不能沿用旧现场结论。 | 真实用户机器的旧安装状态需单独检查。 |
| Windows 局域网作业协议落后 | `LanClassroomService.cs` 新增题干快照、真实逐题提交、提交版本链、教师批改/退回、班级及本人提交列表；测试覆盖跨班 403、幂等、参考答案不外泄、v1 文件读取。旧 `classroom-data-v1.json` 继续读取，保存时升为 schema 2，不清空记录。 | Android 与 Windows 的班级学习摘要/报告快照目前都未形成完整持久化学情同步，不能称 100% 协议或四维学情对齐。 |
| 自动判分盲区 | `answer-schema.js` 与 `learning-engine.js` 增加电磁、动量等量纲与换算、`×10^n`/上标/分数、可定位方向；专项测试覆盖单位等价、错误量纲、方向与开放题待复核。内置题 1,897 道中本次规则核验 1,320 道可自动评分、577 道待人工复核，另有 3 道示例题。 | 复杂混合答案、未验证单位及多义方向仍人工复核；零值默认精确，不凭空设定容差。 |
| 长期存储性能 | `storage-repository.js` 的更新事务只涉及变化的实体 store，不再先 `getAll()` 每张表。19 个存储事务场景包括 v10 迁移、写入中断、配额与回滚；保存中断仍显式报“数据未保存”。 | 状态规范化、快照复制及逐实体字符串比对仍随历史长度增长；未达到严格 O(1)。 |
| Android 大备份导出 | `app.js` 与原生桥优先使用 256 KiB 分块，经应用缓存临时文件再写用户选定位置；旧单块桥保留兼容。Node 桥接模拟验证 900 KiB 数据往返，双 APK Java 编译通过。 | 主线程 ZIP/加密、100 MiB 上限及真机取消/中断仍待验收；不得宣称完全流式备份。 |
| 服务端数据库测试 | 新增 GitHub Actions 容器化集成测试工作流；修复 PostgreSQL 幂等锁键中的 NUL 字符，更新匿名班级测试配置、迁移回滚序号和会话时钟。远端 5 套 / 15 项集成测试通过。 | 本机无 Docker/Podman，无法重复容器测试；CI 通过不替代真实学校部署。 |

## 有意保持的安全与内容边界

- 签名算法实际是 ECDSA P-256/SHA-256；报告中的 RSA-SHA256 说法不符源码。便携码可离线跨设备使用，因此无法离线限制复制席位。PFX 私钥和密码不在仓库及发布附件中。
- 1,231 道未核验教材小节映射和四道待教师审核草稿仍未转正；未核验不得冒充教材精确对应。
- 学生在线 AI 仍因缺少持久化监护人授权/受控网关验权而关闭；没有绕过未成年人发送边界。
- Android 未内置可靠离线公式 OCR，本版不宣称拍照自动识别已可用。
- 未迁移 Vite/动态分包、Android WebMessageCompat，也未获得 Windows 代码签名证书。Windows 安装器是**未签名开发候选**。

## 本机验证记录

- `npm run qa`：通过，含 63 项 Node QA、Android 安全、桌面/移动浏览器、双端和教师/班级测试。
- `node tools/qa_manual_install_parity.cjs`、`node tools/qa_lan_classroom_service.cjs`、`node tools/qa_content_answer_schema.cjs`、`node tools/qa_storage_transactions.cjs`、`node tools/qa_android_chunked_export.cjs`：通过。
- `pnpm --dir server run typecheck`、`pnpm --dir server run test:unit`（17 套 / 74 项）、`pnpm --dir server run build`：通过。
- 本机 `pnpm --dir server run test:integration`：缺少 Docker/Podman，5 套 / 15 项未执行。修复后 [GitHub Actions 容器运行](https://github.com/luo12200159/Physics/actions/runs/42462605562) 成功，5 套 / 15 项通过。
- Android 学生端和教师端 `build_android.ps1`：均成功，包名分别为 `com.physicsstudio.student`、`com.physicsstudio.teacher`，版本 4.2.1。
- `tools/build_release.ps1`：Windows 安装器和 ZIP 构建成功；Windows Authenticode 状态 `NotSigned`。

本次未进行 Android 真机安装/备份文件选择、第二台 Windows 电脑安装、实际跨设备局域网课堂操作和教师内容审核；数据库容器测试仅在 GitHub Actions 自动运行。
