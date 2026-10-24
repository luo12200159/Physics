param(
    [string]$ToolchainRoot = '',
    [string]$ClassroomServerUrl = $env:PHYSICS_STUDIO_CLASSROOM_URL,
    [switch]$AllowInsecureClassroomLan
)

$ErrorActionPreference = 'Stop'
$Builder = Join-Path $PSScriptRoot 'build_android.ps1'
if (-not (Test-Path -LiteralPath $Builder -PathType Leaf)) {
    throw "Android build script is missing: $Builder"
}

$arguments = @{}
if ($ToolchainRoot) { $arguments.ToolchainRoot = $ToolchainRoot }
if ($ClassroomServerUrl) { $arguments.ClassroomServerUrl = $ClassroomServerUrl }
if ($AllowInsecureClassroomLan) { $arguments.AllowInsecureClassroomLan = $true }

& $Builder @arguments -Edition student
if ($LASTEXITCODE -ne 0) { throw 'Student Android build failed.' }
& $Builder @arguments -Edition teacher
if ($LASTEXITCODE -ne 0) { throw 'Teacher Android build failed.' }

Write-Host 'Student and teacher Android builds completed.'
