param(
    [string]$ReleaseDirectory = '',
    [string]$Version = ''
)

$ErrorActionPreference = 'Stop'
$projectDirectory = Split-Path -Parent $PSScriptRoot
$publishRoot = Get-ChildItem -LiteralPath $projectDirectory -Directory |
    Where-Object { Test-Path -LiteralPath (Join-Path $_.FullName 'Android') } |
    Select-Object -First 1
if (-not $publishRoot) { throw 'Missing publish root containing an Android release directory.' }
$versionSourcePath = Join-Path $projectDirectory 'version.json'
if (-not (Test-Path -LiteralPath $versionSourcePath)) { throw 'Missing unified version source.' }
$versionSource = Get-Content -LiteralPath $versionSourcePath -Raw -Encoding UTF8 | ConvertFrom-Json
$canonicalVersion = [string]$versionSource.appVersion
if ($canonicalVersion -notmatch '^\d+\.\d+\.\d+$') { throw 'version.json appVersion is invalid.' }
if ($Version -and $Version -ne $canonicalVersion) { throw "Version must match version.json: $canonicalVersion" }
$legacyVersion = $canonicalVersion
if (-not $ReleaseDirectory) { $ReleaseDirectory = Join-Path $publishRoot.FullName "Windows-v$legacyVersion" }
$ReleaseDirectory = [IO.Path]::GetFullPath($ReleaseDirectory)

$sourceArchive = Get-ChildItem -LiteralPath (Join-Path $projectDirectory '.build\release-candidate-v2.8.0') -File -Filter '*.zip' |
    Where-Object { $_.Name -notlike '*Windows-v2.8.0.zip' } | Select-Object -First 1 -ExpandProperty FullName
