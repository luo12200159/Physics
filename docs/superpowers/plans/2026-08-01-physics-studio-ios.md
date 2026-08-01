# Physics Studio iOS Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 新增一个与 Windows、Android 版共用 Web 学习系统、可在 macOS/Xcode 打开构建的 iOS 15+ iPhone/iPad 通用工程，并交付可复现的资源快照、静态 QA、XCTest 与源码包。

**Architecture:** SwiftUI 只承载应用入口，UIKit `WKWebView` 负责加载随包离线 Web 资源；激活信息进入 Keychain，文件导出、外部链接、媒体权限和文件选择由白名单原生桥接处理。现有题库、学习引擎、学生端、教师端、家长端和班级客户端保持 Web 单一业务实现，iOS 仅增加平台适配层。

**Tech Stack:** Swift 5、SwiftUI、UIKit、WebKit、Security、CryptoKit、UniformTypeIdentifiers、XCTest、Node.js 18+ 静态 QA、PowerShell/Bourne shell 资源脚本、Xcode 15+。

## Global Constraints

- 最低系统固定为 iOS 15.0。
- `TARGETED_DEVICE_FAMILY` 固定为 `1,2`，支持 iPhone、iPad 和横竖屏。
- 显示名称固定为“物理研习室”，版本固定为 `2.7.0`，构建号固定为 `20700`。
- 默认 Bundle Identifier 为 `com.physicsstudio.studyroom`；只允许所有者在 macOS 签名前调整签名身份和 Bundle Identifier。
- 不引入 Capacitor、Cordova、第三方本地服务器、第三方权限框架或远程脚本。
- Web 资源必须来自显式白名单，随包快照必须记录逐文件字节数和 SHA-256。
- `WKWebsiteDataStore.default()` 用于持久化 IndexedDB、localStorage、Cookie 和缓存；本地读取范围只开放到随包 `Resources/Web`。
- iOS 设备秘密和激活码只写入 Keychain，属性固定为 `kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly`，不得回退到 `UserDefaults`。
- Base64 导出解码后不得超过 100 MB；文件名、MIME、消息来源和消息动作必须先校验。
- HTTP/HTTPS 外链优先交给 Edge；Edge 不存在时交给 iOS 默认处理器；外部网页不得在应用内加载。
- 正式班级服务只接受 HTTPS；本地开发只允许回环 HTTP。不得宣称题库、附件或全部作答证据已云同步。
- Windows 环境只可声称“Xcode 工程通过静态检查”；只有 macOS `xcodebuild`、XCTest 和真机检查实际完成后，才能分别声明编译、单测和硬件能力通过。
- 不承诺 5 万并发；该容量必须针对实际部署的班级后端另行压测。
- 修改测试前先完整阅读 `superpowers:test-driven-development` 引用的 `writing-good-tests.md`；每个行为改动都遵循 RED → GREEN → REFACTOR。

---

## File Responsibility Map

- `ios/tools/web-assets.json`：唯一 Web 资源源文件/目标路径白名单。
- `ios/tools/sync_web_assets.cjs`：确定性复制、路径转换、SHA-256 清单生成。
- `ios/tools/sync_web_assets.ps1`、`ios/tools/sync_web_assets.sh`：Windows/macOS 调用入口。
- `ios/PhysicsStudio/Resources/Web/`：提交到 Git 的可离线 Web 快照。
- `ios/PhysicsStudio/LocalWebContent.swift`：随包根目录、入口和本地 URL 边界。
- `ios/PhysicsStudio/ActivationStore.swift`：设备秘密、设备摘要与激活码 Keychain 读写。
- `ios/PhysicsStudio/ExportCoordinator.swift`：导出请求校验、临时文件和系统文档导出界面。
- `ios/PhysicsStudio/NativeBridge.swift`：只接受可信主框架消息并分发激活/导出动作。
- `ios/PhysicsStudio/ExternalLinkRouter.swift`：本地导航白名单、Edge 深链和默认处理器回退。
- `ios/PhysicsStudio/StudioWebViewController.swift`：WKWebView、导航、弹窗、权限和文件选择委托。
- `ios/PhysicsStudio/StudioWebView.swift`：UIKit 控制器的 SwiftUI 封装。
- `ios/PhysicsStudio/PhysicsStudioApp.swift`：应用入口。
- `ios/PhysicsStudioTests/`：可在 macOS/Xcode 执行的纯逻辑和桥接单元测试。
- `tools/qa_ios_project.cjs`：Windows 可执行的 Xcode 项目、资源、桥接和发布边界静态检查。
- `tools/build_ios_source.ps1`：生成自包含 Xcode 源码 ZIP 和 SHA-256。

## Windows Execution Variables

在当前 Codex 工作区开始 Task 1 前设置一次，并在同一 PowerShell 会话中执行后续 Windows 命令：

```powershell
$Node = 'C:\Users\luo47\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe'
$Python = 'C:\Users\luo47\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe'
$WorkspaceNodeModules = 'C:\Users\luo47\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\node_modules'
$env:NODE_PATH = $WorkspaceNodeModules
```

这些路径只用于当前 Windows 验证命令，不得写入 Xcode 工程、Swift 源码、资源清单或发布脚本；发布脚本必须通过 `Get-Command node`/`command -v node` 解析调用方自己的 Node.js。

### Task 1: Deterministic Web Asset Snapshot

**Files:**
- Create: `ios/tools/web-assets.json`
- Create: `ios/tools/sync_web_assets.cjs`
- Create: `ios/tools/sync_web_assets.ps1`
- Create: `ios/tools/sync_web_assets.sh`
- Create: `tools/qa_ios_project.cjs`
- Create: `ios/PhysicsStudio/Resources/Web/asset-manifest.json`
- Create: `ios/PhysicsStudio/Resources/Web/*` from the allowlist

