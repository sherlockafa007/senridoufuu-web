@echo off
title 文件对比分析工具
echo.
echo  正在启动文件分析工具...
echo  启动后浏览器会自动打开，关闭此窗口即停止服务。
echo.
node "%~dp0server.js"
pause
