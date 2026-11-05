# v4.2.0 内容专项与离线授权核验记录

## 第一阶段：答案结构、人工评分、教材节映射

修改文件：`answer-schema.js`、`learning-engine.js`、四个内置题库脚本、`app.js`、`curriculum-taxonomy.js`、`curriculum-mapping.js`、三端资源清单、内容 QA。

- 内置完整题 1,897 道（另有 3 道示例题），原有 ID 未改；1,253 道具备可判读 `answerSchema`，其参考答案通过同一评分器核对；644 道保留人工复核。客观题的字符串答案先转成结构化作答再评分；解释、实验论证和不明确单位/方向的答案不自动判对。显式 `autoScorable:false` 优先于现存答案规范；畸形规范不能绕过评分前校验。
- 已评分前的 `review-required` 仍不计入正确率和错题。存储升级只同步未被用户编辑的内置题评分与目录元数据；用户自改答案不覆盖，旧作答 evidence ID 不变。state 仍为 v10，旧 `.pslab` 导入路径未改。
- 教材目录精确映射 666/1,897，待教师核验 1,231。逐题报告见 `content-mapping-report.json`，按模型/知识点汇总的清单见 `content-teacher-review.md`。未核验不等于错误，不能自动认为目录已经完整。

执行：`node tools/qa_content_answer_schema.cjs`、`node tools/qa_content_bank_migration.cjs`、`node tools/qa_curriculum_mapping.cjs`、`node tools/content_mapping_report.cjs`。上述命令均已通过；报告摘要为 `catalogExact=666`、`unresolved=1231`。轻量题库 v4 schema 增加可选的答案规范与教材节映射字段，拒绝非法规范数值；加密 `.pslab` 与旧版未加密导入均验证新字段原样保留。`node tools/qa_backup_validator_fields.cjs` 与 `node tools/qa_encrypted_backup_v401.cjs` 通过。备份格式版本不变，旧文件仍可导入。

## 第二阶段：三条试点教学序列

修改文件：`teaching-sequences.js`、`experience-shell.js`、`learning-lab.js`、`learning-engine.js`、三端资源清单、`tools/qa_content_remediation.cjs`。

- 高一匀变速直线运动串联四种表征的原创草稿和现有恒加速度模型；模型条件、速度、位移均在 QA 中核算。四题仍为“待教师审核”，不进入正式题库与掌握证据。
- 八年级平均速度与九年级欧姆定律复用已存在的题目、目录和理想化模型；同模板数值变式明确只算练习，不算独立诊断或迁移证据。跨情境题、延迟复测题尚须教师选定已审核的独立题模，不伪称自动完成整套闭环。
- 教师专项预览新增错因对应教学活动和可追溯 evidence ID；不足 3 条已评分证据只建议补测，不作稳定能力判断。学生“学习建议”使用相应课程的诊断、预测、模型、练习和延迟复测文本，不改变页面布局或正式评分状态。

执行：`node tools/qa_motion_representation_drafts_v401.cjs`、`node tools/qa_content_remediation.cjs`，均通过。真实师生课堂操作、跨日复测和教师内容审核未在自动测试中完成。

## 授权与发布边界

修改文件：`activation.js`、`ActivationManager.cs`、管理器构建与 QA、`version.json` 等。`PSA1` 格式、旧设备绑定码和公钥对象原字段保留。新码带签名的 `scope:portable` 且无设备字段；C# PFX 导入签名与 JS Web Crypto 验证各有自动测试。管理员 EXE v1.2.0 登录密码仅为 UI 门槛，签发还须独立强密码 PFX。离线便携码无法限制跨设备复制次数。

执行：`node tools/qa_portable_activation.cjs` 通过；`powershell -NoProfile -ExecutionPolicy Bypass -File tools/qa_activation_manager.ps1` 通过（50 项）。

2026-11-04 构建：Android 学生端、教师端和 Windows v4.2.0 开发候选均成功，Windows 包未签名。构建后 `npm run qa` 一次通过，包括 61 个 Node 脚本、Android 安全、桌面/移动浏览器、双端及教师/班级检查；`npm run qa:activation-manager` 通过 50 项，服务端单元测试 17/17 套、74/74 项通过，服务端 TypeScript 构建通过。完整 `pnpm --dir server run test` 因本机缺少容器运行时，5 套 PostgreSQL 集成测试无法启动（15 项跳过），未标为通过。浏览器交互 QA 不替代真机性能验收。

2026-11-05：仓库外的便携 PFX 与新公钥已初始化，原有主公钥未替换；新公钥的 SPKI SHA-256 和 `kid` 校验通过。Android 双端与 Windows 已用该公钥重建，`npm run qa` 再次通过。前三次本机归档解锁输入未能通过 PFX 解密校验；第四次使用原归档密码成功签发仅有效 1 天的测试码。测试码保存在仓库外，未打印或上传。实际签名为 64 字节 IEEE P1363，载荷 `scope=portable`、`kid=E42766107F91B6F4`、无设备绑定字段；仓库中 `activation.js` 与 `activation-public-key.js` 对两个不同的 64 字符设备标识均验签通过。两份 Android APK 和 Windows 安装程序内的公钥资源 SHA-256 均与源码一致。此测试验证本机 PFX 签发和客户端校验，**不等于**真机安装激活或第二台电脑的 PFX 恢复。PFX、密码和测试码未进入仓库或发布包。Android 真机更新安装、真实第二台 Windows 电脑密钥恢复、教师审核 1,231 条目录映射和四道草稿均待人工验证。