**Interfaces:**
- Consumes: repository-root Web assets and `node <script>`.
- Produces: `syncWebAssets(): { schemaVersion: 1, files: AssetEntry[] }`, where `AssetEntry` is `{ source: string, path: string, bytes: number, sha256: string }`.

- [ ] **Step 1: Write the failing static contract**

Create `tools/qa_ios_project.cjs` with executable assertions for the allowlist, generated files, byte counts and hashes:

```js
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const tools = path.join(root, "ios", "tools");
const webRoot = path.join(root, "ios", "PhysicsStudio", "Resources", "Web");
const read = (file) => fs.readFileSync(file);
const sha256 = (buffer) => crypto.createHash("sha256").update(buffer).digest("hex");
const transform = (source, bytes) => source === "index.html"
  ? Buffer.from(bytes.toString("utf8")
      .replace('href="assets/favicon.svg"', 'href="favicon.svg"')
      .replace('src="vendor/jsQR.js"', 'src="jsQR.js"')
      .replace('src="vendor/fflate.js"', 'src="fflate.js"'), "utf8")
  : bytes;
const list = JSON.parse(read(path.join(tools, "web-assets.json")));
const manifest = JSON.parse(read(path.join(webRoot, "asset-manifest.json")));

assert.equal(list.schemaVersion, 1);
assert.equal(manifest.schemaVersion, 1);
assert.deepEqual(
  manifest.files.map(({ source, path }) => ({ source, path })),
  list.files
);
for (const entry of manifest.files) {
  assert.ok(!path.isAbsolute(entry.source) && !entry.source.split("/").includes(".."));
  assert.ok(!path.isAbsolute(entry.path) && !entry.path.split("/").includes(".."));
  const target = path.join(webRoot, ...entry.path.split("/"));
  const bytes = read(target);
  const expected = transform(entry.source, read(path.join(root, ...entry.source.split("/"))));
  assert.deepEqual(bytes, expected, `${entry.path} differs from repository source`);
  assert.equal(bytes.byteLength, entry.bytes, `${entry.path} byte count`);
  assert.equal(sha256(bytes), entry.sha256, `${entry.path} sha256`);
}
console.log(`iOS static QA passed: ${manifest.files.length} Web assets verified.`);
```

- [ ] **Step 2: Run the contract and verify RED**

Run:

```powershell
& $Node tools/qa_ios_project.cjs
```

Expected: non-zero exit because `ios/tools/web-assets.json` does not exist.

- [ ] **Step 3: Add the exact resource allowlist**

Create `ios/tools/web-assets.json` with `schemaVersion: 1` and these source/target pairs, in this order:

```json
{
  "schemaVersion": 1,
  "files": [
    { "source": "index.html", "path": "index.html" },
    { "source": "styles.css", "path": "styles.css" },
    { "source": "learning-lab.css", "path": "learning-lab.css" },
    { "source": "experience-shell.css", "path": "experience-shell.css" },
    { "source": "activation.css", "path": "activation.css" },
    { "source": "activation-public-key.js", "path": "activation-public-key.js" },
    { "source": "activation.js", "path": "activation.js" },
    { "source": "curriculum-taxonomy.js", "path": "curriculum-taxonomy.js" },
    { "source": "curriculum-bank.js", "path": "curriculum-bank.js" },
    { "source": "exam-question-index.js", "path": "exam-question-index.js" },
    { "source": "mock-exam-bank.js", "path": "mock-exam-bank.js" },
    { "source": "original-practice-bank.js", "path": "original-practice-bank.js" },
    { "source": "targeted-practice-bank.js", "path": "targeted-practice-bank.js" },
    { "source": "vendor/jsQR.js", "path": "jsQR.js" },
    { "source": "vendor/jsQR-LICENSE.txt", "path": "jsQR-LICENSE.txt" },
    { "source": "vendor/fflate.js", "path": "fflate.js" },
    { "source": "vendor/fflate-LICENSE.txt", "path": "fflate-LICENSE.txt" },
    { "source": "security.js", "path": "security.js" },
    { "source": "backup.js", "path": "backup.js" },
    { "source": "backup-validator.js", "path": "backup-validator.js" },
    { "source": "ai-tutor.js", "path": "ai-tutor.js" },
    { "source": "document-import.js", "path": "document-import.js" },
    { "source": "content-catalog.js", "path": "content-catalog.js" },
    { "source": "classroom-client.js", "path": "classroom-client.js" },
    { "source": "learning-engine.js", "path": "learning-engine.js" },
    { "source": "app.js", "path": "app.js" },
    { "source": "learning-lab.js", "path": "learning-lab.js" },
    { "source": "experience-shell.js", "path": "experience-shell.js" },
    { "source": "assets/favicon.svg", "path": "favicon.svg" }
  ]
}
```

- [ ] **Step 4: Implement deterministic sync and safe wrappers**

In `sync_web_assets.cjs`, resolve the repository root from `__dirname`, require every source to be a regular file, assert the destination equals `<root>/ios/PhysicsStudio/Resources/Web`, recreate only that directory, transform only `index.html`, and write a stable two-space-indented manifest:

```js
function transform(relativePath, bytes) {
  if (relativePath !== "index.html") return bytes;
  return Buffer.from(bytes.toString("utf8")
    .replace('href="assets/favicon.svg"', 'href="favicon.svg"')
    .replace('src="vendor/jsQR.js"', 'src="jsQR.js"')
    .replace('src="vendor/fflate.js"', 'src="fflate.js"'), "utf8");
}

function syncWebAssets() {
  const entries = allowlist.files.map(({ source, path: targetPath }) => {
    const bytes = transform(source, fs.readFileSync(resolveInside(root, source)));
    const target = resolveInside(webRoot, targetPath);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, bytes);
    return { source, path: targetPath, bytes: bytes.byteLength, sha256: sha256(bytes) };
  });
  const manifest = { schemaVersion: 1, files: entries };
  fs.writeFileSync(path.join(webRoot, "asset-manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  return manifest;
}
```

