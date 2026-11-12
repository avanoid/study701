@echo off
cd /d "%~dp0"
where node >nul 2>&1
if %errorlevel%==0 (
  node "%~dp0serve.js"
  if errorlevel 1 pause
  exit /b
)
echo Node.js was not found. Opening the quiz in your browser.
start "" "%~dp0index.html"
