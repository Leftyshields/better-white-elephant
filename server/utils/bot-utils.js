/**
 * Bot Auto-Play Utilities
 */
import redisClient from './redis.js';
import { loadGameState, saveGameState } from './game-state-persistence.js';
import { db } from '../config/firebase-admin.js';
import admin from 'firebase-admin';

// Track active bot move timers to prevent duplicate moves
const activeBotTimers = new Map();

// Track bot move attempts to detect infinite loops
const botMoveAttempts = new Map();
const MAX_MOVE_ATTEMPTS = 10; // Prevent infinite loops

// Track bot refresh timers to simulate browser refresh behavior
const botRefreshTimers = new Map();

// Configuration for bot refresh simulation
const BOT_REFRESH_ENABLED = process.env.BOT_REFRESH_SIMULATION === 'true' || false;
const BOT_REFRESH_INTERVAL_MIN = 30000; // 30 seconds minimum between refreshes
const BOT_REFRESH_INTERVAL_MAX = 120000; // 2 minutes maximum between refreshes
const BOT_REFRESH_PROBABILITY = 0.3; // 30% chance of refresh per interval

/**
 * Clear all bot timers and state for a party (for recovery/reset)
 */
export function clearBotState(partyId) {
  // Clear all timers for this party
  const keysToDelete = [];
  for (const key of activeBotTimers.keys()) {
    if (key.startsWith(`${partyId}:`)) {
      clearTimeout(activeBotTimers.get(key));
      keysToDelete.push(key);
    }
  }
  keysToDelete.forEach(key => activeBotTimers.delete(key));
  
  // Clear attempt counters
  const attemptKeysToDelete = [];
  for (const key of botMoveAttempts.keys()) {
    if (key.startsWith(`${partyId}:`)) {
      attemptKeysToDelete.push(key);
    }
  }
  attemptKeysToDelete.forEach(key => botMoveAttempts.delete(key));
  
  // Clear refresh timers
  const refreshKeysToDelete = [];
  for (const key of botRefreshTimers.keys()) {
    if (key.startsWith(`${partyId}:`)) {
      clearTimeout(botRefreshTimers.get(key));
      refreshKeysToDelete.push(key);
    }
  }
  refreshKeysToDelete.forEach(key => botRefreshTimers.delete(key));
  
  console.log(`🧹 Cleared bot state for party ${partyId} (${keysToDelete.length} timers, ${attemptKeysToDelete.length} attempts, ${refreshKeysToDelete.length} refresh timers)`);
}

/**
 * Check if a user ID is a bot
 */
export function isBot(userId) {
  return typeof userId === 'string' && userId.startsWith('bot_');
}

/**
 * Bot decision-making: Choose whether to pick or steal
 * Strategy: 50% chance to steal, 50% chance to pick wrapped gift (when both options available)
 * Handles boomerang phase where bots with gifts can swap
 */
