@echo off
cd /d "%~dp0"
if exist "%APPDATA%\Microsoft\Windows\Start Menu\Programs\SAA.lnk" (
  start "" "%APPDATA%\Microsoft\Windows\Start Menu\Programs\SAA.lnk"
) else if exist "release\SAA-0.1.6-portable.exe" (
  start "" "release\SAA-0.1.6-portable.exe"
) else (
  if exist "node_modules\electron\dist\electron.exe" (
    start "" "node_modules\electron\dist\electron.exe" .
  ) else (
    echo Run npm install and npm run build in this folder first.
    pause
  )
)


