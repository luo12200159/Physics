param(
    [string]$ToolchainRoot = '',
    [string]$VersionName = '',
    [int]$VersionCode = 0,
    [string]$ClassroomServerUrl = $env:PHYSICS_STUDIO_CLASSROOM_URL,
    [switch]$AllowInsecureClassroomLan,
    [ValidateSet('legacy', 'student', 'teacher')]
    [string]$Edition = 'legacy'
)

$ErrorActionPreference = 'Stop'

function Invoke-Checked {
    param(
        [Parameter(Mandatory = $true)][string]$FilePath,
        [Parameter(Mandatory = $true)][object[]]$ArgumentList
    )

    & $FilePath @ArgumentList
    if ($LASTEXITCODE -ne 0) {
        throw "命令执行失败（退出码 $LASTEXITCODE）：$FilePath"
    }
}

function Assert-SafeChildPath {
    param(
        [Parameter(Mandatory = $true)][string]$Parent,
        [Parameter(Mandatory = $true)][string]$Child,
        [Parameter(Mandatory = $true)][string]$ExpectedLeaf
    )

    $parentFull = [IO.Path]::GetFullPath($Parent).TrimEnd([IO.Path]::DirectorySeparatorChar)
    $childFull = [IO.Path]::GetFullPath($Child)
    if (-not $childFull.StartsWith($parentFull + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) {
        throw "目录不在预期范围内：$childFull"
    }
    if ([IO.Path]::GetFileName($childFull) -ne $ExpectedLeaf) {
        throw "目录名称不符合预期：$childFull"
    }
}

function New-SigningPassword {
    $bytes = New-Object byte[] 32
    $generator = [Security.Cryptography.RandomNumberGenerator]::Create()
    try {
        $generator.GetBytes($bytes)
    } finally {
        $generator.Dispose()
    }
    return [Convert]::ToBase64String($bytes).TrimEnd('=').Replace('+', 'A').Replace('/', 'B')
}

function Read-SigningProperties {
    param([Parameter(Mandatory = $true)][string]$Path)

    $properties = @{}
    foreach ($line in Get-Content -LiteralPath $Path -Encoding UTF8) {
        $trimmed = $line.Trim()
        if (-not $trimmed -or $trimmed.StartsWith('#')) { continue }
        $separator = $trimmed.IndexOf('=')
        if ($separator -le 0) { continue }
        $properties[$trimmed.Substring(0, $separator).Trim()] = $trimmed.Substring($separator + 1).Trim()
    }
    return $properties
}

function Copy-RequiredFile {
    param(
        [Parameter(Mandatory = $true)][string]$Source,
        [Parameter(Mandatory = $true)][string]$Destination
    )
    if (-not (Test-Path -LiteralPath $Source -PathType Leaf)) {
        throw "缺少构建资源：$Source"
    }
    Copy-Item -LiteralPath $Source -Destination $Destination -Force
}

$ProjectRoot = Split-Path -Parent $PSScriptRoot
$WebRoot = Split-Path -Parent $ProjectRoot
$WorkspaceRoot = Split-Path -Parent $WebRoot
$EditionSourceDirectory = if ($Edition -eq 'legacy') { $ProjectRoot } else { Join-Path $ProjectRoot "app-$Edition" }
$AndroidPackage = if ($Edition -eq 'student') { 'com.physicsstudio.student' } elseif ($Edition -eq 'teacher') { 'com.physicsstudio.teacher' } else { 'com.physicsstudio.studyroom' }
$AndroidIndexName = if ($Edition -eq 'student') { 'student-index.html' } elseif ($Edition -eq 'teacher') { 'teacher-index.html' } else { 'index.html' }
$EditionDisplayName = if ($Edition -eq 'student') { '费曼物理学生端' } elseif ($Edition -eq 'teacher') { '费曼物理教师端' } else { '费曼物理' }
if (-not (Test-Path -LiteralPath (Join-Path $EditionSourceDirectory 'AndroidManifest.xml'))) {
    throw "缺少 Android $Edition application module：$EditionSourceDirectory"
}
$VersionSourcePath = Join-Path $WebRoot 'version.json'
if (-not (Test-Path -LiteralPath $VersionSourcePath)) { throw "缺少统一版本源：$VersionSourcePath" }
$VersionSource = Get-Content -LiteralPath $VersionSourcePath -Raw -Encoding UTF8 | ConvertFrom-Json
$CanonicalVersion = [string]$VersionSource.appVersion
$VersionMatch = [Text.RegularExpressions.Regex]::Match($CanonicalVersion, '^(\d+)\.(\d+)\.(\d+)$')
if ([string]::IsNullOrWhiteSpace($CanonicalVersion) -or -not $VersionMatch.Success) {
    throw "version.json 的 appVersion 无效。"
}
$CanonicalVersionCode = [int]$VersionMatch.Groups[1].Value * 10000 + [int]$VersionMatch.Groups[2].Value * 100 + [int]$VersionMatch.Groups[3].Value
if ($VersionName -and $VersionName -ne $CanonicalVersion) { throw "VersionName 必须与 version.json 一致：$CanonicalVersion" }
if ($VersionCode -gt 0 -and $VersionCode -ne $CanonicalVersionCode) { throw "VersionCode 必须由 version.json 生成：$CanonicalVersionCode" }
$VersionName = $CanonicalVersion
$VersionCode = $CanonicalVersionCode
if ([string]::IsNullOrWhiteSpace($ToolchainRoot)) {
    $ToolchainRoot = Join-Path $WorkspaceRoot '.android-build-tools'
}
$ToolchainRoot = [IO.Path]::GetFullPath($ToolchainRoot)

$MappedToolchainDrive = $null
$BuildDirectory = $null
$BuildSucceeded = $false
$Subst = Join-Path $env:SystemRoot 'System32\subst.exe'
if ($ToolchainRoot -match '[^\u0000-\u007F]') {
    $usedDriveNames = @(Get-PSDrive -PSProvider FileSystem | Select-Object -ExpandProperty Name)
    $driveName = @('Z', 'Y', 'X', 'W', 'V', 'U', 'T') |
        Where-Object { $usedDriveNames -notcontains $_ } |
        Select-Object -First 1
    if (-not $driveName) { throw '没有可用于 Android 构建的临时盘符。' }
    $MappedToolchainDrive = $driveName + ':'
    & $Subst $MappedToolchainDrive $ToolchainRoot
    if ($LASTEXITCODE -ne 0) { throw '无法为 Android 工具目录创建临时盘符。' }
    $ToolchainRoot = $MappedToolchainDrive + '\'
}

try {
$JdkHome = Get-ChildItem -LiteralPath (Join-Path $ToolchainRoot 'jdk') -Directory -ErrorAction SilentlyContinue |
    Where-Object { Test-Path -LiteralPath (Join-Path $_.FullName 'bin\javac.exe') } |
    Select-Object -First 1 -ExpandProperty FullName
if (-not $JdkHome) { throw "未找到 JDK：$ToolchainRoot\jdk" }

$SdkRoot = Join-Path $ToolchainRoot 'sdk'
$BuildTools = Join-Path $SdkRoot 'build-tools\36.0.0'
$AndroidJar = Join-Path $SdkRoot 'platforms\android-36\android.jar'
$Aapt = Join-Path $BuildTools 'aapt.exe'
$Aapt2 = Join-Path $BuildTools 'aapt2.exe'
$D8 = Join-Path $BuildTools 'd8.bat'
$ZipAlign = Join-Path $BuildTools 'zipalign.exe'
$ApkSigner = Join-Path $BuildTools 'apksigner.bat'
$Javac = Join-Path $JdkHome 'bin\javac.exe'
$Jar = Join-Path $JdkHome 'bin\jar.exe'
$KeyTool = Join-Path $JdkHome 'bin\keytool.exe'

foreach ($required in @($AndroidJar, $Aapt, $Aapt2, $D8, $ZipAlign, $ApkSigner, $Javac, $Jar, $KeyTool)) {
    if (-not (Test-Path -LiteralPath $required)) { throw "缺少构建组件：$required" }
}

$env:JAVA_HOME = $JdkHome
$env:ANDROID_SDK_ROOT = $SdkRoot
$env:Path = (Join-Path $JdkHome 'bin') + ';' + $env:Path

$BuildParent = [IO.Path]::GetTempPath().TrimEnd([IO.Path]::DirectorySeparatorChar)
$BuildLeaf = "PhysicsStudioAndroidBuild-$Edition"
$BuildDirectory = Join-Path $BuildParent $BuildLeaf
Assert-SafeChildPath -Parent $BuildParent -Child $BuildDirectory -ExpectedLeaf $BuildLeaf
if (Test-Path -LiteralPath $BuildDirectory) {
    Remove-Item -LiteralPath $BuildDirectory -Recurse -Force
}

$StagedProject = Join-Path $BuildDirectory 'project'
$AssetsDirectory = Join-Path $BuildDirectory 'assets'
$ClassesDirectory = Join-Path $BuildDirectory 'classes'
$DexDirectory = Join-Path $BuildDirectory 'dex'
$GeneratedDirectory = Join-Path $BuildDirectory 'generated'
New-Item -ItemType Directory -Force -Path $StagedProject, $AssetsDirectory, $ClassesDirectory, $DexDirectory, $GeneratedDirectory | Out-Null

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
        throw '正式 Android 发布的 ClassroomServerUrl 必须使用 HTTPS。'
    }
}
$classroomUrlJson = ConvertTo-Json -InputObject $ClassroomServerUrl -Compress
$allowInsecureLanJson = if ($AllowInsecureClassroomLan) { 'true' } else { 'false' }
$editionJson = ConvertTo-Json -InputObject $Edition -Compress
$classroomConfigSource = "globalThis.PHYSICS_STUDIO_CLASSROOM_URL = $classroomUrlJson;`nglobalThis.PHYSICS_STUDIO_ALLOW_INSECURE_LAN = $allowInsecureLanJson;`nglobalThis.PHYSICS_STUDIO_APP_EDITION = $editionJson;`n"
[IO.File]::WriteAllText(
    (Join-Path $AssetsDirectory 'classroom-config.js'),
    $classroomConfigSource,
    (New-Object Text.UTF8Encoding($false))
)