The PowerShell wrapper must execute `node "$PSScriptRoot\sync_web_assets.cjs"`; the shell wrapper must resolve its own directory and execute `node "$SCRIPT_DIR/sync_web_assets.cjs"`. Neither wrapper downloads dependencies.

- [ ] **Step 5: Generate the snapshot and verify GREEN**

Run:

```powershell
& $Node ios/tools/sync_web_assets.cjs
& $Node tools/qa_ios_project.cjs
git diff --check
```

Expected: the sync command reports 29 copied assets; static QA reports 29 verified assets; `git diff --check` exits zero.

- [ ] **Step 6: Commit**

```powershell
git add ios/tools ios/PhysicsStudio/Resources/Web tools/qa_ios_project.cjs
git commit -m "build: add deterministic iOS web snapshot"
```

### Task 2: Launchable Universal Xcode Shell

**Files:**
- Create: `ios/PhysicsStudio.xcodeproj/project.pbxproj`
- Create: `ios/PhysicsStudio.xcodeproj/xcshareddata/xcschemes/PhysicsStudio.xcscheme`
- Create: `ios/PhysicsStudio/PhysicsStudioApp.swift`
- Create: `ios/PhysicsStudio/StudioWebView.swift`
- Create: `ios/PhysicsStudio/StudioWebViewController.swift`
- Create: `ios/PhysicsStudio/LocalWebContent.swift`
- Create: `ios/PhysicsStudio/Info.plist`
- Create: `ios/PhysicsStudio/Assets.xcassets/Contents.json`
- Create: `ios/PhysicsStudio/Assets.xcassets/AppIcon.appiconset/Contents.json`
- Create: `ios/tools/generate_ios_icons.py`
- Modify: `tools/generate_icon.py`
- Create: `ios/PhysicsStudioTests/LocalWebContentTests.swift`
- Modify: `tools/qa_ios_project.cjs`

**Interfaces:**
- Consumes: `Bundle.main`, committed `Resources/Web`, SwiftUI lifecycle.
- Produces: `LocalWebContent(rootURL:indexURL:) throws`, `contains(_:) -> Bool`, and a `StudioWebViewController` that loads only the bundled index.

- [ ] **Step 1: Add failing Xcode and resource assertions**

Append assertions to `tools/qa_ios_project.cjs` for the required files and exact build settings:

```js
const projectFile = path.join(root, "ios", "PhysicsStudio.xcodeproj", "project.pbxproj");
const projectSource = read(projectFile).toString("utf8");
for (const token of [
  "IPHONEOS_DEPLOYMENT_TARGET = 15.0;",
  'TARGETED_DEVICE_FAMILY = "1,2";',
  "MARKETING_VERSION = 2.7.0;",
  "CURRENT_PROJECT_VERSION = 20700;",
  "PRODUCT_BUNDLE_IDENTIFIER = com.physicsstudio.studyroom;",
  "PhysicsStudioTests"
]) assert.ok(projectSource.includes(token), `missing Xcode setting: ${token}`);
assert.ok(!/[A-Za-z]:\\\\|\/Users\/|\/home\//.test(projectSource), "absolute path in Xcode project");
```

- [ ] **Step 2: Run static QA and verify RED**

Run `& $Node tools/qa_ios_project.cjs`.

Expected: non-zero exit because `project.pbxproj` is absent.

- [ ] **Step 3: Write LocalWebContent XCTest first**

Create `LocalWebContentTests.swift`:

```swift
import XCTest
@testable import PhysicsStudio

final class LocalWebContentTests: XCTestCase {
    func testAcceptsIndexInsideRootAndRejectsSibling() throws {
        let root = FileManager.default.temporaryDirectory
            .appendingPathComponent(UUID().uuidString, isDirectory: true)
        try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
        let index = root.appendingPathComponent("index.html")
        try Data("<!doctype html>".utf8).write(to: index)
        let content = try LocalWebContent(rootURL: root, indexURL: index)
        XCTAssertTrue(content.contains(index))
        XCTAssertFalse(content.contains(root.deletingLastPathComponent().appendingPathComponent("outside.js")))
    }

    func testRejectsMissingIndex() {
        let root = FileManager.default.temporaryDirectory
            .appendingPathComponent(UUID().uuidString, isDirectory: true)
        XCTAssertThrowsError(try LocalWebContent(
            rootURL: root,
            indexURL: root.appendingPathComponent("index.html")
        ))
    }
}
```

- [ ] **Step 4: Implement the local-content boundary and SwiftUI shell**

Implement `LocalWebContent` with standardized file URLs and a separator-safe descendant check:

```swift
struct LocalWebContent {
    let rootURL: URL
    let indexURL: URL

    init(rootURL: URL, indexURL: URL) throws {
        let root = rootURL.standardizedFileURL
        let index = indexURL.standardizedFileURL
        var isDirectory: ObjCBool = false
        guard FileManager.default.fileExists(atPath: root.path, isDirectory: &isDirectory), isDirectory.boolValue else {
            throw LocalWebContentError.missingRoot
        }
        guard FileManager.default.fileExists(atPath: index.path), Self.isDescendant(index, of: root) else {
            throw LocalWebContentError.missingIndex
        }
        self.rootURL = root
        self.indexURL = index
    }

    static func bundled(in bundle: Bundle = .main) throws -> LocalWebContent {
        guard let root = bundle.url(forResource: "Web", withExtension: nil),
              let index = bundle.url(forResource: "index", withExtension: "html", subdirectory: "Web") else {
            throw LocalWebContentError.missingRoot
        }
        return try LocalWebContent(rootURL: root, indexURL: index)
    }

    func contains(_ url: URL) -> Bool { Self.isDescendant(url.standardizedFileURL, of: rootURL) }

    private static func isDescendant(_ child: URL, of root: URL) -> Bool {
        child.path == root.path || child.path.hasPrefix(root.path + "/")
    }
}
```

