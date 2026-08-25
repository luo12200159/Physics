# 更新记录

## v3.4.1（恢复 v3.3.0 界面等价的 Android 双端，2026-08-25）

- 学生端与教师端重新使用 v3.3.0 的共享 `index.html`、`app.js`、`learning-lab.js` 和 `experience-shell.js`，移除 v3.4.0 曾引入的简化双端页面与重复业务实现。
- 学生端固定为 v3.3.0 学生模式，保留“今日、练习、错题、我的、拍题”以及完整学习模块；教师端固定为 v3.3.0 教师模式，保留教师工具条和“今日、学生、班级、管理”工作区。
- 两端仍使用独立包名，可同时安装；普通设置不能跨角色切换，联网管理权限继续由服务端 RBAC 验证，教师 PIN 只作为教师端本机二次锁。
- 题目 ID、1900 道完整题、232 条考试索引、学习 state v9、变式证据和 `.pslab` 格式均未改变。

## v3.4.0（Android 学生端 / 教师端独立发布，2026-08-24）

- 应用拆分：新增 `app-student`（`com.physicsstudio.student`）和 `app-teacher`（`com.physicsstudio.teacher`）两个独立 Android application module、独立入口、独立资源清单和构建产物。旧 `com.physicsstudio.studyroom` 不被覆盖。
- 权限边界：学生包不打包教师页面或教师管理脚本；教师包不提供学生作答写入路径。云班级以服务端 RBAC 为最终权限源，学生直接调用建班接口返回 403；创建者只管理自己拥有的班级。
- 账号与凭据：服务端新增限流的学生/教师注册接口；Android 刷新凭据和 owner capability 迁入 Keystore AES-GCM 保护的私有存储，访问令牌只留在当前 WebView 会话。
- 学习与教学：学生端按“任务—作答—错题—短训练—变式—复测”呈现真实证据；教师端支持班级/小组/个人任务、花名册、分组、学情样本量、人工复核和变式审核。既有 1900 题、题目 ID、state v9、`.pslab` 和 AI 隐私边界不变。
- 动态模型：修复牛顿模型摩擦力滑块未映射到 `opposingForce` 的问题；运动曲线、波形、能量柱和电路增加实时点、渐变、投影和立体层次，参数改变时重新计算 SVG 与数值。
- 证据真实性：变式作答不再写入固定 1 秒用时，提示等级由实际点击自动记录；查看母题完整解析后立即重做仍保留第 5 级辅助标记，不能被误计为独立正确证据。
- 离线任务：教师离线新建任务时显示明确的“待同步草稿/待同步发布”状态，联网后沿用持久化队列和幂等键补传，不再把队列状态误渲染成已发布服务端任务。
- 响应优化：学生端和教师端仅按需渲染当前页面，不再在启动和身份变化时同时构造所有隐藏页面及题库卡片；搜索继续使用短防抖，在线同步有重入保护和固定超时。
- 迁移：由于 Android 应用沙箱按包名隔离，新包不能直接读取旧单体包数据。必须在旧应用导出 `.pslab`，在新学生端或教师端导入；导入继续校验 manifest、大小和 SHA-256，失败不覆盖当前数据。
- 验证：服务端 TypeScript 类型检查、67 项单元测试和生产构建通过；两个角色入口的浏览器 smoke test、动态模型参数测试和 Android 资源隔离检查通过。Testcontainers 集成套件已运行，但当前机器无容器运行时，5 个套件未进入数据库断言，不能记为通过。

## v3.3.0（完整专项变式训练，2026-08-20）

- 原问题：母题后的“举一反三”仅给出改变条件、逆向设问和情境迁移的文字任务，学生需要自行构题，不能直接作答，也没有可核验的答案、解析、教师审核和正式迁移证据。
- 生成与校验：新增独立 `variant-generator.js`，优先复用已审核本地题模/专项题，输出 2～3 道完整变式。新增 `variant_generation_v1` 协议和 `/v1/physics/generate-variants`；AI 生成与交叉验证分为两次调用，关键检查失败或无法确定的内容进入人工审核。
- 学生闭环：母题结果页直接进入近迁移、逆向/结构迁移、情境/表征迁移训练。答案默认隐藏，主动查看完整解法记为第 5 级提示；作答保存用时、提示、错因、验证状态及与母题关系。
- 教师减负：今日页集中显示待审核 AI 变式；题目详情支持并排预览、单题/全部批准、编辑、退回、重生成和加入作业。分层作业支持变式数量、层级比例、错题优先与迁移角色，并可保存 preset。
- 数据与兼容：学习状态升至 v9，新增 `variantSets`、`variantAttempts`、`variantPresets`；IndexedDB、完整备份和班级同步协议同步扩展。旧 `transferNotes`、题库、题目 ID、激活、教师 PIN、班级身份和历史作答保持可读。
- 证据边界：只有已验证且低提示独立正确的完整变式作答才能作为迁移证据；打开题目、查看答案或手写笔记不能抬高掌握。母题编辑会使缓存过期，历史证据保留。
- 质量范围：确定性本地生成以已有可核验题模和审核题族为边界；开放实验设计、复杂图像和无法独立复算的 AI 题必须人工复核。本版本不把生成题伪装为真题或第三方题源。
- 本机验证：根 `npm run qa` 全部通过，包括 40 个 Node 专项、Android 安全、桌面/移动浏览器、交互延迟、教师端、班级 UI、匿名学生加入和双端资源一致性；服务端 TypeScript 类型检查、16 个单元测试文件共 65 项和生产构建通过；Windows v3.3.0 安装器/ZIP/源码 ZIP及 Android v3.3.0 APK/ZIP 均成功生成。
- 未验证边界：当前主机没有 Docker/Podman，5 个 PostgreSQL/Redis Testcontainers 集成套件无法启动容器，14 项业务断言均未执行；Windows 安装器未配置商业代码签名证书，仍为未签名开发发布包。这两项均未记为通过。

