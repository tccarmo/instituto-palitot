@echo off
chcp 65001 >nul
title Instituto Palitot - Iniciar Sistema Local
color 0A

echo.
echo ╔═══════════════════════════════════════════════════════════╗
echo ║                                                           ║
echo ║     🏥 INSTITUTO PALITOT - Sistema de Faturamento        ║
echo ║                                                           ║
echo ╚═══════════════════════════════════════════════════════════╝
echo.
echo 📥 Sincronizando banco de dados da nuvem...
echo.

:: URL da API do Railway
set API_URL=https://instituto-palitot-production.up.railway.app

:: Baixar banco de dados atualizado
echo [1/4] Baixando banco de dados da nuvem...
curl -s -o clinica.db "%API_URL%/api/sync/download" 

if %ERRORLEVEL% EQU 0 (
    echo ✅ Banco de dados baixado com sucesso!
) else (
    echo ⚠️  Erro ao baixar. Usando banco local.
    timeout /t 2 >nul
)

echo.
echo [2/4] Verificando dependências...
if not exist "node_modules" (
    echo ⚠️  Instalando dependências...
    call npm install
)

echo.
echo [3/4] Iniciando servidor local...
start /B cmd /c "node server.js > server.log 2>&1"

:: Aguardar servidor iniciar
timeout /t 3 >nul

echo.
echo [4/4] Abrindo navegador...
start http://localhost:3000

echo.
echo ╔═══════════════════════════════════════════════════════════╗
echo ║                                                           ║
echo ║  ✅ SISTEMA RODANDO LOCALMENTE!                          ║
echo ║                                                           ║
echo ║  🌐 URL: http://localhost:3000                           ║
echo ║  👤 Login: admin                                         ║
echo ║  🔑 Senha: @CarmoPalitot1                                ║
echo ║                                                           ║
echo ║  📌 IMPORTANTE:                                          ║
echo ║     Execute FECHAR-SISTEMA.bat ao terminar!             ║
echo ║     Isso sincroniza seus dados com a nuvem.             ║
echo ║                                                           ║
echo ╚═══════════════════════════════════════════════════════════╝
echo.
echo Pressione qualquer tecla para minimizar esta janela...
pause >nul

:: Minimizar janela
powershell -window minimized -command ""