`StudioWebViewController` must use `WKWebsiteDataStore.default()`, load with `loadFileURL(_:allowingReadAccessTo:)`, add `ios-app` to the document element after the main page finishes, and show a native error view with a reload button if resource resolution or navigation fails. `StudioWebView` wraps it with `UIViewControllerRepresentable`; `PhysicsStudioApp` displays it and ignores only container safe-area gaps, not Web content scrolling.

- [ ] **Step 5: Create a manually portable Xcode project and icons**

The application target must contain the six Swift source/resource entries already created, the `Web` folder reference, `Assets.xcassets`, and `Info.plist`. The test target must link XCTest, host `PhysicsStudio`, and contain `LocalWebContentTests.swift`. Add a shared `PhysicsStudio` scheme so this exact command is resolvable:

```bash
xcodebuild -project ios/PhysicsStudio.xcodeproj -scheme PhysicsStudio -configuration Debug -sdk iphonesimulator CODE_SIGNING_ALLOWED=NO build
```

Update `tools/generate_icon.py` to save its existing 1024×1024 RGBA canvas as `assets/app-icon-1024.png` before producing `app.ico`. `generate_ios_icons.py` must resize that source to the complete iPhone/iPad icon set (20, 29, 40, 58, 60, 76, 80, 87, 120, 152, 167, 180 and 1024 pixels) and write matching `Contents.json` entries.

- [ ] **Step 6: Verify static GREEN and record the macOS gate honestly**

Run:

```powershell
& $Python tools/generate_icon.py
& $Python ios/tools/generate_ios_icons.py
& $Node tools/qa_ios_project.cjs
git diff --check
```

Expected on Windows: static QA passes, every icon exists, no absolute Xcode paths occur. Record the `xcodebuild` and XCTest commands in the task notes as `NOT RUN — macOS/Xcode unavailable`; do not report them as passed.

- [ ] **Step 7: Commit**

```powershell
git add ios/PhysicsStudio.xcodeproj ios/PhysicsStudio ios/PhysicsStudioTests ios/tools/generate_ios_icons.py tools/generate_icon.py tools/qa_ios_project.cjs assets/app-icon-1024.png
git commit -m "feat: add launchable iOS web shell"
```

### Task 3: Device-Bound Keychain Activation

**Files:**
- Create: `ios/PhysicsStudio/ActivationStore.swift`
- Create: `ios/PhysicsStudioTests/TestDoubles.swift`
- Create: `ios/PhysicsStudioTests/ActivationStoreTests.swift`
- Modify: `ios/PhysicsStudio.xcodeproj/project.pbxproj`
- Modify: `tools/qa_ios_project.cjs`

**Interfaces:**
- Consumes: `SecureStore`, `RandomBytesGenerating`, `CryptoKit.SHA256`.
- Produces: `ActivationSnapshot(deviceId:storedCode:description:)`, `ActivationStore.snapshot() throws`, `ActivationStore.save(code:) throws -> Bool`; `MemorySecureStore` is shared only by the XCTest target.

- [ ] **Step 1: Write activation behavior tests before production code**

Create tests using an in-memory `SecureStore` and deterministic 32-byte random provider:

```swift
typealias RandomBytesGenerating = (Int) throws -> Data

protocol SecureStore {
    func read(account: String) throws -> Data?
    func write(_ data: Data, account: String) throws
}

final class MemorySecureStore: SecureStore {
    private var values: [String: Data] = [:]
    func read(account: String) throws -> Data? { values[account] }
    func write(_ data: Data, account: String) throws { values[account] = data }
}
```

```swift
func testDeviceIDIsStableUppercaseSHA256() throws {
    let secureStore = MemorySecureStore()
    let bytes = Data(repeating: 0x2A, count: 32)
    let store = ActivationStore(secureStore: secureStore, randomBytes: { _ in bytes })
    let first = try store.snapshot()
    let second = try store.snapshot()
    XCTAssertEqual(first.deviceId, second.deviceId)
    XCTAssertNotNil(first.deviceId.range(of: "^[A-F0-9]{64}$", options: .regularExpression))
}

func testSaveRejectsUnsafeCodeAndPersistsValidCode() throws {
    let store = ActivationStore(
        secureStore: MemorySecureStore(),
        randomBytes: { Data(repeating: 0x17, count: $0) }
    )
    XCTAssertThrowsError(try store.save(code: "bad code"))
    let valid = "PSA1." + String(repeating: "A", count: 75)
    XCTAssertTrue(try store.save(code: valid))
    XCTAssertEqual(try store.snapshot().storedCode, valid)
}
```

- [ ] **Step 2: Extend static QA and verify RED**

Require `ActivationStore.swift`, its test target membership, `kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly`, `SecRandomCopyBytes`, `SHA256.hash`, the product namespace string, and prohibit `UserDefaults` in this file. Run QA and expect failure because the file is absent.

- [ ] **Step 3: Implement Keychain storage and device hashing**

Use these exact accounts and namespace:

```swift
enum ActivationKeys {
    static let service = "com.physicsstudio.studyroom.activation"
    static let deviceSecret = "device-secret-v1"
    static let activationCode = "activation-code-v1"
    static let namespace = "physics-studio|ios|com.physicsstudio.studyroom|"
}
```

`SystemSecureStore.write` must use `SecItemUpdate` or `SecItemAdd` with `kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly`; `read` must request one `Data` result. When no secret exists, generate exactly 32 cryptographically random bytes and persist them before hashing. Calculate:

```swift
let base64URL = secret.base64EncodedString()
    .replacingOccurrences(of: "+", with: "-")
    .replacingOccurrences(of: "/", with: "_")
    .replacingOccurrences(of: "=", with: "")
let digest = SHA256.hash(data: Data((ActivationKeys.namespace + base64URL).utf8))
let deviceID = digest.map { String(format: "%02X", $0) }.joined()
```

Accept activation codes only when UTF-8 length is 80...4096, the value starts with `PSA1.`, and every scalar is ASCII alphanumeric, `.`, `-`, or `_`. Do not validate the signature in Swift; `activation.js` remains the sole public-key signature verifier.

