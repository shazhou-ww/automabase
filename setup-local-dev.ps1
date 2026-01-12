# Local Development Setup Guide for PowerShell
# 
# This script provides guidance on starting all required services

Write-Host "🚀 Automabase Local Development Setup" -ForegroundColor Green
Write-Host ""

Write-Host "📋 Service Status:" -ForegroundColor Cyan

# Check DynamoDB
$dynamodbRunning = docker ps | Select-String "dynamodb-local"
if ($dynamodbRunning) {
    Write-Host "   ✓ DynamoDB Local: Running on port 8000" -ForegroundColor Green
} else {
    Write-Host "   ✗ DynamoDB Local: Not running" -ForegroundColor Yellow
    Write-Host "     Start with: bun run setup:db" -ForegroundColor Gray
}

# Check SAM Local
$samRunning = netstat -ano 2>$null | Select-String "3000"
if ($samRunning) {
    Write-Host "   ✓ SAM Local API: Running on port 3000" -ForegroundColor Green
} else {
    Write-Host "   ✗ SAM Local API: Not running" -ForegroundColor Yellow
    Write-Host "     Start with: bun run sam:local" -ForegroundColor Gray
}

# Check WebSocket Local
$wsRunning = netstat -ano 2>$null | Select-String "3001"
if ($wsRunning) {
    Write-Host "   ✓ WebSocket Gateway: Running on port 3001" -ForegroundColor Green
} else {
    Write-Host "   ✗ WebSocket Gateway: Not running" -ForegroundColor Yellow
    Write-Host "     Start with: bun run ws:local" -ForegroundColor Gray
}

Write-Host ""
Write-Host "🎯 Quick Start:" -ForegroundColor Cyan
Write-Host ""
Write-Host "1. In Terminal 1 - Start DynamoDB:" -ForegroundColor Cyan
Write-Host "   > bun run setup:db" -ForegroundColor Gray
Write-Host ""
Write-Host "2. In Terminal 2 - Start SAM Local API:" -ForegroundColor Cyan
Write-Host "   > bun run sam:local" -ForegroundColor Gray
Write-Host ""
Write-Host "3. In Terminal 3 - Start WebSocket Gateway:" -ForegroundColor Cyan
Write-Host "   > bun run ws:local" -ForegroundColor Gray
Write-Host ""
Write-Host "4. In Terminal 4 - Run Integration Test:" -ForegroundColor Cyan
Write-Host "   > bun run test:e2e" -ForegroundColor Gray
Write-Host ""
