@echo off
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\server.ps1" start
if errorlevel 1 (
  echo.
  echo Serverul nu a pornit. Consultati mesajul de mai sus si SERVER.md.
  pause
  exit /b 1
)
start "" "http://127.0.0.1:3000/"