if (-not $sourceArchive) { throw 'Missing v2.8 source snapshot archive.' }
$stage = Join-Path $projectDirectory ('.build\windows-v31-stage-' + [Guid]::NewGuid().ToString('N'))
$sourceTree = Join-Path $projectDirectory ('.build\windows-v31-source-' + [Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Force -Path $stage, $sourceTree | Out-Null

function Prepare-Stage {
    param([Parameter(Mandatory = $true)][string]$Destination)

    Expand-Archive -LiteralPath $sourceArchive -DestinationPath $Destination -Force
    foreach ($name in @('classroom-client.js', 'storage-repository.js')) {
        Copy-Item -LiteralPath (Join-Path $projectDirectory $name) -Destination (Join-Path $Destination $name) -Force
    }
    foreach ($relativePath in @('version.json', 'tools\qa_classroom_offline_create.cjs', 'tools\build_windows_v31_from_v28.ps1')) {
        $sourcePath = Join-Path $projectDirectory $relativePath
        if (Test-Path -LiteralPath $sourcePath) {
            $targetPath = Join-Path $Destination $relativePath
            New-Item -ItemType Directory -Force -Path (Split-Path -Parent $targetPath) | Out-Null
            Copy-Item -LiteralPath $sourcePath -Destination $targetPath -Force
        }
    }

    # Keep the v2.8 page structure, but replace only the login boundary and
    # classroom rendering branch needed by the v3 owner-capability flow.
    $shellPath = Join-Path $Destination 'experience-shell.js'
    $text = [IO.File]::ReadAllText($shellPath, [Text.Encoding]::UTF8)
    $canonicalShell = [IO.File]::ReadAllText((Join-Path $projectDirectory 'experience-shell.js'), [Text.Encoding]::UTF8)
    $guestStart = $canonicalShell.IndexOf('  function renderClassroomLogin(status, disabled) {', [StringComparison]::Ordinal)
    $guestEnd = $canonicalShell.IndexOf('  function renderAuthenticatedClassroom', $guestStart, [StringComparison]::Ordinal)
    $oldStart = $text.IndexOf('  function renderClassroomLogin(status, disabled) {', [StringComparison]::Ordinal)
    $oldEnd = $text.IndexOf('  function renderAuthenticatedClassroom', $oldStart, [StringComparison]::Ordinal)
    if ($guestStart -lt 0 -or $guestEnd -le $guestStart -or $oldStart -lt 0 -or $oldEnd -le $oldStart) {
        throw 'Unable to locate the v2.8 classroom login boundary.'
    }
    $guestFunction = $canonicalShell.Substring($guestStart, $guestEnd - $guestStart)
    $text = $text.Remove($oldStart, $oldEnd - $oldStart).Insert($oldStart, $guestFunction)

    # Keep the v2.8 Windows page baseline, but carry over the matching
    # student join handler and QR-field lookup used by the new guest form.
    # The classroom client is already overlaid from the current source above,
    # so these handlers remain API-compatible while preserving the v2.8 UI.
    $submitStart = $canonicalShell.IndexOf('  async function handleClassroomSubmit(event) {', [StringComparison]::Ordinal)
    $submitEnd = $canonicalShell.IndexOf('  async function handleClassroomClick', $submitStart, [StringComparison]::Ordinal)
    $oldSubmitStart = $text.IndexOf('  async function handleClassroomSubmit(event) {', [StringComparison]::Ordinal)
    $oldSubmitEnd = $text.IndexOf('  async function handleClassroomClick', $oldSubmitStart, [StringComparison]::Ordinal)
    if ($submitStart -lt 0 -or $submitEnd -le $submitStart -or $oldSubmitStart -lt 0 -or $oldSubmitEnd -le $oldSubmitStart) {
        throw 'Unable to locate the classroom submit handler boundary.'
    }
    $submitFunction = $canonicalShell.Substring($submitStart, $submitEnd - $submitStart)
    $text = $text.Remove($oldSubmitStart, $oldSubmitEnd - $oldSubmitStart).Insert($oldSubmitStart, $submitFunction)

    $changeStart = $canonicalShell.IndexOf('  async function handleClassroomChange(event) {', [StringComparison]::Ordinal)
    $changeEnd = $canonicalShell.IndexOf('  function diagnosticPackageProgress', $changeStart, [StringComparison]::Ordinal)
    $oldChangeStart = $text.IndexOf('  async function handleClassroomChange(event) {', [StringComparison]::Ordinal)
    $oldChangeEnd = if ($oldChangeStart -ge 0) {
        $text.IndexOf('  function diagnosticPackageProgress', $oldChangeStart, [StringComparison]::Ordinal)
    } else { -1 }
    if ($changeStart -lt 0 -or $changeEnd -le $changeStart) {
        throw 'Unable to locate the canonical classroom change handler boundary.'
    }
    $changeFunction = $canonicalShell.Substring($changeStart, $changeEnd - $changeStart)
    if ($oldChangeStart -ge 0 -and $oldChangeEnd -gt $oldChangeStart) {
        $text = $text.Remove($oldChangeStart, $oldChangeEnd - $oldChangeStart).Insert($oldChangeStart, $changeFunction)
    } else {
        $insertChangeAt = $text.IndexOf('  function diagnosticPackageProgress', [StringComparison]::Ordinal)
        if ($insertChangeAt -lt 0) { throw 'Unable to locate the v2.8 classroom change insertion point.' }
        $text = $text.Insert($insertChangeAt, $changeFunction)
    }

    $text = $text.Replace(
        'if (window.PhysicsStudioClassroom?.status?.().authenticated) refreshClassroomData(false);',
        'if (window.PhysicsStudioClassroom?.status?.().authenticated || window.PhysicsStudioClassroom?.status?.().ownerAuthenticated) refreshClassroomData(false);'
    )
    $text = $text.Replace(
        '    const disabled = ui.classroom.busy ? " disabled" : "";'+[Environment]::NewLine,
        ('    const disabled = ui.classroom.busy ? " disabled" : "";'+[Environment]::NewLine+
         '    const serverRole = status.authenticated ? status.user?.role : status.ownerAuthenticated ? "teacher" : "";'+[Environment]::NewLine+
         '    const roleMatchesSession = experience.role === "student"'+[Environment]::NewLine+
         '      ? serverRole === "student"'+[Environment]::NewLine+
         '      : experience.role === "teacher"'+[Environment]::NewLine+
         '        ? ["teacher", "administrator"].includes(serverRole)'+[Environment]::NewLine+
         '        : false;'+[Environment]::NewLine+
         '    const showAuthenticatedClassroom = Boolean((status.authenticated || status.ownerAuthenticated) && roleMatchesSession);'+[Environment]::NewLine)
    )
    $text = $text.Replace(
        '${status.authenticated ? renderAuthenticatedClassroom(status, selected, disabled, learningSync) : renderClassroomLogin(status, disabled)}',
        '${showAuthenticatedClassroom ? renderAuthenticatedClassroom(status, selected, disabled, learningSync) : renderClassroomLogin(status, disabled)}'
    )
    $text = $text.Replace(
        'if (ui.classroom.busy || !client?.status?.().authenticated || navigator.onLine === false) return;',
        'if (ui.classroom.busy || (!client?.status?.().authenticated && !client?.status?.().ownerAuthenticated) || navigator.onLine === false) return;'
    )
    $text = [Text.RegularExpressions.Regex]::Replace(
        $text,
        '(?m)^      <p class="classroom-boundary">.*$',
        '      <p class="classroom-boundary">教师可直接创建班级；学生只能通过邀请码加入；管理权限仅限创建者。网络不可用时保留本机数据。</p>`;'
    )
    [IO.File]::WriteAllText($shellPath, $text, (New-Object Text.UTF8Encoding($false)))

    # The v2.8 Windows baseline recomputed the full knowledge-point evidence
    # summary even though the dashboard does not display it. Remove only that
    # redundant synchronous call; review/report tabs keep their full metrics.
    $labPath = Join-Path $Destination 'learning-lab.js'
    $labText = [IO.File]::ReadAllText($labPath, [Text.Encoding]::UTF8)
    $labText = $labText.Replace(
        '  const lab = {'+"`n",
        ('  let teacherHydrationPending = false;'+"`n"+
         '  let teacherHydrated = false;'+"`n"+
         '  const lab = {'+"`n")
    )
    $labText = $labText.Replace(
        '    const renderers = {'+"`n",
        ('    if (lab.tab === "teacher" && !teacherHydrated) {'+"`n"+
         '      lab.panel.innerHTML = ''<div class="lab-opening-state" role="status"><strong>正在打开教师中心…</strong><span>学情汇总将在后台准备。</span></div>'';'+"`n"+
         '      if (!teacherHydrationPending) {'+"`n"+
         '        teacherHydrationPending = true;'+"`n"+
         '        window.setTimeout(() => {'+"`n"+
         '          teacherHydrationPending = false;'+"`n"+
         '          if (!lab.dialog?.open || lab.tab !== "teacher") return;'+"`n"+
         '          teacherHydrated = true;'+"`n"+
         '          renderPanel({ preserveScroll: true });'+"`n"+
         '        }, 420);'+"`n"+
         '      }'+"`n"+
         '      return;'+"`n"+
         '    }'+"`n"+
         '    const renderers = {'+"`n")
    )
    $labText = $labText.Replace('    const coverage = engine.knowledgePointEvidenceSummary(lab.state, questions);', '')
    [IO.File]::WriteAllText($labPath, $labText, (New-Object Text.UTF8Encoding($false)))

    $versionPath = Join-Path $Destination 'version.json'
    if (Test-Path -LiteralPath $versionPath) {
        $version = Get-Content -LiteralPath $versionPath -Raw -Encoding UTF8 | ConvertFrom-Json
    } else {
        $version = [pscustomobject]@{ appVersion = ''; classroomClientVersion = ''; androidUserAgentVersion = ''; stateVersion = 5; reportFormatVersion = 2 }
    }
    $version.appVersion = $legacyVersion
    $version.classroomClientVersion = $legacyVersion
    $version.androidUserAgentVersion = $legacyVersion
    [IO.File]::WriteAllText($versionPath, ($version | ConvertTo-Json -Depth 8) + "`n", (New-Object Text.UTF8Encoding($false)))
    foreach ($packagePath in @((Join-Path $Destination 'package.json'), (Join-Path $Destination 'server\package.json'))) {
        if (Test-Path -LiteralPath $packagePath) {
            $package = Get-Content -LiteralPath $packagePath -Raw -Encoding UTF8 | ConvertFrom-Json
            $package.version = $legacyVersion
            [IO.File]::WriteAllText($packagePath, ($package | ConvertTo-Json -Depth 10) + "`n", (New-Object Text.UTF8Encoding($false)))
        }
    }
    foreach ($sourceName in @('Installer.cs', 'Launcher.cs', 'Uninstaller.cs')) {
        $sourcePath = Join-Path $Destination $sourceName
        $source = [IO.File]::ReadAllText($sourcePath, [Text.Encoding]::UTF8)
        $source = $source.Replace('2.8.0.0', "$legacyVersion.0").Replace('2.8.0', $legacyVersion)
        [IO.File]::WriteAllText($sourcePath, $source, (New-Object Text.UTF8Encoding($false)))
    }
    foreach ($readmePath in @((Join-Path $Destination 'README.md'), (Join-Path $Destination 'android\README.md'))) {
        if (Test-Path -LiteralPath $readmePath) {
            $readme = [IO.File]::ReadAllText($readmePath, [Text.Encoding]::UTF8).Replace('v2.8.0', "v$legacyVersion").Replace('2.8.0', $legacyVersion)
            [IO.File]::WriteAllText($readmePath, $readme, (New-Object Text.UTF8Encoding($false)))
        }
    }
}

try {
    Prepare-Stage -Destination $stage
    Prepare-Stage -Destination $sourceTree
    New-Item -ItemType Directory -Force -Path $ReleaseDirectory | Out-Null
    $buildScript = Join-Path $stage 'tools\build_release.ps1'
    & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $buildScript -ReleaseDirectory $ReleaseDirectory -Version $legacyVersion
    if ($LASTEXITCODE -ne 0) { throw "Windows v3.1 build failed: $LASTEXITCODE" }

    Add-Type -AssemblyName System.IO.Compression
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    $sourceZip = Get-ChildItem -LiteralPath $ReleaseDirectory -File -Filter '*.zip' |
        Where-Object { $_.Name -notlike "*Windows-v$legacyVersion.zip" } | Select-Object -First 1 -ExpandProperty FullName
    if (-not $sourceZip) { throw 'The v3.1 build did not produce a source ZIP.' }
    Remove-Item -LiteralPath $sourceZip -Force
    $stream = [IO.File]::Open($sourceZip, [IO.FileMode]::CreateNew, [IO.FileAccess]::ReadWrite, [IO.FileShare]::None)
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
    $sourceHash = Get-FileHash -Algorithm SHA256 -LiteralPath $sourceZip
    [IO.File]::WriteAllText((Join-Path $ReleaseDirectory "$([IO.Path]::GetFileName($sourceZip)).sha256.txt"), "$($sourceHash.Hash) *$([IO.Path]::GetFileName($sourceZip))`n", (New-Object Text.UTF8Encoding($false)))

    [pscustomobject]@{
        Version = $legacyVersion
        Base = 'Windows v2.8 source snapshot'
        ReleaseDirectory = $ReleaseDirectory
        Installer = (Get-ChildItem -LiteralPath $ReleaseDirectory -File -Filter "*v$legacyVersion.exe" | Select-Object -First 1 -ExpandProperty FullName)
        WindowsZip = (Get-ChildItem -LiteralPath $ReleaseDirectory -File -Filter "*Windows-v$legacyVersion.zip" | Select-Object -First 1 -ExpandProperty FullName)
        SourceZip = $sourceZip
        SourceSHA256 = $sourceHash.Hash
    } | Format-List
} finally {
    foreach ($pathToRemove in @($stage, $sourceTree)) {
        if (Test-Path -LiteralPath $pathToRemove) { Remove-Item -LiteralPath $pathToRemove -Recurse -Force -ErrorAction SilentlyContinue }
    }
}