export function botMakeDecision(gameState) {
  const { wrappedGifts, unwrappedGifts, currentPlayerId, currentTurnIndex, turnOrder, config, currentVictim } = gameState;
  const unwrappedMap = new Map(unwrappedGifts);

  // Check if bot already has a gift
  const botHasGift = (() => {
    for (const [_, gift] of unwrappedMap.entries()) {
      if (gift.ownerId === currentPlayerId) {
        return true;
      }
    }
    return false;
  })();

  // CRITICAL: Check if bot is a victim (was stolen from)
  // Per GAME_RULES.md Rule 6: Victims who have no gift MUST pick a new gift (cannot skip)
  const isVictim = currentVictim === currentPlayerId;
  
  // If bot is a victim and has no gift, they MUST pick a wrapped gift (cannot skip)
  if (isVictim && !botHasGift) {
    if (wrappedGifts && wrappedGifts.length > 0) {
      const randomGift = wrappedGifts[Math.floor(Math.random() * wrappedGifts.length)];
      return { action: 'pick', giftId: randomGift };
    }
    // If no wrapped gifts, victim can try to steal
    // (But they should not skip - that would be invalid)
    const stealableGifts = [];
    for (const [giftId, gift] of unwrappedMap.entries()) {
      if (!gift.isFrozen && gift.ownerId !== currentPlayerId) {
        if (gift.lastOwnerId !== currentPlayerId) {
          stealableGifts.push(giftId);
        }
      }
    }
    if (stealableGifts.length > 0) {
      const randomGift = stealableGifts[Math.floor(Math.random() * stealableGifts.length)];
      return { action: 'steal', giftId: randomGift };
    }
    // No legal moves - this is a deadlock (Rule 10 exception allows skip)
    // But this should be rare - log a warning
    console.warn(`⚠️ Victim bot ${currentPlayerId} has no gift and no legal moves - allowing skip to prevent deadlock`);
    return { action: 'skip' };
  }

  // Check if currentTurnIndex is out of bounds (queue exhausted)
  const turnQueueLength = gameState.turnQueue?.length || 0;
  const isQueueExhausted = currentTurnIndex >= turnQueueLength;
  
  // Check if we're in boomerang phase (second half of turn queue)
  // CRITICAL: Boomerang phase only exists if returnToStart is enabled
  const returnToStart = config?.returnToStart || false;
  const isBoomerangPhase = returnToStart && (
    gameState.isBoomerangPhase || 
    (currentTurnIndex >= (turnOrder?.length || 0))
  );

  // CRITICAL: If queue is exhausted but wrapped gifts remain, bot MUST pick a wrapped gift
  // This prevents the game from getting stuck in an infinite loop
  if (isQueueExhausted && wrappedGifts && wrappedGifts.length > 0) {
    // Bot can pick a wrapped gift even if they have a gift (to claim all gifts)
    const randomGift = wrappedGifts[Math.floor(Math.random() * wrappedGifts.length)];
    return { action: 'pick', giftId: randomGift };
  }

  // If bot has a gift and we're in standard phase, check if bot can act
  // Per GAME_RULES.md Rule 10: Players can only skip if they have a gift they like
  // In Standard Phase, players with gifts can only skip if:
  // - They are Player 1 on Final Turn (bookend exception), OR
  // - They are a victim with a gift from exchange and no legal moves
  if (botHasGift && !isBoomerangPhase) {
    // Check if this is Player 1's final turn (bookend exception)
    const isLastIndex = currentTurnIndex === (turnQueueLength - 1);
    const isPlayer1 = turnOrder && turnOrder[0] === currentPlayerId;
    const isPlayer1FinalTurn = isLastIndex && isPlayer1;
    
    // Check if bot is a victim (received gift from exchange)
    const isVictim = gameState.currentVictim === currentPlayerId;
    
    // Check if there are wrapped gifts remaining (Exception 2: can pick to claim all gifts)
    const hasWrappedGifts = wrappedGifts && wrappedGifts.length > 0;
    
    // If Player 1 final turn OR wrapped gifts remain, bot can act
    if (isPlayer1FinalTurn || hasWrappedGifts) {
      // Bot can pick a wrapped gift even though they have a gift
      if (hasWrappedGifts && wrappedGifts.length > 0) {
        const randomGift = wrappedGifts[Math.floor(Math.random() * wrappedGifts.length)];
        return { action: 'pick', giftId: randomGift };
      }
      
      // If Player 1 final turn and no wrapped gifts, try to steal
      if (isPlayer1FinalTurn && (!hasWrappedGifts || wrappedGifts.length === 0)) {
        // Find stealable gifts (not frozen, not owned by bot, and not U-Turn violation)
        const stealableGifts = [];
        for (const [giftId, gift] of unwrappedMap.entries()) {
          if (!gift.isFrozen && gift.ownerId !== currentPlayerId) {
            // Check U-Turn rule: can't steal back immediately
            if (gift.lastOwnerId !== currentPlayerId) {
              stealableGifts.push(giftId);
            }
          }
        }
        
        if (stealableGifts.length > 0) {
          // Player 1 final turn: try to steal
          const randomGift = stealableGifts[Math.floor(Math.random() * stealableGifts.length)];
          return { action: 'steal', giftId: randomGift };
        }
      }
    }
    
    // Check if bot is a victim with no legal moves (deadlock prevention)
    let hasLegalMoves = false;
    if (isVictim) {
      if (hasWrappedGifts) {
        hasLegalMoves = true;
      } else {
        // Check if bot can steal
        for (const [giftId, gift] of unwrappedMap.entries()) {
          if (!gift.isFrozen && gift.ownerId !== currentPlayerId) {
            if (gift.lastOwnerId !== currentPlayerId) {
              hasLegalMoves = true;
              break;
            }
          }
        }
      }
    }
    
    // In Standard Phase, bot can skip if:
    // - Player 1 on Final Turn (only if no stealable gifts available), OR
    // - Victim with gift from exchange and no legal moves (deadlock prevention)
    if (isPlayer1FinalTurn || (isVictim && !hasLegalMoves)) {
      return { action: 'skip' }; // Bot can skip (has gift they like)
    }
    
    // Otherwise, bot should not skip - they should try to act
    // This shouldn't happen in normal gameplay, but log a warning
    console.warn(`⚠️ Bot ${currentPlayerId} has a gift in Standard Phase but cannot skip (not Player 1 Final Turn and not victim with no legal moves). This may indicate a logic error.`);
    // Fall through to try other actions
  }

  // If bot has a gift and we're in boomerang phase, bot MUST steal (swap)
  if (botHasGift && isBoomerangPhase) {
    // Find stealable gifts (not frozen, not owned by bot, and not U-Turn violation)
    const stealableGifts = [];
    for (const [giftId, gift] of unwrappedMap.entries()) {
      if (!gift.isFrozen && gift.ownerId !== currentPlayerId) {
        // Check U-Turn rule: can't steal back immediately
        if (gift.lastOwnerId !== currentPlayerId) {
          stealableGifts.push(giftId);
        }
      }
    }
    
    if (stealableGifts.length > 0) {
      const randomGift = stealableGifts[Math.floor(Math.random() * stealableGifts.length)];
      return { action: 'steal', giftId: randomGift };
    }
    
    // No stealable gifts - bot must skip (all gifts frozen or U-Turn violations)
    return { action: 'skip' };
  }

  // Bot doesn't have a gift - can pick or steal
  // RULE 9: Wrapped Gift Claiming (Unwrap Before Final Turn)
  // Per GAME_RULES.md Rule 9: If bot has NO gift and wrapped gifts remain, bot MUST pick wrapped gift (cannot steal)
  const isLastIndex = currentTurnIndex === (turnQueueLength - 1);
  const isPlayer1 = turnOrder && turnOrder[0] === currentPlayerId;
  const isPlayer1FinalTurn = isLastIndex && isPlayer1;
  const hasWrappedGifts = wrappedGifts && wrappedGifts.length > 0;
  
  // If bot has NO gift and wrapped gifts remain, bot MUST pick wrapped gift (cannot steal)
  // Exception: If bot already has a gift (Boomerang phase), they can still steal
  if (hasWrappedGifts && !isPlayer1FinalTurn && !botHasGift) {
    const randomGift = wrappedGifts[Math.floor(Math.random() * wrappedGifts.length)];
    return { action: 'pick', giftId: randomGift };
  }
  
  // Find stealable gifts (not frozen, not owned by bot, and not U-Turn violation)
  const stealableGifts = [];
  for (const [giftId, gift] of unwrappedMap.entries()) {
    if (!gift.isFrozen && gift.ownerId !== currentPlayerId) {
      // Check U-Turn rule: can't steal back immediately
      if (gift.lastOwnerId !== currentPlayerId) {
        stealableGifts.push(giftId);
      }
    }
  }

  // 50% chance to steal, 50% chance to pick (when both options available)
  const hasBothOptions = stealableGifts.length > 0 && wrappedGifts.length > 0;
  if (hasBothOptions) {
    // Randomly choose between steal and pick (50/50)
    if (Math.random() < 0.5) {
      // Choose to steal
      const randomGift = stealableGifts[Math.floor(Math.random() * stealableGifts.length)];
      return { action: 'steal', giftId: randomGift };
    } else {
      // Choose to pick
      const randomGift = wrappedGifts[Math.floor(Math.random() * wrappedGifts.length)];
      return { action: 'pick', giftId: randomGift };
    }
  }
  
  // If only one option available, use it
  if (stealableGifts.length > 0) {
    const randomGift = stealableGifts[Math.floor(Math.random() * stealableGifts.length)];
    return { action: 'steal', giftId: randomGift };
  }
  
  // Otherwise pick a wrapped gift
  if (wrappedGifts.length > 0) {
    const randomGift = wrappedGifts[Math.floor(Math.random() * wrappedGifts.length)];
    return { action: 'pick', giftId: randomGift };
  }

  // Fallback: if no wrapped gifts, try to steal (even if less preferred)
  if (stealableGifts.length > 0) {
    const randomGift = stealableGifts[Math.floor(Math.random() * stealableGifts.length)];
    return { action: 'steal', giftId: randomGift };
  }

  // No valid move - bot should skip
  return { action: 'skip' };
}