## v3.2.0（费曼物理学习闭环与多表征升级，2026-08-15）

- 品牌与兼容：对外名称更新为“费曼物理”，统一版本源升至 `3.2.0`。保留 Android 包名 `com.physicsstudio.studyroom`、`physicsstudio://`、历史存储目录、内部 Windows 程序名、激活协议、备份格式、题目 ID 和题目来源/版权字段，旧版数据无需破坏性迁移。
- 复习证据：到期复习只能进入真实作答流程；系统表现决定基础复习评级，主观难度/信心只作元数据。第 5 级完整解法不计独立完成，旧 `reviews` 继续兼容。
- 多轮导师：新增客户端 `tutorTurn` 适配层，优先请求受控 `/v1/physics/tutor-turn` 并校验结构化响应；失败退回离线五级提示。仓库内 `physics-ai-gateway.mjs` 尚未实现该新端点，不能将回退结果表述为联网多轮推理。
- Android OCR：原生桥新增 `getOcrCapability` / `ocrImage` 协议及安全降级。当前依赖精简 APK 未捆绑离线 OCR 引擎和模型，能力会明确返回不可用，前端再尝试 `TextDetector`，否则人工录入；保存前仍要求确认题干。
- 多表征与模型：新增 `physics-visuals.js`，提供受力图、运动图像、电路图、实验散点拟合和基础光路图，以及匀变速运动、牛顿第二定律、机械能、碰撞、波动等参数驱动模型。模型交互不自动形成掌握证据。
- 专项覆盖：保留既有 400 道九年级/高三专项题和四类迁移角色；新增按年级、知识点、模型族和迁移角色的缺口报告。八年级、高一、高二无完整审核题族时如实显示缺口，不自动发布低质量生成题。
- 教师分层作业：基于可追溯证据生成学生范围、知识点、题目来源和候选数量预览；只有教师确认后才形成待发布作业，AI 不得直接发布或修改正式学情结论。
- 发布集成：Windows 安装器、源码 ZIP 和 Android APK 资源清单均加入 `physics-visuals.js`；外部产物名统一为 `费曼物理-安装程序-v3.2.0.exe`、`费曼物理-Windows-v3.2.0.zip`、`费曼物理-源码-v3.2.0.zip` 和 `费曼物理-Android-v3.2.0.apk`。
- 测量边界：待人工复核不算错题；不可比前后证据不计算提升百分点；教师形成性结论不伪装成标准化测评分数；所有学情结论继续追溯 evidence IDs。
- 本机验证：服务端 TypeScript 类型检查、16 个单元测试文件共 64 项和生产构建通过；桌面/移动浏览器、交互延迟、教师端、班级 UI、匿名学生加入、双端一致性及复习/AI/模型/题库/备份专项 QA 通过；Android APK/ZIP 与 Windows 安装器/ZIP/源码 ZIP 均成功生成。
- 未验证边界：当前执行环境禁止局域网测试所需的本机 TCP 监听，根门禁在真实 LAN 服务测试处停止；本机无 Docker/Podman，5 个 Testcontainers 套件未进入业务断言；当前 Windows 账户无法访问发行者 CNG 私钥，激活码签发桥未复验；Windows 安装器无商业代码签名证书。以上均未伪装成通过。

## v3.1.8（Android/Windows 同网跨设备班级，2026-08-11）

