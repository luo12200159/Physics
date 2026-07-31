param(
    [switch]$Launch
)

$ErrorActionPreference = 'Stop'

$sourceDirectory = $PSScriptRoot
$installDirectory = Join-Path $env:LOCALAPPDATA 'Programs\物理研习室'
$executableName = '物理研习室.exe'
$requiredFiles = @(
    $executableName,
    'index.html',
    'styles.css',
    'learning-lab.css',
    'experience-shell.css',
    'activation.css',
    'activation-public-key.js',
    'activation.js',
    'curriculum-taxonomy.js',
    'curriculum-bank.js',
    'exam-question-index.js',
    'mock-exam-bank.js',
    'original-practice-bank.js',
    'targeted-practice-bank.js',
    'vendor\jsQR.js',
    'vendor\jsQR-LICENSE.txt',
    'vendor\fflate.js',
    'vendor\fflate-LICENSE.txt',
    'security.js',
    'backup.js',
    'backup-validator.js',
    'ai-tutor.js',
    'document-import.js',
    'content-catalog.js',
    'learning-engine.js',
    'app.js',
    'learning-lab.js',
    'experience-shell.js',
    'Microsoft.Web.WebView2.Core.dll',
    'Microsoft.Web.WebView2.WinForms.dll',
    'runtimes\win-x64\native\WebView2Loader.dll',
    'runtimes\win-x86\native\WebView2Loader.dll',
    'runtimes\win-arm64\native\WebView2Loader.dll'
)

foreach ($file in $requiredFiles) {
    $sourcePath = Join-Path $sourceDirectory $file
    if (-not (Test-Path -LiteralPath $sourcePath)) {
        throw "缺少安装文件：$file"
    }
}

New-Item -ItemType Directory -Force -Path $installDirectory | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $installDirectory 'assets') | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $installDirectory 'vendor') | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $installDirectory 'vendor\webview2') | Out-Null

$filesToInstall = @(
    'index.html',
    'styles.css',
    'learning-lab.css',
    'experience-shell.css',
    'activation.css',
    'activation-public-key.js',
    'activation.js',
    'curriculum-taxonomy.js',
    'curriculum-bank.js',
    'exam-question-index.js',
    'mock-exam-bank.js',
    'original-practice-bank.js',
    'targeted-practice-bank.js',
    'security.js',
    'backup.js',
    'backup-validator.js',
    'ai-tutor.js',
    'document-import.js',
    'content-catalog.js',
    'learning-engine.js',
    'app.js',
    'learning-lab.js',
    'experience-shell.js',
    'README.md',
    'Microsoft.Web.WebView2.Core.dll',
    'Microsoft.Web.WebView2.WinForms.dll',
    $executableName
)

foreach ($file in $filesToInstall) {
    Copy-Item -LiteralPath (Join-Path $sourceDirectory $file) -Destination $installDirectory -Force
}

$vendorFiles = @('jsQR.js', 'jsQR-LICENSE.txt', 'fflate.js', 'fflate-LICENSE.txt')
foreach ($vendorFile in $vendorFiles) {
    Copy-Item -LiteralPath (Join-Path $sourceDirectory "vendor\$vendorFile") `
        -Destination (Join-Path $installDirectory 'vendor') -Force
}

foreach ($webViewNotice in @('LICENSE.txt', 'NOTICE.txt')) {
    Copy-Item -LiteralPath (Join-Path $sourceDirectory "vendor\webview2\$webViewNotice") `
        -Destination (Join-Path $installDirectory 'vendor\webview2') -Force
}

foreach ($architecture in @('win-x64', 'win-x86', 'win-arm64')) {
    $runtimeDirectory = Join-Path $installDirectory "runtimes\$architecture\native"
    New-Item -ItemType Directory -Force -Path $runtimeDirectory | Out-Null
    Copy-Item -LiteralPath (
        Join-Path $sourceDirectory "runtimes\$architecture\native\WebView2Loader.dll"
    ) -Destination $runtimeDirectory -Force
}

$assetFiles = @('favicon.svg', 'app.ico')
foreach ($asset in $assetFiles) {
    Copy-Item -LiteralPath (Join-Path $sourceDirectory "assets\$asset") `
        -Destination (Join-Path $installDirectory 'assets') -Force
}

$targetPath = Join-Path $installDirectory $executableName
$desktopShortcut = Join-Path ([Environment]::GetFolderPath('Desktop')) '物理研习室.lnk'
$startMenuDirectory = Join-Path ([Environment]::GetFolderPath('Programs')) '物理研习室'
$startMenuShortcut = Join-Path $startMenuDirectory '物理研习室.lnk'

New-Item -ItemType Directory -Force -Path $startMenuDirectory | Out-Null

function New-AppShortcut {
    param([string]$ShortcutPath)

    $shell = New-Object -ComObject WScript.Shell
    $shortcut = $shell.CreateShortcut($ShortcutPath)
    $shortcut.TargetPath = $targetPath
    $shortcut.WorkingDirectory = $installDirectory
    $shortcut.IconLocation = "$targetPath,0"
    $shortcut.Description = '初高中物理试题与解题视频离线管理应用'
    $shortcut.Save()
}

New-AppShortcut -ShortcutPath $desktopShortcut
New-AppShortcut -ShortcutPath $startMenuShortcut

Write-Output "INSTALL_DIR=$installDirectory"
Write-Output "DESKTOP_SHORTCUT=$desktopShortcut"
Write-Output "START_MENU_SHORTCUT=$startMenuShortcut"

if ($Launch) {
    Start-Process -FilePath $targetPath
}
