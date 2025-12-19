/**
 * Parse Playwright test results and generate a summary report
 */
import { readdir, readFile } from 'fs/promises';
import { join } from 'path';

const TEST_RESULTS_DIR = join(process.cwd(), 'test-results');

async function parseTestResults() {
  const results = {
    total: 0,
    failures: [],
    commonErrors: {},
    summary: {
      partyNotFound: 0,
      timeouts: 0,
      other: 0,
    }
  };

  try {
    const dirs = await readdir(TEST_RESULTS_DIR, { withFileTypes: true });
    const testDirs = dirs.filter(d => d.isDirectory());

    results.total = testDirs.length;

    for (const dir of testDirs) {
      const testDir = join(TEST_RESULTS_DIR, dir.name);
      const errorFile = join(testDir, 'error-context.md');
      
      try {
        const errorContent = await readFile(errorFile, 'utf-8');
        
        // Parse test name from directory name
        const testName = dir.name
          .replace(/^(common-behaviors|edge-cases|happy-path|rule-compliance|state-integrity|game-simulation)-/, '')
          .replace(/-chromium$/, '')
          .replace(/-/g, ' ');
        
        // Detect error type
        let errorType = 'other';
        if (errorContent.includes('Party Not Found')) {
          errorType = 'partyNotFound';
          results.summary.partyNotFound++;
        } else if (errorContent.includes('timeout') || errorContent.includes('Timeout')) {
          errorType = 'timeout';
          results.summary.timeouts++;
        } else {
          results.summary.other++;
        }

        // Extract key error details
        const errorDetails = {
          testName,
          errorType,
          errorContent: errorContent.substring(0, 500), // First 500 chars
        };

        results.failures.push(errorDetails);

        // Count error types
        if (!results.commonErrors[errorType]) {
          results.commonErrors[errorType] = [];
        }
        results.commonErrors[errorType].push(testName);
      } catch (err) {
        console.error(`Error reading ${errorFile}:`, err.message);
      }
    }

    return results;
  } catch (err) {
    console.error(`Error reading test-results directory:`, err.message);
    return results;
  }
}

// Main execution
const results = await parseTestResults();

console.log('\n' + '='.repeat(80));
console.log('PLAYWRIGHT TEST RESULTS SUMMARY');
console.log('='.repeat(80));
console.log(`\nTotal Failed Tests: ${results.total}`);
console.log(`\nError Breakdown:`);
console.log(`  - Party Not Found: ${results.summary.partyNotFound}`);
console.log(`  - Timeouts: ${results.summary.timeouts}`);
console.log(`  - Other: ${results.summary.other}`);

if (results.summary.partyNotFound > 0) {
  console.log(`\n⚠️  CRITICAL ISSUE: ${results.summary.partyNotFound} tests failed due to "Party Not Found"`);
  console.log('\nRoot Cause: Tests are trying to navigate to parties that don\'t exist.');
  console.log('Solution: Tests need to create parties first before navigating to them.\n');
  
  console.log('Affected Tests:');
  results.commonErrors.partyNotFound.slice(0, 10).forEach((test, i) => {
    console.log(`  ${i + 1}. ${test}`);
  });
  if (results.commonErrors.partyNotFound.length > 10) {
    console.log(`  ... and ${results.commonErrors.partyNotFound.length - 10} more`);
  }
}

if (results.summary.timeouts > 0) {
  console.log(`\n⏱️  TIMEOUT ISSUES: ${results.summary.timeouts} tests failed due to timeouts`);
  console.log('\nAffected Tests:');
  results.commonErrors.timeout?.slice(0, 5).forEach((test, i) => {
    console.log(`  ${i + 1}. ${test}`);
  });
}

console.log('\n' + '='.repeat(80));
console.log('RECOMMENDATIONS:');
console.log('='.repeat(80));
console.log('1. Add party creation logic to test setup (beforeEach hook)');
console.log('2. Use API calls or helper functions to create test parties');
console.log('3. Ensure parties exist before navigating to them');
console.log('4. Consider using a test database or mock API for E2E tests');
console.log('='.repeat(80) + '\n');