- 原问题：Android 教师页提示“尚未配置可访问的班级服务器地址”；手机只有局域网请求客户端，没有可承载班级数据的服务，所以手机教师无法建班，其他设备也无法连接该手机完成入班、成员管理和作业读取。
- 根因：v3.1.7 只有 Windows 安装包启动持久化 TCP/UDP 班级服务。Android 的 `LanClassroomTransport` 只能发现和调用其他主机，`MainActivity` 没有启动服务、持久化班级状态或向网页桥报告本机可分享地址。
- 修改文件：`android/src/com/physicsstudio/studyroom/LanClassroomHost.java`、`LanClassroomTransport.java`、`MainActivity.java`、`AndroidManifest.xml`、`classroom-client.js`、`LanClassroomService.cs`、双端说明、版本源及局域网专项 QA。
- 联机实现：Android 应用运行时启动与 Windows 兼容的 TCP `8788` 班级 API 和 UDP `18788` 发现服务，班级、成员、分组、作业和提交记录持久化在 Android 应用私有目录。建班优先调用本机回环服务，不再等待无结果的网络发现；二维码分享使用教师设备的私有 IPv4 地址。
- 网络边界：教师可在任意受支持的 Windows/Android 设备及任意本地网络中创建班级，不依赖固定服务器地址。学生加入时，主机验证请求来源必须为回环地址或与主机接口同一 IPv4 子网；不同 Wi-Fi、蜂窝网络、公网或被 AP 隔离的设备会被拒绝。该版本不是公网云班级。
- 权限与持久化：创建者获得只绑定该班级的 owner capability；学生邀请码仅建立 `student` membership。owner、邀请码、设备和会话凭据只保存摘要。重复入班幂等，邀请码轮换使旧码失效，删班后旧邀请码立即不可用；原有题库、学习记录、激活信息和题目 ID 均不迁移或删除。
- 作业闭环：Windows 与 Android 内置服务现在都持久化班级作业和学生提交；本地 owner 创建作业不再被误判为离线队列。学生在同一局域网重新连接后可读取已发布作业。
- 新增测试：Android 真实 TCP 服务测试覆盖建班、邀请码、两台模拟学生设备、幂等入班、花名册、作业下发、重启持久化、删班失效和异网拒绝；Windows 测试增加作业下发/提交；网页客户端测试验证 Android 本机建班无需 UDP 等待、二维码私网地址和 owner 作业立即送达。
- 最终测试：根 `npm.cmd run qa` 全部通过（32 个纯 Node 专项、Android 安全与真实主机、桌面/移动浏览器、交互延迟、教师端、班级 UI、学生匿名加入和双端源码一致性）；服务端 TypeScript 类型检查、64 项单元测试和生产构建通过；Windows 与 Android v3.1.8 产物构建通过。
- 环境限制：依赖 PostgreSQL/Redis Testcontainers 的 5 个集成测试文件因本机没有 Docker/Podman 容器运行时，在启动测试基础设施时失败，14 项业务断言均未执行；该结果不记为通过。内置局域网服务的独立 TCP、持久化、权限和多设备测试不依赖容器，已通过。
- 发布边界：Windows 安装器未配置商业代码签名证书，构建状态为 `unsigned-development-only`。Android APK 使用项目现有专用证书签名。教师 Android 应用关闭或进程被系统终止后，本机班级服务不可达，重新打开应用后会从私有持久化文件恢复。

## v3.1.7（局域网多设备班级服务，2026-08-11）

- 原问题：Windows 和 Android 页面虽然已有建班、删除、邀请码及二维码入口，但安装包中的默认地址曾指向无监听服务或设备自身回环地址；网络异常又被统一映射为“无法连接”，导致双端无法形成真实跨设备班级。
- 根因：桌面安装包没有随应用运行的可持久化班级服务；手机不能通过 `127.0.0.1` 访问教师电脑；二维码未稳定携带其他设备可达的局域网主机地址；WebView 的安全策略也不允许直接放开任意明文远程请求。
- 修改文件：`LanClassroomService.cs`、`LanClassroomNative.cs`、`Launcher.cs`、`Installer.cs`、`Uninstaller.cs`、`classroom-client.js`、`experience-shell.js`、`android/src/com/physicsstudio/studyroom/MainActivity.java`、`android/src/com/physicsstudio/studyroom/LanClassroomTransport.java`、双端构建脚本、README 和专项 QA。
- 联机实现：Windows 应用启动时托管 TCP `8788` 班级服务和 UDP `18788` 发现服务，监听专用局域网并把数据原子持久化到 `%LOCALAPPDATA%\物理研习室\ClassroomService`；Android/Windows 原生桥只允许回环或私有网段目标。网络不可达时仅保留本机学习，不伪造建班或入班成功。
- 权限与身份：创建班级生成 UUID `class_id` 和独立 owner capability；服务端只保存 owner token、学生设备 token 和邀请码的 SHA-256 摘要。邀请码仅授予 `student` 成员权限，其他教师和学生均不能管理或删除该班级。重复加入同一设备返回原 membership，不产生重复成员。
- 邀请与二维码：每班生成 22 位密码学随机邀请码；刷新邀请码立即使旧码失效。新二维码使用紧凑格式 `physicsstudio://join?c=<CLASS_ID>&i=<INVITE_CODE>&s=<LAN_IP>`，同时兼容旧版 `class_id/code/server`。手工输入、摄像头扫码和二维码图片均进入同一个服务端加入函数。
- 多设备验证：自动化集成测试让 1 个主设备和 8 个并发设备加入同一班级，确认 9 个唯一成员、同设备幂等重入、跨 owner/学生删除被拒绝、重启后持久化、邀请码轮换与删班失效。该测试证明协议支持多个局域网设备，不代表公网或大规模并发容量认证。
- 迁移策略：只清理旧的 `127.0.0.1:8787`、`localhost:8787` 和 Android appassets 班级服务配置；不删除题目、学习记录、激活状态、IndexedDB 或其他 localStorage 数据。旧长格式二维码仍可解析。
- 最终测试：`npm.cmd run qa` 全部通过（32 个纯 Node 专项脚本、Android 安全与真实 LAN 请求、桌面/移动浏览器、交互延迟、教师端、班级 UI、学生匿名加入和双端源码一致性）；服务端 TypeScript 类型检查与生产构建通过，16 个单元测试文件共 64 项通过；Windows 最终安装包静默安装及内置班级服务联合 smoke test 返回 0；Android APK 构建和签名验证通过。
- 环境限制：5 组 PostgreSQL/Redis Testcontainers 集成套件因本机没有 Docker/Podman 而未执行到业务断言，明确记为环境阻塞而非通过。局域网服务的独立持久化、并发、权限和生命周期套件不依赖容器，已全部通过。
- 发布边界：内置服务面向同一可信 Wi-Fi/局域网，Windows 教师应用必须保持运行并允许专用网络访问。跨城市或不同网络仍需部署 `server/` 的 HTTPS 托管方案；本版本不虚构公共云地址。Windows 产物若未提供商业证书，仍为未签名开发发布包。

