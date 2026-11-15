/**
 * Test script to verify Playwright config and UI mode setup
 */
import config from '../e2e/playwright.config.js';

console.log('Playwright Config Test');
console.log('UI Config:', JSON.stringify(config.ui, null, 2));
console.log('Config valid:', !!config);
