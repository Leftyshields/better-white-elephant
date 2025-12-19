#!/bin/bash
# Wrapper script to run Playwright UI mode with logging

LOG_FILE="/home/brian/docker/.cursor/debug.log"

# #region agent log
echo "{\"location\":\"run-ui-with-logs.sh:6\",\"message\":\"Starting Playwright UI wrapper\",\"data\":{\"timestamp\":$(date +%s000),\"sessionId\":\"debug-session\",\"runId\":\"ui-wrapper\",\"hypothesisId\":\"C\"}}" >> "$LOG_FILE"
# #endregion

# Change to client directory
cd /home/brian/docker/better-white-elephant/client || exit 1

echo "Starting Playwright UI mode..."
echo "DISPLAY: ${DISPLAY:-not set}"
echo "Logging to: $LOG_FILE"
echo "Working directory: $(pwd)"

# Monitor port 9323 in background
(
  while true; do
    if netstat -tlnp 2>/dev/null | grep -q 9323 || ss -tlnp 2>/dev/null | grep -q 9323; then
      # #region agent log
      echo "{\"location\":\"run-ui-with-logs.sh:19\",\"message\":\"Port 9323 is now listening\",\"data\":{\"timestamp\":$(date +%s000),\"sessionId\":\"debug-session\",\"runId\":\"ui-wrapper\",\"hypothesisId\":\"C\"}}" >> "$LOG_FILE"
      # #endregion
      echo "✓ Port 9323 is now listening!"
      break
    fi
    sleep 1
  done
) &
PORT_MONITOR_PID=$!

# Run Playwright with xvfb and capture all output
xvfb-run -a npx playwright test --ui --ui-host=0.0.0.0 --ui-port=9323 --config=src/test/e2e/playwright.config.js 2>&1 | while IFS= read -r line; do
  echo "$line" | tee -a "$LOG_FILE"
  # #region agent log
  echo "{\"location\":\"run-ui-with-logs.sh:34\",\"message\":\"Playwright output\",\"data\":{\"output\":\"$line\",\"timestamp\":$(date +%s000),\"sessionId\":\"debug-session\",\"runId\":\"ui-wrapper\",\"hypothesisId\":\"D\"}}" >> "$LOG_FILE"
  # #endregion
  if echo "$line" | grep -q "Listening on"; then
    # #region agent log
    echo "{\"location\":\"run-ui-with-logs.sh:38\",\"message\":\"Server started message detected\",\"data\":{\"timestamp\":$(date +%s000),\"sessionId\":\"debug-session\",\"runId\":\"ui-wrapper\",\"hypothesisId\":\"D\"}}" >> "$LOG_FILE"
    # #endregion
    echo "✓ Server started! Waiting 10 seconds to verify it stays up..."
    sleep 10
    if ss -tlnp 2>/dev/null | grep -q 9323 || netstat -tlnp 2>/dev/null | grep -q 9323; then
      # #region agent log
      echo "{\"location\":\"run-ui-with-logs.sh:43\",\"message\":\"Port still listening after 10s\",\"data\":{\"timestamp\":$(date +%s000),\"sessionId\":\"debug-session\",\"runId\":\"ui-wrapper\",\"hypothesisId\":\"D\"}}" >> "$LOG_FILE"
      # #endregion
      echo "✓ Port 9323 still listening - server is stable!"
    else
      # #region agent log
      echo "{\"location\":\"run-ui-with-logs.sh:47\",\"message\":\"Port stopped listening after 10s - server crashed\",\"data\":{\"timestamp\":$(date +%s000),\"sessionId\":\"debug-session\",\"runId\":\"ui-wrapper\",\"hypothesisId\":\"D\"}}" >> "$LOG_FILE"
      # #endregion
      echo "✗ Port 9323 stopped listening - server may have crashed!"
    fi
  fi
  if echo "$line" | grep -qiE "(error|failed|crash|exception)"; then
    # #region agent log
    echo "{\"location\":\"run-ui-with-logs.sh:52\",\"message\":\"Error detected in output\",\"data\":{\"error\":\"$line\",\"timestamp\":$(date +%s000),\"sessionId\":\"debug-session\",\"runId\":\"ui-wrapper\",\"hypothesisId\":\"D\"}}" >> "$LOG_FILE"
    # #endregion
    echo "⚠ ERROR DETECTED: $line"
  fi
done &
PLAYWRIGHT_PID=$!

# Keep monitoring
kill $PORT_MONITOR_PID 2>/dev/null
wait $PLAYWRIGHT_PID
EXIT_CODE=$?

# #region agent log
echo "{\"location\":\"run-ui-with-logs.sh:62\",\"message\":\"Playwright process exited\",\"data\":{\"exitCode\":$EXIT_CODE,\"timestamp\":$(date +%s000),\"sessionId\":\"debug-session\",\"runId\":\"ui-wrapper\",\"hypothesisId\":\"D\"}}" >> "$LOG_FILE"
# #endregion
echo "Playwright process exited with code: $EXIT_CODE"
