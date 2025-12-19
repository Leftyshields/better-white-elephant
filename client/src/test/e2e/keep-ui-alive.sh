#!/bin/bash
# Script to keep Playwright UI server running and monitor it

LOG_FILE="/home/brian/docker/.cursor/debug.log"
cd /home/brian/docker/better-white-elephant/client || exit 1

echo "Starting Playwright UI mode (will keep running)..."
echo "Access at: http://sandbox-mac-mini.local:9323"
echo "Press Ctrl+C to stop"
echo ""

# #region agent log
echo "{\"location\":\"keep-ui-alive.sh:10\",\"message\":\"Starting persistent Playwright UI\",\"data\":{\"timestamp\":$(date +%s000),\"sessionId\":\"debug-session\",\"runId\":\"keep-alive\",\"hypothesisId\":\"F\"}}" >> "$LOG_FILE"
# #endregion

# Run Playwright and capture exit code
xvfb-run -a npx playwright test --ui --ui-host=0.0.0.0 --ui-port=9323 --config=src/test/e2e/playwright.config.js 2>&1 | while IFS= read -r line; do
  echo "$line"
  # #region agent log
  echo "{\"location\":\"keep-ui-alive.sh:16\",\"message\":\"Playwright output\",\"data\":{\"line\":\"${line//\"/\\\"}\",\"timestamp\":$(date +%s000),\"sessionId\":\"debug-session\",\"runId\":\"keep-alive\",\"hypothesisId\":\"F\"}}" >> "$LOG_FILE"
  # #endregion
  
  if echo "$line" | grep -qiE "(error|failed|crash|exception|protocol)"; then
    # #region agent log
    echo "{\"location\":\"keep-ui-alive.sh:20\",\"message\":\"ERROR DETECTED\",\"data\":{\"error\":\"${line//\"/\\\"}\",\"timestamp\":$(date +%s000),\"sessionId\":\"debug-session\",\"runId\":\"keep-alive\",\"hypothesisId\":\"F\"}}" >> "$LOG_FILE"
    # #endregion
    echo "⚠️  ERROR: $line" >&2
  fi
done

EXIT_CODE=$?

# #region agent log
echo "{\"location\":\"keep-ui-alive.sh:27\",\"message\":\"Playwright UI exited\",\"data\":{\"exitCode\":$EXIT_CODE,\"timestamp\":$(date +%s000),\"sessionId\":\"debug-session\",\"runId\":\"keep-alive\",\"hypothesisId\":\"F\"}}" >> "$LOG_FILE"
# #endregion

echo ""
echo "Playwright UI exited with code: $EXIT_CODE"
exit $EXIT_CODE
