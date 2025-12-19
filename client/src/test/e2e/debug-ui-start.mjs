/**
 * Debug script to test Playwright UI mode startup
 */
import { spawn } from 'child_process';

// #region agent log
fetch('http://localhost:7243/ingest/aa8b9df8-f732-4ee4-afb1-02470529209e',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'debug-ui-start.mjs:6',message:'Starting Playwright UI with debug',data:{env:process.env.DISPLAY,hasXvfb:true},timestamp:Date.now(),sessionId:'debug-session',runId:'ui-start',hypothesisId:'B'})}).catch(()=>{});
// #endregion

console.log('Starting Playwright UI mode with debugging...');
console.log('DISPLAY:', process.env.DISPLAY || 'not set');

const proc = spawn('xvfb-run', ['-a', 'npx', 'playwright', 'test', '--ui', '--config=src/test/e2e/playwright.config.js'], {
  stdio: 'inherit',
  env: {
    ...process.env,
    DEBUG: 'pw:browser,pw:protocol',
    PLAYWRIGHT_UI_HOST: '0.0.0.0',
    PLAYWRIGHT_UI_PORT: '9323',
  }
});

proc.on('error', (err) => {
  // #region agent log
  fetch('http://localhost:7243/ingest/aa8b9df8-f732-4ee4-afb1-02470529209e',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'debug-ui-start.mjs:22',message:'Process error',data:{error:err.message,code:err.code},timestamp:Date.now(),sessionId:'debug-session',runId:'ui-start',hypothesisId:'B'})}).catch(()=>{});
  // #endregion
  console.error('Process error:', err);
});

proc.on('exit', (code, signal) => {
  // #region agent log
  fetch('http://localhost:7243/ingest/aa8b9df8-f732-4ee4-afb1-02470529209e',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'debug-ui-start.mjs:28',message:'Process exited',data:{code,signal},timestamp:Date.now(),sessionId:'debug-session',runId:'ui-start',hypothesisId:'B'})}).catch(()=>{});
  // #endregion
  console.log(`Process exited: code=${code}, signal=${signal}`);
});
