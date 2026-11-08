@echo off
setlocal
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
    echo Node.js n'est pas installe ou n'est pas accessible depuis le PATH.
    echo Installez Node.js, puis relancez ce fichier.
    pause
    exit /b 1
)

where npm >nul 2>nul
if errorlevel 1 (
    echo npm est introuvable. Reinstallez Node.js avec npm, puis relancez ce fichier.
    pause
    exit /b 1
)

if not exist "node_modules" (
    echo Installation des dependances...
    where bun >nul 2>nul
    if not errorlevel 1 (
        echo Bun detecte : installation depuis bun.lock...
        call bun install
    ) else (
        call npm install --legacy-peer-deps --no-audit --no-fund
    )
    if errorlevel 1 goto install_failed
)

echo Demarrage du projet... Ouvrez http://localhost:5173 dans votre navigateur.
call npm run dev -- --open
pause
exit /b 0

:install_failed
echo.
echo L'installation des dependances a echoue.
echo Si npm affiche une erreur interne, essayez d'installer Bun depuis https://bun.sh
echo puis relancez ce fichier. Le projet contient deja le fichier bun.lock prevu pour Bun.
pause
exit /b 1
