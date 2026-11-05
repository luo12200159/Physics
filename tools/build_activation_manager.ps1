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
$outputPath = Join-Path $OutputDirectory '费曼物理-激活码管理器-v1.2.0.exe'
$consolePath = Join-Path $OutputDirectory '费曼物理-激活码管理器-命令行-v1.2.0.exe'
$iconPath = Join-Path $projectDirectory 'assets\app.ico'
$commonArguments = @(
    '/nologo',
    '/optimize+',
    '/codepage:65001',
    '/reference:System.Windows.Forms.dll',
    '/reference:System.Drawing.dll',
    '/reference:System.Security.dll',
    '/reference:System.Core.dll',
    '/reference:System.Runtime.Serialization.dll',
    "/win32manifest:$(Join-Path $projectDirectory 'app.manifest')",
    "/win32icon:$iconPath",
    (Join-Path $projectDirectory 'ActivationManager.cs')
)

& $compiler @('/target:winexe', "/out:$outputPath") @commonArguments
if ($LASTEXITCODE -ne 0) {
    throw "激活码管理器 GUI 编译失败，退出码：$LASTEXITCODE"
}
& $compiler @('/target:exe', "/out:$consolePath") @commonArguments
if ($LASTEXITCODE -ne 0) {
    throw "激活码管理器 CLI 编译失败，退出码：$LASTEXITCODE"
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
    foreach ($path in @($outputPath, $consolePath)) {
        & $SignToolPath sign /sha1 $thumbprint /s My /fd SHA256 /td SHA256 /tr $TimestampUrl /d '费曼物理激活码管理器' $path
        if ($LASTEXITCODE -ne 0) { throw "激活码管理器代码签名失败：$path" }
    }
} elseif ($RequireSignature) {
    throw '已要求代码签名，但未提供 CertificateThumbprint。'
}

$hashPath = Join-Path $OutputDirectory 'SHA256-激活码管理器.txt'
[string[]]$hashLines = @($outputPath, $consolePath) | ForEach-Object {
    $hash = Get-FileHash -Algorithm SHA256 -LiteralPath $_
    "$($hash.Hash) *$([IO.Path]::GetFileName($_))"
}
[IO.File]::WriteAllText(
    $hashPath,
    ($hashLines -join "`n") + "`n",
    (New-Object Text.UTF8Encoding($false))
)

$guide = @'
费曼物理激活码管理器 v1.2.0（仅限软件所有者）

1. GUI 登录密码只用于阻止误打开；签发权由独立加密 PFX 及其强密码保护。EXE 不含签发私钥。
2. 初次建立便携签发体系时执行 --initialize-portable <activation-public-key.js> <backup.pfx>。归档创建时弹出强密码设置框。PFX 须在仓库外保存，与密码分开备份。
3. 必须用新导出的 activation-public-key.js 重新构建 Windows、Android 学生端和教师端，且三端公钥指纹一致，才可向用户发便携码。
4. 换电脑时复制 GUI/CLI EXE 与独立 PFX；GUI 登录后选择 PFX，签发时输入归档密码。无需恢复原 Windows 用户的命名 CNG 密钥。CLI 支持 --issue-portable 和 --issue-portable-batch。
5. 旧版设备绑定 PSA1 仍可由原设备验证。便携 PSA1 不带设备字段，可跨设备使用，纯离线无法限制复制次数或实现全局一次性核销。
6. 签发台账位于当前用户的 LocalAppData\\PhysicsStudio\\ActivationManager\\audit-log.jsonl。PFX、归档密码、管理员 EXE 与台账不得上传公开仓库。
'@
[IO.File]::WriteAllText(
    (Join-Path $OutputDirectory '管理员使用说明.txt'),
    $guide,
    (New-Object Text.UTF8Encoding($true))
)

Get-Item -LiteralPath $outputPath | Select-Object FullName, Length, LastWriteTime
Get-Item -LiteralPath $consolePath | Select-Object FullName, Length, LastWriteTime
Get-Item -LiteralPath $hashPath | Select-Object FullName, Length, LastWriteTime
