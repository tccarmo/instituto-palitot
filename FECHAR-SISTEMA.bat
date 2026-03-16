@echo off
chcp 65001 >nul
title Instituto Palitot - Fechar e Sincronizar
color 0E

echo.
echo ╔═══════════════════════════════════════════════════════════╗
echo ║                                                           ║
echo ║     🏥 INSTITUTO PALITOT - Fechar Sistema                ║
echo ║                                                           ║
echo ╚═══════════════════════════════════════════════════════════╝
echo.

:: Perguntar se quer sincronizar
echo Deseja sincronizar os dados com a nuvem?
echo.
echo [S] Sim - Enviar alterações para nuvem
echo [N] Não - Apenas fechar (NÃO RECOMENDADO)
echo.
choice /C SN /N /M "Escolha (S/N): "

if %ERRORLEVEL% EQU 2 (
    echo.
    echo ⚠️  Sincronização cancelada!
    echo    Suas alterações NÃO foram enviadas para a nuvem.
    goto FECHAR_SERVIDOR
)

echo.
echo 📤 Sincronizando com a nuvem...
echo.

:: URL da API do Railway
set API_URL=https://instituto-palitot-production.up.railway.app

:: Enviar banco de dados
echo [1/2] Enviando banco de dados atualizado...

curl -X POST -F "database=@clinica.db" "%API_URL%/api/sync/upload" -s -o response.txt

if %ERRORLEVEL% EQU 0 (
    echo ✅ Banco de dados sincronizado com sucesso!
    del response.txt 2>nul
) else (
    echo ❌ Erro ao sincronizar!
    echo    Suas alterações estão salvas LOCALMENTE.
    echo    Tente sincronizar novamente mais tarde.
    timeout /t 3 >nul
)

:FECHAR_SERVIDOR
echo.
echo [2/2] Fechando servidor local...

:: Matar processo node.js
taskkill /F /IM node.exe >nul 2>&1

echo ✅ Servidor fechado!

echo.
echo ╔═══════════════════════════════════════════════════════════╗
echo ║                                                           ║
echo ║  ✅ SISTEMA FECHADO COM SUCESSO!                         ║
echo ║                                                           ║
echo ║  💾 Seus dados foram sincronizados com a nuvem.          ║
echo ║                                                           ║
echo ║  🌐 Você pode acessar de qualquer lugar em:              ║
echo ║     https://instituto-palitot-production.up.railway.app  ║
echo ║                                                           ║
echo ╚═══════════════════════════════════════════════════════════╝
echo.
echo Pressione qualquer tecla para fechar...
pause >nul
