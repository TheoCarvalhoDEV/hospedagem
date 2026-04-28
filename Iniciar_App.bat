@echo off
title LexGen AI - Inicializador

echo =======================================
echo     Limpando processos anteriores...
echo =======================================
taskkill /F /IM node.exe > nul 2>&1
echo.

echo =======================================
echo     Iniciando o LexGen AI...
echo =======================================

echo.
echo [1/2] Iniciando servidor do Backend...
cd /d "%~dp0backend"
start "LexGen AI - Backend" cmd /k "node index.js"

echo [2/2] Iniciando servidor do Frontend...
cd /d "%~dp0frontend"
start "LexGen AI - Frontend" cmd /k "npm run dev"

echo.
echo Aguardando o Vite iniciar...
timeout /t 4 /nobreak > nul

echo.
echo Abrindo o navegador...
start http://localhost:5173

exit
