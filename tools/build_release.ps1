param(
    [string]$ReleaseDirectory,
    [string]$Version = '',
    [string]$CertificateThumbprint = '',
    [string]$TimestampUrl = 'http://timestamp.digicert.com',
    [string]$SignToolPath = '',
    [switch]$RequireSignature,
    [string]$ClassroomServerUrl = $env:PHYSICS_STUDIO_CLASSROOM_URL,
    [switch]$AllowInsecureClassroomLan
)

$ErrorActionPreference = 'Stop'

$projectDirectory = Split-Path -Parent $PSScriptRoot
$versionSourcePath = Join-Path $projectDirectory 'version.json'
if (-not (Test-Path -LiteralPath $versionSourcePath)) { throw "缺少统一版本源：$versionSourcePath" }
$versionSource = Get-Content -LiteralPath $versionSourcePath -Raw -Encoding UTF8 | ConvertFrom-Json
$canonicalVersion = [string]$versionSource.appVersion
if ($canonicalVersion -notmatch '^\d+\.\d+\.\d+$') { throw 'version.json 的 appVersion 无效。' }
if ($Version -and $Version -ne $canonicalVersion) { throw "Version 必须与 version.json 一致：$canonicalVersion" }
$Version = $canonicalVersion
if (-not $ReleaseDirectory) {
    $ReleaseDirectory = Join-Path $projectDirectory '发布'
}
$buildDirectory = Join-Path $projectDirectory '.build'
$installerPath = Join-Path $ReleaseDirectory "费曼物理-安装程序-v$Version.exe"
$launcherPath = Join-Path $projectDirectory '物理研习室.exe'
$lanClassroomServicePath = Join-Path $projectDirectory '物理研习室-班级服务.exe'
$uninstallerPath = Join-Path $buildDirectory '卸载物理研习室.exe'
$iconPath = Join-Path $projectDirectory 'assets\app.ico'
$webViewVendor = Join-Path $projectDirectory 'vendor\webview2'
$webViewCore = Join-Path $webViewVendor 'Microsoft.Web.WebView2.Core.dll'
$webViewWinForms = Join-Path $webViewVendor 'Microsoft.Web.WebView2.WinForms.dll'

$compilerCandidates = @(
    'C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe',
    'C:\Windows\Microsoft.NET\Framework\v4.0.30319\csc.exe'
)
$compiler = $compilerCandidates | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
if (-not $compiler) {
    throw '未找到 Windows .NET Framework C# 编译器。'
}

New-Item -ItemType Directory -Force -Path $buildDirectory | Out-Null
New-Item -ItemType Directory -Force -Path $ReleaseDirectory | Out-Null

$ClassroomServerUrl = [string]$ClassroomServerUrl
$ClassroomServerUrl = $ClassroomServerUrl.Trim().TrimEnd('/')
if ($ClassroomServerUrl) {
    $classroomUri = $null
    if (-not [Uri]::TryCreate($ClassroomServerUrl, [UriKind]::Absolute, [ref]$classroomUri)) {
        throw 'ClassroomServerUrl 不是有效的绝对 URL。'
    }
    if ($classroomUri.UserInfo -or $classroomUri.Query -or $classroomUri.Fragment) {
        throw 'ClassroomServerUrl 不能包含账号、查询参数或片段。'
    }
    if ($classroomUri.Scheme -ne 'https' -and -not ($AllowInsecureClassroomLan -and $classroomUri.Scheme -eq 'http')) {
        throw '正式发布的 ClassroomServerUrl 必须使用 HTTPS。'
    }
}
$classroomConfigPath = Join-Path $buildDirectory 'classroom-config.release.js'
$classroomUrlJson = ConvertTo-Json -InputObject $ClassroomServerUrl -Compress
$allowInsecureLanJson = if ($AllowInsecureClassroomLan) { 'true' } else { 'false' }
$classroomConfigSource = "globalThis.PHYSICS_STUDIO_CLASSROOM_URL = $classroomUrlJson;`nglobalThis.PHYSICS_STUDIO_ALLOW_INSECURE_LAN = $allowInsecureLanJson;`n"
[IO.File]::WriteAllText($classroomConfigPath, $classroomConfigSource, (New-Object Text.UTF8Encoding($false)))

$installGuide = @"
费曼物理 Windows 版 $Version

适用系统
Windows 10 或 Windows 11。