$versionConfigJson = ConvertTo-Json -InputObject $VersionSource -Compress
$versionConfigSource = "globalThis.PHYSICS_STUDIO_VERSION = Object.freeze($versionConfigJson);`n"
[IO.File]::WriteAllText(
    (Join-Path $AssetsDirectory 'version-config.js'),
    $versionConfigSource,
    (New-Object Text.UTF8Encoding($false))
)

Copy-Item -LiteralPath (Join-Path $EditionSourceDirectory 'AndroidManifest.xml') -Destination $StagedProject -Force
Copy-Item -LiteralPath (Join-Path $ProjectRoot 'res') -Destination (Join-Path $StagedProject 'res') -Recurse -Force
if ($Edition -ne 'legacy') {
    Copy-RequiredFile -Source (Join-Path $EditionSourceDirectory 'res\values\strings.xml') -Destination (Join-Path $StagedProject 'res\values\strings.xml')
}
Copy-Item -LiteralPath (Join-Path $ProjectRoot 'src') -Destination (Join-Path $StagedProject 'src') -Recurse -Force
$AndroidIndex = [IO.File]::ReadAllText((Join-Path $WebRoot $AndroidIndexName), [Text.Encoding]::UTF8)
$AndroidIndex = $AndroidIndex.Replace('href="assets/favicon.svg"', 'href="favicon.svg"')
$AndroidIndex = $AndroidIndex.Replace('src="vendor/jsQR.js"', 'src="jsQR.js"')
$AndroidIndex = $AndroidIndex.Replace('src="vendor/fflate.js"', 'src="fflate.js"')
[IO.File]::WriteAllText(
    (Join-Path $AssetsDirectory 'index.html'),
    $AndroidIndex,
    (New-Object Text.UTF8Encoding($false))
)
if ($Edition -eq 'legacy') {
Copy-Item -LiteralPath (Join-Path $WebRoot 'styles.css') -Destination $AssetsDirectory -Force
Copy-Item -LiteralPath (Join-Path $WebRoot 'learning-lab.css') -Destination $AssetsDirectory -Force
Copy-Item -LiteralPath (Join-Path $WebRoot 'experience-shell.css') -Destination $AssetsDirectory -Force
Copy-Item -LiteralPath (Join-Path $WebRoot 'activation.css') -Destination $AssetsDirectory -Force
Copy-Item -LiteralPath (Join-Path $WebRoot 'activation-public-key.js') -Destination $AssetsDirectory -Force
Copy-Item -LiteralPath (Join-Path $WebRoot 'activation.js') -Destination $AssetsDirectory -Force
Copy-Item -LiteralPath (Join-Path $WebRoot 'curriculum-taxonomy.js') -Destination $AssetsDirectory -Force
Copy-Item -LiteralPath (Join-Path $WebRoot 'curriculum-bank.js') -Destination $AssetsDirectory -Force
Copy-Item -LiteralPath (Join-Path $WebRoot 'exam-question-index.js') -Destination $AssetsDirectory -Force
Copy-Item -LiteralPath (Join-Path $WebRoot 'mock-exam-bank.js') -Destination $AssetsDirectory -Force
Copy-Item -LiteralPath (Join-Path $WebRoot 'original-practice-bank.js') -Destination $AssetsDirectory -Force
Copy-Item -LiteralPath (Join-Path $WebRoot 'targeted-practice-bank.js') -Destination $AssetsDirectory -Force
Copy-Item -LiteralPath (Join-Path $WebRoot 'vendor\jsQR.js') -Destination (Join-Path $AssetsDirectory 'jsQR.js') -Force
Copy-Item -LiteralPath (Join-Path $WebRoot 'vendor\jsQR-LICENSE.txt') -Destination (Join-Path $AssetsDirectory 'jsQR-LICENSE.txt') -Force
Copy-Item -LiteralPath (Join-Path $WebRoot 'vendor\fflate.js') -Destination (Join-Path $AssetsDirectory 'fflate.js') -Force
Copy-Item -LiteralPath (Join-Path $WebRoot 'vendor\fflate-LICENSE.txt') -Destination (Join-Path $AssetsDirectory 'fflate-LICENSE.txt') -Force
Copy-Item -LiteralPath (Join-Path $WebRoot 'security.js') -Destination $AssetsDirectory -Force
Copy-Item -LiteralPath (Join-Path $WebRoot 'backup.js') -Destination $AssetsDirectory -Force
Copy-Item -LiteralPath (Join-Path $WebRoot 'backup-validator.js') -Destination $AssetsDirectory -Force
Copy-Item -LiteralPath (Join-Path $WebRoot 'ai-tutor.js') -Destination $AssetsDirectory -Force
Copy-Item -LiteralPath (Join-Path $WebRoot 'document-import.js') -Destination $AssetsDirectory -Force
Copy-Item -LiteralPath (Join-Path $WebRoot 'content-catalog.js') -Destination $AssetsDirectory -Force
Copy-Item -LiteralPath (Join-Path $WebRoot 'classroom-client.js') -Destination $AssetsDirectory -Force
Copy-Item -LiteralPath (Join-Path $WebRoot 'question-answer-service.js') -Destination $AssetsDirectory -Force
Copy-Item -LiteralPath (Join-Path $WebRoot 'storage-repository.js') -Destination $AssetsDirectory -Force
Copy-Item -LiteralPath (Join-Path $WebRoot 'learning-engine.js') -Destination $AssetsDirectory -Force
Copy-Item -LiteralPath (Join-Path $WebRoot 'physics-visuals.js') -Destination $AssetsDirectory -Force
Copy-Item -LiteralPath (Join-Path $WebRoot 'variant-generator.js') -Destination $AssetsDirectory -Force
Copy-Item -LiteralPath (Join-Path $WebRoot 'teacher-mode-lock.js') -Destination $AssetsDirectory -Force
Copy-Item -LiteralPath (Join-Path $WebRoot 'app.js') -Destination $AssetsDirectory -Force
Copy-Item -LiteralPath (Join-Path $WebRoot 'learning-lab.js') -Destination $AssetsDirectory -Force
Copy-Item -LiteralPath (Join-Path $WebRoot 'experience-shell.js') -Destination $AssetsDirectory -Force
} else {
    $SharedWebAssets = @(
        'activation.css',
        'activation-public-key.js',
        'activation.js',
        'curriculum-taxonomy.js',
        'curriculum-bank.js',
        'mock-exam-bank.js',
        'original-practice-bank.js',
        'targeted-practice-bank.js',
        'security.js',
        'backup.js',
        'backup-validator.js',
        'ai-tutor.js',
        'classroom-client.js',
        'question-answer-service.js',
        'storage-repository.js',
        'learning-engine.js',
        'physics-visuals.js',
        'variant-generator.js',
        'dual-app-data.js',
        'dual-app-common.js',
        'dual-app.css'
    )
    foreach ($asset in $SharedWebAssets) {
        Copy-RequiredFile -Source (Join-Path $WebRoot $asset) -Destination (Join-Path $AssetsDirectory $asset)
    }
    Copy-RequiredFile -Source (Join-Path $WebRoot "${Edition}-app.js") -Destination (Join-Path $AssetsDirectory "${Edition}-app.js")
    Copy-RequiredFile -Source (Join-Path $WebRoot 'vendor\fflate.js') -Destination (Join-Path $AssetsDirectory 'fflate.js')
    Copy-RequiredFile -Source (Join-Path $WebRoot 'vendor\fflate-LICENSE.txt') -Destination (Join-Path $AssetsDirectory 'fflate-LICENSE.txt')
    if ($Edition -eq 'student') {
        Copy-RequiredFile -Source (Join-Path $WebRoot 'vendor\jsQR.js') -Destination (Join-Path $AssetsDirectory 'jsQR.js')
        Copy-RequiredFile -Source (Join-Path $WebRoot 'vendor\jsQR-LICENSE.txt') -Destination (Join-Path $AssetsDirectory 'jsQR-LICENSE.txt')
    }
}
Copy-Item -LiteralPath (Join-Path $WebRoot 'assets\favicon.svg') -Destination (Join-Path $AssetsDirectory 'favicon.svg') -Force