## v3.1.6（真实联网班级、邀请码/二维码加入与删除闭环，2026-08-11）

- 原问题：Android 学生输入邀请码或识别二维码后统一显示“无法连接班级服务”，教师端创建的班级可能只保存在本机；班级无法跨设备恢复，删除后邀请码也不能由服务端可靠失效。
- 根因：安装版把 `127.0.0.1:8787` 当作班级 API（该端口实际属于 AI 网关，且手机回环地址只指向手机自身）；Fastify 声明了 CORS 配置却没有注册 CORS 插件；业务端缺少班级详情与删除接口；客户端网络异常路径创建本地多人班级；学生二维码和手工输入存在重复加入路径。
- 修改文件：`classroom-client.js`、`classroom-config.js`、`experience-shell.js`、`index.html`、`server/src/app.ts`、`server/src/config.ts`、`server/src/modules/classes/*`、`server/src/modules/invites/*`、`server/migrations/009_class_owner_capabilities.ts`、Windows/Android 构建脚本及对应 QA/文档。
- 数据库：沿用 `classes`、`memberships`、`invites` 的 UUID/唯一约束；`009_class_owner_capabilities.ts` 新增只保存 HMAC 摘要的匿名教师 owner capability。删除班级在同一事务中归档班级、吊销活动邀请码和 owner capability、移除成员并写出同步/审计事件。
- 权限：任何应用用户可用非空名称建班；未登录创建者获得只绑定一个 `class_id` 的 owner capability。学生邀请码只创建 `student` 成员和学生会话，owner token 不进入二维码、邀请码、分享文本或备份。其他教师/学生不能管理或删除该班。
- 网络：客户端改为 online-first + offline learning fallback；安装包不再猜测 localhost。发布构建可注入 HTTPS 业务地址；GET/HEAD 最多重试一次，写请求不自动重试，15 秒超时。网络失败不再写入假的已加入/已创建状态。
- 二维码：手工邀请码、摄像头 jsQR 扫描和二维码图片解析统一进入 `joinClassByInviteCode()`；支持纯 22 位邀请码和 `physicsstudio://join?class_id=<UUID>&code=<CODE>`，不把文件名/Base64 当邀请码。
- 迁移策略：不改变题目 ID、学习 state schema、IndexedDB/localStorage 学习记录、激活数据或旧 bearer 班级账号；旧本机学习数据继续离线可用。旧的本机模拟班级不会被冒充为服务端已加入状态。
- 新增/强化测试：班级客户端联网/断网、二维码 payload、owner 删除、匿名建班、学生幂等加入、CORS、私网开发 origin、服务端路由/权限和数据库生命周期集成测试。
- 本机验证：`npm.cmd run qa` 通过（29 个 Node 专项脚本及 Android 安全、桌面/移动浏览器、交互延迟、教师端、班级 UI、学生匿名加入、双端一致性门禁）；服务端 TypeScript 类型检查、16 个单元测试文件共 64 项测试和生产构建通过；Windows 安装器/发布 ZIP/源码 ZIP 与 Android APK/发布 ZIP 均重新生成。
- 环境边界：依赖 PostgreSQL、Redis 和 Testcontainers 的班级数据库生命周期集成套件因本机没有 Docker/Podman 而未执行到业务断言，不记为通过。Android 激活桥独立测试因本机没有发行者 CNG 私钥而未完成，不影响班级加入测试结果，但正式激活发布仍需在持有私钥的构建机复验。
- 部署边界：没有收到可用的公共 HTTPS 班级服务域名或部署凭据，因此安装包不预置虚构地址。跨设备班级需要先部署 `server/`、执行迁移并在构建时注入该 HTTPS 地址；未配置时应用明确显示“班级服务尚未配置”，不会伪造创建或加入成功。
- 发布边界：Windows 安装器没有商业代码签名证书，构建状态为 `unsigned-development-only`，不能表述为已签名正式发行包。

## v3.1.5（双端页面切换与教师中心流畅度修复，2026-08-10）

- 原问题：学生端切换“今日/练习/错题/我的”、进入学情分析，以及教师端打开“今日/学生/班级/管理”时，会重复计算全量学情并重建大量隐藏 DOM，低配置 Android WebView 和 Windows WebView2 上可出现可感知停顿。
- 根因：学生导航每次替换整个学生外壳；教师中心默认一次生成全部工作区后再隐藏；知识点证据按主题反复扫描完整题库与作答数组；题库统计和隐藏分析页仍执行无用计算；全屏背景模糊增加合成开销。
- 修改文件：`experience-shell.js`、`learning-lab.js`、`learning-engine.js`、`app.js`、`experience-shell.css`、`learning-lab.css`、`tools/qa_interaction_latency.cjs`、`tools/qa_targeted_teacher_ui.cjs`，以及统一版本和发布文档。
- 修改方式：学生页保留固定头部与底部导航，只更新主内容；搜索输入采用短防抖；学情分析空闲预热并复用汇总结果；教师“今日”使用轻量首屏，“学生/班级/管理”分别按需生成；知识点证据改为一次分组后聚合；隐藏分析页不再构造 1900 题卡片。
- 交互修复：消除了学生主内容状态属性与导航属性重名造成的“开始作答点击无响应”；教师工作区按当前标签重新生成，避免进入“班级/管理”后仍保留其他工作区的隐藏页面。
- 草稿保护：教师在“学生/班级/管理”间切换、切换学生或暂时离开教师中心时，未保存的输入、选择和粘贴内容按工作区、学生身份及文档/名单导入批次隔离恢复；Esc/Android 返回键也执行同一保护。旧文件的授权或“已人工核对”状态不会带入新文件。浏览器无法安全恢复已选择的本地文件，因此文件待导入时会明确阻止切换并提示先完成或清空，避免静默丢失或串档。
- 兼容策略：learning state 仍为 schema 8，报告格式仍为 v4；不改变题目 ID、学习记录、IndexedDB/localStorage、激活数据或班级 owner/student 权限。
- 自动测试：新增学生固定导航 DOM、学情分析异步加载、教师四工作区真实点击及 Long Task 阈值；本次基准环境中学生切页无长任务，教师“学生/班级/管理”最长任务分别约 86–90ms、69–71ms、73–78ms，均低于 120ms 回归阈值。该结果是自动化基准，不承诺所有硬件上的绝对耗时。

