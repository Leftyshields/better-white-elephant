/**
 * Game Engine - White Elephant Game Logic
 */
export class GameEngine {
  constructor(gameState, config) {
    // CRITICAL: Validate partyId exists in gameState
    if (!gameState.partyId) {
      throw new Error('GameEngine: gameState.partyId is required');
    }
    if (typeof gameState.partyId !== 'string' || gameState.partyId.length === 0) {
      throw new Error(`GameEngine: Invalid partyId in gameState: ${gameState.partyId}`);
    }
    
    this.partyId = gameState.partyId;
    this.currentTurnIndex = gameState.currentTurnIndex || 0;
    // CRITICAL: currentVictim takes priority over turnQueue index
    // If currentVictim is set, they are the active player (steal chain in progress)
    // If currentVictim is null, active player is turnQueue[currentTurnIndex]
    this.currentVictim = gameState.currentVictim || null;
    this.turnOrder = [...gameState.turnOrder];
    // Generate turnQueue if missing (for backwards compatibility)
    if (gameState.turnQueue) {
      this.turnQueue = [...gameState.turnQueue];
    } else {
      this.turnQueue = this.generateTurnQueue(gameState.turnOrder, config?.returnToStart || false);
    }
    this.stealStack = [...(gameState.stealStack || [])]; // Keep for backwards compatibility
    this.wrappedGifts = [...gameState.wrappedGifts];
    this.unwrappedGifts = new Map(gameState.unwrappedGifts);
    this.turnAction = new Map(gameState.turnAction);
    this.phase = gameState.phase || 'ACTIVE';
    this.config = config;
    this.isBoomerangPhase = gameState.isBoomerangPhase || false;
    // Initialize history array to track all picks and steals
    this.history = gameState.history || [];
    // Initialize reaction count to track emoji reactions (hype level)
    this.reactionCount = gameState.reactionCount || 0;
    
    // Calculate active player based on victim-first priority
    this.currentPlayerId = this.calculateActivePlayer();
  }
  
  /**
   * Calculate who is the active player using victim-first priority
   * Priority 1: If currentVictim is set, they are active (steal chain)
   * Priority 2: Otherwise, use turnQueue[currentTurnIndex]
   * @returns {string} Active player ID
   */
  calculateActivePlayer() {
    // Priority 1: Victim takes precedence (steal chain in progress)
    if (this.currentVictim) {
      return this.currentVictim;
    }
    
    // Priority 2: Use turn queue index
    // CRITICAL: When queue is exhausted (index >= length), clamp to last valid index
    // This allows players to pick wrapped gifts even when queue is exhausted
    const clampedIndex = Math.min(this.currentTurnIndex || 0, this.turnQueue ? this.turnQueue.length - 1 : 0);
    if (this.turnQueue && clampedIndex >= 0 && clampedIndex < this.turnQueue.length) {
      return this.turnQueue[clampedIndex];
    }
    
    // Priority 3: If queue is exhausted, use last player in queue as fallback
    if (this.turnQueue && this.turnQueue.length > 0) {
      return this.turnQueue[this.turnQueue.length - 1];
    }
    
    // Priority 4: Return stored currentPlayerId if available
    if (this.currentPlayerId) {
      return this.currentPlayerId;
    }
    
    // Priority 5: Use first player in turnOrder as ultimate fallback
    if (this.turnOrder && this.turnOrder.length > 0) {
      return this.turnOrder[0];
    }
    
    // Last resort: return null
    return null;
  }

  /**
   * Generate turn queue (helper method for backwards compatibility)
   * @param {Array} turnOrder - The initial shuffled turn order (array of player IDs)
   * @param {boolean} returnToStart - Whether boomerang rule is active
   * @returns {Array} Complete turn queue array
   */
  generateTurnQueue(turnOrder, returnToStart) {
    if (returnToStart) {
      // Boomerang (Snake Draft): [P1, P2, ... P9, P10, P10, P9, ... P2, P1]
      // Forward pass: all players
      const forward = [...turnOrder];
      // Reverse pass: all players in reverse (last player appears twice at transition)
      const reverse = [...turnOrder].reverse();
      // Last player appears twice at the transition
      return [...forward, ...reverse];
    } else {
      // Standard (Bookend): [P1, P2, ... P10, P1]
      // Forward pass: all players
      const forward = [...turnOrder];
      // Only first player gets a second turn
      return [...forward, turnOrder[0]];
    }
  }

  /**
   * Check if player can pick a wrapped gift
   */
  canPick(playerId) {
    // CRITICAL: Use calculated active player (victim-first priority)
    const activePlayer = this.calculateActivePlayer();
    if (activePlayer !== playerId) return false;
    if (this.turnAction.get(playerId)) return false; // Already acted this turn
    if (this.wrappedGifts.length === 0) return false; // No wrapped gifts left
    
    // Check if player already has a gift
    const playerHasGift = this.playerHasGift(playerId);
    
    // If there are wrapped gifts remaining, allow players to pick even if they have a gift
    // This ensures all gifts are claimed before the game ends
    if (playerHasGift && this.wrappedGifts.length > 0) {
      // Allow picking wrapped gifts even if player has a gift (to claim all gifts)
      return true;
    }
    
    // If player doesn't have a gift, they can always pick
    if (!playerHasGift) {
      return true;
    }
    
    // Exception 1: Player 1's Final Turn in Standard Mode (bookend exception)
    // Per GAME_RULES.md Rule 1: "The Final Turn of Standard Mode (Player 1's second turn at the end of the queue).
    // Player 1 acts as if in Boomerang phase, allowing them to pick or steal even though they already hold a gift."
    const isLastIndex = this.currentTurnIndex === (this.turnQueue.length - 1);
    const isPlayer1 = this.turnOrder && this.turnOrder[0] === playerId;
    const isPlayer1FinalTurn = isLastIndex && isPlayer1;
    
    // Exception 2: First player in final boomerang turn can still act
    // Compute boomerang phase dynamically (consistent with canSteal)
    const isInBoomerangPhase = this.currentTurnIndex >= (this.turnOrder?.length || 0);
    const isFirstPlayerFinalBoomerangTurn = isInBoomerangPhase && 
      this.turnOrder[0] === playerId && 
      activePlayer === playerId;
    
    if (isPlayer1FinalTurn || isFirstPlayerFinalBoomerangTurn) {
      return true;
    }
    
    return false;
  }

