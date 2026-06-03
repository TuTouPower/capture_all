@echo off
REM Restart Chrome with Record All extension loaded
REM Run this on Windows to load the extension into Chrome on port 9223

taskkill /F /IM chrome.exe 2>nul
timeout /t 2 /nobreak >nul

start "" "C:\Program Files\Google\Chrome\Application\chrome.exe" ^
    --remote-debugging-port=9223 ^
    --load-extension="\\wsl.localhost\Ubuntu\home\karon\karson_ubuntu\record_all\dist" ^
    --no-first-run ^
    --no-default-browser-check ^
    --disable-extensions-except="\\wsl.localhost\Ubuntu\home\karon\karson_ubuntu\record_all\dist" ^
    --user-data-dir="%TEMP%\chrome-record-all"

echo Chrome restarted with Record All extension on port 9223
