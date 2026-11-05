$ErrorActionPreference = 'Stop'
$projectDirectory = Split-Path -Parent $PSScriptRoot
$compiler = @(
    'C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe',
    'C:\Windows\Microsoft.NET\Framework\v4.0.30319\csc.exe'
) | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
if (-not $compiler) { throw 'Windows .NET Framework C# compiler not found.' }

$qaDirectory = Join-Path $projectDirectory 'qa-output'
New-Item -ItemType Directory -Force -Path $qaDirectory | Out-Null
$outputPath = Join-Path $qaDirectory 'qa_activation_manager.exe'
& $compiler @(
    '/nologo',
    '/target:exe',
    '/codepage:65001',
    '/reference:System.Windows.Forms.dll',
    '/reference:System.Drawing.dll',
    '/reference:System.Security.dll',
    '/reference:System.Core.dll',
    '/reference:System.Runtime.Serialization.dll',
    '/main:ActivationManagerQa',
    "/out:$outputPath",
    (Join-Path $projectDirectory 'ActivationManager.cs'),
    (Join-Path $PSScriptRoot 'qa_activation_manager.cs')
)
if ($LASTEXITCODE -ne 0) { throw "Activation manager QA compilation failed: $LASTEXITCODE" }
& $outputPath
if ($LASTEXITCODE -ne 0) { throw "Activation manager QA failed: $LASTEXITCODE" }