/**
 * End bot's turn
 */
export async function endBotTurn(partyId, io) {
  try {
    // CRITICAL: Validate partyId
    if (!partyId || typeof partyId !== 'string') {
      console.error(`❌ Invalid partyId in endBotTurn: ${partyId}`);
      return;
    }
    
    // Load game state (from Redis or Firestore)
    const gameState = await loadGameState(partyId);
    if (!gameState) {
      return;
    }
    
    // CRITICAL: Validate partyId matches
    if (gameState.partyId && gameState.partyId !== partyId) {
      console.error(`❌ CRITICAL: partyId mismatch in endBotTurn! Parameter: ${partyId}, gameState.partyId: ${gameState.partyId}`);
      return;
    }
    
    // Ensure partyId is set
    gameState.partyId = partyId;
    
    if (gameState.phase !== 'ACTIVE') {
      return;
    }

    const { GameEngine } = await import('../engine.js');
    const config = gameState.config || { maxSteals: 3, returnToStart: false };
    const engine = new GameEngine(gameState, config);

    const newState = engine.endTurn();
    newState.config = gameState.config;
    // CRITICAL: Ensure partyId is preserved
    newState.partyId = partyId;

    // Save to both Redis and Firestore
    await saveGameState(partyId, newState);

    // Broadcast update
    io.to(`party:${partyId}`).emit('game-updated', newState);

    // If game ended, persist winners to Firestore
    if (newState.phase === 'ENDED') {
      const finalEngine = new GameEngine(newState, config);
      const finalState = finalEngine.endGame();
      
      const finalOwnership = finalState.finalOwnership || {};
      
      const winnerToGiftMap = new Map();
      const giftsToUpdate = [];
      
      for (const [giftId, winnerId] of Object.entries(finalOwnership)) {
        if (winnerId && !winnerToGiftMap.has(winnerId)) {
          winnerToGiftMap.set(winnerId, giftId);
          giftsToUpdate.push({ giftId, winnerId });
        }
      }
      
      const assignedGiftIds = new Set(giftsToUpdate.map(g => g.giftId));
      const allGiftsSnapshot = await db.collection('gifts').where('partyId', '==', partyId).get();
      
      for (const giftDoc of allGiftsSnapshot.docs) {
        const giftId = giftDoc.id;
        const giftData = giftDoc.data();
        
        if (assignedGiftIds.has(giftId)) {
          const assignment = giftsToUpdate.find(g => g.giftId === giftId);
          if (assignment) {
            await db.collection('gifts').doc(giftId).update({
              winnerId: assignment.winnerId,
              updatedAt: new Date(),
            });
          }
        } else {
          if (giftData.winnerId) {
            await db.collection('gifts').doc(giftId).update({
              winnerId: null,
              updatedAt: new Date(),
            });
          }
        }
      }
      
      const endedAt = admin.firestore.Timestamp.now();
      await db.collection('parties').doc(partyId).update({
        status: 'ENDED',
        endedAt: endedAt, // Set retention timestamp for data cleanup
        gameHistory: finalState.state.history || [],
        updatedAt: new Date(),
      });

      // Update all gifts for this party with partyEndedAt timestamp for retention
      const giftsForRetentionSnapshot = await db.collection('gifts').where('partyId', '==', partyId).get();
      const giftRetentionBatch = db.batch();
      giftsForRetentionSnapshot.docs.forEach((giftDoc) => {
        giftRetentionBatch.update(giftDoc.ref, {
          partyEndedAt: endedAt,
          updatedAt: new Date(),
        });
      });
      if (giftsForRetentionSnapshot.docs.length > 0) {
        await giftRetentionBatch.commit();
      }
      
      io.to(`party:${partyId}`).emit('game-ended', finalState);
    } else {
      // Check if next player is a bot and trigger their move
      // Add timeout protection
      const timeoutId = setTimeout(() => {
        checkAndMakeBotMove(partyId, newState, io).catch((error) => {
          console.error(`❌ Error in checkAndMakeBotMove after endTurn:`, error);
          // Don't let errors stop the game flow
        });
      }, 500);
      
      // Safety: Clear timeout if game ends before it fires
      if (newState.phase === 'ENDED') {
        clearTimeout(timeoutId);
      }
    }
  } catch (error) {
    console.error(`❌ Error ending bot turn for party ${partyId}:`, error);
  }
}

/**
 * Check if it's a bot's turn and make a move if autoplay is enabled
 */
