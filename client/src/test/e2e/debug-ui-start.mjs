/**
 * Debug script to test Playwright UI mode startup
 */
import { spawn } from 'child_process';

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
  console.error('Process error:', err);
});

proc.on('exit', (code, signal) => {
  console.log(`Process exited: code=${code}, signal=${signal}`);
});
