#!/bin/bash
# Script to keep Playwright UI server running and monitor it

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR/../../.." || exit 1

echo "Starting Playwright UI mode (will keep running)..."
echo "Access at: http://127.0.0.1:9323"
echo "Press Ctrl+C to stop"
echo ""

xvfb-run -a npx playwright test --ui --ui-host=127.0.0.1 --ui-port=9323 --config=src/test/e2e/playwright.config.js 2>&1 | while IFS= read -r line; do
  echo "$line"
  if echo "$line" | grep -qiE "(error|failed|crash|exception|protocol)"; then
    echo "⚠️  ERROR: $line" >&2
  fi
done

EXIT_CODE=$?

echo ""
echo "Playwright UI exited with code: $EXIT_CODE"
exit $EXIT_CODE