安装方法
1. 核对 SHA256.txt 中的校验值。
2. 双击“费曼物理-安装程序-v$Version.exe”完成当前用户安装。
3. 首次启动使用软件所有者签发的设备绑定激活码。

本版内容
- 八年级至高三完整本地题 1900 道；每题包含题干、答案和分步解析。
- 学生端包含题库、错题、视频、掌握证据、教材目录、学情分析、学习实验室与建议。
- 学习记录包含题型、时长、提示、信心、六类错因和迁移表现；掌握依据跨日独立正确、低提示与迁移成功。
- 新学生可使用 24 题摸底包；前概念诊断共 36 条；每 14 天安排广覆盖检测，并提供非排名式连续完成反馈。
- 学习实验室和拍题弹窗已采用内部滚动；作答提交后显示判定、参考答案和详细解析。
- Windows 应用启动时同时启动可持久化的局域网班级服务；教师只填班级名称即可创建、生成邀请码和二维码、查看花名册及删除自己的班级。
- 同一可信 Wi-Fi/局域网中的学生无需账号密码，只需备注名和邀请码，或扫描/选择二维码即可加入；Windows 教师应用需保持运行。
- 首次出现 Windows 防火墙提示时只允许专用网络。班级成员状态会定时刷新；题库、附件和完整作答证据默认仍保存在学生本机，不会自动上传。
- 用户反馈会调用本机邮件应用，收件人为 luo865265@gmail.com；发送动作须由用户确认。

联网与隐私
班级服务：$(if ($ClassroomServerUrl) { "已配置托管 HTTPS 服务 $ClassroomServerUrl" } else { '默认使用本 Windows 应用内置的局域网服务（TCP 8788、发现 UDP 18788）' })。班级创建、加入和删除只以服务端确认为准；核心题库与本机学习功能可离线使用。内置模式只覆盖同一局域网，不应描述为公网云服务。

签名提示
本次输出状态：$(if ($CertificateThumbprint) { 'signed（已使用指定证书并完成签名验证）' } else { 'unsigned（开发版；不可作为正式发行包）' })。
若发布文件未使用商业代码签名证书，Windows 可能显示 SmartScreen 提示；安装前必须核对随包 SHA-256。
"@
[IO.File]::WriteAllText(
    (Join-Path $ReleaseDirectory '安装说明.txt'),
    $installGuide,
    (New-Object Text.UTF8Encoding($false))
)

foreach ($requiredWebViewFile in @(
    $webViewCore,
    $webViewWinForms,
    (Join-Path $webViewVendor 'LICENSE.txt'),
    (Join-Path $webViewVendor 'NOTICE.txt'),
    (Join-Path $webViewVendor 'runtimes\win-x64\native\WebView2Loader.dll'),
    (Join-Path $webViewVendor 'runtimes\win-x86\native\WebView2Loader.dll'),
    (Join-Path $webViewVendor 'runtimes\win-arm64\native\WebView2Loader.dll')
)) {
    if (-not (Test-Path -LiteralPath $requiredWebViewFile)) {
        throw "缺少 WebView2 构建文件：$requiredWebViewFile"
    }
}

Copy-Item -LiteralPath $webViewCore -Destination $projectDirectory -Force
Copy-Item -LiteralPath $webViewWinForms -Destination $projectDirectory -Force
foreach ($architecture in @('win-x64', 'win-x86', 'win-arm64')) {
    $runtimeTarget = Join-Path $projectDirectory "runtimes\$architecture\native"
    New-Item -ItemType Directory -Force -Path $runtimeTarget | Out-Null
    Copy-Item -LiteralPath (
        Join-Path $webViewVendor "runtimes\$architecture\native\WebView2Loader.dll"
    ) -Destination $runtimeTarget -Force
}

function Invoke-Compiler {
    param([string[]]$Arguments)

    & $compiler @Arguments
    if ($LASTEXITCODE -ne 0) {
        throw "编译失败，退出码：$LASTEXITCODE"
    }
}

