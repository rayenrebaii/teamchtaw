@echo off
setlocal
cd /d "%~dp0"

where npm.cmd >nul 2>nul
if errorlevel 1 (
  echo ERREUR : Node.js et npm sont introuvables. Installe Node.js puis relance ce fichier.
  pause
  exit /b 1
)

if not exist "node_modules\.bin\vite.cmd" (
  echo Installation des dependances de ChatFlow...
  call npm.cmd install --no-audit --no-fund
  if errorlevel 1 (
    echo.
    echo ERREUR : l'installation des dependances a echoue.
    echo Verifie ta connexion Internet puis relance start-chatflow.bat.
    pause
    exit /b 1
  )
)

echo.
echo ChatFlow sera disponible sur http://localhost:5173
echo Laisse cette fenetre ouverte pendant l'utilisation de l'application.
call npm.cmd run dev -- --open
if errorlevel 1 (
  echo.
  echo Le serveur s'est arrete avec une erreur.
  pause
)
endlocal
