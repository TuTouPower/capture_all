$distPath = 'C:\Temp\record_all_dist'
$chromePath = 'C:\Program Files\Google\Chrome\Application\chrome.exe'
$userDataDir = 'C:\Temp\chrome-record-all-2'

# Remove old user data dir
if (Test-Path $userDataDir) { Remove-Item -Recurse -Force $userDataDir }

$args = @(
    '--remote-debugging-port=9223',
    "--load-extension=$distPath",
    "--disable-extensions-except=$distPath",
    '--no-first-run',
    '--no-default-browser-check',
    '--enable-automation',
    "--user-data-dir=$userDataDir"
)
Start-Process -FilePath $chromePath -ArgumentList $args
Write-Host "Chrome started"
