@echo off
setlocal
title BahiBooks ERP - Online (Cloudflare Tunnel)
cd /d "%~dp0"

REM ---------------------------------------------------------------------------
REM  Office PC ko free me online karta hai (Cloudflare quick tunnel).
REM  Is PC par app chalega, aur duniya bhar se https URL khulega - same data.
REM  DHYAN: ye window band ki to website band. URL har baar badalta hai.
REM  Permanent URL ke liye domain chahiye (README/deploy guide dekho).
REM ---------------------------------------------------------------------------

set PORT=4000
set ACCESS_MODE=web
set WEB_FULL_ACCESS=true

echo.
echo   BahiBooks ERP - Online mode
echo   --------------------------------------------
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo   [X] Node.js nahi mila. https://nodejs.org se Node 24 install karo.
  echo.
  pause
  exit /b 1
)

if not exist "client\dist\index.html" (
  echo   App build ho raha hai ^(pehli baar thoda time lagega^)...
  call npm.cmd --prefix client install
  call npm.cmd --prefix client run build
  if errorlevel 1 ( echo   [X] Build fail hua. & pause & exit /b 1 )
)

set CF="C:\Program Files (x86)\cloudflared\cloudflared.exe"
if not exist %CF% (
  where cloudflared >nul 2>nul
  if errorlevel 1 (
    echo   [X] cloudflared nahi mila.
    echo       Install karo:  winget install --id Cloudflare.cloudflared
    echo.
    pause
    exit /b 1
  )
  set CF=cloudflared
)

REM --- Server already chal raha hai kya? ---
set SERVER_STARTED=0
netstat -ano | findstr /r /c:"LISTENING" | findstr /c:":%PORT% " >nul 2>nul
if errorlevel 1 (
  echo   Server start ho raha hai ^(port %PORT%^)...
  start "BahiBooks Server" /min cmd /c "set PORT=%PORT%&& set ACCESS_MODE=%ACCESS_MODE%&& set WEB_FULL_ACCESS=%WEB_FULL_ACCESS%&& node server\index.js"
  set SERVER_STARTED=1
  timeout /t 5 /nobreak >nul
) else (
  echo   Server pehle se chal raha hai ^(port %PORT%^).
)

echo.
echo   ==========================================================
echo    Cloudflare tunnel khul raha hai...
echo    Neeche jo https://xxxx.trycloudflare.com URL aayega,
echo    WAHI aapki website ka public address hai. Sab log usi
echo    par login karenge (apne-apne username/password se).
echo   ==========================================================
echo.
echo   Is window ko band mat karo - band karne par website band ho jayegi.
echo.

%CF% tunnel --url http://localhost:%PORT% --no-autoupdate

echo.
echo   Tunnel band ho gaya.
if "%SERVER_STARTED%"=="1" (
  echo   Server bhi band karna hai to alag se "BahiBooks Server" window band karo.
)
pause