## v3.1.3（学生加入班级与教师中心响应优化，2026-08-10）

- 修复学生身份下残留教师会话导致加入班级入口显示教师班级管理页的问题；学生身份现在始终显示邀请码/二维码加入流程。
- 学生可在“我的 → 加入老师班级”输入邀请码或上传二维码，登录后调用学生加入接口；服务端仍只授予 `student` 权限。
- 教师中心首次打开先绘制可交互加载状态，后台准备学情汇总，降低 Android WebView 与 Windows WebView2 的点击阻塞。
- 保留 v2.8/v3.x 本地数据、题目 ID、邀请码权限和离线回退逻辑；新增残留会话隔离回归测试与教师中心交互延迟测试。

## v3.1.2（学生端加入班级，2026-08-09）

- 原问题：学生端只能先登录班级服务，进入认证后的页面才可看到邀请码加入表单，和教师端的建班入口不匹配。
- 修改文件：`experience-shell.js`、`classroom-client.js`、`tools/qa_classroom_ui.cjs`、`tools/build_windows_v31_from_v28.ps1`、`package.json`及版本文档。
- 学生在“我的 → 加入老师班级”即可填写服务地址、学生账号、邀请码，或扫描教师二维码；提交后自动完成登录、邀请码验证和学生班级刷新。
- 权限边界：服务端仍验证 student 账号和邀请码，客户端不接受通过二维码、班级名称或 URL 参数提升为 teacher/owner。
- Windows 继续以 v2.8 页面基线打包，同时注入学生加入表单、提交处理和二维码字段回填逻辑；Android 与 Windows 使用同一网页流程。
- 新增/强化教师端到学生端班级 UI 回归：验证未认证学生可见加入入口、二维码解析、登录后申请加入、移动端无横向溢出及 student 权限请求。

## v3.1.1（双端交互性能修复，2026-08-09）

- 原问题：Android 与 Windows 点击学习中心、诊断和题库搜索时会出现明显卡顿。
- 根因：学生页首次渲染同步生成完整学情、摸底试卷和广覆盖预览；学习实验室重复计算相同派生数据；搜索每次按题目重建全文索引；Android WebView 逐条输出控制台日志。
- 修改文件：`experience-shell.js`、`learning-lab.js`、`learning-engine.js`、`app.js`、`android/src/com/physicsstudio/studyroom/MainActivity.java`、`tools/qa_interaction_latency.cjs`、`tools/qa_responsive_performance.cjs`。
- 迁移策略：仅增加运行时派生缓存与惰性计算，不改变题目 ID、学习记录或本地存储格式；Windows 发布包继续使用 v2.8 页面基线并应用同一交互性能补丁。
- 新增测试：移动端交互长任务回归、学习实验室即时 loading、派生缓存静态检查；基线最长任务约 225ms，修复后约 50ms 以内。
- 发布结果：Android APK/ZIP 与 Windows 安装器/ZIP/源码 ZIP 均按唯一版本源生成 3.1.1。Windows 安装器未配置商业代码签名，状态为 `unsigned-development-only`。

## Windows v2.8.0 兼容回滚包（2026-08-09）

- Windows 独立发布目录 `发布/Windows-v2.8.0` 已重新生成；根目录源码、Android 版本和统一版本源仍保持 v3.0.0，不被回滚包覆盖。
- 回滚包使用已归档的 v2.8.0 WebView/Windows 源快照，保留 v2.8 的题库、学习中心和本地数据格式（STATE_VERSION 5），不改变现有题目 ID。
- 安装器、Windows ZIP 和源码 ZIP 均附 SHA-256；源码 ZIP 使用 UTF-8 文件名和 `/` 路径分隔符。
- 当前构建未配置商业代码签名证书，签名状态为 `NotSigned`，仅可作为开发/测试包分发。

## v3.0.0（2026-08-09）

### 建班权限补充修正

