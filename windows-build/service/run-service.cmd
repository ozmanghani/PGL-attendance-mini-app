@echo off
REM Wrapper invoked by NSSM. Sets data paths and starts the Node backend.
setlocal

if "%APP_ROOT%"=="" set "APP_ROOT=%~dp0.."
set "APP_ROOT=%APP_ROOT:"=%"

set "NODE_EXE=%APP_ROOT%\node\node.exe"
set "APP_ENTRY=%APP_ROOT%\app\backend\dist\src\main.js"

set "PGL_DATA_DIR=%ProgramData%\PGL Attendance"
if not exist "%PGL_DATA_DIR%" mkdir "%PGL_DATA_DIR%"
if not exist "%PGL_DATA_DIR%\logs" mkdir "%PGL_DATA_DIR%\logs"

set "DATABASE_URL=file:%PGL_DATA_DIR%\attendance.db"
set "DATABASE_URL=%DATABASE_URL:\=/%"

set "RESOURCES_PATH=%APP_ROOT%\app"
set "NODE_ENV=production"
set "PRISMA_QUERY_ENGINE_LIBRARY=%APP_ROOT%\app\backend\node_modules\.prisma\client\query_engine-windows.dll.node"

"%NODE_EXE%" "%APP_ENTRY%"
exit /b %errorlevel%