  /**
   * Check if gift is stealable
   */
  canSteal(giftId, playerId) {
    // CRITICAL: Use calculated active player (victim-first priority)
    const activePlayer = this.calculateActivePlayer();
    if (activePlayer !== playerId) return false;
    
    // Check if player is in second half of boomerang queue
    const isInSecondHalf = this.turnQueue && 
      this.currentTurnIndex >= (this.turnOrder?.length || 0);
    
    // Calculate Player 1's final turn (bookend exception)
    const isLastIndex = this.currentTurnIndex === (this.turnQueue.length - 1);
    const isPlayer1 = this.turnOrder && this.turnOrder[0] === playerId;
    const isPlayer1FinalTurn = isLastIndex && isPlayer1;
    
    // In boomerang phase or Player 1's final turn, players can steal even after picking
    // This allows swapping (picking then stealing in boomerang phase)
    if (this.turnAction.get(playerId) && !isInSecondHalf && !isPlayer1FinalTurn) {
      return false; // Already acted this turn (only in standard phase)
    }
    
    const gift = this.unwrappedGifts.get(giftId);
    if (!gift) return false; // Gift doesn't exist or is wrapped
    if (gift.isFrozen) return false; // Gift is frozen
    if (gift.ownerId === playerId) return false; // Can't steal your own gift
    
    // RULE 4: The "Immediate Steal-Back" Rule (Updated)
    // Prevent immediate steal-back on the SAME turn
    // Once the turn advances (any player acts), you can steal back gifts you lost
    // Per user request: "Only lock re-stealing on next turn"
    // Check if the player was the last owner of this gift
    // Note: lastOwnerId is cleared when turns advance, allowing re-stealing on next turn
    if (gift.lastOwnerId === playerId) {
      throw new Error('Cannot steal back a gift immediately after losing it on the same turn');
    }
    
    // RULE 9: Wrapped Gift Claiming (Unwrap Before Final Turn)
    // Per GAME_RULES.md Rule 9: All wrapped gifts SHOULD be unwrapped before Player 1's final turn
    // The system encourages picking wrapped gifts but does not block stealing
    // This allows players flexibility while bots will prioritize picking
    // Note: Server-side validation removed - players can choose to steal even if wrapped gifts remain
    // Bots will still prioritize picking wrapped gifts (handled in bot-utils.js)
    
    // RULE 3: The "Holding" Constraint
    // In second half of boomerang, players can steal/swap even if they hold a gift
    if (!isInSecondHalf) {
      // First half: normal constraint - cannot act if holding a gift
      for (const [currentGiftId, currentGift] of this.unwrappedGifts.entries()) {
        if (currentGift.ownerId === playerId && currentGiftId !== giftId) {
          // Exception 1: Player 1's Final Turn in Standard Mode (bookend exception)
          // Per GAME_RULES.md Rule 1: "The Final Turn of Standard Mode (Player 1's second turn at the end of the queue).
          // Player 1 acts as if in Boomerang phase, allowing them to pick or steal even though they already hold a gift."
          const isLastIndex = this.currentTurnIndex === (this.turnQueue.length - 1);
          const isPlayer1 = this.turnOrder && this.turnOrder[0] === playerId;
          const isPlayer1FinalTurn = isLastIndex && isPlayer1;
          
          // Exception 2: First player in final boomerang turn can still act
          // Use computed boomerang phase (isInSecondHalf) instead of stored value
          const activePlayer = this.calculateActivePlayer();
          const isFirstPlayerFinalBoomerangTurn = isInSecondHalf && 
            this.turnOrder[0] === playerId && 
            activePlayer === playerId;
          
          if (!isPlayer1FinalTurn && !isFirstPlayerFinalBoomerangTurn) {
            return false; // Player already has a gift - cannot steal
          }
        }
      }
    }
    // If isInSecondHalf is true, allow steal (swap) even if player has a gift
    
    return true;
  }