function Resolve-SignTool {
    if ($SignToolPath) {
        if (-not (Test-Path -LiteralPath $SignToolPath)) {
            throw "未找到指定的 SignTool：$SignToolPath"
        }
        return (Resolve-Path -LiteralPath $SignToolPath).Path
    }

    $kitsRoot = "${env:ProgramFiles(x86)}\Windows Kits\10\bin"
    if (Test-Path -LiteralPath $kitsRoot) {
        $candidate = Get-ChildItem -LiteralPath $kitsRoot -Recurse -Filter 'signtool.exe' -File -ErrorAction SilentlyContinue |
            Where-Object { $_.FullName -match '\\x64\\signtool\.exe$' } |
            Sort-Object FullName -Descending |
            Select-Object -First 1 -ExpandProperty FullName
        if ($candidate) { return $candidate }
    }
    return ''
}

function Invoke-CodeSign {
    param([Parameter(Mandatory = $true)][string]$Path)

    if (-not $CertificateThumbprint) {
        if ($RequireSignature) {
            throw '已要求代码签名，但未提供 CertificateThumbprint。'
        }
        return
    }
    $tool = Resolve-SignTool
    if (-not $tool) { throw '未找到 Windows SDK SignTool，无法完成代码签名。' }
    $normalizedThumbprint = ($CertificateThumbprint -replace '\s', '').ToUpperInvariant()
    & $tool sign /sha1 $normalizedThumbprint /s My /fd SHA256 /td SHA256 /tr $TimestampUrl /d '费曼物理' $Path
    if ($LASTEXITCODE -ne 0) { throw "代码签名失败：$Path" }
    & $tool verify /pa /all $Path
    if ($LASTEXITCODE -ne 0) { throw "签名验证失败：$Path" }
}

