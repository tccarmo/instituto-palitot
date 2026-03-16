@echo off
chcp 65001 >nul
title Instituto Palitot - Fechar Sistema
color 0E

echo.
echo ════════════════════════════════════════════════════════
echo    INSTITUTO PALITOT - Fechar e Sincronizar
echo ════════════════════════════════════════════════════════
echo.

echo Deseja sincronizar os dados com a nuvem?
echo.
echo [S] Sim - Enviar alterações (RECOMENDADO)
echo [N] Não - Apenas fechar
echo.
choice /C SN /N /M "Escolha (S/N): "

if %ERRORLEVEL% EQU 2 (
    echo.
    echo ⚠️  Sincronização cancelada!
    goto FECHAR
)

echo.
echo [1/2] Sincronizando com a nuvem...

:: Usar PowerShell para upload
powershell -Command "$url = 'https://instituto-palitot-production.up.railway.app/api/sync/upload'; $filePath = 'clinica.db'; try { $boundary = [System.Guid]::NewGuid().ToString(); $headers = @{ 'Content-Type' = 'multipart/form-data; boundary=' + $boundary }; $fileBytes = [System.IO.File]::ReadAllBytes($filePath); $encoding = [System.Text.Encoding]::GetEncoding('iso-8859-1'); $bodyStart = '--' + $boundary + \"`r`n\" + 'Content-Disposition: form-data; name=\"database\"; filename=\"clinica.db\"' + \"`r`n\" + 'Content-Type: application/octet-stream' + \"`r`n`r`n\"; $bodyEnd = \"`r`n--\" + $boundary + '--'; $bodyBytes = $encoding.GetBytes($bodyStart) + $fileBytes + $encoding.GetBytes($bodyEnd); Invoke-WebRequest -Uri $url -Method Post -Headers $headers -Body $bodyBytes -ErrorAction Stop | Out-Null; Write-Host '✅ Sincronizado!' } catch { Write-Host '❌ Erro ao sincronizar!' }"

:FECHAR
echo.
echo [2/2] Fechando servidor...

:: Matar processo node.js
taskkill /F /IM node.exe >nul 2>&1

echo ✅ Servidor fechado!

echo.
echo ════════════════════════════════════════════════════════
echo.
echo  ✅ SISTEMA FECHADO!
echo.
echo  💾 Dados salvos localmente
echo.
echo  🌐 Acesse online em:
echo     https://instituto-palitot-production.up.railway.app
echo.
echo ════════════════════════════════════════════════════════
echo.
pause
