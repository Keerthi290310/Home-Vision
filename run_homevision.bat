@echo off
setlocal
cd /d "%~dp0"
title HomeVision - Dashboard Launcher
if not exist ".venv\Scripts\python.exe" (
  echo [1/3] Creating Python virtual environment...
  python -m venv .venv
  if errorlevel 1 goto :error
)
echo [2/3] Installing/checking project dependencies...
".venv\Scripts\python.exe" -m pip install --retries 10 --timeout 60 -r requirements.txt
if errorlevel 1 goto :error
set PORT=8000
powershell -NoProfile -ExecutionPolicy Bypass -Command "try { $r=Invoke-RestMethod 'http://127.0.0.1:8000/health' -TimeoutSec 2; if ($r.project -eq 'HomeVision') { exit 0 } else { exit 1 } } catch { exit 1 }"
if not errorlevel 1 (
  echo HomeVision is already running on port 8000. Reusing the existing server.
  start "" "http://127.0.0.1:8000"
  goto :done
)
netstat -ano | findstr LISTENING | findstr ":8000" >nul
if not errorlevel 1 set PORT=8001
powershell -NoProfile -ExecutionPolicy Bypass -Command "try { $r=Invoke-RestMethod 'http://127.0.0.1:%PORT%/health' -TimeoutSec 2; if ($r.project -eq 'HomeVision') { exit 0 } else { exit 1 } } catch { exit 1 }"
if not errorlevel 1 (
  echo HomeVision is already running on port %PORT%. Reusing the existing server.
  start "" "http://127.0.0.1:%PORT%"
  goto :done
)
netstat -ano | findstr LISTENING | findstr ":%PORT%" >nul
if not errorlevel 1 (
  echo ERROR: Ports 8000 and 8001 are busy and neither is serving HomeVision.
  echo Close the unrelated process or start HomeVision manually on a free port.
  pause
  goto :eof
)
echo [3/3] Starting HomeVision on port %PORT%...
start "HomeVision API" /D "%~dp0" cmd /k ""%~dp0.venv\Scripts\python.exe" -m uvicorn backend.main:app --host 127.0.0.1 --port %PORT%"
timeout /t 4 /nobreak >nul
start "" "http://127.0.0.1:%PORT%"
echo HomeVision dashboard should open at http://127.0.0.1:%PORT%.
echo Keep the HomeVision API terminal open while using the dashboard.
:done
pause
goto :eof
:error
echo.
echo HomeVision could not start. Read the error above. If package installation failed, check internet and run this file again.
pause