export async function checkAndMakeBotMove(partyId, gameState, io) {
  try {
    // CRITICAL: Validate partyId matches gameState.partyId
    if (!partyId || typeof partyId !== 'string') {
      console.error(`❌ Invalid partyId in checkAndMakeBotMove: ${partyId}`);
      return;
    }
    
    if (gameState.partyId && gameState.partyId !== partyId) {
      console.error(`❌ CRITICAL: partyId mismatch in checkAndMakeBotMove! Parameter: ${partyId}, gameState.partyId: ${gameState.partyId}`);
      return;
    }
    
    // Ensure partyId is set in gameState
    gameState.partyId = partyId;
    
    // Check if autoplay is enabled
    const autoplayKey = `autoplay:${partyId}`;
    const autoplayEnabled = await redisClient.get(autoplayKey);
    if (!autoplayEnabled || autoplayEnabled !== 'true') {
      return; // Autoplay not enabled
    }

    // Check if game is active
    if (gameState.phase !== 'ACTIVE') {
      return; // Game not active
    }

    // Check if current player is a bot
    const currentPlayerId = gameState.currentPlayerId;
    
    // Even if it's not a bot's turn, check if game should end (e.g., all gifts frozen)
    const { GameEngine } = await import('../engine.js');
    const config = gameState.config || { maxSteals: 3, returnToStart: false };
    const checkEngine = new GameEngine(gameState, config);
    if (checkEngine.shouldGameEnd()) {
      // Game should end - trigger end game
      const finalState = checkEngine.endGame();
      finalState.state.config = gameState.config;
      
      const { saveGameState } = await import('./game-state-persistence.js');
      await saveGameState(partyId, finalState.state);
      
      // Update party status
      await db.collection('parties').doc(partyId).update({
        status: 'ENDED',
        gameHistory: finalState.state.history || [],
        updatedAt: new Date(),
      });
      
      io.to(`party:${partyId}`).emit('game-ended', finalState);
      return; // Game ended
    }
    
    if (!isBot(currentPlayerId)) {
      return; // Not a bot's turn
    }

    // Check if bot has already acted this turn
    const turnActionMap = new Map(gameState.turnAction);
    if (turnActionMap.get(currentPlayerId)) {
      // Bot already acted, end turn
      await endBotTurn(partyId, io);
      return;
    }

    // Prevent duplicate moves with a timer key
    const timerKey = `${partyId}:${currentPlayerId}`;
    if (activeBotTimers.has(timerKey)) {
      return; // Already processing
    }

    // Add delay to make bot moves feel more natural (4.5-5.5 seconds)
    // Accounts for 3s reveal animation + 1.5s "thinking" time
    const delay = 4500 + Math.random() * 1000;
    activeBotTimers.set(timerKey, setTimeout(async () => {
      activeBotTimers.delete(timerKey);
      
      try {
        // Re-fetch game state to ensure it's current
        const currentState = await loadGameState(partyId);
        if (!currentState) {
          return; // Game state not found
        }
        
        // Double-check it's still this bot's turn
        if (currentState.currentPlayerId !== currentPlayerId || currentState.phase !== 'ACTIVE') {
          return; // Turn changed or game ended
        }

        // Check for infinite loop protection
        const attemptKey = `${partyId}:${currentPlayerId}`;
        const attempts = botMoveAttempts.get(attemptKey) || 0;
        if (attempts >= MAX_MOVE_ATTEMPTS) {
          console.error(`🛑 Bot ${currentPlayerId} exceeded max move attempts (${MAX_MOVE_ATTEMPTS}). Ending turn to prevent infinite loop.`);
          botMoveAttempts.delete(attemptKey);
          await endBotTurn(partyId, io);
          return;
        }
        botMoveAttempts.set(attemptKey, attempts + 1);

        // Make decision
        const decision = botMakeDecision(currentState);
        if (!decision) {
          console.log(`⚠️ Bot ${currentPlayerId} has no valid moves, ending turn`);
          botMoveAttempts.delete(attemptKey);
          await endBotTurn(partyId, io);
          return;
        }

        // Handle skip action (bot has gift in standard phase)
        if (decision.action === 'skip') {
          console.log(`⏭️ Bot ${currentPlayerId} skipping turn (already has gift in standard phase)`);
          botMoveAttempts.delete(attemptKey);
          await endBotTurn(partyId, io);
          return;
        }

        console.log(`🤖 Bot ${currentPlayerId} making move: ${decision.action} on gift ${decision.giftId} (attempt ${attempts + 1}/${MAX_MOVE_ATTEMPTS})`);

        // Execute bot move with error handling
        const { GameEngine } = await import('../engine.js');
        const config = currentState.config || { maxSteals: 3, returnToStart: false };
        const engine = new GameEngine(currentState, config);

        try {
          if (decision.action === 'pick') {
            // Validate gift exists in wrapped gifts
            if (!currentState.wrappedGifts.includes(decision.giftId)) {
              console.error(`❌ Bot ${currentPlayerId} tried to pick gift ${decision.giftId} that doesn't exist in wrapped gifts`);
              botMoveAttempts.delete(attemptKey);
              await endBotTurn(partyId, io);
              return;
            }
            engine.pickGift(decision.giftId, currentPlayerId);
          } else if (decision.action === 'steal') {
            // Validate gift exists and is stealable
            const unwrappedMap = new Map(currentState.unwrappedGifts);
            const gift = unwrappedMap.get(decision.giftId);
            if (!gift) {
              console.error(`❌ Bot ${currentPlayerId} tried to steal gift ${decision.giftId} that doesn't exist`);
              botMoveAttempts.delete(attemptKey);
              await endBotTurn(partyId, io);
              return;
            }
            if (gift.isFrozen || gift.ownerId === currentPlayerId) {
              console.error(`❌ Bot ${currentPlayerId} tried to steal invalid gift ${decision.giftId} (frozen: ${gift.isFrozen}, owner: ${gift.ownerId})`);
              botMoveAttempts.delete(attemptKey);
              await endBotTurn(partyId, io);
              return;
            }
        engine.stealGift(decision.giftId, currentPlayerId);
      }
    } catch (moveError) {
      console.error(`❌ Bot ${currentPlayerId} move failed:`, moveError.message);
      console.error(`   Attempted: ${decision.action} on gift ${decision.giftId}`);
      botMoveAttempts.delete(attemptKey);
      activeBotTimers.delete(timerKey);
      
      // Check if game should end before trying to recover
      const { GameEngine } = await import('../engine.js');
      const checkState = await loadGameState(partyId);
      if (checkState && checkState.phase === 'ACTIVE') {
        const checkConfig = checkState.config || { maxSteals: 3, returnToStart: false };
        const checkEngine = new GameEngine(checkState, checkConfig);
        if (checkEngine.shouldGameEnd()) {
          // Game should end - trigger end game
          const finalState = checkEngine.endGame();
          finalState.state.config = checkState.config;
          await saveGameState(partyId, finalState.state);
          const endedAt = admin.firestore.Timestamp.now();
          await db.collection('parties').doc(partyId).update({
            status: 'ENDED',
            endedAt: endedAt, // Set retention timestamp for data cleanup
            gameHistory: finalState.state.history || [],
            updatedAt: new Date(),
          });

          // Update all gifts for this party with partyEndedAt timestamp for retention
          const allGiftsSnapshot = await db.collection('gifts').where('partyId', '==', partyId).get();
          const giftUpdateBatch = db.batch();
          allGiftsSnapshot.docs.forEach((giftDoc) => {
            giftUpdateBatch.update(giftDoc.ref, {
              partyEndedAt: endedAt,
              updatedAt: new Date(),
            });
          });
          if (allGiftsSnapshot.docs.length > 0) {
            await giftUpdateBatch.commit();
          }
          io.to(`party:${partyId}`).emit('game-ended', finalState);
          return;
        }
      }
      
      // Try to end turn to recover
      await endBotTurn(partyId, io);
      return;
    }
    
    // Reset attempt counter on successful move
    botMoveAttempts.delete(attemptKey);

    const newState = engine.getState();
    newState.config = currentState.config;

    // Save to both Redis and Firestore
    await saveGameState(partyId, newState);

    // Broadcast update
    io.to(`party:${partyId}`).emit('game-updated', newState);

    // CRITICAL: After a STEAL, the stealer's turn is OVER and the victim becomes active
    // Do NOT call endBotTurn - the victim is now active and will be handled by checkAndMakeBotMove
    // Only call endBotTurn for PICK actions (which advance the turn queue)
    if (decision.action === 'pick') {
      // After PICK: end turn after a short delay (0.5-1.5 seconds)
      setTimeout(async () => {
        await endBotTurn(partyId, io);
      }, 500 + Math.random() * 1000);
    } else if (decision.action === 'steal') {
      // After STEAL: victim becomes active, don't end turn
      // The victim will be handled by checkAndMakeBotMove (called from server.js after steal)
      console.log(`✅ Bot ${currentPlayerId} stole - victim ${newState.currentVictim} is now active`);
    }

      } catch (error) {
        console.error(`❌ Error making bot move for ${currentPlayerId}:`, error);
        console.error(`   Stack:`, error.stack);
        activeBotTimers.delete(timerKey);
        botMoveAttempts.delete(`${partyId}:${currentPlayerId}`);
        // Try to recover by ending turn
        try {
          await endBotTurn(partyId, io);
        } catch (recoveryError) {
          console.error(`❌ Failed to recover from bot move error:`, recoveryError);
        }
      }
    }, delay));

  } catch (error) {
    console.error(`❌ Error checking bot move for party ${partyId}:`, error);
  }
}