  /**
   * Player picks a wrapped gift
   */
  pickGift(giftId, playerId) {
    if (!this.canPick(playerId)) {
      throw new Error('Cannot pick gift: invalid action');
    }

    // CRITICAL: If player already has a gift, remove it first to prevent duplicate ownership
    // This ensures "one gift per person" rule is maintained
    const playerHasGift = this.playerHasGift(playerId);
    if (playerHasGift) {
      // Find and remove the player's existing gift
      for (const [existingGiftId, gift] of this.unwrappedGifts.entries()) {
        if (gift.ownerId === playerId) {
          this.unwrappedGifts.delete(existingGiftId);
          console.log(`🔄 Player ${playerId} picking new gift - releasing old gift ${existingGiftId}`);
          break;
        }
      }
    }

    // Remove from wrapped pile
    const index = this.wrappedGifts.indexOf(giftId);
    if (index === -1) {
      throw new Error('Gift not found in wrapped pile');
    }
    this.wrappedGifts.splice(index, 1);

    // Add to unwrapped gifts
    this.unwrappedGifts.set(giftId, {
      ownerId: playerId,
      stealCount: 0,
      isFrozen: false,
      lastOwnerId: null, // No previous owner for picked gifts
    });

    // Mark player as having acted
    this.turnAction.set(playerId, 'PICKED');

    // Add to history
    this.history.push({
      type: 'PICK',
      playerId: playerId,
      giftId: giftId,
      timestamp: new Date().toISOString(),
    });

    // RULE 2: Turn Termination Logic - PICK Action
    // When OPEN_GIFT happens:
    // 1. Clear currentVictim (chain is broken)
    // 2. Increment currentTurnIndex (move to next scheduled slot)
    // 3. Check if game should end
    
    this.currentVictim = null; // Chain is broken - victim resolved by picking
    
    // Clear lastOwnerId for all gifts when turn advances
    // This allows players to steal back gifts they lost once a turn has passed
    // Per user request: "Only lock re-stealing on next turn"
    for (const [giftId, gift] of this.unwrappedGifts.entries()) {
      gift.lastOwnerId = null;
    }
    
    // Increment turn index to next position
    this.currentTurnIndex = (this.currentTurnIndex || 0) + 1;
    
    // Check if game should end (queue exhausted)
    if (this.currentTurnIndex >= this.turnQueue.length) {
      if (this.shouldGameEnd()) {
        this.phase = 'ENDED';
      } else {
        // Queue exhausted but game can't end (wrapped gifts remain)
        // Clamp currentTurnIndex to the last valid index (length - 1, not length)
        // This allows players to pick wrapped gifts even though the queue is exhausted
        this.currentTurnIndex = Math.min(this.currentTurnIndex, this.turnQueue.length - 1);
        console.warn(`⚠️ Queue exhausted (index: ${this.currentTurnIndex}, queue length: ${this.turnQueue.length}) but wrapped gifts remain. Allowing players to pick wrapped gifts.`);
      }
    } else {
      // Determine if we're in boomerang phase
      const isBoomerangPhase = this.isBoomerangPhase || 
        (this.currentTurnIndex >= (this.turnOrder?.length || 0));
      
      if (isBoomerangPhase) {
        // Boomerang Phase: Use skip logic (players with gifts can still act via swap)
        const nextPlayer = this.findNextValidPlayer();
        
        if (nextPlayer) {
          // Update currentTurnIndex to match the found player's position
          const nextIndex = this.turnQueue.indexOf(nextPlayer);
          if (nextIndex >= 0) {
            this.currentTurnIndex = nextIndex;
          }
          // Reset turn action for next player
          this.turnAction.set(nextPlayer, null);
        } else {
          // No valid player found - check if game should end
          if (this.shouldGameEnd()) {
            this.phase = 'ENDED';
          }
        }
      } else {
        // Standard Phase: STRICT +1 increment, but auto-skip players who can't act
        // CRITICAL: In Standard Phase, the Turn Index should NEVER jump more than 1 slot at a time.
        // However, if a player has a gift and can't act, they should be auto-skipped (recorded in history)
        if (this.currentTurnIndex < this.turnQueue.length) {
          const nextPlayerId = this.turnQueue[this.currentTurnIndex];
          // Set turn action for next player
          this.turnAction.set(nextPlayerId, null);
          
          // Auto-skip players who have gifts and can't act in Standard Phase
          // This ensures everyone gets a turn recorded in history
          this.advanceTurnWithAutoSkip();
        }
      }
    }
    
    // Recalculate active player (victim-first priority)
    this.currentPlayerId = this.calculateActivePlayer();

    return this.getState();
  }

