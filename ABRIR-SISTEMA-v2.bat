@echo off
chcp 65001 >nul
title Instituto Palitot - Iniciar Sistema
color 0A

echo.
echo ════════════════════════════════════════════════════════
echo    INSTITUTO PALITOT - Sistema de Faturamento
echo ════════════════════════════════════════════════════════
echo.

:: Verificar se está na pasta correta
if not exist "server.js" (
    echo ❌ ERRO: Arquivo server.js não encontrado!
    echo.
    echo    Execute este script dentro da pasta clinica-web
    echo.
    pause
    exit
)

echo [1/5] Verificando Node.js...
node --version >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo ❌ Node.js não está instalado!
    echo    Baixe em: https://nodejs.org
    pause
    exit
)
echo ✅ Node.js encontrado

echo.
echo [2/5] Baixando banco de dados da nuvem...

:: Usar PowerShell para download (mais confiável que curl)
powershell -Command "try { Invoke-WebRequest -Uri 'https://instituto-palitot-production.up.railway.app/api/sync/download' -OutFile 'clinica.db' -ErrorAction Stop; Write-Host '✅ Banco baixado!' } catch { Write-Host '⚠️  Usando banco local' }"

echo.
echo [3/5] Verificando dependências...
if not exist "node_modules" (
    echo    Instalando dependências (primeira vez)...
    call npm install --silent
)

echo.
echo [4/5] Iniciando servidor local...

:: Matar processos node antigos
taskkill /F /IM node.exe >nul 2>&1

:: Iniciar servidor em segundo plano
start /B "" node server.js

:: Aguardar servidor iniciar
timeout /t 5 /nobreak >nul

echo.
echo [5/5] Abrindo navegador...
start http://localhost:3000

echo.
echo ════════════════════════════════════════════════════════
echo.
echo  ✅ SISTEMA RODANDO!
echo.
echo  🌐 URL: http://localhost:3000
echo  👤 Login: admin
echo  🔑 Senha: @CarmoPalitot1
echo.
echo  ⚠️  IMPORTANTE:
echo     Execute FECHAR-SISTEMA.bat ao terminar
echo     para sincronizar com a nuvem!
echo.
echo ════════════════════════════════════════════════════════
echo.
pause
