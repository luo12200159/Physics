const fs = require("node:fs");
const path = require("node:path");

const project = path.resolve(__dirname, "..");
const version = JSON.parse(fs.readFileSync(path.join(project, "version.json"), "utf8")).appVersion;

function read(relativePath) {
  return fs.readFileSync(path.join(project, relativePath), "utf8");
}

function assertIncludes(relativePath, text) {
  if (!read(relativePath).includes(text)) {
    throw new Error(`${relativePath} missing: ${text}`);
  }
}

if (!fs.existsSync(path.join(project, "storage-repository.js"))) {
  throw new Error("storage-repository.js is missing from the project root");
}

assertIncludes("index.html", '<script src="storage-repository.js"></script>');
assertIncludes("index.html", '<script src="version-config.js"></script>');
assertIncludes("Installer.cs", 'new PayloadFile("PhysicsStudio.Payload.VersionConfig", "version-config.js")');
assertIncludes("Launcher.cs", '"version-config.js"');
assertIncludes("Uninstaller.cs", '"version-config.js"');
assertIncludes("安装应用.ps1", "'version-config.js'");
assertIncludes("tools/build_release.ps1", "'version-config.js'");
assertIncludes("tools/build_release.ps1", "PhysicsStudio.Payload.VersionConfig");
assertIncludes("android/tools/build_android.ps1", "(Join-Path $AssetsDirectory 'version-config.js')");
assertIncludes("index.html", '<script src="question-answer-service.js"></script>');
assertIncludes("Installer.cs", 'new PayloadFile("PhysicsStudio.Payload.StorageRepository", "storage-repository.js")');
assertIncludes("Installer.cs", 'new PayloadFile("PhysicsStudio.Payload.TeacherModeLock", "teacher-mode-lock.js")');
assertIncludes("Installer.cs", 'new PayloadFile("PhysicsStudio.Payload.QuestionAnswerService", "question-answer-service.js")');
assertIncludes("Installer.cs", 'new PayloadFile("PhysicsStudio.Payload.PhysicsVisuals", "physics-visuals.js")');
assertIncludes("Installer.cs", 'new PayloadFile("PhysicsStudio.Payload.VariantGenerator", "variant-generator.js")');
assertIncludes("Installer.cs", 'new PayloadFile("PhysicsStudio.Payload.LanClassroomService", "物理研习室-班级服务.exe")');
assertIncludes("tools/build_release.ps1", "PhysicsStudio.Payload.StorageRepository");
assertIncludes("tools/build_release.ps1", "'storage-repository.js'");
assertIncludes("安装应用.ps1", "'storage-repository.js'");
assertIncludes("Launcher.cs", '"storage-repository.js"');
assertIncludes("Launcher.cs", '"teacher-mode-lock.js"');
assertIncludes("Launcher.cs", '"question-answer-service.js"');
assertIncludes("Launcher.cs", '"physics-visuals.js"');
assertIncludes("Launcher.cs", '"variant-generator.js"');
assertIncludes("Uninstaller.cs", '"storage-repository.js"');
assertIncludes("Uninstaller.cs", '"teacher-mode-lock.js"');
assertIncludes("Uninstaller.cs", '"physics-visuals.js"');
assertIncludes("Uninstaller.cs", '"variant-generator.js"');
assertIncludes("android/tools/build_android.ps1", "'storage-repository.js'");
assertIncludes("android/tools/build_android.ps1", "'question-answer-service.js'");
assertIncludes("android/tools/build_android.ps1", "'add', '-f'");
assertIncludes("tools/build_release.ps1", "Compress-NormalizedSourceZip");
assertIncludes("tools/build_release.ps1", ".Replace('\\', '/')");
assertIncludes("tools/build_release.ps1", "'teacher-mode-lock.js'");
assertIncludes("tools/build_release.ps1", "LanClassroomService.cs");
assertIncludes("tools/build_release.ps1", "LanClassroomNative.cs");
assertIncludes("tools/build_release.ps1", "PhysicsStudio.Payload.LanClassroomService");
assertIncludes("tools/build_release.ps1", "PhysicsStudio.Payload.PhysicsVisuals");
assertIncludes("tools/build_release.ps1", "PhysicsStudio.Payload.VariantGenerator");
assertIncludes("tools/build_release.ps1", "'physics-visuals.js'");
assertIncludes("tools/build_release.ps1", "'variant-generator.js'");
assertIncludes("android/tools/build_android.ps1", "'physics-visuals.js'");
assertIncludes("android/tools/build_android.ps1", "'variant-generator.js'");
assertIncludes("安装应用.ps1", "'physics-visuals.js'");
assertIncludes("安装应用.ps1", "'variant-generator.js'");
assertIncludes("tools/build_release.ps1", '"费曼物理-安装程序-v$Version.exe"');
assertIncludes("tools/build_release.ps1", '"费曼物理-Windows-v$Version.zip"');
assertIncludes("tools/build_release.ps1", '"费曼物理-源码-v$Version.zip"');
assertIncludes("android/tools/build_android.ps1", '"费曼物理-Android-v$VersionName.apk"');
assertIncludes("android/tools/build_android.ps1", "ValidateSet('legacy', 'student', 'teacher')");
assertIncludes("android/tools/build_android.ps1", "$AndroidIndexName = 'index.html'");
assertIncludes("android/tools/build_android.ps1", "'experience-shell.js'");
assertIncludes("tools/build_release.ps1", "@('app-student', 'app-teacher', 'res', 'src', 'tools')");
assertIncludes("Installer.cs", `private const string AppVersion = "${version}";`);
assertIncludes(".gitignore", "物理研习室-班级服务.exe");
assertIncludes("tools/build_windows_current.ps1", "Test-Path -LiteralPath (Join-Path $_.FullName 'Android')");
if (read("tools/build_windows_current.ps1").includes('Join-Path $projectDirectory "发布')) {
  throw new Error("build_windows_current.ps1 must not rely on a non-ASCII release-root literal without a UTF-8 BOM");
}
if (/[^\x00-\x7f]/.test(read("tools/build_windows_current.ps1"))) {
  throw new Error("build_windows_current.ps1 has no UTF-8 BOM and must keep executable source ASCII-only");
}

console.log("Release packaging integration checks passed");
