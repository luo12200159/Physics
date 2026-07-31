param(
    [string]$ReleaseDirectory,
    [string]$Version = '2.5.0',
    [string]$CertificateThumbprint = '',
    [string]$TimestampUrl = 'http://timestamp.digicert.com',
    [string]$SignToolPath = '',
    [switch]$RequireSignature
)

$ErrorActionPreference = 'Stop'

$projectDirectory = Split-Path -Parent $PSScriptRoot
if (-not $ReleaseDirectory) {
    $ReleaseDirectory = Join-Path $projectDirectory '发布'
}
$buildDirectory = Join-Path $projectDirectory '.build'
$installerPath = Join-Path $ReleaseDirectory "物理研习室-安装程序-v$Version.exe"
$launcherPath = Join-Path $projectDirectory '物理研习室.exe'
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
    & $tool sign /sha1 $normalizedThumbprint /s My /fd SHA256 /td SHA256 /tr $TimestampUrl /d '物理研习室' $Path
    if ($LASTEXITCODE -ne 0) { throw "代码签名失败：$Path" }
    & $tool verify /pa /all $Path
    if ($LASTEXITCODE -ne 0) { throw "签名验证失败：$Path" }
}

Push-Location $projectDirectory
try {
    Invoke-Compiler -Arguments @(
        '/nologo',
        '/target:winexe',
        '/optimize+',
        '/codepage:65001',
        '/reference:System.Windows.Forms.dll',
        '/reference:System.Drawing.dll',
        '/reference:System.Security.dll',
        "/reference:$webViewCore",
        "/reference:$webViewWinForms",
        "/win32icon:$iconPath",
        "/out:$launcherPath",
        (Join-Path $projectDirectory 'Launcher.cs')
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
        "/resource:$uninstallerPath,PhysicsStudio.Payload.Uninstaller",
        "/resource:$(Join-Path $projectDirectory 'index.html'),PhysicsStudio.Payload.Index",
        "/resource:$(Join-Path $projectDirectory 'styles.css'),PhysicsStudio.Payload.Styles",
        "/resource:$(Join-Path $projectDirectory 'learning-lab.css'),PhysicsStudio.Payload.LearningLabStyles",
        "/resource:$(Join-Path $projectDirectory 'experience-shell.css'),PhysicsStudio.Payload.ExperienceStyles",
        "/resource:$(Join-Path $projectDirectory 'activation.css'),PhysicsStudio.Payload.ActivationStyles",
        "/resource:$(Join-Path $projectDirectory 'activation-public-key.js'),PhysicsStudio.Payload.ActivationPublicKey",
        "/resource:$(Join-Path $projectDirectory 'activation.js'),PhysicsStudio.Payload.ActivationScript",
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
        "/resource:$(Join-Path $projectDirectory 'learning-engine.js'),PhysicsStudio.Payload.LearningEngine",
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
$hashPath = Join-Path $ReleaseDirectory 'SHA256.txt'
[IO.File]::WriteAllText(
    $hashPath,
    "$($hash.Hash) *$($installer.Name)`n",
    (New-Object Text.UTF8Encoding($false))
)

$zipName = "物理研习室-Windows-v$Version.zip"
$zipPath = Join-Path $ReleaseDirectory $zipName
Compress-Archive -LiteralPath @(
    $installerPath,
    (Join-Path $ReleaseDirectory '安装说明.txt'),
    $hashPath
) -DestinationPath $zipPath -CompressionLevel Optimal -Force
$zipHash = Get-FileHash -Algorithm SHA256 -LiteralPath $zipPath
[IO.File]::WriteAllText(
    (Join-Path $ReleaseDirectory "$zipName.sha256.txt"),
    "$($zipHash.Hash) *$zipName`n",
    (New-Object Text.UTF8Encoding($false))
)

$sourceZipName = "物理研习室-源码-v$Version.zip"
$sourceZipPath = Join-Path $ReleaseDirectory $sourceZipName
$sourceStage = Join-Path $buildDirectory ("source-v$Version-" + [Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $sourceStage | Out-Null

$rootSourceFiles = @(
    '.gitignore',
    'ActivationManager.cs',
    'activation.css',
    'activation-public-key.js',
    'activation.js',
    'app.js',
    'ai-tutor.js',
    'backup.js',
    'backup-validator.js',
    'content-catalog.js',
    'curriculum-bank.js',
    'curriculum-taxonomy.js',
    'document-import.js',
    'exam-question-index.js',
    'experience-shell.css',
    'experience-shell.js',
    'index.html',
    'Installer.cs',
    'Launcher.cs',
    'learning-engine.js',
    'learning-lab.css',
    'learning-lab.js',
    'mock-exam-bank.js',
    'original-practice-bank.js',
    'targeted-practice-bank.js',
    'README.md',
    'security.js',
    'styles.css',
    'Uninstaller.cs',
    '启动应用.cmd',
    '安装应用.cmd',
    '安装应用.ps1'
)
foreach ($relativePath in $rootSourceFiles) {
    Copy-Item -LiteralPath (Join-Path $projectDirectory $relativePath) -Destination $sourceStage
}
foreach ($directoryName in @('assets', 'schemas', 'server', 'tools', 'vendor')) {
    Copy-Item -LiteralPath (Join-Path $projectDirectory $directoryName) -Destination $sourceStage -Recurse
}

$androidStage = Join-Path $sourceStage 'android'
New-Item -ItemType Directory -Path $androidStage | Out-Null
foreach ($relativePath in @('AndroidManifest.xml', 'README.md', '安装说明.txt')) {
    Copy-Item -LiteralPath (Join-Path $projectDirectory "android\$relativePath") -Destination $androidStage
}
foreach ($directoryName in @('res', 'src', 'tools')) {
    Copy-Item -LiteralPath (Join-Path $projectDirectory "android\$directoryName") -Destination $androidStage -Recurse
}

$sourceEntries = Get-ChildItem -LiteralPath $sourceStage -Force
Compress-Archive -LiteralPath $sourceEntries.FullName -DestinationPath $sourceZipPath -CompressionLevel Optimal -Force
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
    Signer = if ($signature.SignerCertificate) { $signature.SignerCertificate.Subject } else { '' }
}
