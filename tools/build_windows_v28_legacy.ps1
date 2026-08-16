param(
    [string]$ArchivePath = '',
    [string]$ReleaseDirectory = ''
)

$ErrorActionPreference = 'Stop'
$projectDirectory = Split-Path -Parent $PSScriptRoot
$publishRoot = Get-ChildItem -LiteralPath $projectDirectory -Directory |
    Where-Object { Test-Path -LiteralPath (Join-Path $_.FullName 'Android') } |
    Select-Object -First 1
if (-not $publishRoot) { throw 'Missing publish root containing an Android release directory.' }
if (-not $ArchivePath) {
    $ArchivePath = (Get-ChildItem -LiteralPath (Join-Path $publishRoot.FullName 'Android') -File -Filter '*v2.8.0.apk' |
        Select-Object -First 1).FullName
}
if (-not $ArchivePath) { throw 'Missing v2.8.0 APK archive.' }
$ArchivePath = (Resolve-Path -LiteralPath $ArchivePath -ErrorAction Stop).Path
if (-not (Test-Path -LiteralPath $ArchivePath)) {
    throw "缺少 v2.8.0 资源包：$ArchivePath"
}
if (-not $ReleaseDirectory) {
    $ReleaseDirectory = Join-Path $publishRoot.FullName 'Windows-v2.8.0'
}
$ReleaseDirectory = [IO.Path]::GetFullPath($ReleaseDirectory)

# When the archived v2.8 Windows source snapshot is present, prefer it over
# composing a package from the current v3 tree.  This keeps the rollback
# faithful while leaving the canonical v3 source untouched.
$sourceSnapshotArchive = Get-ChildItem -LiteralPath (Join-Path $projectDirectory '.build\release-candidate-v2.8.0') -File -Filter '*.zip' -ErrorAction SilentlyContinue |
    Where-Object { $_.Name -notlike '*Windows-v2.8.0.zip' } |
    Select-Object -First 1
