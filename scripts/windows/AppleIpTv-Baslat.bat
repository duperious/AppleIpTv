@echo off
chcp 65001 >nul
title AppleIpTv
setlocal

rem Depo kokune gec (bu dosya scripts\windows altinda).
cd /d "%~dp0..\.."

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo   Node.js bulunamadi.
  echo   https://nodejs.org adresinden "LTS" surumunu kurup bu dosyayi tekrar calistirin.
  echo.
  pause
  exit /b 1
)

if not exist "node_modules" (
  echo.
  echo   Bagimliliklar kuruluyor, ilk seferde birkac dakika surebilir...
  echo.
  call npm install
  if errorlevel 1 goto hata
)

echo   Cekirdek kutuphane derleniyor...
call npm run build -w @appleiptv/core
if errorlevel 1 goto hata

echo   Proxy ve web sunucusu baslatiliyor...
start "AppleIpTv - proxy" cmd /k npm run proxy
start "AppleIpTv - web"   cmd /k npm run dev

rem Sunucunun ayaga kalkmasini bekle, sonra tarayiciyi ac.
timeout /t 6 /nobreak >nul
start "" http://localhost:5173

echo.
echo   Hazir. Tarayicida http://localhost:5173 acildi.
echo   Kapatmak icin acilan iki siyah pencereyi kapatin.
echo.
pause
exit /b 0

:hata
echo.
echo   Bir hata olustu. Yukaridaki mesaji kontrol edin.
echo.
pause
exit /b 1