  /**
   * Player steals an unwrapped gift
   * When you steal, the previous owner gets your current gift
   */
  stealGift(giftId, playerId) {
    if (!this.canSteal(giftId, playerId)) {
      throw new Error('Cannot steal gift: invalid action');
    }

    const stolenGift = this.unwrappedGifts.get(giftId);
    const previousOwnerId = stolenGift.ownerId;
    
    // Track last owner to prevent immediate steal-back
    const lastOwnerId = stolenGift.lastOwnerId || previousOwnerId;

    // Find the gift that the stealing player currently owns (if any)
    // IMPORTANT: Use a different variable name to avoid shadowing the parameter giftId
    // Also important: Exclude the gift being stolen from this search
    let playerCurrentGiftId = null;
    for (const [currentGiftId, gift] of this.unwrappedGifts.entries()) {
      // Skip the gift being stolen - we're about to transfer it
      if (currentGiftId === giftId) continue;
      if (gift.ownerId === playerId) {
        playerCurrentGiftId = currentGiftId;
        break;
      }
    }

    // CRITICAL: Validate that the victim doesn't already have a DIFFERENT gift
    // The victim should only own the gift being stolen (giftId), not any other gift
    // This validation must happen BEFORE any ownership changes
    let victimHasOtherGift = false;
    for (const [currentGiftId, currentGift] of this.unwrappedGifts.entries()) {
      if (currentGift.ownerId === previousOwnerId && currentGiftId !== giftId) {
        victimHasOtherGift = true;
        break;
      }
    }
    if (victimHasOtherGift) {
      console.error(`ERROR: Victim ${previousOwnerId} already has a different gift! Cannot steal.`);
      console.error('Current unwrappedGifts state:', Array.from(this.unwrappedGifts.entries()));
      throw new Error(`Cannot steal: victim ${previousOwnerId} already owns another gift. This indicates a state corruption.`);
    }

    // Increment steal count on the stolen gift
    stolenGift.stealCount += 1;

    // Check if stolen gift should be frozen
    const isFrozenNow = stolenGift.stealCount >= this.config.maxSteals;
    if (isFrozenNow) {
      stolenGift.isFrozen = true;
    }

    // If the stealing player had a gift, give it to the previous owner FIRST
    // This prevents duplicate ownership during the transfer
    if (playerCurrentGiftId) {
      
      const playerGift = this.unwrappedGifts.get(playerCurrentGiftId);
      if (!playerGift) {
        throw new Error(`Player's current gift ${playerCurrentGiftId} not found in unwrappedGifts`);
      }
      // Exchange: previous owner gets the stealing player's old gift FIRST
      playerGift.ownerId = previousOwnerId;
      // CRITICAL: DO NOT reset stealCount or isFrozen - the swapped gift retains its heat level
      // This prevents the "infinite game exploit" where players wash gifts of their steal count
      // Per GAME_RULES.md Rule 5 and Rule 7: swapped gifts retain their stealCount and isFrozen state
      // playerGift.stealCount = playerGift.stealCount; // Retain existing value
      // playerGift.isFrozen = playerGift.isFrozen; // Retain existing value
      // Track last owner for U-Turn prevention
      playerGift.lastOwnerId = playerId; // The stealing player was the previous owner
    }
    // Note: If stealing player had no gift, previous owner will get a turn to pick a new gift

    // Transfer stolen gift to the stealing player LAST
    // This ensures we never have duplicate ownership
    stolenGift.ownerId = playerId;
    // Update lastOwnerId to track previous owner for U-Turn prevention
    stolenGift.lastOwnerId = previousOwnerId;
    
    // CRITICAL: Final validation - ensure stealer doesn't have multiple gifts
    // Check if stealer now owns multiple gifts (should only own the stolen gift)
    let stealerGiftCount = 0;
    for (const [currentGiftId, currentGift] of this.unwrappedGifts.entries()) {
      if (currentGift.ownerId === playerId) {
        stealerGiftCount++;
      }
    }
    if (stealerGiftCount > 1) {
      console.error(`ERROR: After steal, stealer ${playerId} has ${stealerGiftCount} gifts!`);
      console.error('unwrappedGifts state:', Array.from(this.unwrappedGifts.entries()));
      throw new Error(`Duplicate ownership detected: stealer ${playerId} has ${stealerGiftCount} gifts after steal`);
    }
    
    // CRITICAL: Final validation - ensure victim doesn't have multiple gifts
    // Check if victim now owns multiple gifts (should only own exchanged gift or none)
    let victimGiftCount = 0;
    for (const [currentGiftId, currentGift] of this.unwrappedGifts.entries()) {
      if (currentGift.ownerId === previousOwnerId) {
        victimGiftCount++;
      }
    }
    if (victimGiftCount > 1) {
      console.error(`ERROR: After steal, victim ${previousOwnerId} has ${victimGiftCount} gifts!`);
      console.error('unwrappedGifts state:', Array.from(this.unwrappedGifts.entries()));
      throw new Error(`Duplicate ownership detected: victim ${previousOwnerId} has ${victimGiftCount} gifts after steal`);
    }
    
    // RULE 1: Steal Chain Logic - STEAL Action
    // When STEAL_GIFT happens:
    // 1. Set currentVictim = previousOwnerId (victim gets next turn)
    // 2. currentTurnIndex MUST NOT CHANGE (Pause Index on Steal)
    //    - The game is paused on the thief's slot in the turn queue
    //    - The turn order will resume when the victim picks a gift (OPEN_GIFT)
    // 3. Active player becomes the victim (calculated by calculateActivePlayer)
    
    // CRITICAL: Store the paused turn index before setting victim
    // This ensures we can resume from the correct position when victim acts
    const pausedTurnIndex = this.currentTurnIndex;
    
    this.currentVictim = previousOwnerId; // Victim gets immediate turn
    // CRITICAL: Do NOT increment currentTurnIndex - the game is paused
    // The turn order will resume when the victim picks a gift
    // DEBUG: Log the paused index for troubleshooting
    console.log(`⏸️ Steal chain started: ${playerId} stole from ${previousOwnerId}. Turn index paused at ${pausedTurnIndex}`);
    
    // Reset turn action for victim so they can act
    this.turnAction.set(previousOwnerId, null);
    // Clear turn action for stealer (their turn is over)
    this.turnAction.set(playerId, null);
    
    // Recalculate active player (victim-first priority)
    this.currentPlayerId = this.calculateActivePlayer();
    
    // Final comprehensive validation: ensure no gift has duplicate owners
    const ownerCounts = {};
    for (const [giftId, gift] of this.unwrappedGifts.entries()) {
      if (gift.ownerId) {
        ownerCounts[gift.ownerId] = (ownerCounts[gift.ownerId] || 0) + 1;
      }
    }
    const duplicates = Object.entries(ownerCounts).filter(([_, count]) => count > 1);
    if (duplicates.length > 0) {
      console.error('ERROR: After steal, duplicate ownership detected!', duplicates);
      console.error('unwrappedGifts state:', Array.from(this.unwrappedGifts.entries()));
      throw new Error(`Duplicate ownership detected after steal: ${duplicates.map(([playerId, count]) => `${playerId} has ${count} gifts`).join(', ')}`);
    }

    // Mark player as having acted
    this.turnAction.set(playerId, 'STOLEN');

    // Add to history
    this.history.push({
      type: 'STEAL',
      playerId: playerId,
      giftId: giftId, // The gift that was stolen
      previousOwnerId: previousOwnerId,
      exchangedGiftId: playerCurrentGiftId || null, // The gift the stealer gave up (if any)
      stealCount: stolenGift.stealCount,
      isFrozen: isFrozenNow,
      timestamp: new Date().toISOString(),
    });

    return this.getState();
  }

  /**
   * Check if game should end based on robust conditions
   * Game ends if:
   * Option A (Normal end):
   *   1. currentTurnIndex >= turnQueue.length (Everyone has had their primary turn)
   *   2. AND the current activePlayer has a gift (No pending victims from steal chains)
   *   3. AND unwrappedGifts.length === totalParticipants (All gifts have been claimed)
   * Option B (All gifts frozen):
   *   1. currentTurnIndex >= turnQueue.length (No more turns)
   *   2. AND all unwrapped gifts are frozen (No more steals possible)
   *   3. AND at least one gift has been unwrapped (game has started)
   * Note: Remaining wrapped gifts will be assigned in endGame() to players without gifts
   */
  shouldGameEnd() {
    // CRITICAL INVARIANT: Per .cursorrules - "The Game NEVER ends if wrapped gifts remain"
    // SAFETY NET: Game cannot end if wrapped gifts exist
    // This prevents the game from ending prematurely when there are still gifts to be picked
    if (this.wrappedGifts && Array.isArray(this.wrappedGifts) && this.wrappedGifts.length > 0) {
      return false; // GAME CANNOT END if wrapped gifts exist
    }
    
    // Condition 1: Check if we've exhausted the turn queue
    const queueExhausted = (this.currentTurnIndex || 0) >= this.turnQueue.length;
    if (!queueExhausted) {
      return false; // Still have players in queue
    }

    // Check if all unwrapped gifts are frozen
    let allGiftsFrozen = true;
    if (this.unwrappedGifts.size === 0) {
      allGiftsFrozen = false; // No gifts to freeze
    } else {
      for (const [_, gift] of this.unwrappedGifts.entries()) {
        if (!gift.isFrozen) {
          allGiftsFrozen = false;
          break;
        }
      }
    }

    // Option B: If all unwrapped gifts are frozen AND queue is exhausted, game should end
    // (Remaining wrapped gifts will be assigned in endGame() to players without gifts)
    if (allGiftsFrozen && this.unwrappedGifts.size > 0) {
      return true; // Game should end - no more steals possible
    }

    // Option A: Normal end - check if all gifts have been claimed
    const totalParticipants = this.turnOrder?.length || 0;
    const unwrappedGiftsCount = this.unwrappedGifts.size;
    const allGiftsClaimed = unwrappedGiftsCount >= totalParticipants;
    if (!allGiftsClaimed) {
      return false; // Not all gifts have been picked yet
    }

    // Current player must have a gift (no pending victims from steal chains)
    // CRITICAL: Check if there's a pending victim (steal chain in progress)
    if (this.currentVictim) {
      return false; // There's a pending victim - game cannot end yet
    }
    
    // When queue is exhausted, we don't need to check the active player
    // because there is no active player (index is out of bounds)
    // Instead, verify that all participants have gifts
    const playersWithGifts = new Set();
    for (const [_, gift] of this.unwrappedGifts.entries()) {
      if (gift.ownerId) {
        playersWithGifts.add(gift.ownerId);
      }
    }
    
    // If queue is exhausted and all participants have gifts, game should end
    if (playersWithGifts.size >= totalParticipants) {
      return true; // All participants have gifts - game should end
    }
    
    // Fallback: Check active player if index is still valid
    if (this.currentTurnIndex < this.turnQueue.length) {
      const activePlayer = this.calculateActivePlayer();
      const currentPlayerHasGift = activePlayer && this.playerHasGift(activePlayer);
      if (!currentPlayerHasGift) {
        return false; // Current player doesn't have a gift, might be waiting to act
      }
    }

    // All conditions met - game should end
    return true;
  }

