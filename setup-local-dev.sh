#!/usr/bin/env bash
# Local Development Setup Script
# This script sets up all required services for local development

echo "🚀 Starting Automabase Local Development Environment"
echo ""

# 1. Check if DynamoDB Local is running
echo "1️⃣  Checking DynamoDB Local..."
if docker ps | grep -q "dynamodb-local"; then
    echo "   ✓ DynamoDB Local is already running"
else
    echo "   ⚠️  Starting DynamoDB Local..."
    bun run setup:db
fi

echo ""

# 2. Start SAM Local API
echo "2️⃣  Starting SAM Local API (port 3000)..."
echo "   Run in a separate terminal:"
echo "   > bun run sam:local"
echo ""

# 3. Start WebSocket Local Gateway
echo "3️⃣  Starting WebSocket Local Gateway (port 3001)..."
echo "   Run in a separate terminal:"
echo "   > bun run ws:local"
echo ""

# 4. Generate JWT Token
echo "4️⃣  Generating JWT Token..."
bun run jwt:local
echo ""

# 5. Test WebSocket Connection
echo "5️⃣  Testing WebSocket Connection..."
echo "   Run in a separate terminal:"
echo "   > bun run test:e2e"
echo ""

echo "✅ Setup complete!"
echo ""
echo "📋 Summary:"
echo "   - DynamoDB Local: http://localhost:8000"
echo "   - SAM Lambda Service: http://localhost:3002"
echo "   - Dev Gateway: http://localhost:3001"
echo "   - JWT Token cached in: .local-jwt-cache"
echo ""
echo "🎯 Next steps:"
echo "   1. Start SAM Lambda: bun run sam:local"
echo "   2. Start Dev Gateway: bun run dev:gateway:remote"
echo "   3. Run E2E tests: bun run test:e2e"