- [ ] **Step 4: Run static GREEN and defer XCTest truthfully**

Run `& $Node tools/qa_ios_project.cjs` and `git diff --check`. Expected: static checks pass. Leave `ActivationStoreTests` as a macOS test gate until `xcodebuild test` is actually run.

- [ ] **Step 5: Commit**

```powershell
git add ios/PhysicsStudio/ActivationStore.swift ios/PhysicsStudioTests/TestDoubles.swift ios/PhysicsStudioTests/ActivationStoreTests.swift ios/PhysicsStudio.xcodeproj/project.pbxproj tools/qa_ios_project.cjs
git commit -m "feat: secure iOS activation in Keychain"
```

### Task 4: Validated Native Export Coordinator

**Files:**
- Create: `ios/PhysicsStudio/ExportCoordinator.swift`
- Create: `ios/PhysicsStudioTests/ExportCoordinatorTests.swift`
- Modify: `ios/PhysicsStudio.xcodeproj/project.pbxproj`
- Modify: `tools/qa_ios_project.cjs`

**Interfaces:**
- Consumes: JavaScript body dictionaries with `action`, `fileName`, `mimeType`, and `content` or `base64Data`.
- Produces: `ExportRequest.parse(_:) throws -> ExportRequest`, `ExportRequest.validateDecodedSize(_:) throws`, `decodedData() throws -> Data`, `ExportCoordinator.present(_:from:) throws`.

- [ ] **Step 1: Write request-validation tests**

```swift
func testParsesTextExport() throws {
    let request = try ExportRequest.parse([
        "action": "saveText",
        "fileName": "学情报告.json",
        "mimeType": "application/json",
        "content": "{\"ok\":true}"
    ])
    XCTAssertEqual(try request.decodedData(), Data("{\"ok\":true}".utf8))
}

func testRejectsTraversalAndOversizedBase64() {
    XCTAssertThrowsError(try ExportRequest.parse([
        "action": "saveBase64",
        "fileName": "../escape.pslab",
        "mimeType": "application/vnd.physics-studio.backup+zip",
        "base64Data": "AA=="
    ]))
    XCTAssertThrowsError(try ExportRequest.validateDecodedSize(100 * 1024 * 1024 + 1))
}
```

- [ ] **Step 2: Add static assertions and verify RED**

Require `UIDocumentPickerViewController(forExporting:asCopy:)`, `100 * 1024 * 1024`, `application/vnd.physics-studio.backup+zip`, filename control-character rejection, and temporary-file cleanup. Run static QA; expect missing-file failure.

- [ ] **Step 3: Implement the parser and system export**

Define:

```swift
struct ExportRequest: Equatable {
    enum Payload: Equatable { case text(String); case base64(String) }
    static let maximumBytes = 100 * 1024 * 1024
    let fileName: String
    let mimeType: String
    let payload: Payload
}
```

Reject empty names, `/`, `\\`, `:`, Unicode control characters, names longer than 128 characters, MIME strings longer than 127 characters, and MIME strings not matching `^[a-z0-9][a-z0-9!#$&^_.+-]*/[a-z0-9][a-z0-9!#$&^_.+-]*$`. Before Base64 allocation, reject encoded strings longer than `((maximumBytes + 2) / 3) * 4 + 4`; then decode with `Data(base64Encoded:options: [])` and validate decoded byte count.

`ExportCoordinator.present` writes the validated data to a unique directory under `FileManager.default.temporaryDirectory`, presents `UIDocumentPickerViewController(forExporting: [url], asCopy: true)`, retains the directory until picker completion/cancellation, then removes only that verified child directory.

- [ ] **Step 4: Verify GREEN and commit**

Run static QA and `git diff --check`; record XCTest as pending macOS execution. Then:

```powershell
git add ios/PhysicsStudio/ExportCoordinator.swift ios/PhysicsStudioTests/ExportCoordinatorTests.swift ios/PhysicsStudio.xcodeproj/project.pbxproj tools/qa_ios_project.cjs
git commit -m "feat: add validated iOS document export"
```

### Task 5: Main-Frame Native Bridge and Web Adapters

**Files:**
- Create: `ios/PhysicsStudio/NativeBridge.swift`
- Create: `ios/PhysicsStudioTests/NativeBridgeTests.swift`
- Modify: `ios/PhysicsStudio/StudioWebViewController.swift`
- Modify: `ios/PhysicsStudio.xcodeproj/project.pbxproj`
- Modify: `activation.js`
- Modify: `app.js`
- Modify: `learning-lab.js`
- Modify: `android/src/com/physicsstudio/studyroom/MainActivity.java`
- Modify: `tools/qa_android_bridge.cjs`
- Modify: `tools/qa_ios_project.cjs`
- Regenerate: `ios/PhysicsStudio/Resources/Web/*`

**Interfaces:**
- Consumes: message names `physicsStudioActivation` and `physicsStudioExport` from the trusted local main frame.
- Produces: `NativeBridgeHandler.init(activationStore:export:)`, `handle(channel:body:) throws -> [String: Any]`; Promise replies `{ deviceId, storedCode, description }`, `{ saved: true }`, and `{ presented: true }` or a stable rejected error string.

- [ ] **Step 1: Write bridge-routing tests**

```swift
func testActivationGetReturnsSnapshot() throws {
    let activationStore = ActivationStore(
        secureStore: MemorySecureStore(),
        randomBytes: { Data(repeating: 0x31, count: $0) }
    )
    let handler = NativeBridgeHandler(
        activationStore: activationStore,
        export: { _ in XCTFail("unexpected export") }
    )
    let reply = try handler.handle(channel: .activation, body: ["action": "get"])
    XCTAssertEqual(reply["description"] as? String, "iOS Keychain 本机存储")
    XCTAssertNotNil(reply["deviceId"] as? String)
}

func testUnknownActionIsRejected() {
    let activationStore = ActivationStore(
        secureStore: MemorySecureStore(),
        randomBytes: { Data(repeating: 0x31, count: $0) }
    )
    let handler = NativeBridgeHandler(activationStore: activationStore, export: { _ in })
    XCTAssertThrowsError(try handler.handle(channel: .activation, body: ["action": "erase"]))
}
```