/**
 * Force a bot to make a move immediately (bypasses autoplay check)
 * Used for manual bot control
 */
export async function forceBotMove(partyId, io) {
  try {
    // CRITICAL: Validate partyId
    if (!partyId || typeof partyId !== 'string') {
      throw new Error(`Invalid partyId: ${partyId}`);
    }
    
    // Load current game state
    const gameState = await loadGameState(partyId);
    if (!gameState) {
      throw new Error('Game state not found');
    }
    
    // CRITICAL: Validate partyId matches
    if (gameState.partyId && gameState.partyId !== partyId) {
      throw new Error(`Party ID mismatch: parameter ${partyId} does not match gameState.partyId ${gameState.partyId}`);
    }
    
    // Ensure partyId is set
    gameState.partyId = partyId;

    // Check if game is active
    if (gameState.phase !== 'ACTIVE') {
      throw new Error('Game is not active');
    }

    // Check if current player is a bot
    const currentPlayerId = gameState.currentPlayerId;
    if (!isBot(currentPlayerId)) {
      throw new Error(`Current player ${currentPlayerId} is not a bot`);
    }

    // Check if bot has already acted this turn
    const turnActionMap = new Map(gameState.turnAction);
    if (turnActionMap.get(currentPlayerId)) {
      // Bot already acted, end turn
      await endBotTurn(partyId, io);
      return { success: true, action: 'endTurn' };
    }

    // Check for infinite loop protection
    const attemptKey = `${partyId}:${currentPlayerId}`;
    const attempts = botMoveAttempts.get(attemptKey) || 0;
    if (attempts >= MAX_MOVE_ATTEMPTS) {
      console.error(`🛑 Bot ${currentPlayerId} exceeded max move attempts (${MAX_MOVE_ATTEMPTS}). Ending turn to prevent infinite loop.`);
      botMoveAttempts.delete(attemptKey);
      await endBotTurn(partyId, io);
      return { success: true, action: 'endTurn', reason: 'maxAttempts' };
    }
    botMoveAttempts.set(attemptKey, attempts + 1);

    // Make decision
    const decision = botMakeDecision(gameState);
    if (!decision) {
      console.log(`⚠️ Bot ${currentPlayerId} has no valid moves, ending turn`);
      botMoveAttempts.delete(attemptKey);
      await endBotTurn(partyId, io);
      return { success: true, action: 'endTurn', reason: 'noValidMoves' };
    }

    // Handle skip action (bot has gift in standard phase)
    if (decision.action === 'skip') {
      console.log(`⏭️ Bot ${currentPlayerId} skipping turn (already has gift in standard phase)`);
      botMoveAttempts.delete(attemptKey);
      await endBotTurn(partyId, io);
      return { success: true, action: 'skip' };
    }

    console.log(`🤖 [FORCED] Bot ${currentPlayerId} making move: ${decision.action} on gift ${decision.giftId}`);

    // Execute bot move immediately (no delay)
    const { GameEngine } = await import('../engine.js');
    const config = gameState.config || { maxSteals: 3, returnToStart: false };
    const engine = new GameEngine(gameState, config);

    try {
      if (decision.action === 'pick') {
        // Validate gift exists in wrapped gifts
        if (!gameState.wrappedGifts.includes(decision.giftId)) {
          console.error(`❌ Bot ${currentPlayerId} tried to pick gift ${decision.giftId} that doesn't exist in wrapped gifts`);
          botMoveAttempts.delete(attemptKey);
          await endBotTurn(partyId, io);
          return { success: false, error: 'Gift not in wrapped gifts' };
        }
        engine.pickGift(decision.giftId, currentPlayerId);
      } else if (decision.action === 'steal') {
        // Validate gift exists and is stealable
        const unwrappedMap = new Map(gameState.unwrappedGifts);
        const gift = unwrappedMap.get(decision.giftId);
        if (!gift) {
          console.error(`❌ Bot ${currentPlayerId} tried to steal gift ${decision.giftId} that doesn't exist`);
          botMoveAttempts.delete(attemptKey);
          await endBotTurn(partyId, io);
          return { success: false, error: 'Gift does not exist' };
        }
        if (gift.isFrozen || gift.ownerId === currentPlayerId) {
          console.error(`❌ Bot ${currentPlayerId} tried to steal invalid gift ${decision.giftId} (frozen: ${gift.isFrozen}, owner: ${gift.ownerId})`);
          botMoveAttempts.delete(attemptKey);
          await endBotTurn(partyId, io);
          return { success: false, error: 'Gift is frozen or owned by bot' };
        }
        engine.stealGift(decision.giftId, currentPlayerId);
      }
    } catch (moveError) {
      console.error(`❌ Bot ${currentPlayerId} move failed:`, moveError.message);
      botMoveAttempts.delete(attemptKey);
      await endBotTurn(partyId, io);
      return { success: false, error: moveError.message };
    }

    // Reset attempt counter on successful move
    botMoveAttempts.delete(attemptKey);

    const newState = engine.getState();
    newState.config = gameState.config;
    // CRITICAL: Ensure partyId is preserved
    newState.partyId = partyId;

    // Save to both Redis and Firestore
    await saveGameState(partyId, newState);

    // Broadcast update
    io.to(`party:${partyId}`).emit('game-updated', newState);

    // CRITICAL: After a STEAL, the stealer's turn is OVER and the victim becomes active
    // Do NOT call endBotTurn - the victim is now active and will be handled separately
    // Only call endBotTurn for PICK actions (which advance the turn queue)
    if (decision.action === 'pick') {
      // After PICK: end turn after a short delay (0.5-1.5 seconds)
      setTimeout(async () => {
        await endBotTurn(partyId, io);
      }, 500 + Math.random() * 1000);
    } else if (decision.action === 'steal') {
      // After STEAL: victim becomes active, don't end turn
      // The victim will be handled by checkAndMakeBotMove (called from server.js after steal)
      console.log(`✅ Bot ${currentPlayerId} stole - victim ${newState.currentVictim} is now active`);
    }

    return { success: true, action: decision.action, giftId: decision.giftId };

  } catch (error) {
    console.error(`❌ Error forcing bot move for party ${partyId}:`, error);
    throw error;
  }
}

