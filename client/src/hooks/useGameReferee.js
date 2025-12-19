/**
 * useGameReferee Hook
 * Validates game state in real-time and tracks audit log entries
 */
import { useState, useEffect, useRef } from 'react';

export function useGameReferee(gameState, userNames = {}, userEmails = {}) {
  const [auditLog, setAuditLog] = useState([]);
  const prevStateRef = useRef(null);
  const logIdCounter = useRef(0);
  
  // Helper function to get display name for a player ID
  const getPlayerName = (playerId) => {
    if (!playerId) return 'Unknown';
    
    // First, try to get the name from userNames (this works for both bots and real users)
    if (userNames[playerId] && userNames[playerId] !== playerId) {
      return userNames[playerId];
    }
    
    // Fallback to email if available
    if (userEmails[playerId]) {
      return userEmails[playerId];
    }
    
    // For bots, extract a readable identifier from the bot ID
    // Bot IDs are formatted as: bot_${partyId}_${timestamp}_${index}_${random}
    if (playerId.startsWith('bot_')) {
      // Try to extract a meaningful part (e.g., "Bot QpXX" from "bot_..._0_qpxx")
      const parts = playerId.split('_');
      if (parts.length >= 4) {
        // Use the random suffix (last part) for a short identifier
        const suffix = parts[parts.length - 1];
        return `Bot ${suffix.slice(0, 4).toUpperCase()}`;
      }
      // Fallback: use first 8 chars after "bot_"
      return `Bot ${playerId.slice(4, 12)}`;
    }
    
    // For real users, show first 8 chars of ID
    return playerId.slice(0, 8);
  };

  useEffect(() => {
    // Handle null/undefined gameState gracefully
    if (!gameState || !gameState.turnOrder) {
      // Reset audit log if gameState becomes null, but preserve snapshots
      if (gameState === null || gameState === undefined) {
        setAuditLog((prev) => {
          // Preserve any existing SNAPSHOT entries even when gameState is null
          const existingSnapshots = prev.filter(entry => entry.type === 'SNAPSHOT');
          return existingSnapshots;
        });
        prevStateRef.current = null;
      }
      return;
    }

    const prevState = prevStateRef.current;
    const currentState = gameState;

    // Initialize previous state if first run
    // CRITICAL: Only reset audit log on first run (prevState is null)
    // This prevents losing snapshots when gameState object reference changes but history is the same
    if (!prevState) {
      // If this is a completed game with history, generate audit entries from history
      const initialEntries = [];
      
      // Add game metadata entry at the start
      const turnOrder = currentState.turnOrder || [];
      const turnQueue = currentState.turnQueue || turnOrder;
      const config = currentState.config || {};
      const isBoomerangMode = config.returnToStart === true;
      const maxSteals = config.maxSteals || 3;
      const playerCount = turnOrder.length;
      const totalTurns = turnQueue.length;
      const phase = currentState.phase || 'UNKNOWN';
      
      initialEntries.push({
        id: logIdCounter.current++,
        type: 'EVENT',
        eventType: 'INFO',
        message: `Game Started: ${playerCount} players, ${isBoomerangMode ? 'Boomerang Mode' : 'Standard Mode'}, Max Steals: ${maxSteals}, Total Turns: ${totalTurns}, Phase: ${phase}`,
        timestamp: new Date().toISOString(),
      });
      
      const history = currentState.history || [];
      
      if (history.length > 0) {
        // Reconstruct the turn flow from history by simulating game state progression
        // This must match the real-time logic exactly
        const turnQueue = currentState.turnQueue || currentState.turnOrder || [];
        let simulatedTurnIndex = 0;
        let simulatedCurrentPlayerId = turnQueue[0] || null;
        let previousPlayerId = null;
        let previousTurnIndex = -1;
        let pausedTurnIndex = null; // Track paused turn index during steal chains
        
        // Helper function to check if player has gift (same as real-time logic)
        const playerHasGift = (playerId) => {
          if (!playerId) return false;
          let unwrappedMap = new Map();
          if (currentState.unwrappedGifts) {
            if (currentState.unwrappedGifts instanceof Map) {
              unwrappedMap = currentState.unwrappedGifts;
            } else if (Array.isArray(currentState.unwrappedGifts)) {
              if (currentState.unwrappedGifts.length > 0 && Array.isArray(currentState.unwrappedGifts[0])) {
                unwrappedMap = new Map(currentState.unwrappedGifts);
              }
            }
          }
          for (const [_, giftData] of unwrappedMap.entries()) {
            if (giftData?.ownerId === playerId) {
              return true;
            }
          }
          return false;
        };
        
        // Track unwrapped gifts state as we progress through history
        // This allows us to accurately check playerHasGift at each point in time
        const unwrappedGiftsState = new Map();
        
        // Helper function that uses the current unwrappedGiftsState
        const playerHasGiftAtThisPoint = (playerId) => {
          if (!playerId) return false;
          for (const [_, giftData] of unwrappedGiftsState.entries()) {
            if (giftData?.ownerId === playerId) {
              return true;
            }
          }
          return false;
        };
        
        // Track the previous event type to know if a skip is due to steal chain
        let previousEventType = null;
        
        history.forEach((event, eventIndex) => {
          const actingPlayerId = event.playerId;
          const eventTimestamp = event.timestamp ? new Date(event.timestamp) : new Date();
          
          // Helper function to generate TURN entry and validation
          const generateTurnEntry = (fromPlayerId, toPlayerId, timestamp, isStealChain = false) => {
            if (fromPlayerId === null || toPlayerId === null || fromPlayerId === toPlayerId) {
              return;
            }
            
            const prevIndex = turnQueue.indexOf(fromPlayerId);
            const currentIndex = turnQueue.indexOf(toPlayerId);
            
            if (prevIndex < 0 || currentIndex < 0) {
              return; // Invalid indices
            }
            
            initialEntries.push({
              id: logIdCounter.current++,
              type: 'EVENT',
              eventType: 'TURN',
              message: `${getPlayerName(fromPlayerId)} (Index ${prevIndex}) -> ${getPlayerName(toPlayerId)} (Index ${currentIndex})`,
              timestamp: timestamp,
            });
            
            // Check for turn skipping validation
            if (prevIndex >= 0 && currentIndex >= 0) {
              const expectedNextIndex = prevIndex + 1;
              const isBoomerangPhase = currentState.isBoomerangPhase;
              
              if (isBoomerangPhase) {
                const expectedBoomerangIndex = prevIndex - 1;
                if (currentIndex !== expectedBoomerangIndex && currentIndex !== prevIndex && !isStealChain) {
                  const expectedPlayerId = turnQueue[expectedBoomerangIndex];
                  const expectedPlayerHasGift = expectedPlayerId ? playerHasGiftAtThisPoint(expectedPlayerId) : false;
                  const stealStackLength = 0;
                  
                  if (stealStackLength === 0 && !expectedPlayerHasGift && Math.abs(currentIndex - expectedBoomerangIndex) > 1) {
                    initialEntries.push({
                      id: logIdCounter.current++,
                      type: 'EVENT',
                      eventType: 'WARNING',
                      message: `Turn index skipped: ${prevIndex} -> ${currentIndex} (expected ${expectedBoomerangIndex} in boomerang)`,
                      timestamp: timestamp,
                    });
                  }
                }
              } else {
                if (currentIndex !== expectedNextIndex && currentIndex !== prevIndex && !isStealChain) {
                  let allSkippedPlayersHaveGifts = true;
                  const startIndex = Math.min(expectedNextIndex, currentIndex);
                  const endIndex = Math.max(expectedNextIndex, currentIndex);
                  
                  for (let i = startIndex; i < endIndex; i++) {
                    if (i !== currentIndex && i !== prevIndex) {
                      const skippedPlayerId = turnQueue[i];
                      if (skippedPlayerId && !playerHasGiftAtThisPoint(skippedPlayerId)) {
                        allSkippedPlayersHaveGifts = false;
                        break;
                      }
                    }
                  }
                  
                  const stealStackLength = 0;
                  if (stealStackLength === 0 && !allSkippedPlayersHaveGifts && Math.abs(currentIndex - expectedNextIndex) > 1) {
                    initialEntries.push({
                      id: logIdCounter.current++,
                      type: 'EVENT',
                      eventType: 'WARNING',
                      message: `Turn index skipped: ${prevIndex} -> ${currentIndex} (expected ${expectedNextIndex})`,
                      timestamp: timestamp,
                    });
                  }
                }
              }
            }
          };
          
          // If the acting player is different from simulated current player, infer intermediate turn changes
          // This handles cases where players ended their turn (skipped) between events
          // CRITICAL: Skip this inference if the previous event was a STEAL - the victim becomes active immediately
          // Per GAME_RULES.md Rule 2: After STEAL, victim becomes active immediately (no turn progression)
          if (actingPlayerId !== simulatedCurrentPlayerId && simulatedCurrentPlayerId !== null && previousEventType !== 'STEAL') {
            // The current player must have ended their turn, advancing to the acting player
            // We need to simulate the turn progression through the queue
            let currentIndex = turnQueue.indexOf(simulatedCurrentPlayerId);
            const targetIndex = turnQueue.indexOf(actingPlayerId);
            
            // CRITICAL: Update simulatedTurnIndex to match currentIndex to keep them in sync
            if (currentIndex >= 0) {
              simulatedTurnIndex = currentIndex;
            }
            
            // Advance through the queue until we reach the acting player
            while (currentIndex >= 0 && currentIndex < turnQueue.length && currentIndex !== targetIndex) {
              const currentPlayer = turnQueue[currentIndex];
              const nextIndex = currentIndex + 1;
              
              if (nextIndex >= turnQueue.length) {
                break; // End of queue
              }
              
              const nextPlayer = turnQueue[nextIndex];
              
              // Generate TURN entry for this intermediate change
              if (currentPlayer !== nextPlayer) {
                generateTurnEntry(currentPlayer, nextPlayer, eventTimestamp, false);
                previousPlayerId = currentPlayer;
                previousTurnIndex = currentIndex;
                simulatedCurrentPlayerId = nextPlayer;
                // CRITICAL: Update simulatedTurnIndex to match nextIndex to keep them in sync
                simulatedTurnIndex = nextIndex;
              }
              
              currentIndex = nextIndex;
              
              // Stop if we've reached the target or gone past it
              if (currentIndex >= targetIndex) {
                break;
              }
            }
            
            // Update to the acting player
            if (targetIndex >= 0) {
              simulatedCurrentPlayerId = actingPlayerId;
              // CRITICAL: Update simulatedTurnIndex to match targetIndex to keep them in sync
              simulatedTurnIndex = targetIndex;
            }
          } else if (previousEventType === 'STEAL' && actingPlayerId !== simulatedCurrentPlayerId) {
            // After a STEAL, the victim becomes active immediately - no turn progression needed
            // Just update the simulated current player to the victim
            // CRITICAL: Do NOT update simulatedTurnIndex - it's paused at the stealer's position
            simulatedCurrentPlayerId = actingPlayerId;
          }
          
          // Generate TURN entry BEFORE processing the event (showing who's turn it is)
          // This matches real-time behavior where we log the turn before the action
          // CRITICAL: Skip pre-event TURN entry for:
          // 1. STEAL events - TURN entry is generated after STEAL to show stealer -> victim
          // 2. END_TURN after STEAL - victim is already active, no need for pre-event TURN entry
          const shouldSkipPreEventTurn = 
            event.type === 'STEAL' || 
            (event.type === 'END_TURN' && previousEventType === 'STEAL');
          
          if (!shouldSkipPreEventTurn && simulatedCurrentPlayerId !== null && simulatedCurrentPlayerId !== previousPlayerId && previousPlayerId !== null && previousEventType !== 'STEAL') {
            generateTurnEntry(previousPlayerId, simulatedCurrentPlayerId, eventTimestamp, false);
          }
          
          // Generate PICK entries (the action happens)
          if (event.type === 'PICK') {
            // Get gift name if available (from gifts object or use ID)
            const giftName = event.giftId ? `Gift ${event.giftId.slice(0, 8)}` : 'a gift';
            initialEntries.push({
              id: logIdCounter.current++,
              type: 'EVENT',
              eventType: 'PICK',
              message: `${getPlayerName(actingPlayerId)} picked ${giftName}`,
              timestamp: eventTimestamp,
            });
            
            // Update unwrapped gifts state
            unwrappedGiftsState.set(event.giftId, { ownerId: actingPlayerId, stealCount: 0, isFrozen: false });
          } else if (event.type === 'STEAL') {
            // Update stolen gift ownership
            for (const [giftId, giftData] of unwrappedGiftsState.entries()) {
              if (giftData.ownerId === event.previousOwnerId && giftId === event.giftId) {
                unwrappedGiftsState.set(giftId, {
                  ownerId: actingPlayerId,
                  stealCount: event.stealCount || 0,
                  isFrozen: event.isFrozen || false
                });
                break;
              }
            }
            // Handle exchanged gift if present (stealer's old gift goes to victim)
            if (event.exchangedGiftId) {
              for (const [giftId, giftData] of unwrappedGiftsState.entries()) {
                if (giftId === event.exchangedGiftId && giftData.ownerId === actingPlayerId) {
                  unwrappedGiftsState.set(giftId, {
                    ownerId: event.previousOwnerId,
                    stealCount: 0,
                    isFrozen: false
                  });
                  break;
                }
              }
            }
          }
          
          // Generate STEAL entries (the action happens)
          if (event.type === 'STEAL') {
            const stealCount = event.stealCount || 0;
            const maxSteals = currentState.config?.maxSteals || 3;
            initialEntries.push({
              id: logIdCounter.current++,
              type: 'EVENT',
              eventType: 'STEAL',
              message: `${getPlayerName(event.playerId)} stole from ${getPlayerName(event.previousOwnerId)}. Steal Count: ${stealCount}/${maxSteals}`,
              timestamp: eventTimestamp,
            });
            
            // After STEAL: currentPlayerId becomes the victim (previousOwnerId)
            // CRITICAL: Per GAME_RULES.md Rule 2, after STEAL the victim becomes active immediately
            // Generate TURN entry showing stealer -> victim transition
            // The stealer is the actingPlayerId (event.playerId), not simulatedCurrentPlayerId
            // because simulatedCurrentPlayerId might not be set correctly yet
            const stealerId = event.playerId; // The stealer (actingPlayerId)
            const victimId = event.previousOwnerId; // The victim
            if (stealerId && victimId && stealerId !== victimId) {
              generateTurnEntry(stealerId, victimId, eventTimestamp, true); // isStealChain = true
            }
            previousPlayerId = stealerId;
            const stealerIndex = turnQueue.indexOf(stealerId);
            previousTurnIndex = stealerIndex;
            // CRITICAL: Preserve the stealer's turn index - turn order is paused during steal chain
            // Per GAME_RULES.md Rule 6: "Turn order is PAUSED (currentTurnIndex does not increment)"
            // Also update simulatedTurnIndex to the stealer's index so it's correctly tracked
            pausedTurnIndex = stealerIndex;
            simulatedTurnIndex = stealerIndex; // Keep simulatedTurnIndex in sync with paused position
            simulatedCurrentPlayerId = victimId;
            previousEventType = 'STEAL';
          } else if (event.type === 'PICK') {
            // After PICK: advance to next player in turnQueue
            previousPlayerId = simulatedCurrentPlayerId;
            previousTurnIndex = turnQueue.indexOf(simulatedCurrentPlayerId);
            
            // CRITICAL: If this is a victim picking after a steal, resume from paused turn index
            // Per GAME_RULES.md Rule 6: "Turn order resumes when victim picks a new gift (PICK action)"
            if (previousEventType === 'STEAL' && pausedTurnIndex !== null) {
              // Resume from the paused position (stealer's position) and increment
              simulatedTurnIndex = pausedTurnIndex + 1;
              pausedTurnIndex = null; // Clear paused index
            } else {
              // Normal turn progression
              simulatedTurnIndex = (simulatedTurnIndex || 0) + 1;
            }
            
            if (simulatedTurnIndex < turnQueue.length) {
              simulatedCurrentPlayerId = turnQueue[simulatedTurnIndex];
            } else {
              simulatedCurrentPlayerId = null; // Game ended
            }
            previousEventType = 'PICK';
          } else if (event.type === 'END_TURN') {
            // After END_TURN (Skip): advance to next player in turnQueue
            // CRITICAL: Ensure skipped turns are recorded in audit trail
            const skippingPlayerId = event.playerId;
            const skipIndex = turnQueue.indexOf(skippingPlayerId);
            
            // Add explicit SKIP entry to audit trail
            initialEntries.push({
              id: logIdCounter.current++,
              type: 'EVENT',
              eventType: 'SKIP',
              message: `${getPlayerName(skippingPlayerId)} skipped their turn (Index ${skipIndex})`,
              timestamp: eventTimestamp,
            });
            
            // Generate TURN entry for the skip (player -> next player)
            previousPlayerId = simulatedCurrentPlayerId;
            previousTurnIndex = turnQueue.indexOf(simulatedCurrentPlayerId);
            
            // CRITICAL: If this is a victim skipping after a steal, resume from paused turn index
            // Per GAME_RULES.md Rule 6: "Turn order resumes when victim picks a new gift (PICK action) or skips (END_TURN action)"
            if (previousEventType === 'STEAL' && pausedTurnIndex !== null) {
              // Resume from the paused position (stealer's position) and increment
              simulatedTurnIndex = pausedTurnIndex + 1;
              pausedTurnIndex = null; // Clear paused index
            } else {
              // Normal turn progression
              simulatedTurnIndex = (simulatedTurnIndex || 0) + 1;
            }
            
            if (simulatedTurnIndex < turnQueue.length) {
              const nextPlayerId = turnQueue[simulatedTurnIndex];
              // Generate TURN entry showing the skip
              if (simulatedCurrentPlayerId && nextPlayerId && simulatedCurrentPlayerId !== nextPlayerId) {
                generateTurnEntry(simulatedCurrentPlayerId, nextPlayerId, eventTimestamp, false);
              }
              simulatedCurrentPlayerId = nextPlayerId;
            } else {
              simulatedCurrentPlayerId = null; // Game ended
            }
            previousEventType = 'END_TURN';
          }
        });
        
        // Run validation checks on the final state
        let unwrappedMap = new Map();
        if (currentState.unwrappedGifts) {
          if (currentState.unwrappedGifts instanceof Map) {
            unwrappedMap = currentState.unwrappedGifts;
          } else if (Array.isArray(currentState.unwrappedGifts)) {
            if (currentState.unwrappedGifts.length > 0 && Array.isArray(currentState.unwrappedGifts[0])) {
              unwrappedMap = new Map(currentState.unwrappedGifts);
            }
          }
        }
        
        // Check for duplicate ownership
        const ownerCounts = new Map();
        unwrappedMap.forEach((giftData, giftId) => {
          if (giftData?.ownerId) {
            const count = ownerCounts.get(giftData.ownerId) || 0;
            ownerCounts.set(giftData.ownerId, count + 1);
          }
        });
        
        ownerCounts.forEach((count, ownerId) => {
          if (count > 1) {
          initialEntries.push({
            id: logIdCounter.current++,
            type: 'EVENT',
            eventType: 'ERROR',
            message: `Duplicate ownership detected: ${getPlayerName(ownerId)} has ${count} gifts!`,
            timestamp: new Date(),
          });
          }
        });
        
        // Check for ghost gifts
        unwrappedMap.forEach((giftData, giftId) => {
          if (giftData !== null && giftData !== undefined) {
            if (typeof giftData === 'object' && !giftData.ownerId) {
              initialEntries.push({
                id: logIdCounter.current++,
                type: 'EVENT',
                eventType: 'ERROR',
                message: `Ghost gift detected: Gift ${giftId?.slice(0, 8) || 'unknown'} is unwrapped but has no owner!`,
                timestamp: new Date(),
              });
            }
          }
        });
        
        // Set initial audit log from history (reverse to show newest first)
        // CRITICAL: Preserve any existing SNAPSHOT entries when resetting from history
        // The game metadata entry is always added at the start of initialEntries
        setAuditLog((prev) => {
          // Extract any existing SNAPSHOT entries from previous audit log
          const existingSnapshots = prev.filter(entry => entry.type === 'SNAPSHOT');
          // Combine: new entries from history (including metadata) + existing snapshots (newest first)
          // CRITICAL: Always preserve snapshots, even if prev is empty (component remount)
          // initialEntries always contains at least the metadata entry
          return [...initialEntries.reverse(), ...existingSnapshots];
        });
      }
      
      prevStateRef.current = {
        currentPlayerId: currentState.currentPlayerId,
        turnOrder: currentState.turnOrder || [],
        unwrappedGifts: currentState.unwrappedGifts || [],
        history: currentState.history || [],
        historyLength: (currentState.history || []).length, // Track history length
        currentTurnIndex: currentState.turnOrder?.indexOf(currentState.currentPlayerId) ?? -1,
        lastEventType: null, // Track last event type for steal chain detection
      };
      return;
    }

    const newLogEntries = [];

    // Get current turn index
    const currentTurnIndex = currentState.turnOrder?.indexOf(currentState.currentPlayerId) ?? -1;
    const prevTurnIndex = prevState.currentTurnIndex;

    // Check if this turn change is due to a steal chain
    // If the last event in history was a STEAL, this is a valid steal chain skip
    // CRITICAL: Use historyLength from prevState if available, otherwise fall back to history.length
    // This prevents duplicate processing when state updates multiple times
    const prevHistoryLength = prevState.historyLength ?? (prevState.history?.length || 0);
    const currentHistoryLength = currentState.history?.length || 0;
    const isStealChain = currentHistoryLength > prevHistoryLength && 
      currentState.history[currentHistoryLength - 1]?.type === 'STEAL';
    
    // Check if the last event was an END_TURN (skip)
    const lastEvent = currentHistoryLength > prevHistoryLength ? 
      currentState.history[currentHistoryLength - 1] : null;
    const isSkip = lastEvent?.type === 'END_TURN';

    // Check for turn changes
    // CRITICAL: Only generate entries if this is a NEW state change (not a duplicate update)
    // Check if history length changed to ensure we're processing a new event
    const historyChanged = currentHistoryLength > prevHistoryLength;
    
    if (currentState.currentPlayerId !== prevState.currentPlayerId && historyChanged) {
      // If this turn change was due to a skip, log it explicitly
      if (isSkip && lastEvent?.playerId === prevState.currentPlayerId) {
        const skipIndex = prevState.turnOrder?.indexOf(prevState.currentPlayerId) ?? -1;
        newLogEntries.push({
          id: logIdCounter.current++,
          type: 'EVENT',
          eventType: 'SKIP',
          message: `${getPlayerName(prevState.currentPlayerId)} skipped their turn (Index ${skipIndex})`,
          timestamp: new Date(),
        });
      }
      const prevPlayerName = prevState.currentPlayerId || 'None';
      const currentPlayerName = currentState.currentPlayerId || 'None';
      const prevIndex = prevState.turnOrder?.indexOf(prevState.currentPlayerId) ?? -1;
      const currentIndex = currentTurnIndex;

      newLogEntries.push({
        id: logIdCounter.current++,
        type: 'EVENT',
        eventType: 'TURN',
        message: `${getPlayerName(prevState.currentPlayerId)} (Index ${prevIndex}) -> ${getPlayerName(currentState.currentPlayerId)} (Index ${currentIndex})`,
        timestamp: new Date(),
      });

      // Check for turn skipping (unless it's a valid skip due to steal recovery or players with gifts)
      if (prevTurnIndex >= 0 && currentIndex >= 0) {
        const expectedNextIndex = prevTurnIndex + 1;
        const isBoomerangPhase = currentState.isBoomerangPhase;
        
        // Helper: Check if a player at a given index already has a gift
        const playerHasGift = (playerIndex) => {
          if (playerIndex < 0 || playerIndex >= (currentState.turnOrder?.length || 0)) {
            return false;
          }
          const playerId = currentState.turnOrder[playerIndex];
          if (!playerId) return false;
          
          // Check unwrappedGifts to see if this player owns any gift
          let unwrappedMap = new Map();
          if (currentState.unwrappedGifts) {
            if (currentState.unwrappedGifts instanceof Map) {
              unwrappedMap = currentState.unwrappedGifts;
            } else if (Array.isArray(currentState.unwrappedGifts)) {
              if (currentState.unwrappedGifts.length > 0 && Array.isArray(currentState.unwrappedGifts[0])) {
                unwrappedMap = new Map(currentState.unwrappedGifts);
              }
            }
          }
          
          for (const [_, giftData] of unwrappedMap.entries()) {
            if (giftData?.ownerId === playerId) {
              return true;
            }
          }
          return false;
        };
        
        // In boomerang phase, turns go backwards
        if (isBoomerangPhase) {
          const expectedBoomerangIndex = prevTurnIndex - 1;
          // Skip validation if this is a steal chain (turn goes to victim - valid)
          if (currentIndex !== expectedBoomerangIndex && currentIndex !== prevTurnIndex && !isStealChain) {
            // Check if there's a steal stack that would explain the skip
            const stealStackLength = currentState.stealStack?.length || 0;
            // Check if the expected player already has a gift (valid skip - they can skip their turn)
            const expectedPlayerHasGift = playerHasGift(expectedBoomerangIndex);
            
            // Only warn if expected player doesn't have a gift (they should have been able to act)
            // If they have a gift, skipping them is valid (they can skip their turn if happy with their gift)
            if (stealStackLength === 0 && !expectedPlayerHasGift && Math.abs(currentIndex - expectedBoomerangIndex) > 1) {
                newLogEntries.push({
                  id: logIdCounter.current++,
                  type: 'EVENT',
                  eventType: 'WARNING',
                  message: `Turn index skipped: ${prevTurnIndex} -> ${currentIndex} (expected ${expectedBoomerangIndex} in boomerang)`,
                  timestamp: new Date(),
                });
            }
          }
        } else {
          // Normal phase - check for skipping
          // Skip validation if this is a steal chain (turn goes to victim - valid)
          if (currentIndex !== expectedNextIndex && currentIndex !== prevTurnIndex && !isStealChain) {
            // Check if all skipped players have gifts (valid skip - they can all skip their turns)
            // If any skipped player doesn't have a gift, that's a warning
            let allSkippedPlayersHaveGifts = true;
            const startIndex = Math.min(expectedNextIndex, currentIndex);
            const endIndex = Math.max(expectedNextIndex, currentIndex);
            
            // Check each player between expected and actual (excluding the actual player)
            for (let i = startIndex; i < endIndex; i++) {
              if (i !== currentIndex && i !== prevTurnIndex) {
                const skippedPlayerId = currentState.turnOrder[i];
                if (skippedPlayerId && !playerHasGift(i)) {
                  allSkippedPlayersHaveGifts = false;
                  break;
                }
              }
            }
            
            // Check steal stack (though it should be 0 for most cases)
            const stealStackLength = currentState.stealStack?.length || 0;
            
            // Only warn if any skipped player doesn't have a gift (they should have been able to act)
            // If all skipped players have gifts, skipping them is valid (they can skip their turns)
            if (stealStackLength === 0 && !allSkippedPlayersHaveGifts && Math.abs(currentIndex - expectedNextIndex) > 1) {
                newLogEntries.push({
                  id: logIdCounter.current++,
                  type: 'EVENT',
                  eventType: 'WARNING',
                  message: `Turn index skipped: ${prevTurnIndex} -> ${currentIndex} (expected ${expectedNextIndex})`,
                  timestamp: new Date(),
                });
            }
          }
        }
      }
    }

    // Check for new steal events in history
    // Note: prevHistoryLength and currentHistoryLength are already declared above
    if (currentHistoryLength > prevHistoryLength) {
      const newHistoryItems = currentState.history.slice(prevHistoryLength);
      newHistoryItems.forEach((event) => {
        if (event.type === 'STEAL') {
          const stealCount = event.stealCount || 0;
          const maxSteals = currentState.config?.maxSteals || 3;
          newLogEntries.push({
            id: logIdCounter.current++,
            type: 'EVENT',
            eventType: 'STEAL',
            message: `${getPlayerName(event.playerId)} stole from ${getPlayerName(event.previousOwnerId)}. Steal Count: ${stealCount}/${maxSteals}`,
            timestamp: new Date(),
          });
        }
      });
    }

    // Validate unwrapped gifts for rule violations
    // unwrappedGifts can be a Map, array of [key, value] pairs, or array of objects
    let unwrappedMap = new Map();
    if (currentState.unwrappedGifts) {
      if (currentState.unwrappedGifts instanceof Map) {
        unwrappedMap = currentState.unwrappedGifts;
      } else if (Array.isArray(currentState.unwrappedGifts)) {
        // Handle array of [key, value] pairs (from Map.entries())
        if (currentState.unwrappedGifts.length > 0 && Array.isArray(currentState.unwrappedGifts[0])) {
          unwrappedMap = new Map(currentState.unwrappedGifts);
        } else {
          // Handle array of objects with id/ownerId properties
          currentState.unwrappedGifts.forEach((item) => {
            if (item && typeof item === 'object') {
              const giftId = item.id || item[0];
              const giftData = item.data || item[1] || item;
              if (giftId) {
                unwrappedMap.set(giftId, giftData);
              }
            }
          });
        }
      }
    }

    // Check for duplicate ownership (Double Dip)
    const ownerCounts = new Map();
    unwrappedMap.forEach((giftData, giftId) => {
      if (giftData?.ownerId) {
        const count = ownerCounts.get(giftData.ownerId) || 0;
        ownerCounts.set(giftData.ownerId, count + 1);
      }
    });

    ownerCounts.forEach((count, ownerId) => {
      if (count > 1) {
        newLogEntries.push({
          id: logIdCounter.current++,
          type: 'EVENT',
          eventType: 'ERROR',
          message: `Duplicate ownership detected: ${getPlayerName(ownerId)} has ${count} gifts!`,
          timestamp: new Date(),
        });
      }
    });

    // Check for ghost gifts (unwrapped but no owner)
    unwrappedMap.forEach((giftData, giftId) => {
      // A gift is a "ghost" if it's in unwrappedGifts but has no ownerId
      // giftData can be null, undefined, or an object
      if (giftData !== null && giftData !== undefined) {
        // If it's an object, check if ownerId is missing
        if (typeof giftData === 'object' && !giftData.ownerId) {
            newLogEntries.push({
              id: logIdCounter.current++,
              type: 'EVENT',
              eventType: 'ERROR',
              message: `Ghost gift detected: Gift ${giftId?.slice(0, 8) || 'unknown'} is unwrapped but has no owner!`,
              timestamp: new Date(),
            });
        }
      } else if (giftData === null) {
        // giftData is explicitly null - this might be a ghost gift
          newLogEntries.push({
            id: logIdCounter.current++,
            type: 'EVENT',
            eventType: 'WARNING',
            message: `Potential ghost gift: Gift ${giftId?.slice(0, 8) || 'unknown'} is in unwrappedGifts but data is null`,
            timestamp: new Date(),
          });
      }
    });

    // Update audit log with new entries
    // CRITICAL: Always preserve SNAPSHOT entries when adding new log entries
    if (newLogEntries.length > 0) {
      setAuditLog((prev) => {
        // Separate snapshots from regular entries
        const snapshots = prev.filter(entry => entry.type === 'SNAPSHOT');
        const regularEntries = prev.filter(entry => entry.type !== 'SNAPSHOT');
        
        // Deduplicate: Check if any new entries already exist in the log
        // Compare by message and timestamp (within 1 second) to avoid exact duplicates
        const deduplicatedNewEntries = newLogEntries.filter(newEntry => {
          // Always allow snapshots
          if (newEntry.type === 'SNAPSHOT') return true;
          
          // Check if this entry already exists in the log
          const exists = regularEntries.some(existingEntry => {
            // Match by message content and event type
            if (existingEntry.type === newEntry.type && 
                existingEntry.eventType === newEntry.eventType &&
                existingEntry.message === newEntry.message) {
              // If timestamps are very close (within 1 second), consider it a duplicate
              const timeDiff = Math.abs(
                new Date(newEntry.timestamp).getTime() - 
                new Date(existingEntry.timestamp).getTime()
              );
              if (timeDiff < 1000) {
                return true; // Duplicate found
              }
            }
            return false;
          });
          
          return !exists; // Only include if not a duplicate
        });
        
        // Add deduplicated new entries to regular entries, then append snapshots
        return [...deduplicatedNewEntries, ...regularEntries, ...snapshots];
      });
    }

    // Update previous state
    // Track last event type for steal chain detection
    const lastEventType = currentHistoryLength > prevHistoryLength 
      ? currentState.history[currentHistoryLength - 1]?.type 
      : prevStateRef.current?.lastEventType || null;
    
    prevStateRef.current = {
      currentPlayerId: currentState.currentPlayerId,
      turnOrder: currentState.turnOrder || [],
      unwrappedGifts: currentState.unwrappedGifts || [],
      history: currentState.history || [],
      historyLength: currentHistoryLength, // Track history length to detect new events
      currentTurnIndex: currentTurnIndex,
      lastEventType: lastEventType,
    };
  }, [gameState]);

  // Function to add snapshot entry (exported via return)
  const addSnapshotEntry = (snapshot) => {
    const newEntry = {
      id: logIdCounter.current++,
      type: 'SNAPSHOT',
      message: `Issue Report: ${snapshot.userDescription.substring(0, 50)}${snapshot.userDescription.length > 50 ? '...' : ''}`,
      timestamp: new Date(),
      snapshot: snapshot
    };
    
    setAuditLog((prev) => [newEntry, ...prev]);
    return newEntry;
  };

  // Function to add error/warning/info entries to audit log
  const addLogEntry = (eventType, message, data = {}) => {
    const newEntry = {
      id: logIdCounter.current++,
      type: 'EVENT',
      eventType: eventType, // 'ERROR', 'WARNING', 'INFO'
      message: message,
      timestamp: new Date(),
      ...data
    };
    
    setAuditLog((prev) => [newEntry, ...prev]);
    return newEntry;
  };

  return { auditLog, addSnapshotEntry, addLogEntry };
}

