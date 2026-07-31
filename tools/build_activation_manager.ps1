param(
    [string]$OutputDirectory,
    [string]$CertificateThumbprint = '',
    [string]$TimestampUrl = 'http://timestamp.digicert.com',
    [string]$SignToolPath = '',
    [switch]$RequireSignature
)

$ErrorActionPreference = 'Stop'
$projectDirectory = Split-Path -Parent $PSScriptRoot
if (-not $OutputDirectory) {
    $OutputDirectory = Join-Path $projectDirectory '发布\仅限管理员'
}
$compiler = @(
    'C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe',
    'C:\Windows\Microsoft.NET\Framework\v4.0.30319\csc.exe'
) | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
if (-not $compiler) {
    throw '未找到 Windows .NET Framework C# 编译器。'
}

New-Item -ItemType Directory -Force -Path $OutputDirectory | Out-Null
$outputPath = Join-Path $OutputDirectory '物理研习室-激活码管理器-v1.0.0.exe'
$iconPath = Join-Path $projectDirectory 'assets\app.ico'

& $compiler @(
    '/nologo',
    '/target:winexe',
    '/optimize+',
    '/codepage:65001',
    '/reference:System.Windows.Forms.dll',
    '/reference:System.Drawing.dll',
    '/reference:System.Security.dll',
    "/win32icon:$iconPath",
    "/out:$outputPath",
    (Join-Path $projectDirectory 'ActivationManager.cs')
)
if ($LASTEXITCODE -ne 0) {
    throw "激活码管理器编译失败，退出码：$LASTEXITCODE"
}

if ($CertificateThumbprint) {
    if (-not $SignToolPath) {
        $kitsRoot = "${env:ProgramFiles(x86)}\Windows Kits\10\bin"
        if (Test-Path -LiteralPath $kitsRoot) {
            $SignToolPath = Get-ChildItem -LiteralPath $kitsRoot -Recurse -Filter 'signtool.exe' -File -ErrorAction SilentlyContinue |
                Where-Object { $_.FullName -match '\\x64\\signtool\.exe$' } |
                Sort-Object FullName -Descending |
                Select-Object -First 1 -ExpandProperty FullName
        }
    }
    if (-not $SignToolPath) { throw '未找到 Windows SDK SignTool，无法完成代码签名。' }
    $thumbprint = ($CertificateThumbprint -replace '\s', '').ToUpperInvariant()
    & $SignToolPath sign /sha1 $thumbprint /s My /fd SHA256 /td SHA256 /tr $TimestampUrl /d '物理研习室激活码管理器' $outputPath
    if ($LASTEXITCODE -ne 0) { throw '激活码管理器代码签名失败。' }
} elseif ($RequireSignature) {
    throw '已要求代码签名，但未提供 CertificateThumbprint。'
}

$hash = Get-FileHash -Algorithm SHA256 -LiteralPath $outputPath
$hashPath = Join-Path $OutputDirectory 'SHA256-激活码管理器.txt'
[IO.File]::WriteAllText(
    $hashPath,
    "$($hash.Hash) *$([IO.Path]::GetFileName($outputPath))`n",
    (New-Object Text.UTF8Encoding($false))
)

$guide = @'
物理研习室激活码管理器（仅限软件所有者）

1. 该程序不会把私钥打包到 EXE 中。可信私钥保存在初始化它的 Windows 当前用户 CNG 密钥库，并设置为不可导出。
2. 首次发布时仅执行一次：
   物理研习室-激活码管理器-v1.0.0.exe --initialize activation-public-key.js
   然后必须用该 activation-public-key.js 重新构建 Windows 与 Android 用户端。
3. 日常签发时打开管理器，把用户端显示的设备申请码逐行粘贴，批量生成激活码。
4. 每个激活码只对签发时指定的设备摘要有效，不能用于第二台设备。
5. 不要向用户分发本目录、管理器或所有者 Windows 账户。请离线备份操作系统和账户恢复材料；不可导出私钥遗失后，只能发布使用新公钥的新版本。
6. 纯离线签名不能在卸载、清除数据后全局记录“已经兑换”。它实现的是一机一码、跨设备不可复用；如需服务器端一次性核销，必须部署联网激活服务。
'@
[IO.File]::WriteAllText(
    (Join-Path $OutputDirectory '管理员使用说明.txt'),
    $guide,
    (New-Object Text.UTF8Encoding($true))
)

Get-Item -LiteralPath $outputPath | Select-Object FullName, Length, LastWriteTime
Get-Item -LiteralPath $hashPath | Select-Object FullName, Length, LastWriteTime
