/**
 * Game History Validator
 * 
 * Validates game history by replaying all moves and checking for rule violations.
 * Exposed on window object for console testing.
 */

/**
 * Validates a game history by replaying all moves
 * @param {Array} history - Array of game history events
 * @param {Object} options - Validation options
 * @param {Object} options.gifts - Map of giftId -> gift object (for name resolution)
 * @param {Object} options.userNames - Map of playerId -> player name (for name resolution)
 * @param {Number} options.maxSteals - Maximum steals before gift locks (default: 3)
 * @param {Boolean} options.allowBoomerangDoubleDip - Allow double-dip in boomerang phase (default: false)
 * @param {Boolean} options.throwOnError - Throw errors immediately (default: true for console testing)
 * @returns {Object} { valid: boolean, errors: Array<string>, warnings: Array<string> }
 */
export function validateGameHistory(history, options = {}) {
  const {
    gifts = {},
    userNames = {},
    maxSteals = 3,
    allowBoomerangDoubleDip = false,
    throwOnError = true,
  } = options;

  const errors = [];
  const warnings = [];

  // Helper functions for name resolution
  const getPlayerName = (playerId) => {
    if (!playerId) return 'Unknown';
    return userNames[playerId] || playerId.slice(0, 8);
  };

  const getGiftName = (giftId) => {
    if (!giftId) return 'Unknown Gift';
    const gift = gifts[giftId];
    return gift?.title || giftId.slice(0, 8);
  };

  // State tracking
  const playerStatus = new Map(); // { [playerId]: 'HAS_GIFT' | 'WAITING' }
  const giftStatus = new Map(); // { [giftId]: { owner: playerId | null, steals: number, locked: boolean } }
  let lastMove = null; // { actor: playerId, victim: playerId, giftId }
  let currentVictim = null; // playerId | null

  // Initialize all players as WAITING
  // We'll discover players as we process history
  const discoveredPlayers = new Set();
  const discoveredGifts = new Set();

  // Process each event in history
  history.forEach((event, eventIndex) => {
    const { type, playerId, giftId, previousOwnerId, exchangedGiftId, stealCount, isFrozen, timestamp } = event;
    
    // Track discovered players and gifts
    if (playerId) discoveredPlayers.add(playerId);
    if (giftId) discoveredGifts.add(giftId);
    if (previousOwnerId) discoveredPlayers.add(previousOwnerId);

    // Initialize player status if not seen before
    if (playerId && !playerStatus.has(playerId)) {
      playerStatus.set(playerId, 'WAITING');
    }
    if (previousOwnerId && !playerStatus.has(previousOwnerId)) {
      playerStatus.set(previousOwnerId, 'WAITING');
    }

    // Initialize gift status if not seen before
    if (giftId && !giftStatus.has(giftId)) {
      giftStatus.set(giftId, { owner: null, steals: 0, locked: false });
    }
    if (exchangedGiftId && !giftStatus.has(exchangedGiftId)) {
      giftStatus.set(exchangedGiftId, { owner: null, steals: 0, locked: false });
    }

    const eventPrefix = `[Event #${eventIndex + 1}${timestamp ? ` @ ${new Date(timestamp).toLocaleTimeString()}` : ''}]`;
    const actorName = getPlayerName(playerId);
    const giftName = getGiftName(giftId);

    // Rule A: Double Dip Check
    if (type === 'PICK' || type === 'STEAL') {
      const currentStatus = playerStatus.get(playerId);
      if (currentStatus === 'HAS_GIFT') {
        // Exception: If actor is the current victim (steal chain), this is valid
        // Exception: If boomerang double-dip is allowed, this is valid
        const isStealChain = playerId === currentVictim;
        
        if (!isStealChain && !allowBoomerangDoubleDip) {
          const errorMsg = `${eventPrefix} Player ${actorName} took a turn but already held a gift!`;
          errors.push(errorMsg);
          if (throwOnError) {
            throw new Error(errorMsg);
          }
        }
      }
    }

    if (type === 'PICK') {
      // Validate PICK action
      const gift = giftStatus.get(giftId);
      if (!gift) {
        const errorMsg = `${eventPrefix} Gift ${giftName} not found in gift status!`;
        errors.push(errorMsg);
        if (throwOnError) {
          throw new Error(errorMsg);
        }
        return; // Skip state update if gift not found
      }

      // Update state after PICK
      playerStatus.set(playerId, 'HAS_GIFT');
      giftStatus.set(giftId, {
        owner: playerId,
        steals: 0,
        locked: false,
      });
      
      // Clear current victim (turn advances normally after PICK)
      currentVictim = null;
      lastMove = null;

    } else if (type === 'STEAL') {
      // Rule B: Ghost Steal Check
      const gift = giftStatus.get(giftId);
      if (!gift) {
        const errorMsg = `${eventPrefix} Gift ${giftName} not found in gift status!`;
        errors.push(errorMsg);
        if (throwOnError) {
          throw new Error(errorMsg);
        }
        return; // Skip state update if gift not found
      }

      if (gift.owner !== previousOwnerId) {
        const victimName = getPlayerName(previousOwnerId);
        const actualOwnerName = gift.owner ? getPlayerName(gift.owner) : 'nobody';
        const errorMsg = `${eventPrefix} ${actorName} tried to steal ${giftName} from ${victimName}, but ${victimName} didn't have it! (Actual owner: ${actualOwnerName})`;
        errors.push(errorMsg);
        if (throwOnError) {
          throw new Error(errorMsg);
        }
        return; // Skip state update on ghost steal
      }

      // Rule C: Locked Gift Check
      if (gift.locked) {
        const errorMsg = `${eventPrefix} Attempted to steal locked gift ${giftName}!`;
        errors.push(errorMsg);
        if (throwOnError) {
          throw new Error(errorMsg);
        }
        return; // Skip state update on locked gift
      }

      // Rule D: U-Turn Check (Immediate Steal Back)
      if (lastMove && lastMove.victim === playerId && lastMove.giftId === giftId) {
        const victimName = getPlayerName(lastMove.victim);
        const errorMsg = `${eventPrefix} Immediate steal-back detected: ${actorName} stole ${giftName} back from ${victimName}!`;
        errors.push(errorMsg);
        if (throwOnError) {
          throw new Error(errorMsg);
        }
        return; // Skip state update on immediate steal-back
      }

      // Update state after STEAL
      const stealerHadGift = exchangedGiftId !== null && exchangedGiftId !== undefined;
      
      // Update stolen gift
      const newStealCount = (gift.steals || 0) + 1;
      const isNowLocked = newStealCount >= maxSteals;
      
      giftStatus.set(giftId, {
        owner: playerId,
        steals: newStealCount,
        locked: isNowLocked || (isFrozen === true), // Use isFrozen from event if provided
      });

      // Handle gift exchange: if stealer had a gift, transfer it to victim
      if (stealerHadGift && exchangedGiftId) {
        const exchangedGift = giftStatus.get(exchangedGiftId);
        if (exchangedGift) {
          giftStatus.set(exchangedGiftId, {
            owner: previousOwnerId,
            steals: 0, // Reset steal count for exchanged gift
            locked: false,
          });
        } else {
          // Initialize exchanged gift if not seen before
          giftStatus.set(exchangedGiftId, {
            owner: previousOwnerId,
            steals: 0,
            locked: false,
          });
        }
        
        // Update player status: victim now has a gift
        playerStatus.set(previousOwnerId, 'HAS_GIFT');
      } else {
        // Victim lost their gift and doesn't get one back
        playerStatus.set(previousOwnerId, 'WAITING');
      }

      // Update stealer status: they now have the stolen gift
      playerStatus.set(playerId, 'HAS_GIFT');

      // Update tracking variables
      currentVictim = previousOwnerId; // Victim gets next turn (steal chain)
      lastMove = {
        actor: playerId,
        victim: previousOwnerId,
        giftId: giftId,
      };

      // Validate steal count matches expected
      if (stealCount !== undefined && stealCount !== newStealCount) {
        const warningMsg = `${eventPrefix} Steal count mismatch: expected ${newStealCount}, got ${stealCount}`;
        warnings.push(warningMsg);
      }

      // Validate locked status matches expected
      if (isFrozen !== undefined && isFrozen !== isNowLocked) {
        const warningMsg = `${eventPrefix} Locked status mismatch: expected ${isNowLocked}, got ${isFrozen}`;
        warnings.push(warningMsg);
      }
    }
  });

  // Final validation: check for any players with multiple gifts
  const giftOwnership = new Map();
  giftStatus.forEach((gift, giftId) => {
    if (gift.owner) {
      const count = giftOwnership.get(gift.owner) || 0;
      giftOwnership.set(gift.owner, count + 1);
    }
  });

  giftOwnership.forEach((count, playerId) => {
    if (count > 1) {
      const playerName = getPlayerName(playerId);
      const errorMsg = `[Final State] Player ${playerName} has ${count} gifts! (Duplicate ownership detected)`;
      errors.push(errorMsg);
      if (throwOnError) {
        throw new Error(errorMsg);
      }
    }
  });

  // Check if all expected gifts were claimed
  // If gameState is provided, check unwrappedGifts to see total gift count
  let totalExpectedGifts = discoveredGifts.size;
  let totalClaimedGifts = 0;
  
  if (options.gameState) {
    const gameState = options.gameState;
    // Count total gifts from wrapped + unwrapped
    const wrappedGifts = gameState.wrappedGifts || [];
    const unwrappedGifts = gameState.unwrappedGifts || [];
    const unwrappedMap = unwrappedGifts instanceof Map 
      ? unwrappedGifts 
      : new Map(Array.isArray(unwrappedGifts) ? unwrappedGifts : []);
    
    totalExpectedGifts = wrappedGifts.length + unwrappedMap.size;
    totalClaimedGifts = Array.from(giftStatus.values()).filter(g => g.owner !== null).length;
    
    if (totalClaimedGifts < totalExpectedGifts) {
      const unclaimedCount = totalExpectedGifts - totalClaimedGifts;
      const warningMsg = `[Final State] Not all gifts were claimed! Expected ${totalExpectedGifts} gifts, but only ${totalClaimedGifts} were picked/stolen. ${unclaimedCount} gift(s) remain unclaimed.`;
      warnings.push(warningMsg);
    }
  } else {
    // If no gameState provided, check if all discovered gifts were claimed
    totalClaimedGifts = Array.from(giftStatus.values()).filter(g => g.owner !== null).length;
    if (totalClaimedGifts < discoveredGifts.size) {
      const unclaimedCount = discoveredGifts.size - totalClaimedGifts;
      const warningMsg = `[Final State] ${unclaimedCount} gift(s) from history were never claimed (no owner assigned).`;
      warnings.push(warningMsg);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    stats: {
      totalEvents: history.length,
      picks: history.filter(e => e.type === 'PICK').length,
      steals: history.filter(e => e.type === 'STEAL').length,
      players: discoveredPlayers.size,
      gifts: discoveredGifts.size,
      totalExpectedGifts,
      totalClaimedGifts,
    },
  };
}

/**
 * Convenience function to validate current game from window context
 * Attempts to find game state from React DevTools or global state
 */
window.validateGame = function(options = {}) {
  // Try to get game state from various sources
  let history = null;
  let gifts = {};
  let userNames = {};

  // Method 1: Check if there's a global game state
  if (window.__GAME_STATE__) {
    const gameState = window.__GAME_STATE__;
    history = gameState.history || gameState.gameState?.history;
    gifts = gameState.gifts || {};
    userNames = gameState.userNames || {};
    // Use maxSteals from game state if available
    if (gameState.maxSteals !== undefined) {
      options.maxSteals = gameState.maxSteals;
    }
    // Pass gameState to validator for final state checks
    if (gameState.gameState) {
      options.gameState = gameState.gameState;
    }
  }

  // Method 2: Try to find it in React DevTools (if available)
  if (!history && window.__REACT_DEVTOOLS_GLOBAL_HOOK__) {
    console.warn('React DevTools detected, but automatic state extraction not implemented. Please provide history manually.');
  }

  if (!history) {
    console.error('Could not find game state. Please call validateGameHistory() directly with history array.');
    console.log('Usage: validateGameHistory(history, { gifts, userNames, maxSteals: 3 })');
    return null;
  }

  return validateGameHistory(history, { gifts, userNames, ...options });
};

// Expose main function on window
window.validateGameHistory = validateGameHistory;

// Export for module use
export default validateGameHistory;