- 原问题：兼容接口仍以全局 `teacher` 角色拒绝创建班级，导致已进入教师界面的普通应用用户仍可能得到 403。
- 根因：`ClassesService.createClass` 与授权策略把“全局角色”和“班级 owner”混为一谈。
- 修改文件：`server/src/modules/classes/service.ts`、`server/src/modules/authorization/policy.ts`、`server/src/modules/classes/repository.ts`、`server/src/modules/invites/service.ts`、`server/src/modules/learning/service.ts`、`server/src/modules/classes/routes.ts`。
- 迁移策略：不改现有 `users/classes/memberships` 或题目 ID；创建仍使用 UUID，owner capability 仍由独立表保存。非家长用户的已认证创建动作只新增其自身的 class-scoped owner 权限，既有学生成员与其他班级数据不受影响。
- 新增测试：服务端 class-scoped ownership 单元测试、匿名建班/Owner 与学生邀请码隔离 QA；服务端单元测试 16 个文件共 61 项通过。

### 班级创建、权限与联网

| 原问题 | 根因 | 修改文件 | 迁移策略 | 新增测试 |
| --- | --- | --- | --- | --- |
| 教师必须登录/有邀请才能建班 | `POST /v1/classes` 只接受 bearer teacher | `server/src/modules/classes/routes.ts`、`service.ts`、`app.ts`、`main.ts`、`owner-capability.ts`、`009_class_owner_capabilities.ts` | 不改现有 users/classes/memberships；匿名建班新增独立 owner capability 表和 Owner 认证分支 | `server/tests/unit/class-route.test.ts`、`owner-route.test.ts`、`owner-capability.test.ts` |
| 邀请码可能同时承担管理与学生加入 | 客户端没有区分管理凭据与学生邀请码 | `classroom-client.js`、`experience-shell.js`、`server/src/modules/invites/routes.ts` | 旧 bearer teacher 继续可管理；新 owner token 只绑定创建班级，不进入二维码/邀请码 | `tools/qa_v3_classroom.cjs` |
| 创建后仍停留在创建页 | UI 未自动选择新班级和加载详情 | `experience-shell.js` | 仅新增 UI 状态，不改变本地班级/学习数据 | `tools/qa_v3_classroom.cjs`、教师浏览器 QA |
| 外部检索容易被误认为应用答案 | 直接打开网页但未声明抓取边界 | `question-answer-service.js`、`app.js`、`Launcher.cs` | 受控 AI 仍走原网关；无网关时明确标注 Edge 检索未生成软件答案 | `tools/qa_edge_preference.cjs` |
| 完整 UUID 加邀请码的二维码超出旧容量 | 原生成器只支持到 80 字节 | `experience-shell.js`、`tools/qa_classroom_ui.cjs` | 保留 `physicsstudio://join?class_id=...&code=...`，长 payload 使用 QR Version 5-L | `qa_classroom_ui.cjs` 实际生成后由 jsQR 解析并校验 class_id/code |

### 学情诊断

| 原问题 | 根因 | 修改文件 | 迁移策略 | 新增测试 |
| --- | --- | --- | --- | --- |
| 诊断上下文调用参数错误，且缺少可解释汇总 | 问答服务未使用统一的真实证据聚合 | `learning-engine.js`、`question-answer-service.js` | 不改旧 attempts；新增纯函数只读旧记录，保留原 `studentAnalysis` API | `tools/qa_student_diagnosis.cjs` |

`buildStudentLearningDiagnosis` 按真实 `attempts` 和稳定 `knowledgePointId` 返回提交数、已评分数、正确数、正确率、待复核数、近期/历史正确率、重复错误、作答时长、最近时间、趋势和 evidence IDs。样本不足时不生成稳定结论；`review-required` 不进入正确率或趋势。

### 版本与发布

- 唯一版本源由 `version.json` 升至 `3.0.0`；`package.json`、Windows 程序集版本和 Android 客户端请求标识随之同步。
- v2.8/v2.9 的题目 ID、学习记录、IndexedDB/localStorage 迁移和激活数据保持兼容；班级 owner capability 不写入 `.pslab` 题库/学习备份。
- 在线请求 15 秒超时、GET/HEAD 最多一次重试，写操作不自动重试；网络失败显示本机回退状态，恢复网络后再同步。
- 最终门禁：根 `npm.cmd run qa`（27 个 Node 专项脚本、Android 安全、桌面、移动、教师端）通过；服务端 16 个单元测试文件/61 项、TypeScript 检查和生产构建通过。`tools/qa_classroom_ui.cjs` 额外通过匿名建班、Owner 管理、结构化二维码解析和学生邀请码加入。
- v3.0 发布构建：Windows 安装器、Windows ZIP、源码 ZIP 和 Android APK/ZIP 均已重新生成；Windows 安装器当前为 `unsigned-development-only`，因为未提供商业代码签名证书。

## v2.9.0

### 正确性修复矩阵