/**
 * Force bot to steal a gift (for testing)
 */
export async function forceBotSteal(partyId, io) {
  try {
    // CRITICAL: Validate partyId
    if (!partyId || typeof partyId !== 'string') {
      throw new Error(`Invalid partyId: ${partyId}`);
    }
    
    // Load current game state
    const gameState = await loadGameState(partyId);
    if (!gameState) {
      throw new Error('Game state not found');
    }
    
    // CRITICAL: Validate partyId matches
    if (gameState.partyId && gameState.partyId !== partyId) {
      throw new Error(`Party ID mismatch: parameter ${partyId} does not match gameState.partyId ${gameState.partyId}`);
    }
    
    // Ensure partyId is set
    gameState.partyId = partyId;

    // Check if game is active
    if (gameState.phase !== 'ACTIVE') {
      throw new Error('Game is not active');
    }

    // Check if current player is a bot
    const currentPlayerId = gameState.currentPlayerId;
    if (!isBot(currentPlayerId)) {
      throw new Error(`Current player ${currentPlayerId} is not a bot`);
    }

    // Check if bot has already acted this turn
    // CRITICAL: If current player is a victim (currentVictim), they should always be able to act
    // Their turnAction should be cleared, but even if there's stale data, allow forcing the action
    const turnActionMap = new Map(gameState.turnAction);
    const isVictim = gameState.currentVictim === currentPlayerId;
    const hasActed = turnActionMap.get(currentPlayerId);
    
    // Only block if they're not a victim AND they've already acted
    if (!isVictim && hasActed) {
      throw new Error('Bot has already acted this turn');
    }
    
    // If they're a victim or have stale data, ensure turnAction is cleared
    if (isVictim || hasActed) {
      // Clear stale turnAction - the engine will handle setting it correctly
      turnActionMap.set(currentPlayerId, null);
      gameState.turnAction = Array.from(turnActionMap.entries());
    }

    // Find stealable gifts
    const unwrappedMap = new Map(gameState.unwrappedGifts);
    const stealableGifts = [];
    for (const [giftId, gift] of unwrappedMap.entries()) {
      if (!gift.isFrozen && gift.ownerId !== currentPlayerId) {
        // Check U-Turn rule: can't steal back immediately
        if (gift.lastOwnerId !== currentPlayerId) {
          stealableGifts.push(giftId);
        }
      }
    }

    if (stealableGifts.length === 0) {
      throw new Error('No stealable gifts available');
    }

    // Pick a random stealable gift
    const giftId = stealableGifts[Math.floor(Math.random() * stealableGifts.length)];

    console.log(`🤖 [FORCED STEAL] Bot ${currentPlayerId} stealing gift ${giftId}`);

    // Execute steal
    const { GameEngine } = await import('../engine.js');
    const config = gameState.config || { maxSteals: 3, returnToStart: false };
    const engine = new GameEngine(gameState, config);
    engine.stealGift(giftId, currentPlayerId);

    const newState = engine.getState();
    newState.config = gameState.config;
    // CRITICAL: Ensure partyId is preserved
    newState.partyId = partyId;

    // Save to both Redis and Firestore
    await saveGameState(partyId, newState);

    // Broadcast update
    io.to(`party:${partyId}`).emit('game-updated', newState);

    // After STEAL: victim becomes active, don't end turn
    console.log(`✅ Bot ${currentPlayerId} stole - victim ${newState.currentVictim} is now active`);

    return { success: true, action: 'steal', giftId };

  } catch (error) {
    console.error(`❌ Error forcing bot steal for party ${partyId}:`, error);
    throw error;
  }
}