function Compress-NormalizedSourceZip {
    param(
        [Parameter(Mandatory = $true)][string]$SourceRoot,
        [Parameter(Mandatory = $true)][string]$Destination
    )

    Add-Type -AssemblyName System.IO.Compression
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    if (Test-Path -LiteralPath $Destination) { Remove-Item -LiteralPath $Destination -Force }
    $root = [IO.Path]::GetFullPath($SourceRoot).TrimEnd([IO.Path]::DirectorySeparatorChar) + [IO.Path]::DirectorySeparatorChar
    $stream = [IO.File]::Open($Destination, [IO.FileMode]::CreateNew, [IO.FileAccess]::ReadWrite, [IO.FileShare]::None)
    $archive = New-Object IO.Compression.ZipArchive($stream, [IO.Compression.ZipArchiveMode]::Create, $false)
    try {
        foreach ($file in Get-ChildItem -LiteralPath $SourceRoot -File -Recurse) {
            $full = [IO.Path]::GetFullPath($file.FullName)
            $entryName = $full.Substring($root.Length).Replace('\', '/')
            if ([string]::IsNullOrWhiteSpace($entryName) -or $entryName.Contains('..')) {
                throw "源码 ZIP entry 路径非法：$entryName"
            }
            $entry = $archive.CreateEntry($entryName, [IO.Compression.CompressionLevel]::Optimal)
            $input = [IO.File]::OpenRead($full)
            $output = $entry.Open()
            try { $input.CopyTo($output) } finally { $output.Dispose(); $input.Dispose() }
        }
    } finally {
        $archive.Dispose()
        $stream.Dispose()
    }
}

Push-Location $projectDirectory
try {
    Invoke-Compiler -Arguments @(
        '/nologo',
        '/target:winexe',
        '/optimize+',
        '/codepage:65001',
        '/reference:System.Web.Extensions.dll',
        "/win32icon:$iconPath",
        "/out:$lanClassroomServicePath",
        (Join-Path $projectDirectory 'LanClassroomService.cs')
    )

    Invoke-Compiler -Arguments @(
        '/nologo',
        '/target:winexe',
        '/optimize+',
        '/codepage:65001',
        '/reference:System.Windows.Forms.dll',
        '/reference:System.Drawing.dll',
        '/reference:System.Security.dll',
        '/reference:System.Web.Extensions.dll',
        "/reference:$webViewCore",
        "/reference:$webViewWinForms",
        "/win32icon:$iconPath",
        "/out:$launcherPath",
        (Join-Path $projectDirectory 'Launcher.cs'),
        (Join-Path $projectDirectory 'LanClassroomNative.cs')
    )

    Invoke-Compiler -Arguments @(
        '/nologo',
        '/target:winexe',
        '/optimize+',
        '/codepage:65001',
        '/reference:System.Windows.Forms.dll',
        "/win32icon:$iconPath",
        "/out:$uninstallerPath",
        (Join-Path $projectDirectory 'Uninstaller.cs')
    )

    Invoke-CodeSign -Path $lanClassroomServicePath
    Invoke-CodeSign -Path $launcherPath
    Invoke-CodeSign -Path $uninstallerPath

    Invoke-Compiler -Arguments @(
        '/nologo',
        '/target:winexe',
        '/optimize+',
        '/codepage:65001',
        '/reference:System.Windows.Forms.dll',
        "/win32icon:$iconPath",
        "/out:$installerPath",
        (Join-Path $projectDirectory 'Installer.cs'),
        "/resource:$launcherPath,PhysicsStudio.Payload.Launcher",
        "/resource:$lanClassroomServicePath,PhysicsStudio.Payload.LanClassroomService",
        "/resource:$uninstallerPath,PhysicsStudio.Payload.Uninstaller",
        "/resource:$(Join-Path $projectDirectory 'index.html'),PhysicsStudio.Payload.Index",
        "/resource:$(Join-Path $projectDirectory 'styles.css'),PhysicsStudio.Payload.Styles",
        "/resource:$(Join-Path $projectDirectory 'learning-lab.css'),PhysicsStudio.Payload.LearningLabStyles",
        "/resource:$(Join-Path $projectDirectory 'experience-shell.css'),PhysicsStudio.Payload.ExperienceStyles",
        "/resource:$(Join-Path $projectDirectory 'activation.css'),PhysicsStudio.Payload.ActivationStyles",
        "/resource:$(Join-Path $projectDirectory 'activation-public-key.js'),PhysicsStudio.Payload.ActivationPublicKey",
        "/resource:$(Join-Path $projectDirectory 'activation.js'),PhysicsStudio.Payload.ActivationScript",
        "/resource:$(Join-Path $projectDirectory 'storage-repository.js'),PhysicsStudio.Payload.StorageRepository",
        "/resource:$(Join-Path $projectDirectory 'curriculum-taxonomy.js'),PhysicsStudio.Payload.CurriculumTaxonomy",
        "/resource:$(Join-Path $projectDirectory 'curriculum-bank.js'),PhysicsStudio.Payload.CurriculumBank",
        "/resource:$(Join-Path $projectDirectory 'exam-question-index.js'),PhysicsStudio.Payload.ExamQuestionIndex",
        "/resource:$(Join-Path $projectDirectory 'mock-exam-bank.js'),PhysicsStudio.Payload.MockExamBank",
        "/resource:$(Join-Path $projectDirectory 'original-practice-bank.js'),PhysicsStudio.Payload.OriginalPracticeBank",
        "/resource:$(Join-Path $projectDirectory 'targeted-practice-bank.js'),PhysicsStudio.Payload.TargetedPracticeBank",
        "/resource:$(Join-Path $projectDirectory 'vendor\jsQR.js'),PhysicsStudio.Payload.JsQr",
        "/resource:$(Join-Path $projectDirectory 'vendor\jsQR-LICENSE.txt'),PhysicsStudio.Payload.JsQrLicense",
        "/resource:$(Join-Path $projectDirectory 'vendor\fflate.js'),PhysicsStudio.Payload.Fflate",
        "/resource:$(Join-Path $projectDirectory 'vendor\fflate-LICENSE.txt'),PhysicsStudio.Payload.FflateLicense",
        "/resource:$webViewCore,PhysicsStudio.Payload.WebView2Core",
        "/resource:$webViewWinForms,PhysicsStudio.Payload.WebView2WinForms",
        "/resource:$(Join-Path $webViewVendor 'runtimes\win-x64\native\WebView2Loader.dll'),PhysicsStudio.Payload.WebView2LoaderX64",
        "/resource:$(Join-Path $webViewVendor 'runtimes\win-x86\native\WebView2Loader.dll'),PhysicsStudio.Payload.WebView2LoaderX86",
        "/resource:$(Join-Path $webViewVendor 'runtimes\win-arm64\native\WebView2Loader.dll'),PhysicsStudio.Payload.WebView2LoaderArm64",
        "/resource:$(Join-Path $webViewVendor 'LICENSE.txt'),PhysicsStudio.Payload.WebView2License",
        "/resource:$(Join-Path $webViewVendor 'NOTICE.txt'),PhysicsStudio.Payload.WebView2Notice",
        "/resource:$(Join-Path $projectDirectory 'security.js'),PhysicsStudio.Payload.Security",
        "/resource:$(Join-Path $projectDirectory 'backup.js'),PhysicsStudio.Payload.Backup",
        "/resource:$(Join-Path $projectDirectory 'backup-validator.js'),PhysicsStudio.Payload.BackupValidator",
        "/resource:$(Join-Path $projectDirectory 'ai-tutor.js'),PhysicsStudio.Payload.AiTutor",
        "/resource:$(Join-Path $projectDirectory 'document-import.js'),PhysicsStudio.Payload.DocumentImport",
         "/resource:$(Join-Path $projectDirectory 'content-catalog.js'),PhysicsStudio.Payload.ContentCatalog",
         "/resource:$classroomConfigPath,PhysicsStudio.Payload.ClassroomConfig",
         "/resource:$(Join-Path $projectDirectory 'classroom-client.js'),PhysicsStudio.Payload.ClassroomClient",
         "/resource:$(Join-Path $projectDirectory 'question-answer-service.js'),PhysicsStudio.Payload.QuestionAnswerService",
         "/resource:$(Join-Path $projectDirectory 'learning-engine.js'),PhysicsStudio.Payload.LearningEngine",
         "/resource:$(Join-Path $projectDirectory 'physics-visuals.js'),PhysicsStudio.Payload.PhysicsVisuals",
        "/resource:$(Join-Path $projectDirectory 'teacher-mode-lock.js'),PhysicsStudio.Payload.TeacherModeLock",
        "/resource:$(Join-Path $projectDirectory 'app.js'),PhysicsStudio.Payload.Script",
        "/resource:$(Join-Path $projectDirectory 'learning-lab.js'),PhysicsStudio.Payload.LearningLab",
        "/resource:$(Join-Path $projectDirectory 'experience-shell.js'),PhysicsStudio.Payload.ExperienceScript",
        "/resource:$(Join-Path $projectDirectory 'README.md'),PhysicsStudio.Payload.Readme",
        "/resource:$(Join-Path $projectDirectory 'assets\favicon.svg'),PhysicsStudio.Payload.Favicon",
        "/resource:$iconPath,PhysicsStudio.Payload.Icon"
    )
    Invoke-CodeSign -Path $installerPath
}
finally {
    Pop-Location
}

$installer = Get-Item -LiteralPath $installerPath
$signature = Get-AuthenticodeSignature -LiteralPath $installerPath
$hash = Get-FileHash -Algorithm SHA256 -LiteralPath $installerPath
$isSigned = $signature.Status -eq [System.Management.Automation.SignatureStatus]::Valid
$releaseStatus = if ($isSigned) {
    "signed`n签名状态：Valid`n签名者：$($signature.SignerCertificate.Subject)"
} else {
    "unsigned`n签名状态：$($signature.Status)`n不可作为正式发行包；请使用带证书的构建重新发布。"
}
[IO.File]::WriteAllText(
    (Join-Path $ReleaseDirectory '签名状态.txt'),
    $releaseStatus + "`n",
    (New-Object Text.UTF8Encoding($false))
)
$hashPath = Join-Path $ReleaseDirectory 'SHA256.txt'
[IO.File]::WriteAllText(
    $hashPath,
    "$($hash.Hash) *$($installer.Name)`n",
    (New-Object Text.UTF8Encoding($false))
)

$zipName = "费曼物理-Windows-v$Version.zip"
$zipPath = Join-Path $ReleaseDirectory $zipName
Compress-Archive -LiteralPath @(
    $installerPath,
    (Join-Path $ReleaseDirectory '安装说明.txt'),
    $hashPath,
    (Join-Path $ReleaseDirectory '签名状态.txt')
) -DestinationPath $zipPath -CompressionLevel Optimal -Force
$zipHash = Get-FileHash -Algorithm SHA256 -LiteralPath $zipPath
[IO.File]::WriteAllText(
    (Join-Path $ReleaseDirectory "$zipName.sha256.txt"),
    "$($zipHash.Hash) *$zipName`n",
    (New-Object Text.UTF8Encoding($false))
)

$sourceZipName = "费曼物理-源码-v$Version.zip"
$sourceZipPath = Join-Path $ReleaseDirectory $sourceZipName
$sourceStage = Join-Path $buildDirectory ("source-v$Version-" + [Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $sourceStage | Out-Null

$rootSourceFiles = @(
    '.gitignore',
    'ActivationManager.cs',
    'activation.css',
    'activation-public-key.js',
    'activation.js',
    'storage-repository.js',
    'app.js',
    'ai-tutor.js',
    'backup.js',
    'backup-validator.js',
    'content-catalog.js',
    'classroom-config.js',
    'classroom-client.js',
    'question-answer-service.js',
    'curriculum-bank.js',
    'curriculum-taxonomy.js',
    'document-import.js',
    'exam-question-index.js',
    'experience-shell.css',
    'experience-shell.js',
    'index.html',
    'Installer.cs',
    'LanClassroomNative.cs',
    'LanClassroomService.cs',
    'Launcher.cs',
    'learning-engine.js',
    'physics-visuals.js',
    'teacher-mode-lock.js',
    'learning-lab.css',
    'learning-lab.js',
    'package.json',
    'mock-exam-bank.js',
    'original-practice-bank.js',
    'targeted-practice-bank.js',
    'README.md',
    'security.js',
    'styles.css',
    'Uninstaller.cs',
    '启动应用.cmd',
    '安装应用.cmd',
    '安装应用.ps1',
    'AGENTS.md',
    'PLANS.md',
    'CHANGELOG.md',
    'version.json'
)
foreach ($relativePath in $rootSourceFiles) {
    Copy-Item -LiteralPath (Join-Path $projectDirectory $relativePath) -Destination $sourceStage
}
foreach ($directoryName in @('assets', 'schemas', 'tools', 'vendor')) {
    Copy-Item -LiteralPath (Join-Path $projectDirectory $directoryName) -Destination $sourceStage -Recurse
}

$serverStage = Join-Path $sourceStage 'server'
New-Item -ItemType Directory -Path $serverStage | Out-Null
foreach ($relativePath in @(
    '.env.business.example',
    '.env.example',
    'package.json',
    'physics-ai-gateway.mjs',
    'pnpm-lock.yaml',
    'pnpm-workspace.yaml',
    'README.md',
    'tsconfig.build.json',
    'tsconfig.json',
    'vitest.config.ts'
)) {
    Copy-Item -LiteralPath (Join-Path $projectDirectory "server\$relativePath") -Destination $serverStage
}
foreach ($directoryName in @('migrations', 'src', 'tests')) {
    Copy-Item -LiteralPath (Join-Path $projectDirectory "server\$directoryName") -Destination $serverStage -Recurse
}

$androidStage = Join-Path $sourceStage 'android'
New-Item -ItemType Directory -Path $androidStage | Out-Null
foreach ($relativePath in @('AndroidManifest.xml', 'README.md', '安装说明.txt')) {
    Copy-Item -LiteralPath (Join-Path $projectDirectory "android\$relativePath") -Destination $androidStage
}
foreach ($directoryName in @('res', 'src', 'tools')) {
    Copy-Item -LiteralPath (Join-Path $projectDirectory "android\$directoryName") -Destination $androidStage -Recurse
}

Compress-NormalizedSourceZip -SourceRoot $sourceStage -Destination $sourceZipPath
$nodeCommand = Get-Command node.exe -ErrorAction SilentlyContinue
if (-not $nodeCommand) { throw '发布包可移植性校验需要 Node.js。' }
$sourceZipQa = Join-Path $projectDirectory 'tools\qa_release_zip_portability.cjs'
& $nodeCommand.Source $sourceZipQa $sourceZipPath
if ($LASTEXITCODE -ne 0) { throw "源码 ZIP 可移植性校验失败：$sourceZipPath" }
$sourceZipHash = Get-FileHash -Algorithm SHA256 -LiteralPath $sourceZipPath
[IO.File]::WriteAllText(
    (Join-Path $ReleaseDirectory "$sourceZipName.sha256.txt"),
    "$($sourceZipHash.Hash) *$sourceZipName`n",
    (New-Object Text.UTF8Encoding($false))
)

[pscustomobject]@{
    Installer = $installer.FullName
    Size = $installer.Length
    SHA256 = $hash.Hash
    ReleaseZip = $zipPath
    ZipSHA256 = $zipHash.Hash
    SourceZip = $sourceZipPath
    SourceZipSHA256 = $sourceZipHash.Hash
    SignatureStatus = $signature.Status.ToString()
    ReleaseStatus = if ($isSigned) { 'signed' } else { 'unsigned-development-only' }
    Signer = if ($signature.SignerCertificate) { $signature.SignerCertificate.Subject } else { '' }
}
