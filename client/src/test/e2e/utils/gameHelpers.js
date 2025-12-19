/**
 * Game helper utilities for E2E tests
 * Provides functions for game setup, state validation, and game flow management
 */

/**
 * Start a game with specified number of bots
 * @param {Page} page - Playwright page object
 * @param {string} partyId - Party ID to start game in
 * @param {number} botCount - Number of bots to add
 * @param {Object} options - Additional options (boomerang, maxSteals, etc.)
 * @returns {Promise<void>}
 */
export async function startGameWithBots(page, partyId, botCount, options = {}) {
  // Navigate with sim mode
  await page.goto(`/party/${partyId}?sim=true`);
  
  // Wait for sim controls
  await page.waitForSelector('text=SIM TOOLS', { timeout: 10000 });
  
  // Wait for socket connection
  await page.waitForFunction(() => {
    const socketStatus = document.querySelector('text=/Socket not connected/i');
    return !socketStatus || socketStatus === null;
  }, { timeout: 10000 }).catch(() => {
    // Socket might already be connected
  });
  
  // Add bots
  const botInput = await page.locator('input[type="number"]').first();
  await botInput.fill(botCount.toString());
  
  const addBotsButton = page.getByRole('button', { name: /add bots/i });
  await addBotsButton.click();
  
  // Wait for bots to be added
  await page.waitForTimeout(2000);
  
  // If game needs to be started manually (not auto-started)
  // Look for "Start Game" button and click if present
  const startButton = page.getByRole('button', { name: /start game/i });
  if (await startButton.isVisible({ timeout: 1000 }).catch(() => false)) {
    await startButton.click();
    await page.waitForTimeout(1000);
  }
}

/**
 * Wait for a specific player's turn
 * @param {Page} page - Playwright page object
 * @param {string} playerId - Player ID to wait for (or partial match)
 * @param {number} timeout - Timeout in ms
 * @returns {Promise<void>}
 */
export async function waitForTurn(page, playerId, timeout = 30000) {
  // Wait for player ID to appear in turn indicator
  await page.waitForFunction(
    (pid) => {
      const turnText = document.body.textContent || '';
      // Look for "Waiting for {playerId}" or active player indicators
      return turnText.includes(pid) || 
             turnText.toLowerCase().includes(`waiting for ${pid.toLowerCase()}`);
    },
    playerId,
    { timeout }
  );
}

/**
 * Get current game state from the page
 * @param {Page} page - Playwright page object
 * @returns {Promise<Object>} Current game state
 */
export async function getGameState(page) {
  return await page.evaluate(() => {
    // Try to get game state from window object (if exposed)
    if (window.__GAME_STATE__) {
      return window.__GAME_STATE__.gameState || window.__GAME_STATE__;
    }
    
    // Extract game state from DOM if available
    // Look for data attributes or accessible state
    const gameStateElement = document.querySelector('[data-game-state]');
    if (gameStateElement) {
      try {
        return JSON.parse(gameStateElement.getAttribute('data-game-state'));
      } catch (e) {
        return null;
      }
    }
    
    return null;
  });
}

/**
 * Validate game state matches expected properties
 * @param {Page} page - Playwright page object
 * @param {Object} expectedState - Expected state properties to check
 * @param {number} timeout - Timeout in ms
 * @returns {Promise<boolean>} True if state matches
 */
export async function validateGameState(page, expectedState, timeout = 5000) {
  const startTime = Date.now();
  
  while (Date.now() - startTime < timeout) {
    const currentState = await getGameState(page);
    
    if (!currentState) {
      await page.waitForTimeout(100);
      continue;
    }
    
    const matches = Object.entries(expectedState).every(([key, value]) => {
      return currentState[key] === value;
    });
    
    if (matches) {
      return true;
    }
    
    await page.waitForTimeout(100);
  }
  
  return false;
}

/**
 * Validate all gifts have owners
 * @param {Page} page - Playwright page object
 * @returns {Promise<Object>} Validation result with details
 */
