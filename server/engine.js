/**
 * Game Engine - White Elephant Game Logic
 */
export class GameEngine {
  constructor(gameState, config) {
    this.partyId = gameState.partyId;
    this.currentPlayerId = gameState.currentPlayerId;
    this.turnOrder = [...gameState.turnOrder];
    this.stealStack = [...gameState.stealStack];
    this.wrappedGifts = [...gameState.wrappedGifts];
    this.unwrappedGifts = new Map(gameState.unwrappedGifts);
    this.turnAction = new Map(gameState.turnAction);
    this.phase = gameState.phase || 'ACTIVE';
    this.config = config;
    this.isBoomerangPhase = gameState.isBoomerangPhase || false;
    // Initialize history array to track all picks and steals
    this.history = gameState.history || [];
  }

  /**
   * Check if player can pick a wrapped gift
   */
  canPick(playerId) {
    if (this.currentPlayerId !== playerId) return false;
    if (this.turnAction.get(playerId)) return false; // Already acted this turn
    if (this.wrappedGifts.length === 0) return false; // No wrapped gifts left
    return true;
  }

  /**
   * Check if gift is stealable
   */
  canSteal(giftId, playerId) {
    if (this.currentPlayerId !== playerId) return false;
    if (this.turnAction.get(playerId)) return false; // Already acted this turn
    
    const gift = this.unwrappedGifts.get(giftId);
    if (!gift) return false; // Gift doesn't exist or is wrapped
    if (gift.isFrozen) return false; // Gift is frozen
    if (gift.ownerId === playerId) return false; // Can't steal your own gift
    
    return true;
  }

  /**
   * Player picks a wrapped gift
   */
  pickGift(giftId, playerId) {
    if (!this.canPick(playerId)) {
      throw new Error('Cannot pick gift: invalid action');
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

    // Find the gift that the stealing player currently owns (if any)
    // IMPORTANT: Use a different variable name to avoid shadowing the parameter giftId
    let playerCurrentGiftId = null;
    for (const [currentGiftId, gift] of this.unwrappedGifts.entries()) {
      if (gift.ownerId === playerId) {
        playerCurrentGiftId = currentGiftId;
        break;
      }
    }

    // Increment steal count on the stolen gift
    stolenGift.stealCount += 1;

    // Check if stolen gift should be frozen
    const isFrozenNow = stolenGift.stealCount >= this.config.maxSteals;
    if (isFrozenNow) {
      stolenGift.isFrozen = true;
    }

    // Transfer stolen gift to the stealing player
    stolenGift.ownerId = playerId;

    // If the stealing player had a gift, give it to the previous owner
    if (playerCurrentGiftId) {
      const playerGift = this.unwrappedGifts.get(playerCurrentGiftId);
      if (!playerGift) {
        throw new Error(`Player's current gift ${playerCurrentGiftId} not found in unwrappedGifts`);
      }
      // Exchange: previous owner gets the stealing player's old gift
      playerGift.ownerId = previousOwnerId;
      // Reset steal count and frozen status for the exchanged gift (it's a fresh exchange)
      playerGift.stealCount = 0;
      playerGift.isFrozen = false;
    } else {
      // If stealing player had no gift (first turn), previous owner goes to steal stack to pick a new gift
      this.stealStack.unshift(previousOwnerId);
    }
    
    // Validation: ensure no gift has duplicate owners
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
   * Get next player from turn order or steal stack
   * Returns null if game should end
   * 
   * Game flow:
   * 1. Normal phase: Players go through turn order (randomly shuffled at start)
   * 2. When last player finishes normal phase:
   *    - If returnToStart is true: Enter boomerang phase, go backwards
   *    - If returnToStart is false: Game ends
   * 3. Boomerang phase: Go backwards through turn order
   * 4. When first player (index 0) completes their turn in boomerang: Game ends
   */
  getNextPlayer() {
    // Check steal stack first (players who had gifts stolen go next)
    if (this.stealStack.length > 0) {
      return this.stealStack.shift();
    }

    // Get current player index
    const currentIndex = this.turnOrder.indexOf(this.currentPlayerId);
    
    // Check if we need to handle boomerang
    if (this.isBoomerangPhase) {
      // Reverse order: go backwards through the turn order
      if (currentIndex > 0) {
        // Still more players to go in reverse (go to previous player)
        return this.turnOrder[currentIndex - 1];
      } else {
        // Reached the first player (index 0) in boomerang phase
        // After this player completes their turn, game ends automatically
        return null;
      }
    } else {
      // Normal forward order
      if (currentIndex < this.turnOrder.length - 1) {
        // More players in normal order (go to next player)
        return this.turnOrder[currentIndex + 1];
      } else {
        // Last player in normal order just finished
        if (this.config.returnToStart) {
          // Enter boomerang phase: reverse back through the order
          // Start from second-to-last player (since last player just went)
          this.isBoomerangPhase = true;
          if (this.turnOrder.length > 1) {
            return this.turnOrder[this.turnOrder.length - 2];
          } else {
            // Only one player, game ends
            return null;
          }
        } else {
          // No boomerang: game ends after last player completes their turn
          return null;
        }
      }
    }
  }

  /**
   * End current turn and advance to next player
   */
  endTurn() {
    const nextPlayer = this.getNextPlayer();
    
    if (nextPlayer === null) {
      // Game ends
      this.phase = 'ENDED';
      return this.getState();
    }

    // Reset turn action for previous player
    this.turnAction.set(this.currentPlayerId, null);
    
    // Advance to next player
    this.currentPlayerId = nextPlayer;
    this.turnAction.set(nextPlayer, null);

    return this.getState();
  }

  /**
   * Get current game state
   */
  getState() {
    return {
      partyId: this.partyId,
      currentPlayerId: this.currentPlayerId,
      turnOrder: [...this.turnOrder],
      stealStack: [...this.stealStack],
      wrappedGifts: [...this.wrappedGifts],
      unwrappedGifts: Array.from(this.unwrappedGifts.entries()),
      turnAction: Array.from(this.turnAction.entries()),
      phase: this.phase,
      isBoomerangPhase: this.isBoomerangPhase,
      history: [...this.history], // Include history in state
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
      
      if (reconstructedDuplicates.length === 0) {
        console.log('Using reconstructed ownership from history');
        finalOwnership = reconstructedOwnership;
      } else {
        console.error('Reconstructed ownership also has duplicates!', reconstructedDuplicates);
        // Fix duplicates: keep only the first gift per player (based on order in unwrappedGifts)
        const fixedOwnership = {};
        const playerGiftsAssigned = new Set();
        
        for (const [giftId, gift] of this.unwrappedGifts.entries()) {
          if (gift.ownerId && !playerGiftsAssigned.has(gift.ownerId)) {
            fixedOwnership[giftId] = gift.ownerId;
            playerGiftsAssigned.add(gift.ownerId);
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


