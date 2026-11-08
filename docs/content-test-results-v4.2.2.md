# v4.2.2 教学内容候选测试结果

执行日期：2026-11-08；源码分支：`feat/teacher-student-loop-v4`。以下为本机实际执行，不把模拟测试写成真机课堂验收。

| 命令/流程 | 实际结果 |
| --- | --- |
| `node tools/qa_content_bank_migration.cjs` | 先用旧安装标记复现跳过课程元数据更新，修复后通过；1,897 道题、1,320 可自动评分、577 待人工评分，原学习笔记保留 |
| `node tools/qa_content_quality_v422.cjs` | 通过；1,416 原创参数题、100 道高二教材册修正、3 个课程单元、5 组补救材料 |
| `node tools/qa_curriculum_mapping.cjs`、`node tools/qa_motion_representation_drafts_v401.cjs` | 通过；错误册别保持 unresolved，四道草稿仍待人工审核 |
| `node tools/content_mapping_report.cjs` | 生成 1,897 道逐题矩阵：内部目录匹配 766，待核验 1,131；可自动评分 1,320，人工评分 577 |
| `powershell -NoProfile -ExecutionPolicy Bypass -File android/tools/build_dual_android.ps1` | 成功生成独立学生、教师 APK；versionName 4.2.2，versionCode 40202 |
| `powershell -NoProfile -ExecutionPolicy Bypass -File tools/build_release.ps1` | 成功生成 Windows 安装程序、ZIP 和标准目录源码 ZIP；安装程序未正式代码签名 |
| `npm run qa` | 退出码 0；64 个 Node 脚本，Android 安全、桌面/手机浏览器、师生界面、数据迁移、交互延迟、班级流程和三端源码一致性检查均完成 |
| `pnpm --dir server run typecheck` | 退出码 0 |
| `pnpm --dir server run test:unit` | 17 个测试文件、74 项通过 |
| `pnpm --dir server run build` | 退出码 0 |
| `git diff --check` | 退出码 0；仅有 Windows 换行符提示 |

## 包与源码边界

- 两个 APK 内 32 个共享业务文件通过 `qa_apk_source_parity_v402.cjs` 与当前源码对比。Windows 构建源与 Android 共用 `index.html` 和业务脚本。
- 构建产物 SHA-256 见 `发布/SHA256SUMS-v4.2.2-rc1.txt`。Windows 安装程序是未签名开发候选；Android 为本机开发签名，不具备正式商店发行保证。
- 本机未安装 Docker，未运行 PostgreSQL/Redis 容器集成测试；服务端仅完成 typecheck、单测和构建。旧版远端 CI 结果不自动视为本次候选通过。
- 未运行真实 Android 设备上的跨设备课堂、升级安装、文件导出取消/中断和长期学习效果验证；教材目录、评分量规与内容科学性仍待教师人工审核。没有学生配平的前后测数据，不计算能力提升。