$CompiledResources = Join-Path $BuildDirectory 'compiled-resources.zip'
$UnsignedApk = Join-Path $BuildDirectory 'unsigned.apk'
$AlignedApk = Join-Path $BuildDirectory 'aligned.apk'
$SignedApk = Join-Path $BuildDirectory 'signed.apk'

Invoke-Checked -FilePath $Aapt2 -ArgumentList @(
    'compile', '--dir', (Join-Path $StagedProject 'res'), '-o', $CompiledResources
)
Invoke-Checked -FilePath $Aapt2 -ArgumentList @(
    'link',
    '-o', $UnsignedApk,
    '-I', $AndroidJar,
    '--manifest', (Join-Path $StagedProject 'AndroidManifest.xml'),
    '--min-sdk-version', '23',
    '--target-sdk-version', '36',
    '--version-code', $VersionCode.ToString(),
    '--version-name', $VersionName,
    '--auto-add-overlay',
    '-A', $AssetsDirectory,
    $CompiledResources
)

$JavaFiles = @(Get-ChildItem -LiteralPath (Join-Path $StagedProject 'src') -Filter '*.java' -File -Recurse |
    Select-Object -ExpandProperty FullName)
if ($JavaFiles.Count -eq 0) { throw '没有找到 Android Java 源文件。' }
$JavacArguments = @(
    '-encoding', 'UTF-8',
    '-source', '8',
    '-target', '8',
    '-bootclasspath', $AndroidJar,
    '-d', $ClassesDirectory
) + $JavaFiles
Invoke-Checked -FilePath $Javac -ArgumentList $JavacArguments

