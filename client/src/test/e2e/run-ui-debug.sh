#!/bin/bash
# Run Playwright UI mode and stream output to the terminal

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR/../../.." || exit 1

echo "Starting Playwright UI mode..."
echo "DISPLAY: ${DISPLAY:-not set}"
echo "UI: http://127.0.0.1:9323"
echo ""

xvfb-run -a npx playwright test --ui --ui-host=127.0.0.1 --ui-port=9323 --config=src/test/e2e/playwright.config.js

EXIT_CODE=$?

echo ""
echo "Playwright exited with code: $EXIT_CODE"