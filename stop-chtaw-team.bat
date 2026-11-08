@echo off
setlocal DisableDelayedExpansion
title Team Chtaw - Arret
where powershell.exe >nul 2>nul
if errorlevel 1 (
    echo [ERREUR] Windows PowerShell est introuvable.
    pause
    exit /b 1
)
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0chtaw-team-launcher.ps1" -Action Stop
if errorlevel 1 (
    echo.
    echo [ERREUR] Certains serveurs n'ont pas pu etre arretes.
    pause
    exit /b 1
)
echo.
pause
exit /b 0