$ClassesJar = Join-Path $BuildDirectory 'classes.jar'
Invoke-Checked -FilePath $Jar -ArgumentList @('cf', $ClassesJar, '-C', $ClassesDirectory, '.')
Invoke-Checked -FilePath $D8 -ArgumentList @(
    '--lib', $AndroidJar,
    '--min-api', '23',
    '--output', $DexDirectory,
    $ClassesJar
)

Push-Location $DexDirectory
try {
    Invoke-Checked -FilePath $Aapt -ArgumentList @('add', '-f', $UnsignedApk, 'classes.dex')
} finally {
    Pop-Location
}
Invoke-Checked -FilePath $ZipAlign -ArgumentList @('-f', '-p', '4', $UnsignedApk, $AlignedApk)

$SigningDirectory = Join-Path $ProjectRoot 'signing'
$SigningPropertiesPath = Join-Path $SigningDirectory 'keystore.properties'
$KeystorePath = Join-Path $SigningDirectory 'physics-studio-release.jks'
$StagedSigningDirectory = Join-Path $BuildDirectory 'signing'
$StagedKeystorePath = Join-Path $StagedSigningDirectory 'physics-studio-release.jks'
New-Item -ItemType Directory -Force -Path $SigningDirectory | Out-Null
New-Item -ItemType Directory -Force -Path $StagedSigningDirectory | Out-Null
if (-not (Test-Path -LiteralPath $SigningPropertiesPath)) {
    $password = New-SigningPassword
    $propertiesText = "storePassword=$password`nkeyAlias=physics-studio`n"
    [IO.File]::WriteAllText(
        $SigningPropertiesPath,
        $propertiesText,
        (New-Object Text.UTF8Encoding($false))
    )
}
$SigningProperties = Read-SigningProperties -Path $SigningPropertiesPath
$StorePassword = $SigningProperties['storePassword']
$KeyAlias = $SigningProperties['keyAlias']
if (-not $StorePassword -or -not $KeyAlias) { throw 'Android 签名配置不完整。' }

