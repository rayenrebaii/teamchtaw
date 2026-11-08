@echo off
setlocal DisableDelayedExpansion
title Team Chtaw - Demarrage
where powershell.exe >nul 2>nul
if errorlevel 1 (
    echo [ERREUR] Windows PowerShell est introuvable.
    pause
    exit /b 1
)
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0chtaw-team-launcher.ps1" -Action Start
if errorlevel 1 (
    echo.
    echo [ERREUR] Demarrage incomplet. Consultez les messages ci-dessus.
    pause
    exit /b 1
)
exit /b 0
