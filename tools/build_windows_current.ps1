param(
    [string]$ReleaseDirectory = '',
    [string]$Version = '',
    [string]$CertificateThumbprint = '',
    [string]$TimestampUrl = 'http://timestamp.digicert.com',
    [string]$SignToolPath = '',
    [switch]$RequireSignature
)

$ErrorActionPreference = 'Stop'
$projectDirectory = Split-Path -Parent $PSScriptRoot
$versionPath = Join-Path $projectDirectory 'version.json'
if (-not (Test-Path -LiteralPath $versionPath)) { throw 'Missing unified version source.' }
$versionSource = Get-Content -LiteralPath $versionPath -Raw -Encoding UTF8 | ConvertFrom-Json
$canonicalVersion = [string]$versionSource.appVersion
if ($canonicalVersion -notmatch '^\d+\.\d+\.\d+$') { throw 'version.json appVersion is invalid.' }
if ($Version -and $Version -ne $canonicalVersion) { throw "Version must match version.json: $canonicalVersion" }
if (-not $ReleaseDirectory) {
    # This wrapper intentionally has no UTF-8 BOM, so avoid a non-ASCII path
    # literal that Windows PowerShell 5 could decode using the active ANSI code page.
    $publishRoot = Get-ChildItem -LiteralPath $projectDirectory -Directory |
        Where-Object { Test-Path -LiteralPath (Join-Path $_.FullName 'Android') } |
        Select-Object -First 1
    if (-not $publishRoot) { throw 'Missing publish root containing the Android release directory.' }
    $ReleaseDirectory = Join-Path $publishRoot.FullName "Windows-v$canonicalVersion"
}

# Windows and Android must package the same canonical web source. The only
# platform difference is the native host and the asset URL rewrite performed
# by android/tools/build_android.ps1.
$requiredFiles = @(
    'index.html', 'styles.css', 'learning-lab.css', 'experience-shell.css',
    'activation.css', 'activation.js', 'storage-repository.js',
    'question-answer-service.js', 'classroom-client.js', 'learning-engine.js',
    'teacher-mode-lock.js', 'app.js', 'learning-lab.js', 'experience-shell.js'
)
foreach ($relativePath in $requiredFiles) {
    if (-not (Test-Path -LiteralPath (Join-Path $projectDirectory $relativePath))) {
        throw "Canonical web asset is missing: $relativePath"
    }
}

$buildScript = Join-Path $projectDirectory 'tools\build_release.ps1'
$arguments = @(
    '-NoProfile',
    '-ExecutionPolicy', 'Bypass',
    '-File', $buildScript,
    '-ReleaseDirectory', $ReleaseDirectory,
    '-Version', $canonicalVersion
)
if ($CertificateThumbprint) { $arguments += @('-CertificateThumbprint', $CertificateThumbprint) }
if ($TimestampUrl) { $arguments += @('-TimestampUrl', $TimestampUrl) }
if ($SignToolPath) { $arguments += @('-SignToolPath', $SignToolPath) }
if ($RequireSignature) { $arguments += '-RequireSignature' }

& powershell.exe @arguments
if ($LASTEXITCODE -ne 0) { throw "Windows current-source build failed: $LASTEXITCODE" }

[pscustomobject]@{
    Version = $canonicalVersion
    ReleaseDirectory = [IO.Path]::GetFullPath($ReleaseDirectory)
    Base = 'canonical current web source (shared with Android)'
    Installer = (Get-ChildItem -LiteralPath $ReleaseDirectory -File -Filter "*v$canonicalVersion.exe" | Select-Object -First 1 -ExpandProperty FullName)
    WindowsZip = (Get-ChildItem -LiteralPath $ReleaseDirectory -File -Filter "*Windows-v$canonicalVersion.zip" | Select-Object -First 1 -ExpandProperty FullName)
    SourceZip = (Get-ChildItem -LiteralPath $ReleaseDirectory -File -Filter "*.zip" |
        Where-Object { $_.Name -notlike "*Windows-v$canonicalVersion.zip" } |
        Select-Object -First 1 -ExpandProperty FullName)
} | Format-List
