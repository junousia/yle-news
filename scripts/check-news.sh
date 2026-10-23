#!/bin/bash
# yle-news - News checker wrapper

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
cd "$PROJECT_DIR"

# Only compile if JS file doesn't exist or TS is newer
if [ ! -f "scripts/check-news.js" ] || [ "src/check-news.ts" -nt "scripts/check-news.js" ]; then
    echo "🔄 Compiling TypeScript..."
    npx tsc || {
        echo "❌ Compilation failed"
        exit 1
    }
fi

# Run the compiled JS, passing all arguments
node scripts/check-news.js "$@"