if (Test-Path -LiteralPath $KeystorePath) {
    Copy-Item -LiteralPath $KeystorePath -Destination $StagedKeystorePath -Force
} else {
    Invoke-Checked -FilePath $KeyTool -ArgumentList @(
        '-genkeypair',
        '-noprompt',
        '-keystore', $StagedKeystorePath,
        '-storetype', 'PKCS12',
        '-alias', $KeyAlias,
        '-keyalg', 'RSA',
        '-keysize', '3072',
        '-validity', '10000',
        '-dname', 'CN=Physics Studio Android, OU=Learning App, O=Physics Studio, L=Changsha, ST=Hunan, C=CN',
        '-storepass', $StorePassword,
        '-keypass', $StorePassword
    )
    Copy-Item -LiteralPath $StagedKeystorePath -Destination $KeystorePath -Force
}

$env:PHYSICS_STUDIO_SIGNING_PASSWORD = $StorePassword
try {
    Invoke-Checked -FilePath $ApkSigner -ArgumentList @(
        'sign',
        '--ks', $StagedKeystorePath,
        '--ks-key-alias', $KeyAlias,
        '--ks-pass', 'env:PHYSICS_STUDIO_SIGNING_PASSWORD',
        '--key-pass', 'env:PHYSICS_STUDIO_SIGNING_PASSWORD',
        '--v4-signing-enabled', 'false',
        '--out', $SignedApk,
        $AlignedApk
    )
} finally {
    Remove-Item Env:PHYSICS_STUDIO_SIGNING_PASSWORD -ErrorAction SilentlyContinue
}