| 原问题 | 根因 | 修改文件 | 兼容/迁移策略 | 新增或强化测试 |
| --- | --- | --- | --- | --- |
| 普通练习会被误判为已完成摸底 | 用 attempts 或长期覆盖等级反推一次性 assessment 状态 | `learning-engine.js`、`experience-shell.js`、`learning-lab.js` | 新增 `assessmentSessions`；旧档案无明确 session 时为 `legacy-unknown`，不伪造 completed | `qa_placement_status.cjs`、`qa_placement_blueprint.cjs` |
| 多学生使用同一 examId 时可能串档 | 题目级行只按 examId 分组，导入器统一覆盖 activeProfileId | `learning-engine.js`、`learning-lab.js` | 多学生按 `resolvedProfileId|examId` 写入；旧单学生 API 仅在调用方显式传 profileId 时兼容 | `qa_exam_question_import.cjs`、`qa_identity_isolation.cjs` |
| 同名学生被静默合并 | 姓名曾被当成身份键 | `learning-engine.js`、`learning-lab.js` | 首次归一化补永久 `portableProfileId`；同名为 `duplicate-name-warning`，必须明确新建或合并 | `qa_identity_isolation.cjs` |
| 两台设备的 `student-default` 报告碰撞 | 跨设备聚合使用内部 profile.id | `learning-engine.js`、`learning-lab.js` | 报告格式升至 v4，按 portable ID 和导出时间/指纹去重；旧报告标记 `unresolved-legacy` 并要求人工绑定 | `qa_identity_isolation.cjs` |
| 待人工复核被算作 0 分或错题 | 聚合逻辑只检查 score/correct，没有统一 grading 状态口径 | `learning-engine.js`、`learning-lab.js` | 保留提交和原始证据；教师正式复核后才成为 scored evidence | `qa_manual_review_scoring.cjs` |
| 一对 0→1 或未匹配记录会显示虚假 +100pp | 前后汇总没有只使用配对证据，也没有最小证据阈值 | `learning-engine.js`、`learning-lab.js` | learning plan 补基线/复测 evidence IDs；阈值作为可配置产品规则保存，旧计划经 normalize 补默认字段 | `qa_intervention_comparison.cjs` |
| 文本 topic 的细微差异拆成多个证据桶 | topic 中文显示名兼任 join key | `curriculum-taxonomy.js`、各题库、`learning-engine.js` | 保留 topic 展示和 legacy fallback，统计统一使用稳定 `knowledgePointId`；同义词映射到同一概念 | `qa_question_metadata.cjs`、`qa_taxonomy_sources.cjs` |
| 24 题摸底被描述为覆盖整套课程 taxonomy | 把当前年级全部 topic 当作单次摸底分母 | `learning-engine.js`、`experience-shell.js` | 新蓝图区分本次核心目标覆盖与长期课程证据覆盖；缺失能力维度如实报告 | `qa_placement_blueprint.cjs` |
| 高频学习数据集中在一个 localStorage JSON | 每次保存全量序列化，容量和事务边界不足 | `storage-repository.js`、`app.js`、`backup.js` | 旧 JSON 先备份，IndexedDB 事务成功才切 schemaVersion；facade 保留旧调用兼容，`.pslab` 仍含全部实体 | `qa_storage_migration.cjs`、`qa_browser.cjs` |
| 体验角色切换可触达本地教师能力 | UI 角色与教师授权没有分离 | `teacher-mode-lock.js`、`experience-shell.js` | 旧用户首次进入时设置 PBKDF2+随机 salt 的本地 PIN；解锁仅保存 session | `qa_teacher_lock.cjs` |
| Android 文本导出被强制追加 `.json` | 通用文本保存误用 JSON 专用文件名清理器 | `MainActivity.java`、`learning-lab.js` | 已有合法扩展名按 MIME 保留，非法路径字符清理且阻止穿越 | `qa_android_export_filename.cjs` |
| Windows/Android/备份版本可能漂移 | 多处复制版本字符串 | `version.json`、构建脚本、宿主、备份与 QA | `version.json` 为唯一版本源；安装器 Assembly/File/DisplayVersion 同步为 2.9.0.0 | `qa_version_source.cjs` |

### 数据口径变化

- `accuracy` 的分母改为 `scoredCount`；同时返回 `submittedCount`、`correctCount` 与 `pendingReviewCount`。`scoredCount===0` 时为 `null`，不再用 0 表示“没有证据”。
- “可迁移”要求跨日期、低提示、迁移成功和至少两个独立模型/证据组；同一参数模板的连续变式仍可计练习次数，但不能快速堆出独立掌握证据。
- 干预结果分为 `insufficient / emerging / comparable`；未进入 pair 的前后练习只列为补充证据，不影响 paired delta。
- 报告中的学情标签均为形成性、描述性推断；不输出班级排名、人格/智力标签，也不把一次变化解释为因果性“能力提升”。

### 存储与旧数据升级

- learning state schema 升至 8，报告格式升至 4；normalize/migration 保留旧题目 ID、旧作答、考试、成长、激活和附件引用。
- default 内部 ID 为兼容可继续使用 `student-default`，但迁移时会补设备独立的永久 `portableProfileId`。
- localStorage 只保留设置、当前学生、轻量索引、迁移备份和 schemaVersion；高频实体迁入 IndexedDB。任何配额不足、事务 abort 或迁移失败都会保留旧数据并显示保存失败。
- 1900 道完整题补齐 `questionType`、`knowledgePointId` 和证据元数据，已有 question ID 不重新编号。

### 最终测试与构建结果（2026-08-09）

- 根级 Node 门禁包含 25 个脚本，覆盖人工复核、摸底状态、试卷隔离、身份隔离、可比复测、题库元数据、教师锁、Android 文件名、版本源、隐私边界、IndexedDB 迁移和发布 ZIP 便携性。
- 根 `npm run qa` 通过：Node 25 个专项脚本、Android 安全、桌面 1440×900、移动 390×844、教师端流程，以及真实旧 JSON→IndexedDB 浏览器迁移均通过。
- 服务端 55/55 项单元测试、TypeScript 类型检查与生产构建通过；需要 Docker/Testcontainers 的 5 组集成套件在当前无容器运行时的机器上无法启动，属于运行环境阻塞，不记为通过。
- Android 构建通过：版本名 2.9.0、versionCode 20900、最低 Android 6.0；APK 使用项目 Android 签名配置生成。
- Windows 安装器、Windows 发布 ZIP 和源码 ZIP 构建通过，Assembly/File/DisplayVersion 均来自 2.9.0 唯一版本源。当前未提供商业代码签名证书，构建状态为 `unsigned-development-only`，不能作为已签名正式发行包宣传。

