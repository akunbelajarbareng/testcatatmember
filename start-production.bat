@echo off
title Oriental CRM - Production Server
color 0A

echo ========================================================
echo   ORIENTAL CRM - Point ^& Kupon Statement
echo   Menjalankan Mode Produksi (Next.js Production)
echo ========================================================
echo.

cd /d "%~dp0"

echo [1/2] Memeriksa bundle produksi...
if not exist ".next" (
    echo Bundle produksi belum ada. Menjalankan build...
    call npm run build
)

echo [2/2] Memulai server produksi di port 3000...
echo Server dapat diakses di: http://localhost:3000
echo Tekan Ctrl+C untuk menghentikan server.
echo.

call npm run start
pause
