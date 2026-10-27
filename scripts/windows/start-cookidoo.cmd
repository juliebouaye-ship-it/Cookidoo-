@echo off
rem Demarre le serveur Cookidoo MCP pour Claude Desktop.
rem Laisser cette fenetre ouverte pendant lutilisation, la fermer pour arreter.
title Cookidoo MCP
cd /d "%~dp0..\.."
if not exist "dist\main.js" (
  echo Le serveur nest pas compile. Lance dabord :
  echo   powershell -ExecutionPolicy Bypass -File scripts\windows\setup.ps1
  pause
  exit /b 1
)
if not exist ".env" (
  echo Fichier .env manquant. Lance dabord scripts\windows\setup.ps1
  pause
  exit /b 1
)
echo Serveur Cookidoo en cours de demarrage... (fermer cette fenetre pour larreter)
node dist\main
echo.
echo Le serveur sest arrete.
pause