Invoke-Checked -FilePath $ZipAlign -ArgumentList @('-c', '-p', '4', $SignedApk)

$ReleaseDirectory = Join-Path $WebRoot '发布\Android'
New-Item -ItemType Directory -Force -Path $ReleaseDirectory | Out-Null
$ArtifactPrefix = if ($Edition -eq 'legacy') { '费曼物理' } else { $EditionDisplayName }
$ApkName = if ($Edition -eq 'legacy') { "费曼物理-Android-v$VersionName.apk" } else { "$EditionDisplayName-Android-v$VersionName.apk" }
$ReleaseApk = Join-Path $ReleaseDirectory $ApkName
Copy-Item -LiteralPath $SignedApk -Destination $ReleaseApk -Force
Copy-Item -LiteralPath (Join-Path $ProjectRoot '安装说明.txt') -Destination (Join-Path $ReleaseDirectory '安装说明.txt') -Force

$SignatureOutput = & $ApkSigner 'verify' '--verbose' '--print-certs' $SignedApk 2>&1
if ($LASTEXITCODE -ne 0) { throw '发布 APK 的签名验证失败。' }
$BadgingOutput = & $Aapt 'dump' 'badging' $SignedApk 2>&1
if ($LASTEXITCODE -ne 0) { throw '无法读取发布 APK 信息。' }