- [ ] **Step 2: Add JS/static bridge assertions and verify RED**

Update QA to require both iOS handler names in `NativeBridge.swift`, `activation.js`, `app.js` and `learning-lab.js`; require main-frame/local-content checks; require Android `PhysicsStudioAndroid` and Windows `window.chrome.webview` tokens to remain present. Run QA and expect failure because the iOS adapter is absent.

- [ ] **Step 3: Implement the Swift message handler**

Define channels and pure routing separately from WebKit:

```swift
enum NativeBridgeChannel: String {
    case activation = "physicsStudioActivation"
    case export = "physicsStudioExport"
}

final class NativeBridge: NSObject, WKScriptMessageHandlerWithReply {
    func userContentController(
        _ userContentController: WKUserContentController,
        didReceive message: WKScriptMessage,
        replyHandler: @escaping (Any?, String?) -> Void
    ) {
        guard message.frameInfo.isMainFrame,
              let url = message.frameInfo.request.url,
              localContent.contains(url),
              let channel = NativeBridgeChannel(rawValue: message.name) else {
            replyHandler(nil, "bridge-origin-rejected")
            return
        }
        do { replyHandler(try handler.handle(channel: channel, body: message.body), nil) }
        catch { replyHandler(nil, "bridge-request-invalid") }
    }
}
```

Register both handlers with `WKUserContentController.addScriptMessageHandler(_:contentWorld:name:)` for `.page`, and remove them in controller deinitialization. Never echo raw Keychain, Base64 or exception data into the error string.

- [ ] **Step 4: Add iOS activation and export adapters without changing other platforms**

At the start of `getNativeActivationAdapter()` in `activation.js`, add:

```js
const iosActivation = window.webkit?.messageHandlers?.physicsStudioActivation;
if (iosActivation?.postMessage) {
  const state = await iosActivation.postMessage({ action: "get" });
  return {
    deviceId: String(state.deviceId || ""),
    storedCode: String(state.storedCode || ""),
    description: "iOS Keychain 本机存储",
    async save(code) {
      const response = await iosActivation.postMessage({ action: "save", code });
      return Boolean(response.saved);
    }
  };
}
```

In `app.js`, centralize iOS export calls in these helpers and use them from attachment export, complete backup, lightweight JSON export and authorized-import-template export:

```js
function getIosExportBridge() {
  return window.webkit?.messageHandlers?.physicsStudioExport || null;
}

async function saveTextWithIos(fileName, content, mimeType) {
  const bridge = getIosExportBridge();
  if (!bridge?.postMessage) return false;
  await bridge.postMessage({ action: "saveText", fileName, mimeType, content });
  return true;
}

async function saveBase64WithIos(fileName, base64Data, mimeType) {
  const bridge = getIosExportBridge();
  if (!bridge?.postMessage) return false;
  await bridge.postMessage({ action: "saveBase64", fileName, mimeType, base64Data });
  return true;
}
```

Keep Android as the first branch where it already exists, then iOS, then the current browser/Windows download fallback. In `learning-lab.js`, send the same `saveText` dictionary and attach `.catch(error => showLabMessage("文件保存失败，请重试。", true))`; do not require existing synchronous callers to become Promise-aware. For `exportSketch()`, convert the PNG Blob to Base64 and send `saveBase64` on iOS before using the existing anchor-download fallback.

Correct the Android text-export compatibility bug in the same regression cycle: `saveTextFile()` must call `sanitizeGenericFileName(fileName)` because all Web callers already supply `.json`, `.html` or `.csv`; it must not append `.json` to HTML/CSV reports. Update `qa_android_bridge.cjs` from the stale UA assertion `PhysicsStudioAndroid/2.6.0` to the actual source value `PhysicsStudioAndroid/2.7.0`, and add a static assertion that text export uses the generic sanitizer.

- [ ] **Step 5: Re-sync assets and run regression checks**

Run:

```powershell
& $Node ios/tools/sync_web_assets.cjs
& $Node tools/qa_ios_project.cjs
& $Node tools/qa_activation_and_1900.cjs
& $Node tools/qa_learning_engine.cjs
& $Node tools/qa_classroom_client.cjs
$env:NODE_PATH = $WorkspaceNodeModules
& $Node tools/qa_android_bridge.cjs .\index.html .\qa-output\android-bridge-ios-regression
git diff --check
```

Expected: every listed command exits zero; iOS manifest hashes change only for the modified JavaScript and manifest.

- [ ] **Step 6: Commit**

```powershell
git add ios/PhysicsStudio/NativeBridge.swift ios/PhysicsStudio/StudioWebViewController.swift ios/PhysicsStudioTests/NativeBridgeTests.swift ios/PhysicsStudio.xcodeproj/project.pbxproj activation.js app.js learning-lab.js android/src/com/physicsstudio/studyroom/MainActivity.java ios/PhysicsStudio/Resources/Web tools/qa_android_bridge.cjs tools/qa_ios_project.cjs
git commit -m "feat: connect iOS activation and export bridges"
```

### Task 6: External Routing, File Import, and Media Permissions

**Files:**
- Create: `ios/PhysicsStudio/ExternalLinkRouter.swift`
- Create: `ios/PhysicsStudioTests/ExternalLinkRouterTests.swift`
- Modify: `ios/PhysicsStudio/StudioWebViewController.swift`
- Modify: `ios/PhysicsStudio/Info.plist`
- Modify: `ios/PhysicsStudio.xcodeproj/project.pbxproj`
- Modify: `tools/qa_ios_project.cjs`

