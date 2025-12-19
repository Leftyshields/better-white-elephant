/**
 * Assertion helpers for E2E tests
 * Provides reusable assertion functions for validating perfect gameplay outcomes
 */

import { expect } from '@playwright/test';
import { getAuditTrailEntries } from './simModeHelpers';
import { validateAllGiftsOwned, validateNoDuplicates, getGameState } from './gameHelpers';

/**
 * Assert game completed successfully
 * @param {Page} page - Playwright page object
 */
export async function assertGameCompleted(page) {
  // Check for game over screen
  await expect(page.getByText(/game over/i)).toBeVisible({ timeout: 10000 });
  
  // Verify game phase is ENDED
  const gameState = await getGameState(page);
  if (gameState) {
    expect(gameState.phase === 'ENDED' || gameState.phase === 'FINISHED').toBeTruthy();
  }
  
  // Check for game over indicators in DOM
  const gameOverText = await page.textContent('body');
  expect(gameOverText).toMatch(/game over/i);
}

/**
 * Assert no errors in audit trail
 * @param {Page} page - Playwright page object
 */
export async function assertNoErrors(page) {
  // Expand audit trail if needed
  const auditButton = page.getByText(/AUDIT TRAIL/i);
  if (await auditButton.isVisible()) {
    const buttonState = await auditButton.evaluate((el) => {
      const parent = el.closest('button');
      return parent?.getAttribute('aria-expanded') !== 'true';
    });
    
    if (buttonState) {
      await auditButton.click();
      await page.waitForTimeout(500);
    }
  }
  
  // Get audit trail entries
  const entries = await getAuditTrailEntries(page);
  
  // Check for ERROR entries
  const errorEntries = entries.filter(e => 
    e.type === 'ERROR' || 
    (e.message && e.message.toLowerCase().includes('error'))
  );
  
  expect(errorEntries.length).toBe(0);
  
  // Also check for WARNING entries that indicate problems
  const criticalWarnings = entries.filter(e => 
    e.type === 'WARNING' && 
    e.message && (
      e.message.includes('duplicate') ||
      e.message.includes('invalid') ||
      e.message.includes('violation')
    )
  );
  
  expect(criticalWarnings.length).toBe(0);
}

/**
 * Assert all gifts are owned
 * @param {Page} page - Playwright page object
 */
export async function assertAllGiftsOwned(page) {
  const validation = await validateAllGiftsOwned(page);
  
  expect(validation.allOwned).toBeTruthy();
  if (validation.unownedGifts.length > 0) {
    throw new Error(`Unowned gifts found: ${validation.unownedGifts.join(', ')}`);
  }
}

/**
 * Assert no duplicate ownership
 * @param {Page} page - Playwright page object
 */
export async function assertNoDuplicates(page) {
  const validation = await validateNoDuplicates(page);
  
  expect(validation.noDuplicates).toBeTruthy();
  if (validation.duplicateOwners.length > 0) {
    throw new Error(`Duplicate ownership found for players: ${validation.duplicateOwners.join(', ')}`);
  }
}

/**
 * Assert rules were followed
 * @param {Page} page - Playwright page object
 * @param {Object} rulesToCheck - Specific rules to validate
 */
export async function assertRulesFollowed(page, rulesToCheck = {}) {
  const auditEntries = await getAuditTrailEntries(page);
  
  // Check for rule violations in audit trail
  const violations = auditEntries.filter(e => 
    e.message && (
      e.message.includes('violation') ||
      e.message.includes('rule') && e.message.includes('violat')
    )
  );
  
  expect(violations.length).toBe(0);
  
  // Validate specific rules if requested
  if (rulesToCheck.maxSteals) {
    // Check that no gift has more than maxSteals
    const gameState = await getGameState(page);
    if (gameState && gameState.unwrappedGifts) {
      const giftsMap = gameState.unwrappedGifts instanceof Map 
        ? gameState.unwrappedGifts 
        : new Map(gameState.unwrappedGifts);
      
      giftsMap.forEach((giftData) => {
        if (giftData.stealCount > rulesToCheck.maxSteals) {
          throw new Error(`Gift has ${giftData.stealCount} steals, exceeds max of ${rulesToCheck.maxSteals}`);
        }
      });
    }
  }
}

