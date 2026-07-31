@echo off
chcp 65001 >nul
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0安装应用.ps1" -Launch
if errorlevel 1 (
  echo.
  echo 安装失败，请保留此窗口并检查上方提示。
  pause
)
