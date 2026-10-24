# 师生双端 v4.1.0 测试报告

执行日期：2026-10-23；工作区 `物理研习室`。本报告只记录实际执行结果，不把浏览器模拟或 Java 本机服务测试称为公网/真机端到端验收。

## 已通过

| 命令或检查 | 结果 | 验证边界 |
| --- | --- | --- |
| `npm run qa` | 退出码 0；Node QA 56 脚本及后续 Android 安全、桌面/手机浏览器、双应用、学生 v4、交互耗时、教师、班级 UI、匿名加入、桌面资源一致性检查均通过 | 浏览器班级请求使用受控模拟服务，不等于 PostgreSQL 部署实测。 |
| `pnpm --dir server run typecheck` | 退出码 0 | TypeScript 静态检查。 |
| `pnpm --dir server run test:unit` | 17 个文件、72 个用例通过 | 覆盖逐题答案校验、答案键不下发、仅可靠单选可自动判定等纯逻辑与路由边界。 |
| `server/node_modules/.bin/tsc.cmd -p server/tsconfig.json --noEmit`、在 `server/` 中执行 `node_modules/.bin/vitest.cmd run tests/unit` 与 `node_modules/.bin/tsc.cmd -p tsconfig.build.json` | v4.1.0 最终代码均退出码 0；17 文件/72 用例 | 版本更新后本机 pnpm 包管理包装层要求非交互清理 `node_modules` 而拒绝执行；直接使用同一已安装依赖完成静态检查、单测和生产编译，没有跳过测试。 |
| `node tools/qa_android_lan_classroom.cjs` | 退出码 0 | 编译并启动真实 Java 教师局域网服务，以两个模拟客户端走三题发布、加入、逐题提交、不可空交、幂等、越权复核拒绝、退回、订正、历史版本、持久重启与删班；同时拒绝缺少题干快照和重复题目快照的发布请求。 |
| `npm run qa:classroom-ui` | 退出码 0 | 浏览器教师/学生双界面真实 DOM 操作，网络层为模拟接口；390×844 弹窗无横向溢出。 |
| `pwsh -NoProfile -File android/tools/build_dual_android.ps1` | 退出码 0；两包签名验证与 SHA-256 生成成功 | 构建成功不等于真机安装/覆盖升级通过。 |
| `pwsh -NoProfile -File tools/build_release.ps1` | 退出码 0；源码 ZIP 可移植性通过 | Windows 安装器未代码签名；本任务的 Android 作业回归不能推导 Windows 局域网服务功能等价。 |

## 未通过 / 未验证

- `pnpm --dir server run test:integration`：退出码 1。5 个 Testcontainers 套件均在启动前报 `Could not find a working container runtime strategy`，15 个断言跳过。原因是本机无可用 Docker/Podman；PostgreSQL 迁移 `012_assignment_submission_versions.ts` 未在真实数据库执行，不能宣称数据库端到端已通过。需在具有容器运行环境的 CI 中运行迁移、集成测试并检查旧库升级。
- Android 真机未验证：教师热点/同网发现、摄像头二维码、后台恢复、输入法遮挡、签名覆盖升级、低内存与多设备并发。至少用一台教师设备与两台学生设备重复核心流程。
- 公网 HTTPS 班级服务未配置，跨网络/跨地域作业下发未验证。局域网模式只在教师设备服务可达时有效。
- Windows 内置 `LanClassroomService.cs` 未同步本次 Android/PG 的完整作答版本与复核协议；Windows 4.1.0 构建物只用于源码/构建检查，不作为本次作业闭环交付。
- 实验变量采集、课堂实时答题、完整四维学情统计、教师作业草稿编辑/模板复用、自动评分正式入库尚未完成，不能称为通过。

## 最短人工验收与失败复现

1. 教师端创建班级并生成邀请码；学生端同网加入。教师从本地完整题库选三题发布；学生打开题干、填写三题并提交。教师应看到三份逐题答案与服务端提交时间。
2. 教师退回并写订正要求；学生重交。教师应同时看到第一次和第二次答案；同一 `clientEntityId` 网络重试不得新增提交。另一个学生和另一班教师不得读写此记录。
3. 关闭教师服务或断网时，学生草稿仍在本机；页面只能显示“待同步/未确认”，不可显示已提交。恢复后检查服务端确认与历史版本。
4. 在配备 Docker/Podman 的机器执行 `pnpm --dir server run test:integration` 和 `pnpm --dir server run migrate:up`，确认迁移、权限与 SQL 查询；未完成前不要宣称 PostgreSQL 服务已生产就绪。