### 学情与证据

- 待人工复核作答不再参与正确率、平均分、趋势或“需巩固”判断，但继续计入提交记录并进入教师复核队列。
- 正确率同时区分 `submittedCount`、`scoredCount`、`correctCount` 和 `pendingReviewCount`；没有可评分证据时使用 `null`，界面显示“暂无可评分证据”。
- 专项方案增加基线证据、焦点知识点、复测证据和比较规则；只有同知识点、同模型/等价组、同难度且不同题目的证据才可计算前后变化。
- 提升报告在证据不足或不可匹配时不显示百分比变化，改为“干预后表现”并说明比较边界。
- 摸底优先使用 `diagnostic-anchor`，记录题型、模型、信心、时长、错因和建模证据，并明确提示默认关闭。

### 教师工作流

- 教师中心按“今日、学生、班级、管理”组织；今日只显示需要行动的异常。
- 学生详情、原始证据、教师确认和专项方案保持可追溯；成长档案由练习、考试、诊断、确认、方案和复测事件自动形成。
- 新建在线班级改为只需填写班级名称，客户端只发送 `{name}`，服务端对旧客户端继续接受年级和学科字段；创建成功后自动进入班级。
- 教师邀请改为一键生成邀请码和本地二维码，不再要求填写有效期或使用人数；学生可拍摄或选择二维码图片自动填入邀请码。后端继续保留安全默认有效期、使用上限、角色校验、限流和审计。
- 修复 Android 把 `appassets.androidplatform.net` 内置页面误判为班级服务地址的问题；正式跨设备班级仍需部署并配置 HTTPS 服务。
- 班级入口显示联网/本机同步状态；已配置 HTTPS 服务端时在线优先同步，网络不可用时不覆盖本机记录。学生联网检索默认开启，未配置受控 ChatGPT 服务时使用 Edge/Bing 查询题干和当前巩固重点；外部结果不直接改变学情结论。Windows 与 Android 均在 Edge 不可用时回退系统默认浏览器。
- 本地教师管理增加 PIN 解锁和锁定；体验角色切换不再直接授予教师本地管理权限。云班级权限仍以服务端账号角色为准。

### 题库、兼容与发布

- 所有完整题目补齐真实 `questionType` 和证据元数据；原有题目 ID 不变，1416 道参数化练习保留稳定模型定义。
- 旧 v2.8 状态通过版本迁移和字段归一化升级；不会清理已有学习记录、题目或附件。
- Android 文本导出按 MIME 保留 `.html`、`.csv`、`.json` 和 `.txt` 扩展名，并阻止路径穿越。
- 源码 ZIP 使用 UTF-8 文件名和 `/` 分隔符；发布包 QA 会检查 Windows、Linux 解压后的安装脚本名称。
- 作答记录在导入或测试时保留有效原始时间戳，跨日期掌握与专项复测比较不再被“导入时刻”覆盖；浏览器 QA 统一覆盖 2.9.0 激活后页面。

### 解释边界

- 学情结论是基于本机或已授权云班级证据的描述性推断，不是标准化测评结果。
- 不同难度、不同知识点或不可匹配题目之间不称为“提升率”；一次正确率变化不表述为因果性能力提升。
- 待人工复核记录在教师确认前不作为错题或错误证据。
# v3.1.0（双端班级创建修复）

- Android 继续沿用当前 v3 学习功能；Windows 以 v2.8 页面与题库基线重新打包。
- 班级服务不可达时，教师创建班级会安全回退到本机：生成唯一 class_id、owner capability 和学生邀请码；联网恢复后仍可使用在线服务。
- 学生邀请码只携带 `class_id` 与邀请码，不包含 owner capability；管理权限仍按班级 owner 隔离。
- 新增离线建班回归测试，确认二维码/Deep Link 不泄露 owner token，且 Windows/Android 均使用 3.1.0 构建版本。
# v3.1.4（双端学生免账号入班）

- 原问题：学生加入班级仍要求登录名、密码，部分入口会回到教师中心；扫描和备注名流程不完整。
- 根因：前端仍调用带认证的旧 join 路由，服务端没有匿名学生会话和明确的学生身份更新接口。
- 修改文件：`experience-shell.js`、`classroom-client.js`、`server/src/modules/invites/*`、`server/src/modules/auth/*`、`tools/qa_student_guest_join.cjs`、`tools/qa_classroom_ui.cjs`。
- 迁移策略：保留旧登录学生的 `/v1/invites/join` 与原有本地存储；新增匿名学生会话和班级备注名接口，不改变现有题目 ID 或学习档案结构。
- 新流程：邀请码/二维码 → 服务端验证 → 直接创建 active student membership；学生不能获得 owner/teacher capability，教师管理仍按班级权限隔离。
- 测试：`npm.cmd run qa`、`node --check classroom-client.js`、`node --check experience-shell.js`、Android/Windows 构建均通过；server TypeScript/Vitest 未运行，原因是当前工作区未安装 server 的 `tsc`/`vitest` 依赖。