/**
 * Force bot to skip their turn (for testing)
 */
export async function forceBotSkip(partyId, io) {
  try {
    // CRITICAL: Validate partyId
    if (!partyId || typeof partyId !== 'string') {
      throw new Error(`Invalid partyId: ${partyId}`);
    }
    
    // Load current game state
    const gameState = await loadGameState(partyId);
    if (!gameState) {
      throw new Error('Game state not found');
    }
    
    // CRITICAL: Validate partyId matches
    if (gameState.partyId && gameState.partyId !== partyId) {
      throw new Error(`Party ID mismatch: parameter ${partyId} does not match gameState.partyId ${gameState.partyId}`);
    }
    
    // Ensure partyId is set
    gameState.partyId = partyId;

    // Check if game is active
    if (gameState.phase !== 'ACTIVE') {
      throw new Error('Game is not active');
    }

    // Check if current player is a bot
    const currentPlayerId = gameState.currentPlayerId;
    if (!isBot(currentPlayerId)) {
      throw new Error(`Current player ${currentPlayerId} is not a bot`);
    }

    // Check if bot has already acted this turn
    // CRITICAL: If current player is a victim (currentVictim), they should always be able to act
    // Their turnAction should be cleared, but even if there's stale data, allow forcing the action
    const turnActionMap = new Map(gameState.turnAction);
    const isVictim = gameState.currentVictim === currentPlayerId;
    const hasActed = turnActionMap.get(currentPlayerId);
    
    // Only block if they're not a victim AND they've already acted
    if (!isVictim && hasActed) {
      throw new Error('Bot has already acted this turn');
    }
    
    // If they're a victim or have stale data, ensure turnAction is cleared
    if (isVictim || hasActed) {
      // Clear stale turnAction - the engine will handle setting it correctly
      turnActionMap.set(currentPlayerId, null);
      gameState.turnAction = Array.from(turnActionMap.entries());
    }

    console.log(`🤖 [FORCED SKIP] Bot ${currentPlayerId} skipping turn`);

    // Execute skip (end turn)
    const { GameEngine } = await import('../engine.js');
    const config = gameState.config || { maxSteals: 3, returnToStart: false };
    const engine = new GameEngine(gameState, config);
    engine.endTurn();

    const newState = engine.getState();
    newState.config = gameState.config;
    // CRITICAL: Ensure partyId is preserved
    newState.partyId = partyId;

    // Save to both Redis and Firestore
    await saveGameState(partyId, newState);

    // Broadcast update
    io.to(`party:${partyId}`).emit('game-updated', newState);

    // Check if next player is a bot and trigger their move
    setTimeout(() => {
      checkAndMakeBotMove(partyId, newState, io).catch(console.error);
    }, 500);

    return { success: true, action: 'skip' };

  } catch (error) {
    console.error(`❌ Error forcing bot skip for party ${partyId}:`, error);
    throw error;
  }
}

/**
 * Force bot to pick a wrapped gift (for testing)
 */
export async function forceBotPick(partyId, io) {
  try {
    // CRITICAL: Validate partyId
    if (!partyId || typeof partyId !== 'string') {
      throw new Error(`Invalid partyId: ${partyId}`);
    }
    
    // Load current game state
    const gameState = await loadGameState(partyId);
    if (!gameState) {
      throw new Error('Game state not found');
    }
    
    // CRITICAL: Validate partyId matches
    if (gameState.partyId && gameState.partyId !== partyId) {
      throw new Error(`Party ID mismatch: parameter ${partyId} does not match gameState.partyId ${gameState.partyId}`);
    }
    
    // Ensure partyId is set
    gameState.partyId = partyId;

    // Check if game is active
    if (gameState.phase !== 'ACTIVE') {
      throw new Error('Game is not active');
    }

    // Check if current player is a bot
    const currentPlayerId = gameState.currentPlayerId;
    if (!isBot(currentPlayerId)) {
      throw new Error(`Current player ${currentPlayerId} is not a bot`);
    }

    // Check if bot has already acted this turn
    // CRITICAL: If current player is a victim (currentVictim), they should always be able to act
    // Their turnAction should be cleared, but even if there's stale data, allow forcing the action
    const turnActionMap = new Map(gameState.turnAction);
    const isVictim = gameState.currentVictim === currentPlayerId;
    const hasActed = turnActionMap.get(currentPlayerId);
    
    // Only block if they're not a victim AND they've already acted
    if (!isVictim && hasActed) {
      throw new Error('Bot has already acted this turn');
    }
    
    // If they're a victim or have stale data, ensure turnAction is cleared
    if (isVictim || hasActed) {
      // Clear stale turnAction - the engine will handle setting it correctly
      turnActionMap.set(currentPlayerId, null);
      gameState.turnAction = Array.from(turnActionMap.entries());
    }

    // Check if there are wrapped gifts
    if (!gameState.wrappedGifts || gameState.wrappedGifts.length === 0) {
      throw new Error('No wrapped gifts available');
    }

    // Pick a random wrapped gift
    const giftId = gameState.wrappedGifts[Math.floor(Math.random() * gameState.wrappedGifts.length)];

    console.log(`🤖 [FORCED PICK] Bot ${currentPlayerId} picking gift ${giftId}`);

    // Execute pick
    const { GameEngine } = await import('../engine.js');
    const config = gameState.config || { maxSteals: 3, returnToStart: false };
    const engine = new GameEngine(gameState, config);
    engine.pickGift(giftId, currentPlayerId);

    const newState = engine.getState();
    newState.config = gameState.config;
    // CRITICAL: Ensure partyId is preserved
    newState.partyId = partyId;

    // Save to both Redis and Firestore
    await saveGameState(partyId, newState);

    // Broadcast update
    io.to(`party:${partyId}`).emit('game-updated', newState);

    // After PICK: end turn after a short delay
    setTimeout(async () => {
      await endBotTurn(partyId, io);
    }, 500 + Math.random() * 1000);

    return { success: true, action: 'pick', giftId };

  } catch (error) {
    console.error(`❌ Error forcing bot pick for party ${partyId}:`, error);
    throw error;
  }
}