[IO.File]::WriteAllText(
    (Join-Path $ReleaseDirectory "$ArtifactPrefix-签名验证.txt"),
    (($SignatureOutput | Out-String).Trim() + "`n"),
    (New-Object Text.UTF8Encoding($false))
)
[IO.File]::WriteAllText(
    (Join-Path $ReleaseDirectory "$ArtifactPrefix-APK信息.txt"),
    (($BadgingOutput | Out-String).Trim() + "`n"),
    (New-Object Text.UTF8Encoding($false))
)

$ApkHash = (Get-FileHash -LiteralPath $ReleaseApk -Algorithm SHA256).Hash
$ApkHashPath = Join-Path $ReleaseDirectory "$ArtifactPrefix-SHA256.txt"
[IO.File]::WriteAllText(
    $ApkHashPath,
    "$ApkHash *$ApkName`n",
    (New-Object Text.UTF8Encoding($false))
)

$ZipName = "$ArtifactPrefix-Android-v$VersionName.zip"
$ReleaseZip = Join-Path $ReleaseDirectory $ZipName
Compress-Archive -LiteralPath @(
    $ReleaseApk,
    (Join-Path $ReleaseDirectory '安装说明.txt'),
    $ApkHashPath,
    (Join-Path $ReleaseDirectory "$ArtifactPrefix-签名验证.txt"),
    (Join-Path $ReleaseDirectory "$ArtifactPrefix-APK信息.txt")
) -DestinationPath $ReleaseZip -CompressionLevel Optimal -Force
$ZipHash = (Get-FileHash -LiteralPath $ReleaseZip -Algorithm SHA256).Hash
[IO.File]::WriteAllText(
    (Join-Path $ReleaseDirectory "$ZipName.sha256.txt"),
    "$ZipHash *$ZipName`n",
    (New-Object Text.UTF8Encoding($false))
)

$BuildSucceeded = $true
[pscustomobject]@{
    Apk = $ReleaseApk
    ApkSize = (Get-Item -LiteralPath $ReleaseApk).Length
    ApkSHA256 = $ApkHash
    Package = $AndroidPackage
    Edition = $Edition
    VersionName = $VersionName
    VersionCode = $VersionCode
    MinimumAndroid = '6.0 (API 23)'
    ReleaseZip = $ReleaseZip
    ZipSHA256 = $ZipHash
    SigningDirectory = $SigningDirectory
} | Format-List
} finally {
    if ($BuildSucceeded -and $BuildDirectory -and (Test-Path -LiteralPath $BuildDirectory)) {
        Assert-SafeChildPath -Parent $BuildParent -Child $BuildDirectory -ExpectedLeaf $BuildLeaf
        Remove-Item -LiteralPath $BuildDirectory -Recurse -Force
    }
    if ($MappedToolchainDrive) {
        & $Subst $MappedToolchainDrive '/D' | Out-Null
    }
}
