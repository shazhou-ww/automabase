# Automabase API Test Script
# Test all APIs in local SAM environment

$baseUrl = "http://localhost:3000"
$adminKey = "dev-admin:dev-secret-change-me"

Write-Host "=== Automabase API Test ===" -ForegroundColor Green
Write-Host ""

# 1. Create Tenant
Write-Host "Step 1: Create Tenant" -ForegroundColor Yellow
$tenantBody = @{
    name = "Test Tenant"
    jwksUri = "https://example.com/.well-known/jwks.json"
    ownerSubjectId = "sha256:test-owner-key-12345678901234567890123456789012"
    contactName = "Test User"
    contactEmail = "test@example.com"
} | ConvertTo-Json

$headers = @{
    "X-Admin-Key" = $adminKey
    "Content-Type" = "application/json"
}

try {
    $tenantResponse = Invoke-RestMethod -Uri "$baseUrl/admin/tenants" -Method POST -Headers $headers -Body $tenantBody
    Write-Host "[OK] Tenant created successfully!" -ForegroundColor Green
    Write-Host ($tenantResponse | ConvertTo-Json -Depth 3)
    $tenantId = $tenantResponse.tenantId
    Write-Host "Tenant ID: $tenantId" -ForegroundColor Cyan
    Write-Host ""
} catch {
    Write-Host "[ERROR] Tenant creation failed: $($_.Exception.Message)" -ForegroundColor Red
    if ($_.Exception.Response) {
        $statusCode = $_.Exception.Response.StatusCode.value__
        Write-Host "Status Code: $statusCode" -ForegroundColor Yellow
        $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
        $responseBody = $reader.ReadToEnd()
        Write-Host "Response Body:" -ForegroundColor Yellow
        if ($responseBody) {
            try {
                $errorObj = $responseBody | ConvertFrom-Json
                Write-Host ($errorObj | ConvertTo-Json -Depth 5) -ForegroundColor Red
            } catch {
                Write-Host $responseBody -ForegroundColor Red
            }
        } else {
            Write-Host "(empty)" -ForegroundColor Gray
        }
    }
    Write-Host ""
    Write-Host "Please check SAM Local logs for more details." -ForegroundColor Yellow
    exit 1
}

# 2. Get Tenant
Write-Host "Step 2: Get Tenant" -ForegroundColor Yellow
try {
    $getTenantResponse = Invoke-RestMethod -Uri "$baseUrl/admin/tenants/$tenantId" -Method GET -Headers $headers
    Write-Host "[OK] Tenant retrieved successfully!" -ForegroundColor Green
    Write-Host ($getTenantResponse | ConvertTo-Json -Depth 3)
    Write-Host ""
} catch {
    Write-Host "[ERROR] Failed to get tenant: $($_.Exception.Message)" -ForegroundColor Red
}

# 3. List Tenants
Write-Host "Step 3: List Tenants" -ForegroundColor Yellow
try {
    $listTenantsResponse = Invoke-RestMethod -Uri "$baseUrl/admin/tenants" -Method GET -Headers $headers
    Write-Host "[OK] Tenants listed successfully!" -ForegroundColor Green
    Write-Host ($listTenantsResponse | ConvertTo-Json -Depth 3)
    Write-Host ""
} catch {
    Write-Host "[ERROR] Failed to list tenants: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host ""
Write-Host "Note: To test Automata API, we need to create JWT token" -ForegroundColor Yellow
Write-Host "This requires:" -ForegroundColor Yellow
Write-Host "  1. Generate RSA key pair" -ForegroundColor Yellow
Write-Host "  2. Create JWKS endpoint (or use existing one)" -ForegroundColor Yellow
Write-Host "  3. Sign JWT token with private key" -ForegroundColor Yellow
Write-Host ""
Write-Host "Basic tests completed!" -ForegroundColor Green

