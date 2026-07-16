@echo off
REM Double-click this file to start TimeTrek on Windows.
REM
REM The app has no build step, but it loads its JavaScript as ES modules, and
REM browsers refuse to load modules over file:// — so opening the page
REM directly will not work. Hence this tiny local server.

setlocal
cd /d "%~dp0"

set PORT=8000
set URL=http://localhost:%PORT%/

REM Pick whichever static file server this machine already has.
REM Each candidate is actually executed rather than just looked up: Windows ships
REM a python.exe stub that only opens the Microsoft Store, and `where python`
REM matches it even when Python isn't really installed. `py` is the real Python
REM launcher, so it's tried first.
set SERVER=
py -3 -V >nul 2>&1 && set SERVER=py -3 -m http.server %PORT%
if not defined SERVER python -V >nul 2>&1 && set SERVER=python -m http.server %PORT%
if not defined SERVER npx --version >nul 2>&1 && set SERVER=npx --yes serve -l %PORT%

if not defined SERVER (
    echo.
    echo   TimeTrek needs Python or Node to serve the files locally.
    echo   The easiest fix is to install Python: https://www.python.org/downloads/
    echo   Tick "Add python.exe to PATH" in the installer, then double-click this again.
    echo.
    pause
    exit /b 1
)

echo.
echo   TimeTrek is starting on port %PORT%
echo   %URL%
echo.
echo   Leave this window open while you use the app.
echo   Close it, or press Ctrl-C, to stop.
echo.

REM Open the browser shortly from now in a separate window, so the server below
REM can hold the foreground of this one. Closing this window stops the server.
start "" /min cmd /c "timeout /t 2 /nobreak >nul & start "" "%URL%""

%SERVER%
