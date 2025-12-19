/**
 * E2E test utilities for simulation mode
 * Provides Playwright helpers for testing with sim=true
 */

/**
 * Navigate to party with simulation mode enabled
 */
export async function navigateToSimMode(page, partyId) {
  await page.goto(`/party/${partyId}?sim=true`);
  // Wait for sim controls to appear
  await page.waitForSelector('text=SIM TOOLS', { timeout: 10000 });
}

/**
 * Wait for socket connection in sim mode
 */
export async function waitForSocketConnection(page) {
  // Wait for "Socket not connected" to disappear or check connection status
  await page.waitForFunction(() => {
    const socketStatus = document.querySelector('text=/Socket not connected/i');
    return !socketStatus || socketStatus === null;
  }, { timeout: 10000 }).catch(() => {
    // Socket might already be connected or status not shown
  });
}

/**
 * Add bots via simulation controls
 */
export async function addBots(page, count = 5) {
  // Find bot count input
  const botInput = await page.locator('input[type="number"]').first();
  await botInput.fill(count.toString());
  
  // Click add bots button
  const addBotsButton = page.getByRole('button', { name: /add bots/i });
  await addBotsButton.click();
  
  // Wait for success message or bot count to update
  await page.waitForSelector(`text=${count}`, { timeout: 5000 }).catch(() => {});
}

/**
 * Enable auto-play
 */
export async function enableAutoPlay(page) {
  const autoPlayToggle = page.getByLabel(/auto-play/i);
  await autoPlayToggle.click();
  await page.waitForTimeout(500); // Wait for toggle to register
}

/**
 * Wait for game to start
 */
export async function waitForGameStart(page) {
  // Wait for game phase to be ACTIVE
  await page.waitForFunction(() => {
    // Check for game active indicators
    const gameActive = document.querySelector('text=/turn/i') || 
                      document.querySelector('text=/picking/i') ||
                      document.querySelector('text=/stealing/i');
    return gameActive !== null;
  }, { timeout: 30000 });
}

/**
 * Force bot move via simulation controls
 */
export async function forceBotMove(page) {
  const forceMoveButton = page.getByRole('button', { name: /force bot move/i });
  if (await forceMoveButton.isVisible()) {
    await forceMoveButton.click();
    await page.waitForTimeout(1000); // Wait for move to process
  }
}

/**
 * Get audit trail entries
 */
export async function getAuditTrailEntries(page) {
  // Expand audit trail if collapsed
  const auditTrailButton = page.getByText(/AUDIT TRAIL/i);
  if (await auditTrailButton.isVisible()) {
    await auditTrailButton.click();
    await page.waitForTimeout(500);
  }
  
  // Get all audit log entries
  const entries = await page.locator('[data-testid="audit-entry"]').all();
  return Promise.all(entries.map(async (entry) => {
    return {
      type: await entry.getAttribute('data-event-type'),
      message: await entry.textContent(),
      timestamp: await entry.getAttribute('data-timestamp'),
    };
  }));
}

/**
 * Copy audit trail to clipboard
 */
export async function copyAuditTrail(page) {
  const copyButton = page.getByRole('button', { name: /copy/i });
  await copyButton.click();
  await page.waitForTimeout(500);
  
  // Get clipboard content
  return await page.evaluate(async () => {
    return await navigator.clipboard.readText();
  });
}

/**
 * Reset game via simulation controls
 */
export async function resetGame(page) {
  const resetButton = page.getByRole('button', { name: /reset game/i });
  await resetButton.click();
  
  // Confirm reset if dialog appears
  page.on('dialog', dialog => dialog.accept());
  
  await page.waitForTimeout(2000); // Wait for reset to complete
}

/**
 * Wait for game to finish
 */
export async function waitForGameFinish(page) {
  await page.waitForSelector('text=/game over/i', { timeout: 60000 });
}

/**
 * Get current game state from window object (if exposed)
 */
export async function getGameState(page) {
  return await page.evaluate(() => {
    if (window.__GAME_STATE__) {
      return window.__GAME_STATE__.gameState || window.__GAME_STATE__;
    }
    return null;
  });
}

/**
 * Wait for specific audit trail entry
 */
export async function waitForAuditEntry(page, expectedText, timeout = 10000) {
  await page.waitForSelector(`text=${expectedText}`, { timeout });
}

/**
 * Get gift ownership from page
 */
export async function getGiftOwnership(page) {
  return await page.evaluate(() => {
    const ownership = new Map();
    
    // Get from game state if available
    if (window.__GAME_STATE__ && window.__GAME_STATE__.gameState) {
      const gameState = window.__GAME_STATE__.gameState;
      const unwrappedGifts = gameState.unwrappedGifts;
      
      if (unwrappedGifts) {
        const giftsMap = unwrappedGifts instanceof Map 
          ? unwrappedGifts 
          : new Map(unwrappedGifts);
        
        giftsMap.forEach((giftData, giftId) => {
          if (giftData.ownerId && !giftData.isWrapped) {
            ownership.set(giftId, giftData.ownerId);
          }
        });
      }
    }
    
    return Object.fromEntries(ownership);
  });
}

/**
 * Check if game is in boomerang phase
 */
export async function isBoomerangPhase(page) {
  const gameState = await getGameState(page);
  if (!gameState) return false;
  
  const turnOrderLength = gameState.turnOrder?.length || 0;
  const currentTurnIndex = gameState.currentTurnIndex || 0;
  
  return currentTurnIndex >= turnOrderLength;
}

/**
 * Get current player ID
 */
export async function getCurrentPlayer(page) {
  const gameState = await getGameState(page);
  return gameState?.currentPlayerId || null;
}

/**
 * Wait for specific audit trail entry
 */
export async function waitForAuditEntry(page, expectedText, timeout = 10000) {
  await page.waitForSelector(`text=${expectedText}`, { timeout });
}