export async function validateAllGiftsOwned(page) {
  return await page.evaluate(() => {
    // Get gift data from the page
    const giftElements = document.querySelectorAll('[data-gift-id]');
    const gifts = [];
    const unownedGifts = [];
    
    giftElements.forEach((el) => {
      const giftId = el.getAttribute('data-gift-id');
      const ownerId = el.getAttribute('data-owner-id');
      const isWrapped = el.getAttribute('data-is-wrapped') === 'true';
      
      if (!isWrapped && !ownerId) {
        unownedGifts.push(giftId);
      }
      
      gifts.push({ giftId, ownerId, isWrapped });
    });
    
    // Also check via game state if available
    if (window.__GAME_STATE__ && window.__GAME_STATE__.gameState) {
      const gameState = window.__GAME_STATE__.gameState;
      const unwrappedGifts = gameState.unwrappedGifts;
      
      if (unwrappedGifts) {
        const giftsMap = unwrappedGifts instanceof Map 
          ? unwrappedGifts 
          : new Map(unwrappedGifts);
        
        giftsMap.forEach((giftData, giftId) => {
          if (!giftData.ownerId) {
            unownedGifts.push(giftId);
          }
        });
      }
    }
    
    return {
      allOwned: unownedGifts.length === 0,
      unownedGifts: [...new Set(unownedGifts)],
      totalGifts: gifts.length,
      ownedGifts: gifts.filter(g => !g.isWrapped && g.ownerId).length,
    };
  });
}

/**
 * Validate no duplicate ownership (each player owns at most one gift)
 * @param {Page} page - Playwright page object
 * @returns {Promise<Object>} Validation result with duplicates
 */
export async function validateNoDuplicates(page) {
  return await page.evaluate(() => {
    const ownerCounts = new Map();
    const duplicates = [];
    
    // Check via game state
    if (window.__GAME_STATE__ && window.__GAME_STATE__.gameState) {
      const gameState = window.__GAME_STATE__.gameState;
      const unwrappedGifts = gameState.unwrappedGifts;
      
      if (unwrappedGifts) {
        const giftsMap = unwrappedGifts instanceof Map 
          ? unwrappedGifts 
          : new Map(unwrappedGifts);
        
        giftsMap.forEach((giftData, giftId) => {
          if (giftData.ownerId) {
            const count = ownerCounts.get(giftData.ownerId) || 0;
            ownerCounts.set(giftData.ownerId, count + 1);
            
            if (count === 1) {
              // Second gift for this owner - duplicate found
              duplicates.push(giftData.ownerId);
            }
          }
        });
      }
    }
    
    // Also check DOM
    const giftElements = document.querySelectorAll('[data-gift-id][data-owner-id]');
    giftElements.forEach((el) => {
      const ownerId = el.getAttribute('data-owner-id');
      const isWrapped = el.getAttribute('data-is-wrapped') === 'true';
      
      if (ownerId && !isWrapped) {
        const count = ownerCounts.get(ownerId) || 0;
        ownerCounts.set(ownerId, count + 1);
        
        if (count === 1) {
          duplicates.push(ownerId);
        }
      }
    });
    
    return {
      noDuplicates: duplicates.length === 0,
      duplicateOwners: [...new Set(duplicates)],
      ownershipCounts: Object.fromEntries(ownerCounts),
    };
  });
}

/**
 * Wait for game phase
 * @param {Page} page - Playwright page object
 * @param {string} phase - Expected phase (ACTIVE, ENDED, LOBBY)
 * @param {number} timeout - Timeout in ms
 * @returns {Promise<void>}
 */
export async function waitForGamePhase(page, phase, timeout = 30000) {
  await page.waitForFunction(
    (expectedPhase) => {
      // Check game state
      if (window.__GAME_STATE__ && window.__GAME_STATE__.gameState) {
        return window.__GAME_STATE__.gameState.phase === expectedPhase;
      }
      
      // Check DOM indicators
      const bodyText = document.body.textContent || '';
      if (expectedPhase === 'ENDED') {
        return bodyText.includes('Game Over') || bodyText.includes('GAME OVER');
      }
      if (expectedPhase === 'ACTIVE') {
        return bodyText.includes('turn') || bodyText.includes('Turn');
      }
      if (expectedPhase === 'LOBBY') {
        return bodyText.includes('Ready to Start') || bodyText.includes('Setup Progress');
      }
      
      return false;
    },
    phase,
    { timeout }
  );
}

/**
 * Get current player count from the page
 * @param {Page} page - Playwright page object
 * @returns {Promise<number>} Number of participants
 */
export async function getPlayerCount(page) {
  return await page.evaluate(() => {
    // Try to get from participants text
    const participantsText = document.body.textContent?.match(/Participants: (\d+)/i);
    if (participantsText) {
      return parseInt(participantsText[1], 10);
    }
    
    // Try game state
    if (window.__GAME_STATE__ && window.__GAME_STATE__.gameState) {
      return window.__GAME_STATE__.gameState.turnOrder?.length || 0;
    }
    
    return 0;
  });
}
