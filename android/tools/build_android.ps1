param(
    [string]$ToolchainRoot = '',
    [string]$VersionName = '2.6.0',
    [int]$VersionCode = 20600
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

$ProjectRoot = Split-Path -Parent $PSScriptRoot
$WebRoot = Split-Path -Parent $ProjectRoot
$WorkspaceRoot = Split-Path -Parent $WebRoot
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
$BuildDirectory = Join-Path $BuildParent 'PhysicsStudioAndroidBuild'
Assert-SafeChildPath -Parent $BuildParent -Child $BuildDirectory -ExpectedLeaf 'PhysicsStudioAndroidBuild'
if (Test-Path -LiteralPath $BuildDirectory) {
    Remove-Item -LiteralPath $BuildDirectory -Recurse -Force
}

$StagedProject = Join-Path $BuildDirectory 'project'
$AssetsDirectory = Join-Path $BuildDirectory 'assets'
$ClassesDirectory = Join-Path $BuildDirectory 'classes'
$DexDirectory = Join-Path $BuildDirectory 'dex'
$GeneratedDirectory = Join-Path $BuildDirectory 'generated'
New-Item -ItemType Directory -Force -Path $StagedProject, $AssetsDirectory, $ClassesDirectory, $DexDirectory, $GeneratedDirectory | Out-Null

Copy-Item -LiteralPath (Join-Path $ProjectRoot 'AndroidManifest.xml') -Destination $StagedProject -Force
Copy-Item -LiteralPath (Join-Path $ProjectRoot 'res') -Destination (Join-Path $StagedProject 'res') -Recurse -Force
Copy-Item -LiteralPath (Join-Path $ProjectRoot 'src') -Destination (Join-Path $StagedProject 'src') -Recurse -Force
$AndroidIndex = [IO.File]::ReadAllText((Join-Path $WebRoot 'index.html'), [Text.Encoding]::UTF8)
$AndroidIndex = $AndroidIndex.Replace('href="assets/favicon.svg"', 'href="favicon.svg"')
$AndroidIndex = $AndroidIndex.Replace('src="vendor/jsQR.js"', 'src="jsQR.js"')
$AndroidIndex = $AndroidIndex.Replace('src="vendor/fflate.js"', 'src="fflate.js"')
[IO.File]::WriteAllText(
    (Join-Path $AssetsDirectory 'index.html'),
    $AndroidIndex,
    (New-Object Text.UTF8Encoding($false))
)
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
Copy-Item -LiteralPath (Join-Path $WebRoot 'learning-engine.js') -Destination $AssetsDirectory -Force
Copy-Item -LiteralPath (Join-Path $WebRoot 'app.js') -Destination $AssetsDirectory -Force
Copy-Item -LiteralPath (Join-Path $WebRoot 'learning-lab.js') -Destination $AssetsDirectory -Force
Copy-Item -LiteralPath (Join-Path $WebRoot 'experience-shell.js') -Destination $AssetsDirectory -Force
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
    Invoke-Checked -FilePath $Aapt -ArgumentList @('add', $UnsignedApk, 'classes.dex')
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
$ApkName = "物理研习室-Android-v$VersionName.apk"
$ReleaseApk = Join-Path $ReleaseDirectory $ApkName
Copy-Item -LiteralPath $SignedApk -Destination $ReleaseApk -Force
Copy-Item -LiteralPath (Join-Path $ProjectRoot '安装说明.txt') -Destination (Join-Path $ReleaseDirectory '安装说明.txt') -Force

$SignatureOutput = & $ApkSigner 'verify' '--verbose' '--print-certs' $SignedApk 2>&1
if ($LASTEXITCODE -ne 0) { throw '发布 APK 的签名验证失败。' }
$BadgingOutput = & $Aapt 'dump' 'badging' $SignedApk 2>&1
if ($LASTEXITCODE -ne 0) { throw '无法读取发布 APK 信息。' }

[IO.File]::WriteAllText(
    (Join-Path $ReleaseDirectory '签名验证.txt'),
    (($SignatureOutput | Out-String).Trim() + "`n"),
    (New-Object Text.UTF8Encoding($false))
)
[IO.File]::WriteAllText(
    (Join-Path $ReleaseDirectory 'APK信息.txt'),
    (($BadgingOutput | Out-String).Trim() + "`n"),
    (New-Object Text.UTF8Encoding($false))
)

$ApkHash = (Get-FileHash -LiteralPath $ReleaseApk -Algorithm SHA256).Hash
$ApkHashPath = Join-Path $ReleaseDirectory 'SHA256.txt'
[IO.File]::WriteAllText(
    $ApkHashPath,
    "$ApkHash *$ApkName`n",
    (New-Object Text.UTF8Encoding($false))
)

$ZipName = "物理研习室-Android-v$VersionName.zip"
$ReleaseZip = Join-Path $ReleaseDirectory $ZipName
Compress-Archive -LiteralPath @(
    $ReleaseApk,
    (Join-Path $ReleaseDirectory '安装说明.txt'),
    $ApkHashPath,
    (Join-Path $ReleaseDirectory '签名验证.txt'),
    (Join-Path $ReleaseDirectory 'APK信息.txt')
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
    Package = 'com.physicsstudio.studyroom'
    VersionName = $VersionName
    VersionCode = $VersionCode
    MinimumAndroid = '6.0 (API 23)'
    ReleaseZip = $ReleaseZip
    ZipSHA256 = $ZipHash
    SigningDirectory = $SigningDirectory
} | Format-List
} finally {
    if ($BuildSucceeded -and $BuildDirectory -and (Test-Path -LiteralPath $BuildDirectory)) {
        Assert-SafeChildPath -Parent $BuildParent -Child $BuildDirectory -ExpectedLeaf 'PhysicsStudioAndroidBuild'
        Remove-Item -LiteralPath $BuildDirectory -Recurse -Force
    }
    if ($MappedToolchainDrive) {
        & $Subst $MappedToolchainDrive '/D' | Out-Null
    }
}