if ($sourceSnapshotArchive) {
    $snapshotStage = Join-Path $projectDirectory ('.build\windows-v2.8-snapshot-' + [Guid]::NewGuid().ToString('N'))
    $sourceTree = Join-Path $projectDirectory ('.build\windows-v2.8-source-' + [Guid]::NewGuid().ToString('N'))
    New-Item -ItemType Directory -Force -Path $snapshotStage, $sourceTree | Out-Null
    Expand-Archive -LiteralPath $sourceSnapshotArchive.FullName -DestinationPath $snapshotStage -Force
    Expand-Archive -LiteralPath $sourceSnapshotArchive.FullName -DestinationPath $sourceTree -Force
    $legacyBuildScript = Join-Path $snapshotStage 'tools\build_release.ps1'
    & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $legacyBuildScript -ReleaseDirectory $ReleaseDirectory -Version '2.8.0'
    if ($LASTEXITCODE -ne 0) { throw "Windows v2.8 snapshot build failed: $LASTEXITCODE" }

    Add-Type -AssemblyName System.IO.Compression
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    $sourceZip = Get-ChildItem -LiteralPath $ReleaseDirectory -File -Filter '*.zip' |
        Where-Object { $_.Name -notlike '*Windows-v2.8.0.zip' } |
        Select-Object -First 1
    if (-not $sourceZip) { throw 'The v2.8 snapshot build did not produce a source ZIP.' }
    if (Test-Path -LiteralPath $sourceZip.FullName) { Remove-Item -LiteralPath $sourceZip.FullName -Force }
    $stream = [IO.File]::Open($sourceZip.FullName, [IO.FileMode]::CreateNew, [IO.FileAccess]::ReadWrite, [IO.FileShare]::None)
    $archive = New-Object IO.Compression.ZipArchive($stream, [IO.Compression.ZipArchiveMode]::Create, $false)
    try {
        $root = [IO.Path]::GetFullPath($sourceTree).TrimEnd([IO.Path]::DirectorySeparatorChar) + [IO.Path]::DirectorySeparatorChar
        foreach ($file in Get-ChildItem -LiteralPath $sourceTree -File -Recurse) {
            $full = [IO.Path]::GetFullPath($file.FullName)
            $entryName = $full.Substring($root.Length).Replace('\', '/')
            if ([string]::IsNullOrWhiteSpace($entryName) -or $entryName.Contains('..')) { throw "Invalid source ZIP entry: $entryName" }
            $entry = $archive.CreateEntry($entryName, [IO.Compression.CompressionLevel]::Optimal)
            $input = [IO.File]::OpenRead($full)
            $output = $entry.Open()
            try { $input.CopyTo($output) } finally { $output.Dispose(); $input.Dispose() }
        }
    } finally { $archive.Dispose(); $stream.Dispose() }
    $sourceHash = Get-FileHash -Algorithm SHA256 -LiteralPath $sourceZip.FullName
    $sourceHashFile = Get-ChildItem -LiteralPath $ReleaseDirectory -File -Filter '*.zip.sha256.txt' |
        Where-Object { $_.Name -notlike '*Windows-v2.8.0.zip.sha256.txt' } |
        Select-Object -First 1
    if ($sourceHashFile) {
        [IO.File]::WriteAllText($sourceHashFile.FullName, "$($sourceHash.Hash) *$($sourceZip.Name)`n", (New-Object Text.UTF8Encoding($false)))
    }
    [pscustomobject]@{
        Version = '2.8.0'
        SourceArchive = $sourceSnapshotArchive.FullName
        ReleaseDirectory = $ReleaseDirectory
        Installer = (Get-ChildItem -LiteralPath $ReleaseDirectory -File -Filter '*.exe' | Where-Object Name -like '*v2.8.0.exe' | Select-Object -First 1).FullName
        WindowsZip = (Get-ChildItem -LiteralPath $ReleaseDirectory -File -Filter '*Windows-v2.8.0.zip' | Select-Object -First 1).FullName
        SourceZip = $sourceZip.FullName
        WebAssets = 'archived v2.8.0 Windows source snapshot'
    }
    exit 0
}

# Build in an isolated staging tree.  The current v3 source and its version
# source are never overwritten; only the generated v2.8 release directory is
# changed.
$stage = Join-Path $projectDirectory ('.build\windows-v2.8-' + [Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Force -Path $stage | Out-Null
foreach ($file in Get-ChildItem -LiteralPath $projectDirectory -File) {
    Copy-Item -LiteralPath $file.FullName -Destination (Join-Path $stage $file.Name) -Force
}
foreach ($directoryName in @('assets', 'tools', 'vendor', 'schemas', 'runtimes')) {
    $sourceDirectory = Join-Path $projectDirectory $directoryName
    if (Test-Path -LiteralPath $sourceDirectory) {
        Copy-Item -LiteralPath $sourceDirectory -Destination (Join-Path $stage $directoryName) -Recurse -Force
    }
}
foreach ($directoryName in @('android', 'server')) {
    $sourceDirectory = Join-Path $projectDirectory $directoryName
    $destinationDirectory = Join-Path $stage $directoryName
    if (-not (Test-Path -LiteralPath $sourceDirectory)) { continue }
    New-Item -ItemType Directory -Force -Path $destinationDirectory | Out-Null
    foreach ($file in Get-ChildItem -LiteralPath $sourceDirectory -File) {
        Copy-Item -LiteralPath $file.FullName -Destination (Join-Path $destinationDirectory $file.Name) -Force
    }
    foreach ($childName in @('migrations', 'res', 'src', 'tests', 'tools')) {
        $child = Join-Path $sourceDirectory $childName
        if (Test-Path -LiteralPath $child) {
            Copy-Item -LiteralPath $child -Destination (Join-Path $destinationDirectory $childName) -Recurse -Force
        }
    }
}

Add-Type -AssemblyName System.IO.Compression.FileSystem
$legacyAssets = Join-Path $stage '.legacy-v2.8-assets'
New-Item -ItemType Directory -Force -Path $legacyAssets | Out-Null
$archive = [IO.Compression.ZipFile]::OpenRead($ArchivePath)
try {
    foreach ($entry in $archive.Entries | Where-Object { $_.FullName -like 'assets/*' -and -not $_.FullName.EndsWith('/') }) {
        $name = Split-Path -Leaf $entry.FullName
        $destination = Join-Path $legacyAssets $name
        $input = $entry.Open()
        $output = [IO.File]::Open($destination, [IO.FileMode]::Create, [IO.FileAccess]::Write, [IO.FileShare]::None)
        try { $input.CopyTo($output) } finally { $output.Dispose(); $input.Dispose() }
    }
} finally {
    $archive.Dispose()
}

# These are the v2.8 WebView assets extracted from the archived v2.8 APK.
$legacyAssetNames = @(
    'activation.js', 'activation.css', 'ai-tutor.js', 'app.js',
    'backup-validator.js', 'backup.js', 'classroom-client.js',
    'content-catalog.js', 'curriculum-bank.js', 'curriculum-taxonomy.js',
    'document-import.js', 'exam-question-index.js', 'experience-shell.css',
    'experience-shell.js', 'index.html', 'learning-engine.js',
    'learning-lab.css', 'learning-lab.js', 'mock-exam-bank.js',
    'original-practice-bank.js', 'storage-repository.js', 'styles.css',
    'targeted-practice-bank.js'
)
foreach ($name in $legacyAssetNames) {
    $source = Join-Path $legacyAssets $name
    if (-not (Test-Path -LiteralPath $source)) { throw "v2.8 资源缺失：$name" }
    Copy-Item -LiteralPath $source -Destination (Join-Path $stage $name) -Force
}
foreach ($name in @('activation-public-key.js', 'document-import.js', 'security.js')) {
    $source = Join-Path $legacyAssets $name
    if (Test-Path -LiteralPath $source) { Copy-Item -LiteralPath $source -Destination (Join-Path $stage $name) -Force }
}
if (Test-Path -LiteralPath (Join-Path $legacyAssets 'favicon.svg')) {
    Copy-Item -LiteralPath (Join-Path $legacyAssets 'favicon.svg') -Destination (Join-Path $stage 'assets\favicon.svg') -Force
}
foreach ($name in @('jsQR.js', 'jsQR-LICENSE.txt', 'fflate.js', 'fflate-LICENSE.txt')) {
    $source = Join-Path $legacyAssets $name
    if (Test-Path -LiteralPath $source) { Copy-Item -LiteralPath $source -Destination (Join-Path $stage "vendor\$name") -Force }
}

# Keep the v2.8 version metadata consistent inside the isolated package.
$versionPath = Join-Path $stage 'version.json'
$version = Get-Content -LiteralPath $versionPath -Raw -Encoding UTF8 | ConvertFrom-Json
$version.appVersion = '2.8.0'
$version.classroomClientVersion = '2.8.0'
$version.androidUserAgentVersion = '2.8.0'
$version.stateVersion = 5
$version.reportFormatVersion = 2
[IO.File]::WriteAllText($versionPath, ($version | ConvertTo-Json -Depth 5) + "`n", (New-Object Text.UTF8Encoding($false)))

foreach ($packagePath in @((Join-Path $stage 'package.json'), (Join-Path $stage 'server\package.json'))) {
    if (Test-Path -LiteralPath $packagePath) {
        $package = Get-Content -LiteralPath $packagePath -Raw -Encoding UTF8 | ConvertFrom-Json
        $package.version = '2.8.0'
        [IO.File]::WriteAllText($packagePath, ($package | ConvertTo-Json -Depth 10) + "`n", (New-Object Text.UTF8Encoding($false)))
    }
}

foreach ($sourceName in @('Installer.cs', 'Launcher.cs', 'Uninstaller.cs')) {
    $sourcePath = Join-Path $stage $sourceName
    $text = Get-Content -LiteralPath $sourcePath -Raw -Encoding UTF8
    $text = $text.Replace('3.0.0.0', '2.8.0.0').Replace('3.0.0', '2.8.0')
    [IO.File]::WriteAllText($sourcePath, $text, (New-Object Text.UTF8Encoding($false)))
}

New-Item -ItemType Directory -Force -Path $ReleaseDirectory | Out-Null
$buildScript = Join-Path $stage 'tools\build_release.ps1'
& powershell.exe -NoProfile -ExecutionPolicy Bypass -File $buildScript -ReleaseDirectory $ReleaseDirectory
if ($LASTEXITCODE -ne 0) { throw "Windows v2.8 构建失败，退出码：$LASTEXITCODE" }

[pscustomobject]@{
    Version = '2.8.0'
    SourceArchive = $ArchivePath
    ReleaseDirectory = $ReleaseDirectory
    Installer = (Get-ChildItem -LiteralPath $ReleaseDirectory -File -Filter '*.exe' |
        Where-Object { $_.Name -like '*v2.8.0.exe' } | Select-Object -First 1).FullName
    WindowsZip = (Get-ChildItem -LiteralPath $ReleaseDirectory -File -Filter '*Windows-v2.8.0.zip' | Select-Object -First 1).FullName
    SourceZip = (Get-ChildItem -LiteralPath $ReleaseDirectory -File -Filter '*.zip' |
        Where-Object { $_.Name -notlike '*Windows-v2.8.0.zip' } | Select-Object -First 1).FullName
    WebAssets = 'archived Android v2.8.0 assets'
}
