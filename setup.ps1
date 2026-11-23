# Notice2Action - Local Windows Setup Script
# Run once on a new laptop: .\setup.ps1
$ErrorActionPreference = "Stop"

Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "   Notice2Action: Windows Single-Laptop Setup" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan

# 1. Check Python
Write-Host "`n[1/6] Checking Python installation..." -ForegroundColor Yellow
$pythonCmd = "python"
if (-not (Get-Command $pythonCmd -ErrorAction SilentlyContinue)) {
    $pythonCmd = "py"
    if (-not (Get-Command $pythonCmd -ErrorAction SilentlyContinue)) {
        Write-Error "Python 3.10+ was not found on PATH. Please install Python from https://www.python.org/downloads/ and check 'Add Python to PATH'."
        exit 1
    }
}
$pyVer = & $pythonCmd --version
Write-Host "  -> Found: $pyVer" -ForegroundColor Green

# 2. Virtual Environment
Write-Host "`n[2/6] Configuring Python virtual environment (.venv)..." -ForegroundColor Yellow
if (-not (Test-Path ".venv")) {
    Write-Host "  -> Creating .venv..." -ForegroundColor Gray
    & $pythonCmd -m venv .venv
} else {
    Write-Host "  -> .venv already exists." -ForegroundColor Gray
}

$venvPython = ".\.venv\Scripts\python.exe"
$venvPip = ".\.venv\Scripts\pip.exe"

Write-Host "  -> Installing Python requirements..." -ForegroundColor Gray
& $venvPython -m pip install --quiet --upgrade pip
if (Test-Path "backend/requirements.txt") {
    & $venvPip install --quiet -r backend/requirements.txt
} elseif (Test-Path "requirements.txt") {
    & $venvPip install --quiet -r requirements.txt
}
Write-Host "  -> Python dependencies installed." -ForegroundColor Green

# 3. Check Node.js and Frontend dependencies
Write-Host "`n[3/6] Checking Node.js and frontend dependencies..." -ForegroundColor Yellow
$nodeCmd = Get-Command "node" -ErrorAction SilentlyContinue
if (-not $nodeCmd) {
    if (Test-Path ".node\node.exe") {
        $env:PATH = "$(Get-Location)\.node;$env:PATH"
    } else {
        Write-Error "Node.js was not found on PATH. Please install Node.js 18+ from https://nodejs.org/"
        exit 1
    }
}
$nodeVer = & node --version
Write-Host "  -> Found Node.js: $nodeVer" -ForegroundColor Green

if (Test-Path "frontend/package.json") {
    Write-Host "  -> Installing frontend npm packages..." -ForegroundColor Gray
    Push-Location frontend
    & npm install --silent
    Pop-Location
    Write-Host "  -> Frontend dependencies installed." -ForegroundColor Green
}

# 4. Environment Configuration
Write-Host "`n[4/6] Checking environment configuration (.env)..." -ForegroundColor Yellow
if (-not (Test-Path ".env")) {
    if (Test-Path ".env.example") {
        Copy-Item ".env.example" ".env"
        Write-Host "  -> Copied .env.example to .env (Default Port: 8001)" -ForegroundColor Green
    } else {
        Write-Host "  -> Warning: .env.example not found." -ForegroundColor Yellow
    }
} else {
    Write-Host "  -> .env file already present." -ForegroundColor Gray
}

if (-not (Test-Path "frontend/.env")) {
    if (Test-Path "frontend/.env.example") {
        Copy-Item "frontend/.env.example" "frontend/.env"
        Write-Host "  -> Copied frontend/.env.example to frontend/.env (VITE_API_BASE_URL=http://localhost:8001)" -ForegroundColor Green
    }
}

# 5. Database Initialization & Seed Account
Write-Host "`n[5/6] Initializing local database and demo user..." -ForegroundColor Yellow
& $venvPython -c "from backend.app.database import init_db; init_db(); print('  -> Database initialized and demo account seeded: demo@notice2action.com')"

# 6. Tesseract OCR Detection
Write-Host "`n[6/6] Checking Tesseract OCR availability..." -ForegroundColor Yellow
$tessFound = $null

# Check user-configured TESSERACT_CMD
if ($env:TESSERACT_CMD -and (Test-Path $env:TESSERACT_CMD)) {
    $tessFound = $env:TESSERACT_CMD
}

# Check system PATH
if (-not $tessFound) {
    $whichTess = Get-Command "tesseract" -ErrorAction SilentlyContinue
    if ($whichTess) {
        $tessFound = $whichTess.Source
    }
}

# Check common Windows directories
if (-not $tessFound) {
    $commonPaths = @(
        "C:\Program Files\Tesseract-OCR\tesseract.exe",
        "C:\Program Files (x86)\Tesseract-OCR\tesseract.exe",
        "$env:LOCALAPPDATA\Programs\Tesseract-OCR\tesseract.exe"
    )
    foreach ($p in $commonPaths) {
        if (Test-Path $p) {
            $tessFound = $p
            break
        }
    }
}

if ($tessFound) {
    Write-Host "  -> Tesseract OCR located at: $tessFound" -ForegroundColor Green
    try {
        $tessVer = & $tessFound --version 2>&1 | Select-Object -First 1
        Write-Host "  -> $tessVer" -ForegroundColor Green
    } catch {}
} else {
    Write-Host "  -> [Notice] Tesseract OCR binary not found on this machine." -ForegroundColor Yellow
    Write-Host "     Scanned PDFs and paper photos will use Gemini Vision fallback." -ForegroundColor Gray
    Write-Host "     To enable fast, private local OCR on Windows:" -ForegroundColor Cyan
    Write-Host "     1. Download Tesseract Windows installer from UB-Mannheim:" -ForegroundColor Cyan
    Write-Host "        https://github.com/UB-Mannheim/tesseract/wiki" -ForegroundColor Cyan
    Write-Host "     2. Install to default directory: C:\Program Files\Tesseract-OCR" -ForegroundColor Cyan
    Write-Host "     3. Restart terminal, or set TESSERACT_CMD in your .env" -ForegroundColor Cyan
}

Write-Host "`n============================================================" -ForegroundColor Cyan
Write-Host "   Setup Complete! To start Notice2Action, run: .\run.ps1" -ForegroundColor Green
Write-Host "============================================================" -ForegroundColor Cyan
