# 物理研习室 iOS 通用版设计

日期：2026-08-01
状态：用户已确认
对应版本：2.7.0

## 1. 目标

新增一个可在 macOS 的 Xcode 中直接打开、构建和签名的 iOS 工程，同时保留现有 Windows 与 Android 版本。iOS 版面向 iOS 15.0 及以上的 iPhone 和 iPad，支持横竖屏，复用同一套离线题库、教材目录、学习闭环、学生端、教师端、家长端和班级客户端。

本次在 Windows 环境交付完整 Xcode 源码、资源同步脚本、静态自动检查和 macOS 构建说明。由于 Apple 的编译、签名和真机安装必须使用 macOS、Xcode 与 Apple 开发者身份，本环境不声称能够产出已签名 IPA、完成 TestFlight 上传或通过 App Store 审核。

## 2. 已确认约束

- 最低系统：iOS 15.0。
- 设备范围：iPhone 与 iPad 通用应用，支持横竖屏。
- 推荐并采用：SwiftUI 应用入口、UIKit `WKWebView` 宿主、复用现有 Web 学习系统。
- 不引入 Capacitor、Cordova、第三方本地服务器或第三方权限框架。
- Bundle Identifier 默认使用 `com.physicsstudio.studyroom`，在实际签名前允许所有者按 Apple 开发者账户调整。
- 显示名称为“物理研习室”，版本为 `2.7.0`，构建号为 `20700`。
- 题库、附件和学习证据默认仅保存在设备本地；班级成员状态可连接已部署的 HTTPS 服务端，不能把现状描述为完整学习数据云同步。

## 3. 方案比较与决定

### 方案 A：SwiftUI + WKWebView 混合外壳（采用）

SwiftUI 负责应用生命周期和通用设备入口，UIKit 控制器负责 `WKWebView`、权限、文件、外链、Keychain 和系统界面。网页、题库和学习引擎继续作为唯一业务实现，减少三端逻辑分叉。

### 方案 B：Capacitor 或 Cordova（不采用）

插件生态较完整，但会引入 Node 构建链、第三方运行时和额外供应链风险；当前仓库没有相应基础，收益不足以抵消维护成本。

### 方案 C：全原生 SwiftUI 重写（不采用）

原生交互自由度高，但必须重写题库、学习实验室、诊断、教师中心与数据迁移，成本高且容易造成三端功能和学习规则不一致。

## 4. 工程结构

新增目录如下：

```text
ios/
  PhysicsStudio.xcodeproj/
    project.pbxproj
  PhysicsStudio/
    PhysicsStudioApp.swift
    StudioWebView.swift
    StudioWebViewController.swift
    LocalWebContent.swift
    NativeBridge.swift
    ActivationStore.swift
    ExternalLinkRouter.swift
    ExportCoordinator.swift
    Info.plist
    Assets.xcassets/
    Resources/Web/
      index.html
      asset-manifest.json
      ...共享网页与题库资源
  PhysicsStudioTests/
    LocalWebContentTests.swift
    ActivationStoreTests.swift
    NativeBridgeTests.swift
    ExternalLinkRouterTests.swift
  tools/
    sync_web_assets.ps1
    sync_web_assets.sh
  README.md
  安装说明.txt
tools/
  qa_ios_project.cjs
```

每个 Swift 文件只承担一个职责：

- `PhysicsStudioApp.swift`：SwiftUI 应用入口和场景生命周期。
- `StudioWebView.swift`：将 UIKit 控制器封装为 SwiftUI 可用视图。
- `StudioWebViewController.swift`：创建 WKWebView、设置委托、加载主页、显示原生错误页。
- `LocalWebContent.swift`：解析并校验应用内 Web 根目录、入口文件与 MIME 类型。
- `NativeBridge.swift`：严格解析来自主框架的消息，只允许白名单动作并返回结构化结果。
- `ActivationStore.swift`：生成本机随机设备秘密、计算设备摘要、读写激活码。
- `ExternalLinkRouter.swift`：拦截 HTTP、HTTPS、mailto 和 tel；Edge 可用时优先 Edge，否则系统默认处理器。
- `ExportCoordinator.swift`：校验文件名、MIME 和大小，使用系统导出或分享界面保存文本、附件和完整备份。

## 5. Web 资源同步

iOS 资源采用与 Android 构建脚本一致的显式白名单。同步内容包括：

- `index.html`
- `styles.css`、`learning-lab.css`、`experience-shell.css`、`activation.css`
- `activation-public-key.js`、`activation.js`
- `curriculum-taxonomy.js`、`curriculum-bank.js`
- `exam-question-index.js`、`mock-exam-bank.js`、`original-practice-bank.js`、`targeted-practice-bank.js`
- `security.js`、`backup.js`、`backup-validator.js`
- `ai-tutor.js`、`document-import.js`、`content-catalog.js`、`classroom-client.js`
- `learning-engine.js`、`app.js`、`learning-lab.js`、`experience-shell.js`
- `vendor/jsQR.js`、`vendor/jsQR-LICENSE.txt`、`vendor/fflate.js`、`vendor/fflate-LICENSE.txt`
- `assets/favicon.svg`

