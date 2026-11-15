#!/bin/bash
# Wrapper script to run Playwright UI mode with console logging

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR/../../.." || exit 1

echo "Starting Playwright UI mode..."
echo "DISPLAY: ${DISPLAY:-not set}"
echo "Working directory: $(pwd)"
echo "UI: http://127.0.0.1:9323"
echo ""

PORT_MONITOR_PID=""
(
  while true; do
    if netstat -tlnp 2>/dev/null | grep -q 9323 || ss -tlnp 2>/dev/null | grep -q 9323; then
      echo "✓ Port 9323 is now listening!"
      break
    fi
    sleep 1
  done
) &
PORT_MONITOR_PID=$!

xvfb-run -a npx playwright test --ui --ui-host=127.0.0.1 --ui-port=9323 --config=src/test/e2e/playwright.config.js 2>&1 | while IFS= read -r line; do
  echo "$line"
  if echo "$line" | grep -q "Listening on"; then
    echo "✓ Server started! Waiting 10 seconds to verify it stays up..."
    sleep 10
    if ss -tlnp 2>/dev/null | grep -q 9323 || netstat -tlnp 2>/dev/null | grep -q 9323; then
      echo "✓ Port 9323 still listening - server is stable!"
    else
      echo "✗ Port 9323 stopped listening - server may have crashed!"
    fi
  fi
  if echo "$line" | grep -qiE "(error|failed|crash|exception)"; then
    echo "⚠ ERROR DETECTED: $line"
  fi
done &
PLAYWRIGHT_PID=$!

kill $PORT_MONITOR_PID 2>/dev/null
wait $PLAYWRIGHT_PID
EXIT_CODE=$?

echo "Playwright process exited with code: $EXIT_CODE"