# Notice2Action - Local Launch Script
# Starts FastAPI backend (port 8001) and React Vite frontend (port 5173) together.
$ErrorActionPreference = "Stop"

Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "   Starting Notice2Action (Localhost Dev Environment)" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan

# 1. Verification of environment
if (-not (Test-Path ".venv\Scripts\python.exe")) {
    Write-Error "Virtual environment not found. Please run .\setup.ps1 first."
    exit 1
}

if (-not (Test-Path "frontend\node_modules")) {
    Write-Error "Frontend dependencies not found. Please run .\setup.ps1 first."
    exit 1
}

# 2. Tesseract detection
if (-not $env:TESSERACT_CMD) {
    $commonPaths = @(
        "C:\Program Files\Tesseract-OCR\tesseract.exe",
        "C:\Program Files (x86)\Tesseract-OCR\tesseract.exe",
        "$env:LOCALAPPDATA\Programs\Tesseract-OCR\tesseract.exe"
    )
    foreach ($p in $commonPaths) {
        if (Test-Path $p) {
            $env:TESSERACT_CMD = $p
            Write-Host "[OCR] Auto-detected Tesseract at: $p" -ForegroundColor Gray
            break
        }
    }
}

# 3. Path setup for Node
if (Test-Path ".node\node.exe") {
    $env:PATH = "$(Get-Location)\.node;$env:PATH"
}

Write-Host "`nBackend API:      http://localhost:8001  (Docs: http://localhost:8001/docs)" -ForegroundColor Green
Write-Host "Frontend Client:  http://localhost:5173" -ForegroundColor Green
Write-Host "Demo Account:     demo@notice2action.com / DemoPassword123!`n" -ForegroundColor Yellow
Write-Host "Press Ctrl+C to terminate both servers.`n" -ForegroundColor Gray

# 4. Start Backend and Frontend processes
$backendProcess = Start-Process -FilePath ".\.venv\Scripts\python.exe" `
    -ArgumentList "-m", "uvicorn", "backend.app.main:app", "--host", "0.0.0.0", "--port", "8001", "--reload" `
    -PassThru

$frontendProcess = Start-Process -FilePath "npm.cmd" `
    -ArgumentList "run", "dev", "--prefix", "frontend" `
    -PassThru

try {
    # Keep script alive until user interrupts or process exits
    while (-not $backendProcess.HasExited -and -not $frontendProcess.HasExited) {
        Start-Sleep -Seconds 1
    }
} finally {
    Write-Host "`nShutting down servers..." -ForegroundColor Yellow
    if ($backendProcess -and -not $backendProcess.HasExited) {
        Stop-Process -Id $backendProcess.Id -Force -ErrorAction SilentlyContinue
    }
    if ($frontendProcess -and -not $frontendProcess.HasExited) {
        Stop-Process -Id $frontendProcess.Id -Force -ErrorAction SilentlyContinue
    }
    Write-Host "Servers stopped." -ForegroundColor Gray
}