/**
 * Assert game state is consistent
 * @param {Page} page - Playwright page object
 */
export async function assertStateConsistent(page) {
  // Check all gifts owned
  await assertAllGiftsOwned(page);
  
  // Check no duplicates
  await assertNoDuplicates(page);
  
  // Get game state
  const gameState = await getGameState(page);
  
  if (gameState) {
    // Verify turn order consistency
    if (gameState.turnOrder && gameState.turnQueue) {
      expect(gameState.turnQueue.length).toBeGreaterThanOrEqual(gameState.turnOrder.length);
    }
    
    // Verify current player is in turn queue
    if (gameState.currentPlayerId && gameState.turnQueue) {
      expect(gameState.turnQueue).toContain(gameState.currentPlayerId);
    }
    
    // Verify unwrapped gifts have owners
    if (gameState.unwrappedGifts) {
      const giftsMap = gameState.unwrappedGifts instanceof Map 
        ? gameState.unwrappedGifts 
        : new Map(gameState.unwrappedGifts);
      
      giftsMap.forEach((giftData, giftId) => {
        if (!giftData.isWrapped && !giftData.ownerId) {
          throw new Error(`Gift ${giftId} is unwrapped but has no owner`);
        }
      });
    }
  }
}

/**
 * Assert audit trail contains expected events
 * @param {Page} page - Playwright page object
 * @param {Array<string>} expectedEventTypes - Expected event types
 */
export async function assertAuditTrailContains(page, expectedEventTypes) {
  const entries = await getAuditTrailEntries(page);
  const foundTypes = entries.map(e => e.type || e.eventType).filter(Boolean);
  
  for (const expectedType of expectedEventTypes) {
    expect(foundTypes).toContain(expectedType);
  }
}

/**
 * Assert no warnings in audit trail (or only expected ones)
 * @param {Page} page - Playwright page object
 * @param {Array<string>} allowedWarningPatterns - Warning message patterns to ignore
 */
export async function assertNoUnexpectedWarnings(page, allowedWarningPatterns = []) {
  const entries = await getAuditTrailEntries(page);
  const warnings = entries.filter(e => e.type === 'WARNING' || e.eventType === 'WARNING');
  
  const unexpectedWarnings = warnings.filter(w => {
    if (!w.message) return true;
    
    // Check if this warning matches any allowed pattern
    return !allowedWarningPatterns.some(pattern => {
      if (typeof pattern === 'string') {
        return w.message.includes(pattern);
      }
      if (pattern instanceof RegExp) {
        return pattern.test(w.message);
      }
      return false;
    });
  });
  
  expect(unexpectedWarnings.length).toBe(0);
}

/**
 * Assert turn progression is correct
 * @param {Page} page - Playwright page object
 * @param {number} expectedTurnIndex - Expected current turn index
 */
export async function assertTurnProgression(page, expectedTurnIndex) {
  const gameState = await getGameState(page);
  
  if (gameState) {
    expect(gameState.currentTurnIndex).toBe(expectedTurnIndex);
  }
}

/**
 * Assert game phase is correct
 * @param {Page} page - Playwright page object
 * @param {string} expectedPhase - Expected phase
 */
export async function assertGamePhase(page, expectedPhase) {
  const gameState = await getGameState(page);
  
  if (gameState) {
    expect(gameState.phase).toBe(expectedPhase);
  } else {
    // Fallback to DOM checking
    const bodyText = await page.textContent('body');
    if (expectedPhase === 'ENDED') {
      expect(bodyText).toMatch(/game over/i);
    }
  }
}
