# DropRoom Local Development Launcher (Windows PowerShell — Localhost Only)
$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$redisRoot = "$env:LOCALAPPDATA\Programs\Redis"

# 1. Start Redis if port 6379 is not open
$redisUp = Test-NetConnection -ComputerName 127.0.0.1 -Port 6379 -InformationLevel Quiet -WarningAction SilentlyContinue
if (-not $redisUp) {
    Write-Host "Starting Redis 5.0.14.1 on 127.0.0.1:6379..."
    Start-Process -FilePath "$redisRoot\redis-server.exe" -ArgumentList "`"$redisRoot\redis.windows.conf`"" -WindowStyle Minimized
    Start-Sleep -Seconds 1
}

# 2. Start Go Backend on 127.0.0.1:8080
Write-Host "Starting Go Backend on http://127.0.0.1:8080 ..."
$backendProc = Start-Process -FilePath "powershell" -ArgumentList "-NoExit", "-Command", "cd '$repoRoot\backend'; go run ./cmd/server" -PassThru

# 3. Start Vite Frontend strictly on localhost:5173
Write-Host "Starting Frontend on http://localhost:5173 ..."
try {
    fnm env --use-on-cd --shell powershell | Out-String | Invoke-Expression
    Set-Location "$repoRoot\apps\web"
    npm run dev -- --host 127.0.0.1 --port 5173
} finally {
    if ($backendProc -and -not $backendProc.HasExited) {
        Stop-Process -Id $backendProc.Id -Force -ErrorAction SilentlyContinue
    }
}