  /**
   * Helper: Check if a player currently has a gift
   */
  playerHasGift(playerId) {
    if (!playerId) return false;
    for (const [_, gift] of this.unwrappedGifts.entries()) {
      if (gift.ownerId === playerId) {
        return true;
      }
    }
    return false;
  }

  /**
   * Get next player from turn queue
   * Returns null if game should end
   * 
   * Uses pre-generated turnQueue array and currentTurnIndex
   * This method is only called after a PICK action to advance to next in queue
   * @deprecated Use shouldGameEnd() and direct turnQueue access instead
   */
  getNextPlayer() {
    // Increment turn index
    const nextIndex = (this.currentTurnIndex || 0) + 1;
    
    // Check if queue is exhausted
    if (nextIndex >= this.turnQueue.length) {
      return null; // Game ends
    }
    
    // Return next player from queue
    return this.turnQueue[nextIndex];
  }

  /**
   * Advance turn and handle auto-skipping players who can't act in Standard Phase
   * Ensures everyone gets a turn recorded in history, even if they must skip
   * This prevents players from being silently skipped
   * @returns {void}
   */
  advanceTurnWithAutoSkip() {
    // In Standard Phase, check if current player has a gift and can't act
    const isBoomerangPhase = this.isBoomerangPhase || 
      (this.currentTurnIndex >= (this.turnOrder?.length || 0));
    
    // Only auto-skip in Standard Phase
    if (isBoomerangPhase) {
      return; // In boomerang phase, players with gifts can act (swap)
    }
    
    // Prevent infinite loops
    const maxIterations = this.turnQueue.length;
    let iterations = 0;
    
    while (iterations < maxIterations && this.currentTurnIndex < this.turnQueue.length) {
      iterations++;
      
      const currentPlayerId = this.turnQueue[this.currentTurnIndex];
      if (!currentPlayerId) {
        break;
      }
      
      const currentPlayerHasGift = this.playerHasGift(currentPlayerId);
      
      if (!currentPlayerHasGift) {
        // Player doesn't have a gift, they can act - stop auto-skipping
        break;
      }
      
      // Player has a gift - check if they can act
      const isLastIndex = this.currentTurnIndex === (this.turnQueue.length - 1);
      const isPlayer1 = this.turnOrder && this.turnOrder[0] === currentPlayerId;
      const isPlayer1FinalTurn = isLastIndex && isPlayer1;
      const hasWrappedGifts = this.wrappedGifts && this.wrappedGifts.length > 0;
      
      // If player can act (Player 1 final turn or wrapped gifts remain), stop auto-skipping
      if (isPlayer1FinalTurn || hasWrappedGifts) {
        break;
      }
      
      // Player has gift and can't act - auto-skip and record in history
      // CRITICAL: This ensures everyone gets a turn recorded, even if they must skip
      this.history.push({
        type: 'END_TURN',
        playerId: currentPlayerId,
        timestamp: new Date().toISOString(),
      });
      
      // Reset their turn action
      this.turnAction.set(currentPlayerId, null);
      
      // Advance to next player
      this.currentTurnIndex = this.currentTurnIndex + 1;
      
      // Check if queue is exhausted
      if (this.currentTurnIndex >= this.turnQueue.length) {
        // Queue exhausted - stop auto-skipping (will be handled by caller)
        break;
      }
    }
  }

  /**
   * Find next valid player who can act
   * Skips players who already have gifts (unless in boomerang phase or bookend turn)
   * @returns {string|null} Next valid player ID or null if none found
   */
  findNextValidPlayer() {
    const isBoomerangPhase = this.isBoomerangPhase || 
      (this.currentTurnIndex >= (this.turnOrder?.length || 0));
    
    let searchIndex = (this.currentTurnIndex || 0) + 1;
    const maxIterations = this.turnQueue.length; // Prevent infinite loops
    
    // Check if this is the bookend turn in Standard mode (last index, Player 1 goes again)
    const isBookendTurn = !isBoomerangPhase && 
      searchIndex === (this.turnQueue.length - 1) &&
      this.turnQueue[searchIndex] === this.turnOrder?.[0];
    
    for (let i = 0; i < maxIterations && searchIndex < this.turnQueue.length; i++) {
      const candidatePlayerId = this.turnQueue[searchIndex];
      
      if (!candidatePlayerId) {
        searchIndex++;
        continue;
      }
      
      // In boomerang phase, players WITH gifts can act (swap), so don't skip them
      if (isBoomerangPhase) {
        return candidatePlayerId;
      }
      
      // Bookend turn exception: Player 1 can act even if they have a gift
      if (isBookendTurn && candidatePlayerId === this.turnOrder?.[0]) {
        return candidatePlayerId;
      }
      
      // In standard phase, skip players who already have gifts
      const playerHasGift = this.playerHasGift(candidatePlayerId);
      if (!playerHasGift) {
        return candidatePlayerId;
      }
      
      // Player has gift and we're not in boomerang or bookend - skip them
      searchIndex++;
    }
    
    // No valid player found
    return null;
  }

