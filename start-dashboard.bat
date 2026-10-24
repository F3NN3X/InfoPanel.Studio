@echo off
rem Starts the InfoPanel Studio server (ips-server) on http://127.0.0.1:3922.
rem Runs src-tauri\target\release\ips-server.exe when it is built, else `cargo run --release -p ips-server`
rem (Rust stable needed). Installs dependencies and builds dist\ on first run.
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
if not defined DASHBOARD_DIST set "DASHBOARD_DIST=%~dp0dist"
if exist src-tauri\target\release\ips-server.exe (
  src-tauri\target\release\ips-server.exe
) else (
  where cargo >nul 2>nul || (
    echo Rust was not found on PATH. Install it from https://rustup.rs/ and try again.
    pause
    exit /b 1
  )
  pushd src-tauri
  cargo run --release -p ips-server
  popd
)
if errorlevel 1 goto :failed
exit /b 0

:failed
echo.
echo The dashboard failed to start (see the output above).
pause
exit /b 1
