# Automabase Local Development Setup (PowerShell)
#
# This script sets up the local development environment.
# For daily development, use: bun run dev
#

$ErrorActionPreference = "Stop"

Write-Host ""
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Magenta
Write-Host "  🚀 Automabase Local Development Setup" -ForegroundColor Magenta
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Magenta
Write-Host ""

# Check prerequisites
Write-Host "📋 Checking prerequisites..." -ForegroundColor Cyan

# Check Bun
try {
    $bunVersion = bun --version
    Write-Host "   ✓ Bun $bunVersion" -ForegroundColor Green
} catch {
    Write-Host "❌ Bun is not installed. Please install it first:" -ForegroundColor Red
    Write-Host "   irm bun.sh/install.ps1 | iex" -ForegroundColor Gray
    exit 1
}

# Check Docker
try {
    $dockerVersion = docker --version
    Write-Host "   ✓ $dockerVersion" -ForegroundColor Green
} catch {
    Write-Host "❌ Docker is not installed. Please install Docker Desktop." -ForegroundColor Red
    exit 1
}

# Check SAM CLI
try {
    $samVersion = sam --version
    Write-Host "   ✓ $samVersion" -ForegroundColor Green
} catch {
    Write-Host "❌ AWS SAM CLI is not installed. Please install it:" -ForegroundColor Red
    Write-Host "   https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/install-sam-cli.html" -ForegroundColor Gray
    exit 1
}

# Install dependencies
Write-Host ""
Write-Host "📦 Installing dependencies..." -ForegroundColor Cyan
bun install

# Create env.json if not exists
if (-not (Test-Path "env.json")) {
    Write-Host ""
    Write-Host "⚙️  Creating env.json from template..." -ForegroundColor Cyan
    Copy-Item "env.json.example" "env.json"
    
    # Generate JWT keys
    Write-Host "🔐 Generating JWT keys..." -ForegroundColor Cyan
    bun run keygen
}

# Generate local JWT
Write-Host ""
Write-Host "🔑 Generating local JWT..." -ForegroundColor Cyan
bun run jwt:local --accountId acc_local_test_001 --refresh

Write-Host ""
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Green
Write-Host "  ✅ Setup Complete!" -ForegroundColor Green
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Green
Write-Host ""
Write-Host "  Start development environment:" -ForegroundColor White
Write-Host "    bun run dev" -ForegroundColor Yellow
Write-Host ""
Write-Host "  This will start:" -ForegroundColor White
Write-Host "    - DynamoDB Local:  http://localhost:8000" -ForegroundColor Gray
Write-Host "    - SAM Lambda:      http://localhost:3001" -ForegroundColor Gray
Write-Host "    - Dev Gateway:     http://localhost:3000" -ForegroundColor Gray
Write-Host "    - WebSocket:       ws://localhost:3000" -ForegroundColor Gray
Write-Host ""
Write-Host "  Other commands:" -ForegroundColor White
Write-Host "    bun run dev:skip-build    Skip building (faster restart)" -ForegroundColor Gray
Write-Host "    bun run test:e2e          Run E2E tests" -ForegroundColor Gray
Write-Host "    bun run jwt:local         Refresh JWT token" -ForegroundColor Gray
Write-Host ""
