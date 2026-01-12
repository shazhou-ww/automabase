#!/bin/bash
#
# Automabase Local Development Setup
#
# This script sets up the local development environment.
# For daily development, use: bun run dev
#

set -e

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  🚀 Automabase Local Development Setup"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Check prerequisites
echo "📋 Checking prerequisites..."

# Check Bun
if ! command -v bun &> /dev/null; then
    echo "❌ Bun is not installed. Please install it first:"
    echo "   curl -fsSL https://bun.sh/install | bash"
    exit 1
fi
echo "   ✓ Bun $(bun --version)"

# Check Docker
if ! command -v docker &> /dev/null; then
    echo "❌ Docker is not installed. Please install Docker Desktop."
    exit 1
fi
echo "   ✓ Docker $(docker --version | cut -d ' ' -f 3)"

# Check SAM CLI
if ! command -v sam &> /dev/null; then
    echo "❌ AWS SAM CLI is not installed. Please install it:"
    echo "   https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/install-sam-cli.html"
    exit 1
fi
echo "   ✓ SAM CLI $(sam --version | cut -d ' ' -f 4)"

# Install dependencies
echo ""
echo "📦 Installing dependencies..."
bun install

# Create env.json if not exists
if [ ! -f "env.json" ]; then
    echo ""
    echo "⚙️  Creating env.json from template..."
    cp env.json.example env.json
    
    # Generate JWT keys
    echo "🔐 Generating JWT keys..."
    bun run keygen
fi

# Generate local JWT
echo ""
echo "🔑 Generating local JWT..."
bun run jwt:local --accountId acc_local_test_001 --refresh

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  ✅ Setup Complete!"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "  Start development environment:"
echo "    bun run dev"
echo ""
echo "  This will start:"
echo "    - DynamoDB Local:  http://localhost:8000"
echo "    - SAM Lambda:      http://localhost:3001"
echo "    - Dev Gateway:     http://localhost:3000"
echo "    - WebSocket:       ws://localhost:3000"
echo ""
echo "  Other commands:"
echo "    bun run dev:skip-build    Skip building (faster restart)"
echo "    bun run test:e2e          Run E2E tests"
echo "    bun run jwt:local         Refresh JWT token"
echo ""
