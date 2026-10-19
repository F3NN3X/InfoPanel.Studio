@echo off
rem Starts the InfoPanel Studio server on http://127.0.0.1:3922 (see server.mjs).
rem Installs dependencies and builds dist\ on first run.
rem   start-dashboard.bat rebuild   rebuild dist\ before starting
rem   set PORT / HOST beforehand to change where it listens
setlocal
cd /d "%~dp0"

where node >nul 2>nul || (
  echo Node.js was not found on PATH. Install it from https://nodejs.org/ and try again.
  pause
  exit /b 1
)

if not exist node_modules (
  echo Installing dependencies...
  call npm ci || goto :failed
)

if /i "%~1"=="rebuild" goto :build
if exist dist\index.html goto :start

:build
echo Building the dashboard...
call npm run build || goto :failed

:start
node server.mjs
if errorlevel 1 goto :failed
exit /b 0

:failed
echo.
echo The dashboard failed to start (see the output above).
pause
exit /b 1
