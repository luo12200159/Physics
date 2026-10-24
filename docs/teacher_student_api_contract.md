# 师生作业协议（v4.1.0 开发候选）

此文以 `server/src/modules/learning/contracts.ts`、`routes.ts`、`service.ts` 和 Android `LanClassroomHost.java` 为准。PostgreSQL 服务与 Android 教师本机局域网服务共用下列业务路径；两者的身份建立方式不同，不能把同网服务当作公网服务。

## 身份与边界

- 教师通过自己班级的服务端身份或本机 owner capability 管理该班；学生通过有效邀请码加入后取得学生身份。邀请码和二维码不包含 owner capability。
- 服务端在每次作业发布、读取、提交和复核时校验班级归属、成员状态与目标范围；学生提交只能写自己的 membership。客户端显示/隐藏按钮不充当权限校验。
- `classId`、`assignmentId`、`submissionId` 均为服务端 UUID；题目 ID 沿用现有题库字符串，不重新编号。重复网络请求使用 `Idempotency-Key` 与稳定 `clientEntityId`，不得创建重复作答。

## 主要接口与数据

| 操作 | 接口 | 权限与关键规则 |
| --- | --- | --- |
| 发布或保存草稿 | `POST /v1/classes/:classId/assignments` | 班级 owner/教师；`publish` 为真时必须有完整题目快照。`targetType` 为 class/group/student，组或学生目标须属于本班。 |
| 查看作业 | `GET /v1/classes/:classId/assignments` | 学生只见本人有权限的已发布作业；教师见本班作业。响应 `questionItems` 不含 `correctAnswer`。 |
| 逐题提交 | `POST /v1/assignments/:assignmentId/submissions` | 仅目标学生；`answers` 非空，每题有 `questionId` 与真实非空 `response`，缺题、重复题或越界题均拒绝。只有最近提交被教师退回后才可生成订正版本。 |
| 查看自己的提交 | `GET /v1/assignments/:assignmentId/submissions/me`、`GET /v1/classes/:classId/assignment-submissions/me` | 仅当前学生；返回本人版本、状态、反馈；以可选 UUID `cursor` 分页。 |
| 查看班级提交 | `GET /v1/classes/:classId/assignment-submissions` | 本班 owner/教师；包括学生备注名、逐题答案、提交时间、版本、复核状态、总分以及已确认的逐题分；以可选 UUID `cursor` 分页。客户端必须读完全部页面后才计算未交和均分。 |
| 查看待批改 | `GET /v1/classes/:classId/review-cases` | 本班 owner/教师；包含当前作答及前一版本作答。 |
| 教师批改 | `PATCH /v1/review-cases/:reviewId` | 本班 owner/教师；`decision` 为 approve/return/rejudge，附总分、逐题分（允许 `null` 表示尚未评分）与非空理由。逐题 ID 必须属于本次提交且不得重复，数值必须在 0—100。复核前不把开放题计入正确率。 |

作业题目快照至少含 `id/title/content/questionType/options/knowledgePointId/difficulty`；服务端私有快照可保留精确单选答案供未来可靠自动判题，但任何学生读取路径必须剔除答案。提交版本为 `version >= 1`，`previousSubmissionId` 指向上一不可变提交。复核记录与提交版本分开保存。逾期是根据 `dueAt` 和当前时间计算的属性，不覆盖提交/复核状态。

状态：作业 `draft → published → closed`；提交初始 `submitted`，经教师复核到 `accepted` 或 `returned`，退回后新建下一提交版本。`pending` 人工复核不表示答错。当前服务端尚无已上线的作业草稿编辑/关闭 API；不能在客户端假装这些转换可操作。

## 离线与兼容

学生草稿按用户 ID 和作业 ID 存在本机仓储。网络写入失败可能排队，界面必须显示“待同步”，只有服务端回执才显示“已确认”。Android 教师服务的本地二进制状态从 v1 兼容读取并升级到 v2，历史提交版本按既有时间序列回填；PostgreSQL 通过迁移 `012_assignment_submission_versions.ts` 回填版本并保留旧行。旧作业缺少题干快照时客户端仅在本地题库可解析时展示，否则应提示重新发布；不得合成题干。学生学习 state 仍为 v10，旧 `.pslab` 恢复逻辑不改变。

## 数据口径

作业进度按服务端真实提交记录计数；草稿、无答案标记、未批改开放题均不是已评分证据。班级学情基础统计对每名学生、每份作业只选择版本号/提交时间最新的记录；只有状态为 `accepted`、非待复核且总分为有效数值的提交进入作业和学生均分。知识点统计只读取这些提交中非空的 `perQuestionScores`，少于 3 条已评分题目证据时只显示“证据不足”，不作掌握判断。每个统计行保留 submission ID，知识点证据使用 `submissionId:questionId` 追溯。提交分页未完整读取时，界面不计算未交人数、均分或知识点表现。首次与订正的因果性提升判断、不同任务之间的可比复测不由该描述性统计自动生成。