**Interfaces:**
- Consumes: navigation URLs, `WKOpenPanelParameters`, WebKit media requests.
- Produces: `ExternalLinkRouter.init(localContent:)`, `decision(for:) -> NavigationDecision`, `edgeURL(for:) -> URL?`, file-picker callbacks, `.prompt` only for trusted local main-frame media requests. `StudioWebViewController` alone calls `UIApplication`.

- [ ] **Step 1: Write URL routing tests first**

```swift
func testConvertsWebURLsToEdgeSchemes() throws {
    XCTAssertEqual(
        ExternalLinkRouter.edgeURL(for: URL(string: "https://example.com/a?q=1")!)?.absoluteString,
        "microsoft-edge-https://example.com/a?q=1"
    )
    XCTAssertEqual(
        ExternalLinkRouter.edgeURL(for: URL(string: "http://example.com")!)?.absoluteString,
        "microsoft-edge-http://example.com"
    )
}

func testRejectsExecutableAndForeignFileSchemes() {
    let router = ExternalLinkRouter(localContent: localContent)
    XCTAssertEqual(router.decision(for: URL(string: "javascript:alert(1)")!), .reject)
    XCTAssertEqual(router.decision(for: URL(fileURLWithPath: "/tmp/outside.html")), .reject)
}
```

- [ ] **Step 2: Extend Info.plist/static checks and verify RED**

Require non-empty Chinese values for `NSCameraUsageDescription`, `NSMicrophoneUsageDescription`, `NSMotionUsageDescription`; require both Edge schemes; require `NSAllowsLocalNetworking` but prohibit `NSAllowsArbitraryLoads`; require all iPhone/iPad orientations. Require routing tests and `ExternalLinkRouter.swift`. Run QA and expect missing-file failure.

Use these exact permission strings:

```text
NSCameraUsageDescription = 拍摄试题、识别二维码和记录物理实验。
NSMicrophoneUsageDescription = 采集声音频谱实验数据。
NSMotionUsageDescription = 采集加速度和运动实验数据。
```

- [ ] **Step 3: Implement the pure routing decision**

Use:

```swift
enum NavigationDecision: Equatable {
    case allowLocal
    case openExternal(URL)
    case reject
}

static func edgeURL(for url: URL) -> URL? {
    guard var components = URLComponents(url: url, resolvingAgainstBaseURL: false) else { return nil }
    if components.scheme?.lowercased() == "https" { components.scheme = "microsoft-edge-https" }
    else if components.scheme?.lowercased() == "http" { components.scheme = "microsoft-edge-http" }
    else { return nil }
    return components.url
}
```

Allow only bundled `file:` URLs inside `LocalWebContent`; route `http`, `https`, `mailto`, and `tel` externally; reject every other scheme. For HTTP/HTTPS, call `UIApplication.canOpenURL(edgeURL)` and open Edge when true, otherwise open the original URL. For mail feedback, preserve the existing prefilled recipient `luo865265@gmail.com`; the user must still confirm sending in the mail application.

- [ ] **Step 4: Implement WebKit delegate boundaries**

In `StudioWebViewController`:

- Cancel and route every non-local navigation in `decidePolicyFor`.
- Return no child WebView from `createWebViewWith`; route only HTTP/HTTPS/mail/tel requests whose `sourceFrame` is the trusted bundled main frame.
- Implement `runOpenPanelWith` using `UIDocumentPickerViewController(forOpeningContentTypes: [.item], asCopy: true)`, mirror `allowsMultipleSelection`, retain exactly one completion handler, and return `nil` on cancellation.
- On iOS 15 media permission callbacks, return `.prompt` only when the initiating frame is the trusted local main frame; return `.deny` for subframes and external origins.
- Keep `mediaTypesRequiringUserActionForPlayback = .all` so videos play after a user tap.
- Retain normal Web scrolling; do not add a parent drag recognizer or disable `webView.scrollView.isScrollEnabled`.

- [ ] **Step 5: Verify static and existing mobile behavior**

Run:

```powershell
& $Node tools/qa_ios_project.cjs
$env:NODE_PATH = $WorkspaceNodeModules
& $Node tools/qa_student_complete_experience.cjs
git diff --check
```

Expected: static iOS checks and the complete student-flow browser QA exit zero. On Windows, record camera/microphone/motion/file-picker/Edge iOS checks as `NOT RUN — real iOS device required`.

- [ ] **Step 6: Commit**

```powershell
git add ios/PhysicsStudio/ExternalLinkRouter.swift ios/PhysicsStudio/StudioWebViewController.swift ios/PhysicsStudio/Info.plist ios/PhysicsStudioTests/ExternalLinkRouterTests.swift ios/PhysicsStudio.xcodeproj/project.pbxproj tools/qa_ios_project.cjs
git commit -m "feat: secure iOS links imports and permissions"
```

### Task 7: Documentation and Reproducible iOS Source Package

**Files:**
- Create: `ios/README.md`
- Create: `ios/安装说明.txt`
- Create: `tools/build_ios_source.ps1`
- Modify: `README.md`
- Modify: `android/README.md`
- Modify: `tools/build_release.ps1`
- Modify: `.gitignore`
- Modify: `tools/qa_ios_project.cjs`

**Interfaces:**
- Consumes: completed `ios/` tree and version `2.7.0`.
- Produces: `发布/Apple/物理研习室-iOS-Xcode源码-v2.7.0.zip` and adjacent `.sha256.txt`.

- [ ] **Step 1: Add packaging assertions and verify RED**

Extend static QA to require the iOS README to contain the exact `xcodebuild` command, minimum iOS version, signing limitation, Keychain behavior, backup migration, Edge fallback and real-device checklist. Require `tools/build_release.ps1` to include `ios` in the source archive and require `build_ios_source.ps1` to exclude `.git`, `DerivedData`, user data and signing material.

Run QA; expected failure because the documentation and packager do not exist.

- [ ] **Step 2: Write honest platform documentation**

Add an “iOS 版” section to root `README.md` that states:

