#!/bin/bash
# Simplified debug script to run Playwright UI mode and capture all output

LOG_FILE="/home/brian/docker/.cursor/debug.log"
cd /home/brian/docker/better-white-elephant/client || exit 1

echo "Starting Playwright UI mode with full output capture..."
echo "DISPLAY: ${DISPLAY:-not set}"
echo "Logging to: $LOG_FILE"
echo ""
echo "=== Starting Playwright ==="
echo ""

# #region agent log
echo "{\"location\":\"run-ui-debug.sh:12\",\"message\":\"Starting Playwright UI\",\"data\":{\"timestamp\":$(date +%s000),\"sessionId\":\"debug-session\",\"runId\":\"ui-debug\",\"hypothesisId\":\"E\"}}" >> "$LOG_FILE"
# #endregion

# Run Playwright in foreground to see all output
xvfb-run -a npx playwright test --ui --ui-host=0.0.0.0 --ui-port=9323 --config=src/test/e2e/playwright.config.js 2>&1 | tee >(
  while IFS= read -r line; do
    # Log every line
    # #region agent log
    echo "{\"location\":\"run-ui-debug.sh:19\",\"message\":\"Playwright output\",\"data\":{\"line\":\"${line//\"/\\\"}\",\"timestamp\":$(date +%s000),\"sessionId\":\"debug-session\",\"runId\":\"ui-debug\",\"hypothesisId\":\"E\"}}" >> "$LOG_FILE"
    # #endregion
  done
)

EXIT_CODE=${PIPESTATUS[0]}

# #region agent log
echo "{\"location\":\"run-ui-debug.sh:26\",\"message\":\"Playwright exited\",\"data\":{\"exitCode\":$EXIT_CODE,\"timestamp\":$(date +%s000),\"sessionId\":\"debug-session\",\"runId\":\"ui-debug\",\"hypothesisId\":\"E\"}}" >> "$LOG_FILE"
# #endregion

echo ""
echo "=== Playwright exited with code: $EXIT_CODE ==="
