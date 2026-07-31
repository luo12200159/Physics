@echo off
chcp 65001 >nul
if exist "%~dp0物理研习室.exe" (
  start "" "%~dp0物理研习室.exe"
) else (
  start "" "%~dp0index.html"
)
