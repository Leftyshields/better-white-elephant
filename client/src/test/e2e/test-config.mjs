/**
 * Test script to verify Playwright config and UI mode setup
 */
import config from '../e2e/playwright.config.js';
// #region agent log
fetch('http://localhost:7243/ingest/aa8b9df8-f732-4ee4-afb1-02470529209e',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'test-config.mjs:7',message:'Config loaded',data:{hasUI:!!config.ui,uiHost:config.ui?.host,uiPort:config.ui?.port,playwrightVersion:'1.57.0'},timestamp:Date.now(),sessionId:'debug-session',runId:'config-check',hypothesisId:'A'})}).catch(()=>{});
// #endregion

console.log('Playwright Config Test');
console.log('UI Config:', JSON.stringify(config.ui, null, 2));
console.log('Config valid:', !!config);
