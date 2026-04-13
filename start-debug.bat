@echo off
chcp 65001 >nul
title AR人脸射击游戏 - USB调试启动器
echo ========================================
echo    AR人脸射击游戏 - USB调试启动器
echo ========================================
echo.

REM 检查PowerShell执行策略并运行脚本
powershell -ExecutionPolicy Bypass -File "%~dp0start-debug.ps1"

pause