同步脚本复制文件到 `Resources/Web`，修正 Android 构建中同样需要修正的 vendor 和图标相对路径，并生成 `asset-manifest.json`。清单对每个文件记录相对路径、字节数和 SHA-256。脚本只覆盖白名单资源，不复制发布包、密钥、测试输出或用户数据。

提交到仓库的 Web 资源快照保证 Xcode 工程开箱可构建；每次发布前运行同步脚本并执行静态 QA，发现根目录资源与 iOS 快照不一致时构建检查失败。

## 6. 页面加载与持久化

`StudioWebViewController` 使用 `WKWebsiteDataStore.default()`，保证 IndexedDB、localStorage、Cookie 和缓存跨启动保留。主页通过 `loadFileURL(_:allowingReadAccessTo:)` 加载，读取范围只开放到 `Resources/Web` 目录。

Web 安全规范把 `file:` 列为潜在可信来源，但具体 API 可用性仍由 WebKit 决定。因此 macOS 模拟器和真机验收必须检查 `window.isSecureContext`、`crypto.subtle`、IndexedDB、摄像头和麦克风；任何缺失均显示可操作错误，不能静默绕过激活或伪造能力。

应用升级沿用相同默认数据仓库。三端之间的数据迁移继续使用 `.pslab` 完整备份和轻量 JSON，不直接共享 WebView 存储目录。

## 7. 原生桥接协议

页面仅通过以下两个消息处理器与 Swift 通信：

### `physicsStudioActivation`

请求格式：

```json
{ "action": "get" }
```

返回：

```json
{
  "deviceId": "64位大写十六进制摘要",
  "storedCode": "已保存且格式有效的激活码或空字符串",
  "description": "iOS Keychain 本机存储"
}
```

保存请求：

```json
{ "action": "save", "code": "PSA1..." }
```

返回 `{ "saved": true }` 或结构化错误。Bridge 只接受主页主框架发送的消息；设备 ID 必须匹配 `^[A-F0-9]{64}$`，激活码长度为 80–4096 且字符只允许 ASCII 字母、数字、点、连字符和下划线。

### `physicsStudioExport`

文本请求：

```json
{
  "action": "saveText",
  "fileName": "物理学习档案.json",
  "mimeType": "application/json",
  "content": "..."
}
```

二进制请求：

```json
{
  "action": "saveBase64",
  "fileName": "物理研习室完整备份.pslab",
  "mimeType": "application/vnd.physics-studio.backup+zip",
  "base64Data": "..."
}
```

文件名移除路径分隔符和控制字符，不能为空；单次 Base64 导出上限为 100 MB，与 Android 客户端保持一致。Swift 完成解码后用系统导出界面交给用户选择位置，不把文件写入任意路径。

`activation.js`、`app.js` 和 `learning-lab.js` 增加 iOS 适配器，调用上述消息处理器；浏览器、Android 和 Windows 原有分支保持不变。

## 8. 激活与 Keychain

首次启动时生成 32 字节密码学随机设备秘密，存入 Keychain。设备摘要计算为：

```text
SHA-256("physics-studio|ios|com.physicsstudio.studyroom|" + base64url(deviceSecret))
```

设备秘密与激活码均使用 `kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly`，不设置同步属性，不能迁移到另一台设备。激活码签名仍由现有 `activation.js` 和发布公钥校验；iOS Bridge 不接收绕过校验的“已激活”状态。

卸载后 Keychain 条目可能仍留在同一设备，这是维持设备绑定的预期行为；恢复到另一台设备时 `ThisDeviceOnly` 条目不会迁移。

## 9. 权限与硬件能力

`Info.plist` 包含明确的中文用途说明：

- `NSCameraUsageDescription`：拍摄试题、识别二维码和记录实验。
- `NSMicrophoneUsageDescription`：采集声音频谱实验数据。
- `NSMotionUsageDescription`：采集加速度和运动实验数据。
- `LSApplicationQueriesSchemes`：`microsoft-edge-http`、`microsoft-edge-https`。

权限只在用户点击相应功能后由系统询问。WKUIDelegate 对媒体请求返回系统提示，只接受当前本地主页的主框架；外部网页不在 WKWebView 内加载，不能发起应用内媒体权限请求。

现有 `DeviceMotionEvent.requestPermission()`、`getUserMedia()` 和系统文件选择器用于加速度、麦克风、拍照、二维码和文件上传。WebKit 未公开的环境光或 Generic Sensor API 能力保持禁用，并明确显示“当前设备不支持”，不生成模拟数据。

## 10. 外部链接

WKNavigationDelegate 只允许应用内 `file:` 资源在当前 WKWebView 导航。下列链接离开应用处理：