  /**
   * End current turn and advance to next player
   * Note: This is only used for manual turn ending (skip turn). Picks automatically advance.
   * When a player skips their turn, it's treated like a PICK action (clears victim, increments index)
   * 
   * CRITICAL: Per GAME_RULES.md Rule 10 - Players can only skip if they have a gift they like.
   * - Standard Mode: Only Player 1 on Final Turn OR victim with gift from exchange (and no legal moves)
   * - Boomerang Mode: Anyone with a gift can skip
   * - Never allow skip if player has no gift (except deadlock prevention for victims)
   */
  endTurn() {
    const skippingPlayerId = this.currentPlayerId;
    const playerHasGift = this.playerHasGift(skippingPlayerId);
    
    // Determine if we're in boomerang phase
    const isBoomerangPhase = this.isBoomerangPhase || 
      (this.currentTurnIndex >= (this.turnOrder?.length || 0));
    
    // Check if this is Player 1's Final Turn (bookend exception)
    const isLastIndex = this.currentTurnIndex === (this.turnQueue.length - 1);
    const isPlayer1 = this.turnOrder && this.turnOrder[0] === skippingPlayerId;
    const isPlayer1FinalTurn = isLastIndex && isPlayer1;
    
    // CRITICAL VALIDATION: Per GAME_RULES.md Rule 10
    // Players should only skip if they have a gift they like
    
    // Rule 1: In Standard Phase, players without gifts CANNOT skip (they must pick)
    if (!isBoomerangPhase && !playerHasGift) {
      // Exception: Victim deadlock prevention (Rule 10)
      const isVictim = this.currentVictim === skippingPlayerId;
      if (isVictim) {
        // Check if victim has any legal moves
        const hasWrappedGifts = this.wrappedGifts && this.wrappedGifts.length > 0;
        let hasLegalMoves = false;
        
        if (hasWrappedGifts) {
          hasLegalMoves = true;
        } else {
          // Check if victim can steal
          for (const [giftId, gift] of this.unwrappedGifts.entries()) {
            if (!gift.isFrozen && gift.ownerId !== skippingPlayerId) {
              if (gift.lastOwnerId !== skippingPlayerId) {
                hasLegalMoves = true;
                break;
              }
            }
          }
        }
        
        // If victim has no gift and has legal moves, they CANNOT skip - they MUST pick
        if (hasLegalMoves) {
          throw new Error(`Cannot skip: Victim ${skippingPlayerId} has no gift and must pick a new gift. They cannot skip when they have legal moves available.`);
        }
        
        // If victim has no gift and no legal moves, allow skip (deadlock prevention per Rule 10)
        console.warn(`⚠️ Victim ${skippingPlayerId} has no gift and no legal moves - allowing skip to prevent deadlock (Rule 10)`);
      } else {
        // Not a victim and has no gift - cannot skip in Standard Phase
        throw new Error(`Cannot skip: Player ${skippingPlayerId} has no gift. Players can only skip if they have a gift they like.`);
      }
    }
    
    // Rule 2: In Standard Phase, players with gifts CAN skip (they want to keep their gift)
    // Per GAME_RULES.md Rule 10: "Players CAN skip their turn if they are content with their current gift"
    // If a player has a gift, they should be able to skip to keep it
    // No additional restrictions needed - having a gift is sufficient reason to skip
    if (!isBoomerangPhase && playerHasGift) {
      // Player has a gift and wants to keep it - allow skip
      // This is the core behavior: if you like your gift, you can skip to keep it
      console.log(`✅ Player ${skippingPlayerId} skipping to keep their gift (Standard Phase)`);
    }
    
    // Rule 3: In Boomerang Phase, players can skip if they have a gift
    if (isBoomerangPhase && !playerHasGift) {
      throw new Error(`Cannot skip: Player ${skippingPlayerId} has no gift. In Boomerang Mode, players can only skip if they have a gift they like.`);
    }
    
    // Record skip action in history before advancing
    if (skippingPlayerId) {
      this.history.push({
        type: 'END_TURN',
        playerId: skippingPlayerId,
        timestamp: new Date().toISOString(),
      });
    }
    
    // Reset turn action for previous player
    this.turnAction.set(this.currentPlayerId, null);
    
    // END_TURN is treated like PICK: clears victim and increments index
    // CRITICAL: If this was a victim skipping, we need to resume from the paused turn index
    // When a steal happens, currentTurnIndex is paused at the stealer's position
    // When the victim skips, we resume from that paused position and increment
    const wasVictim = this.currentVictim === skippingPlayerId;
    const pausedIndex = this.currentTurnIndex; // Store before clearing victim
    this.currentVictim = null; // Chain is broken - player chose to skip
    
    // Increment turn index to next position
    // CRITICAL: currentTurnIndex was paused at the stealer's position during the steal
    // When victim skips, we resume from that paused position
    this.currentTurnIndex = (this.currentTurnIndex || 0) + 1;
    
    // Clear lastOwnerId for all gifts when turn advances
    // This allows players to steal back gifts they lost once a turn has passed
    // Per user request: "Only lock re-stealing on next turn"
    for (const [giftId, gift] of this.unwrappedGifts.entries()) {
      gift.lastOwnerId = null;
    }
    
    // DEBUG: Log if we're resuming from a steal chain
    if (wasVictim) {
      const victimIndexInQueue = this.turnQueue.indexOf(skippingPlayerId);
      console.log(`🔄 Victim ${skippingPlayerId} (at queue index ${victimIndexInQueue}) skipped - resuming turn order from paused index ${pausedIndex} -> ${this.currentTurnIndex}`);
      console.log(`   Turn queue: [${this.turnQueue.map((p, i) => `${i}:${p.slice(0, 8)}`).join(', ')}]`);
    }
    
    // CRITICAL: If turn index is way out of bounds, check if game should end
    // CRITICAL: Per .cursorrules - "The Game NEVER ends if wrapped gifts remain"
    // This prevents infinite loops when the queue is exhausted but wrapped gifts remain
    if (this.currentTurnIndex > this.turnQueue.length + 1) {
      console.error(`⚠️ Turn index ${this.currentTurnIndex} is way out of bounds (queue length: ${this.turnQueue.length}).`);
      // Clamp index and check if game should end (respects wrapped gifts rule)
      this.currentTurnIndex = Math.min(this.currentTurnIndex, this.turnQueue.length - 1);
      if (this.shouldGameEnd()) {
        this.phase = 'ENDED';
        return this.getState();
      } else {
        console.warn(`⚠️ Index out of bounds but wrapped gifts remain. Clamping index and continuing.`);
      }
    }
    
    // Check if game should end (queue exhausted)
    if (this.currentTurnIndex >= this.turnQueue.length) {
      // If queue is exhausted, check if we should end the game
      if (this.shouldGameEnd()) {
        this.phase = 'ENDED';
      } else {
        // Queue exhausted but game can't end (wrapped gifts remain)
        // Clamp currentTurnIndex to the last valid index to prevent further out-of-bounds issues
        // This allows players to pick wrapped gifts even though the queue is exhausted
        // Use length - 1 (last valid index) instead of length (out of bounds)
        this.currentTurnIndex = Math.min(this.currentTurnIndex, this.turnQueue.length - 1);
        console.warn(`⚠️ Queue exhausted (index: ${this.currentTurnIndex}, queue length: ${this.turnQueue.length}) but wrapped gifts remain. Allowing players to pick wrapped gifts.`);
      }
    } else {
      // Determine if we're in boomerang phase
      const isBoomerangPhase = this.isBoomerangPhase || 
        (this.currentTurnIndex >= (this.turnOrder?.length || 0));
      
      if (isBoomerangPhase) {
        // Boomerang Phase: Use skip logic (players with gifts can still act via swap)
        const nextPlayer = this.findNextValidPlayer();
        
        if (nextPlayer) {
          // Update currentTurnIndex to match the found player's position
          const nextIndex = this.turnQueue.indexOf(nextPlayer);
          if (nextIndex >= 0) {
            this.currentTurnIndex = nextIndex;
          }
          // Reset turn action for next player
          this.turnAction.set(nextPlayer, null);
        } else {
          // No valid player found - check if game should end
          // CRITICAL: Per .cursorrules - "The Game NEVER ends if wrapped gifts remain"
          if (this.shouldGameEnd()) {
            this.phase = 'ENDED';
          } else {
            // Game can't end (wrapped gifts remain) - clamp index to prevent further issues
            this.currentTurnIndex = Math.min(this.currentTurnIndex, this.turnQueue.length - 1);
          }
        }
      } else {
        // Standard Phase: STRICT +1 increment, but auto-skip players who can't act
        // CRITICAL: In Standard Phase, the Turn Index should NEVER jump more than 1 slot at a time.
        // However, if a player has a gift and can't act, they should be auto-skipped (recorded in history)
        if (this.currentTurnIndex < this.turnQueue.length) {
          const nextPlayerId = this.turnQueue[this.currentTurnIndex];
          // Set turn action for next player
          this.turnAction.set(nextPlayerId, null);
          
          // Auto-skip players who have gifts and can't act in Standard Phase
          // This ensures everyone gets a turn recorded in history
          this.advanceTurnWithAutoSkip();
        }
      }
    }
    
    // Recalculate active player (victim-first priority)
    this.currentPlayerId = this.calculateActivePlayer();

    return this.getState();
  }

