#!/bin/bash
echo ""
echo "╔════════════════════════════════════════╗"
echo "║      Campaign Pipeline — Starting      ║"
echo "╚════════════════════════════════════════╝"
echo ""

# Check Node
if ! command -v node &> /dev/null; then
    echo "❌ Node.js not found. Download from https://nodejs.org"
    exit 1
fi

NODE_VER=$(node --version | cut -d. -f1 | tr -d 'v')
if [ "$NODE_VER" -lt "18" ]; then
    echo "❌ Node.js 18+ required (you have $(node --version)). Download from https://nodejs.org"
    exit 1
fi

# Install if needed
if [ ! -d "node_modules" ]; then
    echo "📦 Installing dependencies (one-time, ~30 seconds)…"
    npm install --silent
fi

echo "✓ Node $(node --version)"
echo "✓ Starting API server on :3001 and app on :3000"
echo ""
echo "  → Open http://localhost:3000 in your browser"
echo "  → Press Ctrl+C to stop"
echo ""

npm run dev
