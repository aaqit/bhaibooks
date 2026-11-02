@echo off
setlocal
title BahiBooks ERP - Desktop
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo   Node.js nahi mila. Please https://nodejs.org se Node LTS install karo.
  echo.
  pause
  exit /b 1
)

if not exist "node_modules" (
  echo   Dependencies install ho rahi hain... (pehli baar thoda time lagega)
  call npm install
  if errorlevel 1 ( echo   npm install fail hua. & pause & exit /b 1 )
)

if not exist "client\node_modules" (
  echo   Client dependencies install ho rahi hain...
  call npm --prefix client install
  if errorlevel 1 ( echo   client install fail hua. & pause & exit /b 1 )
)

if not exist "client\dist\index.html" (
  echo   App build ho raha hai...
  call npm --prefix client run build
  if errorlevel 1 ( echo   build fail hua. & pause & exit /b 1 )
)

echo.
echo   BahiBooks ERP start ho raha hai...
echo   Browser khul raha hai: http://localhost:4000
echo.
start "" "http://localhost:4000"
node server\index.js

echo.
echo   Server band ho gaya.
pause