  /**
   * Get current game state
   */
  getState() {
    // CRITICAL: Validate partyId is set
    if (!this.partyId) {
      throw new Error('GameEngine.getState(): partyId is not set');
    }
    
    // Ensure active player is calculated correctly before returning state
    const activePlayer = this.calculateActivePlayer();
    
    // CRITICAL: Calculate isBoomerangPhase dynamically based on current turn index
    // This ensures the phase is correctly updated when the turn advances
    // Boomerang phase begins when currentTurnIndex >= turnOrder.length (second half of queue)
    const computedBoomerangPhase = this.currentTurnIndex >= (this.turnOrder?.length || 0);
    // Update stored value for consistency
    this.isBoomerangPhase = computedBoomerangPhase;
    
    const stateVersion = Date.now();
    return {
      partyId: this.partyId, // CRITICAL: Always include partyId in state
      currentTurnIndex: this.currentTurnIndex || 0,
      currentPlayerId: activePlayer, // Always use calculated active player
      currentVictim: this.currentVictim, // CRITICAL: Include currentVictim in state
      turnOrder: [...this.turnOrder],
      turnQueue: [...this.turnQueue],
      stealStack: [...this.stealStack], // Keep for backwards compatibility
      wrappedGifts: [...this.wrappedGifts],
      unwrappedGifts: Array.from(this.unwrappedGifts.entries()),
      turnAction: Array.from(this.turnAction.entries()),
      phase: this.phase,
      isBoomerangPhase: computedBoomerangPhase, // Use computed value, not stored value
      config: this.config || { maxSteals: 3, returnToStart: false }, // Include config in state
      history: [...this.history], // Include history in state
      reactionCount: this.reactionCount || 0, // Track emoji reactions (hype level)
      stateVersion: stateVersion, // Add timestamp for state versioning
      updatedAt: new Date().toISOString(), // ISO timestamp for easy comparison
    };
  }

