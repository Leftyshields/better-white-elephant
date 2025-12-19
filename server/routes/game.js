/**
 * Game API Routes
 */
import express from 'express';
import { db, auth } from '../config/firebase-admin.js';
import admin from 'firebase-admin';
import { partyConverter, participantConverter, giftConverter } from '../utils/firestore-converters.js';
import { GameEngine } from '../engine.js';
import redisClient from '../utils/redis.js';
import { scrapeGiftMetadata } from '../utils/scraper.js';
import { saveGameState, loadGameState, deleteGameState } from '../utils/game-state-persistence.js';

const router = express.Router();

/**
 * POST /api/game/start
 * Start a game for a party
 */
router.post('/start', async (req, res) => {
  try {
    const { partyId } = req.body;
    const userId = req.user?.uid; // Set by auth middleware

    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    if (!partyId || typeof partyId !== 'string' || partyId.length === 0 || partyId.length > 128) {
      return res.status(400).json({ error: 'Valid partyId is required' });
    }

    // Fetch party document
    const partyDoc = await db.collection('parties').doc(partyId).get();
    if (!partyDoc.exists) {
      return res.status(404).json({ error: 'Party not found' });
    }

    const party = partyConverter.fromFirestore(partyDoc);

    // Verify user is admin
    if (party.adminId !== userId) {
      return res.status(403).json({ error: 'Only party admin can start the game' });
    }

    if (party.status !== 'LOBBY') {
      return res.status(400).json({ error: 'Game already started or ended' });
    }

    // Fetch all participants with status 'GOING'
    const participantsSnapshot = await db
      .collection('parties')
      .doc(partyId)
      .collection('participants')
      .where('status', '==', 'GOING')
      .get();

    const participants = participantsSnapshot.docs.map((doc) => ({
      id: doc.id,
      ...participantConverter.fromFirestore(doc),
    }));

    if (participants.length < 2) {
      return res.status(400).json({ error: 'Need at least 2 participants to start' });
    }

    // Fetch all gifts for this party
    const giftsSnapshot = await db
      .collection('gifts')
      .where('partyId', '==', partyId)
      .get();

    const gifts = giftsSnapshot.docs.map((doc) => ({
      id: doc.id,
      ...giftConverter.fromFirestore(doc),
    }));

    if (gifts.length < participants.length) {
      return res.status(400).json({ error: 'Not enough gifts for all participants' });
    }

    // Build turn order (randomly shuffled)
    const turnOrder = participants
      .map((p) => p.id)
      .sort(() => Math.random() - 0.5); // Random shuffle

    /**
     * Generate turn queue based on game mode
     * @param {Array} turnOrder - The initial shuffled turn order (array of player IDs)
     * @param {boolean} returnToStart - Whether boomerang rule is active
     * @returns {Array} Complete turn queue array
     */
    function generateTurnQueue(turnOrder, returnToStart) {
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

    // Initialize game state
    const wrappedGifts = gifts.map((g) => g.id);
    const unwrappedGifts = new Map();
    const turnAction = new Map();
    turnOrder.forEach((playerId) => {
      turnAction.set(playerId, null);
    });

    // Get game config from party (with defaults)
    const gameConfig = party.config || {};
    const config = {
      maxSteals: gameConfig.maxSteals ?? 3,
      returnToStart: gameConfig.returnToStart ?? false,
    };

    // Generate turn queue based on boomerang rule
    const turnQueue = generateTurnQueue(turnOrder, config.returnToStart);

    const gameState = {
      partyId,
      currentTurnIndex: 0, // Index into turnQueue
      currentPlayerId: turnQueue[0], // Active player from queue
      currentVictim: null, // CRITICAL: Victim-first priority state machine
      turnOrder, // Original shuffled order (for reference)
      turnQueue, // Complete queue array
      stealStack: [], // Keep for backwards compatibility
      wrappedGifts,
      unwrappedGifts: Array.from(unwrappedGifts.entries()),
      turnAction: Array.from(turnAction.entries()),
      phase: 'ACTIVE',
      isBoomerangPhase: false, // Can be removed or kept for backwards compatibility
      config, // Store config in game state
      history: [], // Initialize empty history array
      reactionCount: 0, // Initialize reaction count to track emoji reactions (hype level)
    };

    // Save to both Redis and Firestore
    await saveGameState(partyId, gameState);

    // Update party status
    await db.collection('parties').doc(partyId).update({
      status: 'ACTIVE',
      updatedAt: new Date(),
    });

    // Emit socket event (handled in server.js)
    req.io?.to(`party:${partyId}`).emit('game-started', gameState);

    // Check if first player is a bot and trigger auto-play
    // Use longer delay (2 seconds) to ensure all clients have received game-started event
    setTimeout(async () => {
      try {
        const { checkAndMakeBotMove } = await import('../utils/bot-utils.js');
        if (checkAndMakeBotMove && req.io) {
          // Re-fetch game state to ensure we have the latest
          const currentState = await loadGameState(partyId);
          if (currentState && currentState.phase === 'ACTIVE') {
            await checkAndMakeBotMove(partyId, currentState, req.io);
          }
        }
      } catch (error) {
        console.error('Error triggering bot move on game start:', error);
      }
    }, 2000);

    res.json({ success: true, gameState });
  } catch (error) {
    console.error('Error starting game:', error);
    res.status(500).json({ error: 'Failed to start game', message: error.message });
  }
});

/**
 * POST /api/game/end
 * Manually end a game (admin only)
 */
router.post('/end', async (req, res) => {
  try {
    const { partyId } = req.body;
    const userId = req.user?.uid;

    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    if (!partyId || typeof partyId !== 'string' || partyId.length === 0 || partyId.length > 128) {
      return res.status(400).json({ error: 'Valid partyId is required' });
    }

    // Fetch party document
    const partyDoc = await db.collection('parties').doc(partyId).get();
    if (!partyDoc.exists) {
      return res.status(404).json({ error: 'Party not found' });
    }

    const party = partyConverter.fromFirestore(partyDoc);

    if (party.status !== 'ACTIVE') {
      return res.status(400).json({ error: 'Game is not active' });
    }

    // Get current game state (from Redis or Firestore)
    const gameState = await loadGameState(partyId);
    
    if (!gameState) {
      return res.status(404).json({ error: 'Game state not found' });
    }
    
    // Verify user is admin (admin only can end game)
    if (party.adminId !== userId) {
      return res.status(403).json({ error: 'Only party admin can end the game' });
    }
    
    const { GameEngine } = await import('../engine.js');
    const config = gameState.config || { maxSteals: 3, returnToStart: false };
    const engine = new GameEngine(gameState, config);

    // End the game and get final state
    const finalState = engine.endGame();
    const finalOwnership = finalState.finalOwnership || {};

    // Ensure one gift per player - remove any duplicate winnerId assignments
    const winnerToGiftMap = new Map(); // Track which gift each winner gets
    const giftsToUpdate = [];
    
    // First pass: build map of winner -> gift (only first gift per winner)
    for (const [giftId, winnerId] of Object.entries(finalOwnership)) {
      if (winnerId) {
        if (!winnerToGiftMap.has(winnerId)) {
          winnerToGiftMap.set(winnerId, giftId);
          giftsToUpdate.push({ giftId, winnerId });
        }
      }
    }
    
    // Clear winnerId from any gifts not assigned to their winner
    const assignedGiftIds = new Set(giftsToUpdate.map(g => g.giftId));
    const allGiftsSnapshot = await db.collection('gifts').where('partyId', '==', partyId).get();
    
    for (const giftDoc of allGiftsSnapshot.docs) {
      const giftId = giftDoc.id;
      const giftData = giftDoc.data();
      
      if (assignedGiftIds.has(giftId)) {
        // This gift is assigned to a winner - update with correct winnerId
        const assignment = giftsToUpdate.find(g => g.giftId === giftId);
        if (assignment && giftData.winnerId !== assignment.winnerId) {
          await db.collection('gifts').doc(giftId).update({
            winnerId: assignment.winnerId,
            updatedAt: new Date(),
          });
        }
      } else {
        // This gift is not assigned - clear any existing winnerId
        if (giftData.winnerId) {
          await db.collection('gifts').doc(giftId).update({
            winnerId: null,
            updatedAt: new Date(),
          });
        }
      }
    }

    // Update party status to ENDED and store game history
    const endedAt = admin.firestore.Timestamp.now();
    await db.collection('parties').doc(partyId).update({
      status: 'ENDED',
      endedAt: endedAt, // Set retention timestamp for data cleanup
      gameHistory: finalState.state.history || [], // Store history in party document
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

    // Save ended state to both Redis and Firestore
    finalState.state.config = gameState.config;
    await saveGameState(partyId, finalState.state);

    // Emit socket event to notify all clients
    if (req.io) {
      req.io.to(`party:${partyId}`).emit('game-ended', finalState);
    }

    res.json({ success: true, finalState });
  } catch (error) {
    console.error('Error ending game:', error);
    res.status(500).json({ error: 'Failed to end game', message: error.message });
  }
});

/**
 * POST /api/game/scrape
 * Scrape gift URL for metadata
 * Requires authentication
 */
router.post('/scrape', async (req, res) => {
  try {
    // Require authentication
    if (!req.user?.uid) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    
    const { url } = req.body;
    console.log('[Scrape API] Received scrape request for URL:', url);
    console.log('[Scrape API] APIFY_API_TOKEN configured:', !!process.env.APIFY_API_TOKEN);

    if (!url || typeof url !== 'string') {
      return res.status(400).json({ error: 'Valid URL is required' });
    }
    
    // Basic URL validation - must be http or https
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      return res.status(400).json({ error: 'URL must start with http:// or https://' });
    }
    
    // Limit URL length to prevent abuse
    if (url.length > 2048) {
      return res.status(400).json({ error: 'URL too long' });
    }

    const metadata = await scrapeGiftMetadata(url);
    console.log('[Scrape API] Returning metadata:', JSON.stringify(metadata, null, 2));

    res.json(metadata);
  } catch (error) {
    console.error('[Scrape API] Error scraping gift URL:', error.message, error.stack);
    res.status(500).json({ error: 'Failed to scrape URL', message: error.message });
  }
});

export default router;