- The repository contains a complete Xcode source project for iOS 15+ universal devices.
- Windows static QA does not prove compilation, signing, TestFlight, App Store review or real-device permission behavior.
- macOS owners must choose their Apple Development team, adjust Bundle Identifier only if needed, run `xcodebuild`, execute XCTest, then perform the listed real-device checks.
- `.pslab` is the supported cross-device migration path; each iOS device needs its own activation code.
- Class joining works only against an actually deployed reachable HTTPS classroom server.

The iOS README must provide the exact build command from Task 2 and this test command:

```bash
xcodebuild -project ios/PhysicsStudio.xcodeproj -scheme PhysicsStudio -configuration Debug -sdk iphonesimulator -destination 'platform=iOS Simulator,name=iPhone 15' CODE_SIGNING_ALLOWED=NO test
```

- [ ] **Step 3: Implement safe source packaging**

`build_ios_source.ps1` must:

1. Resolve and verify the repository root and `ios` child path.
2. Run `node ios/tools/sync_web_assets.cjs` and `node tools/qa_ios_project.cjs` before packaging.
3. Copy only `ios/`, the root Web allowlist sources, `assets/app-icon-1024.png`, activation public key, required vendor licenses, and build/readme files to a verified temporary child directory.
4. Exclude `.git`, `.build`, `DerivedData`, `xcuserdata`, `*.mobileprovision`, `*.p12`, Keychain exports, Android signing files and user data.
5. Produce `发布/Apple/物理研习室-iOS-Xcode源码-v2.7.0.zip` and an uppercase SHA-256 line in `物理研习室-iOS-Xcode源码-v2.7.0.zip.sha256.txt`.

Update `android/README.md` so it describes Android as one of three retained clients rather than one of only two. Update `tools/build_release.ps1` so it runs the iOS asset sync and static QA before source packaging, then includes the non-secret `ios` directory while retaining the existing Android/Windows outputs unchanged.

- [ ] **Step 4: Run full Windows-verifiable regression suite**

Run:

```powershell
& $Node tools/qa_ios_project.cjs
& $Node tools/qa_activation_and_1900.cjs
& $Node tools/qa_backup_validator_fields.cjs
& $Node tools/qa_classroom_client.cjs
& $Node tools/qa_learning_engine.cjs
& $Node tools/qa_mock_exam_bank.cjs
& $Node tools/qa_targeted_learning.cjs
$env:NODE_PATH = $WorkspaceNodeModules
& $Node tools/qa_student_complete_experience.cjs
& $Node tools/qa_targeted_teacher_ui.cjs
& powershell -ExecutionPolicy Bypass -File tools/build_ios_source.ps1 -Version 2.7.0
git diff --check
```

Expected: each executable Windows check exits zero; the ZIP and SHA-256 file exist; recalculating `Get-FileHash -Algorithm SHA256` exactly matches the published hash. Do not mark the next macOS/real-device gate passed.

- [ ] **Step 5: Commit**

```powershell
git add ios/README.md ios/安装说明.txt tools/build_ios_source.ps1 README.md android/README.md tools/build_release.ps1 .gitignore tools/qa_ios_project.cjs
git commit -m "docs: package and hand off iOS Xcode source"
```

### Task 8: Independent Review and Platform Handoff

**Files:**
- Review: every file changed by Tasks 1–7
- Update only if review finds a concrete defect: the smallest owning file and its test

**Interfaces:**
- Consumes: all committed task outputs.
- Produces: reviewed source tree, final Windows QA evidence, macOS execution checklist, and no unsupported success claims.

- [ ] **Step 1: Request two-stage code review**

Use `superpowers:requesting-code-review`. First review spec compliance against `docs/superpowers/specs/2026-08-01-physics-studio-ios-design.md`; then review implementation quality, security boundaries, Xcode project references and test quality. Reviewers must not modify files.

- [ ] **Step 2: Fix each confirmed finding with its own RED/GREEN cycle**

For every accepted finding, first add the smallest failing XCTest or `qa_ios_project.cjs` assertion, run it to observe failure, change only the owning implementation, rerun the focused test, then rerun the full suite from Task 7. Do not make speculative refactors.

- [ ] **Step 3: Verify repository and artifact state**

Run:

```powershell
git status --short
git log --oneline -8
Get-FileHash -Algorithm SHA256 '发布/Apple/物理研习室-iOS-Xcode源码-v2.7.0.zip'
Get-Content '发布/Apple/物理研习室-iOS-Xcode源码-v2.7.0.zip.sha256.txt'
```

Expected: only intentional release artifacts are untracked or ignored as documented; the task commits are present; both SHA-256 values match.

- [ ] **Step 4: Record the macOS acceptance gate**

Provide these commands without claiming results until a macOS runner executes them:

```bash
xcodebuild -project ios/PhysicsStudio.xcodeproj -scheme PhysicsStudio -configuration Debug -sdk iphonesimulator CODE_SIGNING_ALLOWED=NO build
xcodebuild -project ios/PhysicsStudio.xcodeproj -scheme PhysicsStudio -configuration Debug -sdk iphonesimulator -destination 'platform=iOS Simulator,name=iPhone 15' CODE_SIGNING_ALLOWED=NO test
```

Then test on one iPhone and one iPad: `window.isSecureContext`、`crypto.subtle`、IndexedDB persistence, activation request/save/relaunch, offline question bank, answer/analysis display, learning-lab scrolling, camera capture, QR scan, microphone, motion sensor, multi-file/PDF/Word import, `.pslab` export/restore, Edge preference/default-browser fallback, class login/invite join, user feedback mail composer, portrait and landscape.

- [ ] **Step 5: Commit only confirmed review fixes**

```powershell
git status --short
git add -u
git diff --cached --check
git commit -m "fix: address final iOS review findings"
```

Run this only in the isolated implementation worktree and only after Step 2 has shown that every tracked change belongs to an accepted finding. Skip the commit when review found no defect and `git status --short` confirms no source changes.