  /**
   * Reconstruct final ownership from history (for validation)
   * This simulates the game from scratch using the audit trail
   */
  reconstructOwnershipFromHistory() {
    const ownership = {}; // giftId -> ownerId
    const playerGifts = {}; // playerId -> giftId (track what each player currently has)
    
    for (const event of this.history) {
      if (event.type === 'PICK') {
        // Player picks a gift - they now own it
        ownership[event.giftId] = event.playerId;
        playerGifts[event.playerId] = event.giftId;
      } else if (event.type === 'STEAL') {
        // Player steals a gift
        const stolenGiftId = event.giftId;
        const stealerId = event.playerId;
        const previousOwnerId = event.previousOwnerId;
        const exchangedGiftId = event.exchangedGiftId;
        
        // Stealer gets the stolen gift
        ownership[stolenGiftId] = stealerId;
        
        // If there was an exchange, previous owner gets stealer's old gift
        if (exchangedGiftId) {
          ownership[exchangedGiftId] = previousOwnerId;
          // Update playerGifts tracking
          delete playerGifts[stealerId];
          playerGifts[stealerId] = stolenGiftId;
          playerGifts[previousOwnerId] = exchangedGiftId;
        } else {
          // No exchange - stealer had no gift, previous owner goes to stack (handled elsewhere)
          playerGifts[stealerId] = stolenGiftId;
          delete playerGifts[previousOwnerId];
        }
      }
    }
    
    return ownership;
  }

  /**
   * End game and return final state for Firestore
   * Uses current ownership state directly - each gift goes to its current owner
   * Validates that each player has exactly one gift and each gift has exactly one owner
   */
  endGame() {
    this.phase = 'ENDED';
    
    // Build final gift ownership map from current unwrapped gifts
    // Each gift's current owner is the final winner
    let finalOwnership = {};
    const playerGiftCount = {}; // Track how many gifts each player has
    
    // First pass: assign all unwrapped gifts to their current owners
    for (const [giftId, gift] of this.unwrappedGifts.entries()) {
      if (gift.ownerId) {
        finalOwnership[giftId] = gift.ownerId;
        playerGiftCount[gift.ownerId] = (playerGiftCount[gift.ownerId] || 0) + 1;
      }
    }
    
    // Validate: check for duplicates (a player having multiple gifts)
    const duplicateOwners = Object.entries(playerGiftCount).filter(([_, count]) => count > 1);
    if (duplicateOwners.length > 0) {
      console.error('ERROR: Duplicate ownership detected in unwrappedGifts!', duplicateOwners);
      console.error('Current unwrappedGifts state:', Array.from(this.unwrappedGifts.entries()));
      console.error('Game history:', this.history);
      
      // Try to reconstruct from history as a fallback
      const reconstructedOwnership = this.reconstructOwnershipFromHistory();
      console.log('Reconstructed ownership from history:', reconstructedOwnership);
      
      // Use reconstructed ownership if it's valid
      const reconstructedPlayerCount = {};
      for (const [giftId, ownerId] of Object.entries(reconstructedOwnership)) {
        reconstructedPlayerCount[ownerId] = (reconstructedPlayerCount[ownerId] || 0) + 1;
      }
      const reconstructedDuplicates = Object.entries(reconstructedPlayerCount).filter(([_, count]) => count > 1);
      
      if (reconstructedDuplicates.length === 0 && Object.keys(reconstructedOwnership).length > 0) {
        console.log('✅ Using reconstructed ownership from history (no duplicates)');
        finalOwnership = reconstructedOwnership;
      } else {
        console.error('⚠️ Reconstructed ownership also has duplicates or is empty. Fixing by keeping first gift per player.');
        // Fix duplicates: keep only the first gift per player (based on order in unwrappedGifts)
        // Use history to determine which gift should belong to which player (most recent owner wins)
        const fixedOwnership = {};
        const playerGiftsAssigned = new Set();
        
        // First, try to use the most recent owner from history for each gift
        const giftToOwner = new Map();
        for (let i = this.history.length - 1; i >= 0; i--) {
          const event = this.history[i];
          if (event.type === 'STEAL' && event.giftId) {
            if (!giftToOwner.has(event.giftId)) {
              giftToOwner.set(event.giftId, event.playerId);
            }
          } else if (event.type === 'PICK' && event.giftId) {
            if (!giftToOwner.has(event.giftId)) {
              giftToOwner.set(event.giftId, event.playerId);
            }
          }
        }
        
        // Assign gifts based on history (most recent owner)
        for (const [giftId, gift] of this.unwrappedGifts.entries()) {
          if (gift.ownerId) {
            const historyOwner = giftToOwner.get(giftId);
            const ownerToUse = historyOwner || gift.ownerId;
            
            if (!playerGiftsAssigned.has(ownerToUse)) {
              fixedOwnership[giftId] = ownerToUse;
              playerGiftsAssigned.add(ownerToUse);
            }
          }
        }
        
        // Reassign remaining gifts to players who don't have one
        const unassignedGifts = [];
        for (const [giftId, gift] of this.unwrappedGifts.entries()) {
          if (gift.ownerId && !fixedOwnership[giftId]) {
            unassignedGifts.push(giftId);
          }
        }
        
        const playersWithoutGifts = this.turnOrder.filter(playerId => !playerGiftsAssigned.has(playerId));
        for (let i = 0; i < Math.min(unassignedGifts.length, playersWithoutGifts.length); i++) {
          fixedOwnership[unassignedGifts[i]] = playersWithoutGifts[i];
          playerGiftsAssigned.add(playersWithoutGifts[i]);
        }
        
        finalOwnership = fixedOwnership;
        console.log('✅ Fixed ownership:', finalOwnership);
      }
    }
    
    // Handle any remaining wrapped gifts - assign to players who don't have one
    const playersWithGifts = new Set(Object.values(finalOwnership));
    const playersWithoutGifts = this.turnOrder.filter(playerId => !playersWithGifts.has(playerId));
    
    // Assign wrapped gifts to players who don't have one
    for (let i = 0; i < Math.min(this.wrappedGifts.length, playersWithoutGifts.length); i++) {
      const giftId = this.wrappedGifts[i];
      const playerId = playersWithoutGifts[i];
      finalOwnership[giftId] = playerId;
    }

    return {
      phase: 'ENDED',
      finalOwnership,
      state: this.getState(),
    };
  }
}