- `http`、`https`：先转换为 `microsoft-edge-http://` 或 `microsoft-edge-https://`；若 `UIApplication.canOpenURL` 返回 false，则打开原 URL，让 iOS 使用默认浏览器。
- `mailto`：打开系统邮件处理器；用户反馈仍预填收件人 `luo865265@gmail.com`，发送由用户确认。
- `tel`：打开系统电话处理器。

其他自定义 scheme、`javascript:`、外部 `file:`、`data:` 导航一律拒绝。Blob URL 只允许页面自身用于已加载的本地附件和视频。

## 11. 联网与班级服务

`classroom-client.js` 保持现有边界：正式环境只接受 HTTPS；开发时只接受本机回环 HTTP。iOS 真机上的 `127.0.0.1` 指手机本身，因此真实跨设备班级服务必须部署到可访问的 HTTPS 地址。

登录密码不保存，访问令牌和刷新令牌只保存在当前 Web 会话。客户端每 60 秒以及应用回到前台时刷新班级和成员状态。学生题库、附件和作答证据仍默认保存在本机；当前版本不声称已经实现学习证据自动上传。

## 12. 错误处理

- Web 根目录、主页或清单缺失：显示原生错误页，列出缺失资源并提供重新加载。
- WKWebView 导航失败：显示错误代码和可复制的简短诊断，不显示空白页面。
- Bridge 消息字段、长度或类型错误：拒绝请求并返回稳定错误码，不回显敏感数据。
- Keychain 失败：激活页显示“安全存储不可用”，不回退到普通 UserDefaults。
- 导出数据过大、Base64 无效或文件名不安全：阻止保存并给出具体修改方法。
- 权限被拒绝：提供相册、手工输入或稍后在系统设置开启的替代路径。
- 外部处理器不存在：显示提示，不在 WKWebView 内加载不受审核网页。

## 13. 测试设计

### Windows 可执行检查

`tools/qa_ios_project.cjs` 验证：

1. Xcode 项目只包含相对路径，不包含当前电脑绝对路径。
2. `IPHONEOS_DEPLOYMENT_TARGET` 为 `15.0`，设备族为 `1,2`，版本为 `2.7.0/20700`。
3. Info.plist 包含相机、麦克风、运动和 Edge scheme 配置。
4. 所有 Swift 源文件、测试文件和 Web 清单被 Xcode 项目引用。
5. iOS Web 清单与根目录白名单逐文件大小和 SHA-256 一致。
6. iOS 激活、文本导出和二进制导出适配器存在，Android 与 Windows 分支未删除。
7. 现有学生端 QA 继续确认 1900 道完整题、九个学生模块、选择题、填空题、实验题和无浏览器错误。

### macOS/Xcode 检查

在项目根目录执行：

```bash
xcodebuild \
  -project ios/PhysicsStudio.xcodeproj \
  -scheme PhysicsStudio \
  -configuration Debug \
  -sdk iphonesimulator \
  CODE_SIGNING_ALLOWED=NO \
  build
```

随后在 Xcode 选择一台已安装的 iOS 15 及以上模拟器运行 `PhysicsStudioTests`。单元测试覆盖资源路径穿越、MIME、激活码格式、Keychain 错误映射、Bridge 白名单和外链转换。

### 真机检查

真机必须逐项检查：首次设备申请码、激活码保存、离线重启、题库搜索、作答解析、学习实验室滚动、拍题、二维码、麦克风、运动传感器、文件导入、`.pslab` 导出恢复、Edge 优先与默认浏览器回退、班级登录、邀请码加入、教师审批、iPhone/iPad 横竖屏。

## 14. 发布边界

- Windows 环境只能生成并静态验证 Xcode 工程和源码 ZIP。
- IPA、TestFlight、App Store Connect 上传、Apple 发布证书、Provisioning Profile 和最终 Bundle ID 必须在所有者的 macOS/Xcode 环境完成。
- 未执行 macOS 编译前，只能声称“工程已生成并通过静态检查”，不能声称“iOS 已编译通过”。
- 未执行真机权限与离线测试前，不能声称相机、麦克风、运动传感器和 Keychain 已在真实设备通过。
- 未进行已部署后端压测前，不能承诺 5 万人并发容量。

## 15. 依据

- Apple `WKWebView` 本地文件加载：<https://developer.apple.com/documentation/webkit/wkwebview/loadfileurl(_:allowingreadaccessto:)>
- Apple JavaScript 原生消息桥：<https://developer.apple.com/documentation/webkit/wkscriptmessagehandlerwithreply>
- Apple WKWebView 媒体权限：<https://developer.apple.com/documentation/webkit/wkuidelegate/webview(_:requestmediacapturepermissionfor:initiatedbyframe:type:decisionhandler:)>
- Apple Keychain 可访问性：<https://developer.apple.com/documentation/security/restricting-keychain-item-accessibility>
- Microsoft Edge 移动端深层链接：<https://learn.microsoft.com/en-us/intune/intune-service/fundamentals/guided-scenarios-edge>
- W3C Secure Contexts：<https://www.w3.org/TR/secure-contexts/>