/**
 * Simulate browser refresh for a bot by triggering a reconnection scenario
 * This tests the state version checking and prevents stale state resets
 */
export async function simulateBotRefresh(partyId, botId, io) {
  try {
    if (!BOT_REFRESH_ENABLED) {
      return; // Refresh simulation disabled
    }

    // Load current game state
    const gameState = await loadGameState(partyId);
    if (!gameState) {
      console.log(`🔄 [Bot Refresh] No game state found for party ${partyId}, skipping refresh simulation`);
      return;
    }

    // Only simulate refresh if game is active
    if (gameState.phase !== 'ACTIVE') {
      return;
    }

    console.log(`🔄 [Bot Refresh] Simulating browser refresh for bot ${botId} in party ${partyId}`);
    console.log(`   Current turn index: ${gameState.currentTurnIndex}, History length: ${gameState.history?.length || 0}`);
    
    // Simulate what happens when a bot's browser refreshes:
    // 1. Their socket would disconnect (we skip this as bots don't have sockets)
    // 2. They reconnect and join the party room
    // 3. Server sends them the current game-state event
    
    // Emit game-state event to the bot's socket (if it exists) or to the party room
    // This simulates what would happen on reconnection
    // Since bots are server-side, we emit to the party room and log it
    const roomName = `party:${partyId}`;
    const room = io.sockets.adapter.rooms.get(roomName);
    
    if (room && room.size > 0) {
      console.log(`📤 [Bot Refresh] Sending game-state event to party room (${room.size} clients connected)`);
      // This will trigger the state version checking logic in the client
      io.to(roomName).emit('game-state', gameState);
      console.log(`✅ [Bot Refresh] Game-state event sent for bot ${botId} refresh simulation`);
      console.log(`   State version: ${gameState.stateVersion || 'N/A'}, Updated: ${gameState.updatedAt || 'N/A'}`);
    } else {
      console.log(`⚠️ [Bot Refresh] No clients connected to party room ${roomName}, skipping emit`);
    }

  } catch (error) {
    console.error(`❌ [Bot Refresh] Error simulating refresh for bot ${botId} in party ${partyId}:`, error);
  }
}

/**
 * Schedule periodic random refresh simulations for all bots in a party
 * This simulates realistic browser behavior where users occasionally refresh
 */
export function scheduleBotRefreshSimulation(partyId, botIds, io) {
  if (!BOT_REFRESH_ENABLED) {
    return; // Refresh simulation disabled
  }

  // Clear any existing refresh timers for this party
  const refreshKeysToDelete = [];
  for (const key of botRefreshTimers.keys()) {
    if (key.startsWith(`${partyId}:`)) {
      clearTimeout(botRefreshTimers.get(key));
      refreshKeysToDelete.push(key);
    }
  }
  refreshKeysToDelete.forEach(key => botRefreshTimers.delete(key));

  // Schedule refresh simulation for each bot
  botIds.forEach(botId => {
    if (!isBot(botId)) {
      return; // Skip non-bots
    }

    const scheduleNextRefresh = () => {
      // Random interval between min and max
      const interval = BOT_REFRESH_INTERVAL_MIN + 
        Math.random() * (BOT_REFRESH_INTERVAL_MAX - BOT_REFRESH_INTERVAL_MIN);
      
      const timerKey = `${partyId}:${botId}:refresh`;
      
      const timerId = setTimeout(async () => {
        botRefreshTimers.delete(timerKey);
        
        // Random probability check - only refresh sometimes
        if (Math.random() < BOT_REFRESH_PROBABILITY) {
          await simulateBotRefresh(partyId, botId, io);
        }
        
        // Schedule next refresh (only if game is still active)
        const { loadGameState } = await import('./game-state-persistence.js');
        const gameState = await loadGameState(partyId);
        if (gameState && gameState.phase === 'ACTIVE') {
          scheduleNextRefresh();
        }
      }, interval);
      
      botRefreshTimers.set(timerKey, timerId);
      console.log(`📅 [Bot Refresh] Scheduled refresh simulation for bot ${botId} in party ${partyId} in ${Math.round(interval / 1000)}s`);
    };

    // Start scheduling for this bot
    scheduleNextRefresh();
  });
}

/**
 * Stop refresh simulation for a party
 */
export function stopBotRefreshSimulation(partyId) {
  const refreshKeysToDelete = [];
  for (const key of botRefreshTimers.keys()) {
    if (key.startsWith(`${partyId}:`)) {
      clearTimeout(botRefreshTimers.get(key));
      refreshKeysToDelete.push(key);
    }
  }
  refreshKeysToDelete.forEach(key => botRefreshTimers.delete(key));
  
  if (refreshKeysToDelete.length > 0) {
    console.log(`🛑 [Bot Refresh] Stopped ${refreshKeysToDelete.length} refresh simulations for party ${partyId}`);
  }
}

