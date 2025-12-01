/**
 * Express Server with Socket.io
 */
import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import dotenv from 'dotenv';
import gameRoutes from './routes/game.js';
import userRoutes from './routes/users.js';
import redisClient from './utils/redis.js';
import { auth, db } from './config/firebase-admin.js';
import admin from 'firebase-admin';
import { checkAndMakeBotMove } from './utils/bot-utils.js';

dotenv.config();

const app = express();
const httpServer = createServer(app);
// CORS origins - configured via environment variables with safe defaults
// ALLOWED_ORIGINS can be a comma-separated list of origins
// CLIENT_URL is also included for backwards compatibility
const buildAllowedOrigins = () => {
  const origins = new Set();
  
  // Always include localhost for local development (safe default)
  origins.add('http://localhost:5173');
  
  // Include CLIENT_URL if set (backwards compatibility)
  if (process.env.CLIENT_URL) {
    origins.add(process.env.CLIENT_URL);
  }
  
  // Parse ALLOWED_ORIGINS from environment (comma-separated)
  if (process.env.ALLOWED_ORIGINS) {
    process.env.ALLOWED_ORIGINS.split(',').forEach(origin => {
      const trimmed = origin.trim();
      if (trimmed) {
        origins.add(trimmed);
      }
    });
  }
  
  // In production, include common production domains if not already set
  // This provides a fallback if env vars aren't configured
  if (process.env.NODE_ENV === 'production') {
    // Only add these if ALLOWED_ORIGINS wasn't explicitly set
    // This allows production to work out of the box while still allowing override
    if (!process.env.ALLOWED_ORIGINS) {
      origins.add('https://stealorreveal.com');
      origins.add('https://www.stealorreveal.com');
      origins.add('https://better-white-elephant.web.app');
    }
  }
  
  return Array.from(origins);
};

const allowedOrigins = buildAllowedOrigins();

// Helper function to validate partyId format
function isValidPartyId(partyId) {
  return typeof partyId === 'string' && 
         partyId.length > 0 && 
         partyId.length <= 128 && 
         /^[a-zA-Z0-9_-]+$/.test(partyId);
}

// Helper function to validate giftId format
function isValidGiftId(giftId) {
  return typeof giftId === 'string' && 
         giftId.length > 0 && 
         giftId.length <= 128 && 
         /^[a-zA-Z0-9_-]+$/.test(giftId);
}

// Helper function to verify user is a participant in a party
async function verifyPartyMembership(partyId, userId) {
  if (!isValidPartyId(partyId) || !userId) {
    return false;
  }
  
  try {
    const participantDoc = await db
      .collection('parties')
      .doc(partyId)
      .collection('participants')
      .doc(userId)
      .get();
    
    return participantDoc.exists;
  } catch (error) {
    console.error('Error verifying party membership:', error);
    return false;
  }
}

const io = new Server(httpServer, {
  cors: {
    origin: (origin, callback) => {
      // Only allow requests from known origins
      // Note: origin can be undefined for same-origin requests, which is OK
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'));
      }
    },
    methods: ['GET', 'POST'],
    credentials: true,
  },
});

const PORT = process.env.SERVER_PORT || 3001;

// Middleware
app.use(cors({
  origin: (origin, callback) => {
    // Only allow requests from known origins
    // Note: origin can be undefined for same-origin requests, which is OK
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));
// Limit request body size to prevent DoS
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// Auth middleware for Express routes
app.use(async (req, res, next) => {
  const token = req.headers.authorization?.split('Bearer ')[1];
  if (token) {
    try {
      const decodedToken = await auth.verifyIdToken(token);
      req.user = decodedToken;
    } catch (error) {
      // Continue without user if token invalid
    }
  }
  next();
});

// Attach io to request for routes
app.use((req, res, next) => {
  req.io = io;
  next();
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    port: PORT,
    socketConnections: io.sockets.sockets.size
  });
});

// Routes
app.use('/api/game', gameRoutes);
app.use('/api/users', userRoutes);

// Socket.io authentication and connection handling
io.use(async (socket, next) => {
  const token = socket.handshake.auth.token;
  if (!token) {
    return next(new Error('Authentication error: no token'));
  }

  try {
    const decodedToken = await auth.verifyIdToken(token);
    socket.userId = decodedToken.uid;
    socket.user = decodedToken;
    next();
  } catch (error) {
    next(new Error('Authentication error: invalid token'));
  }
});

io.on('connection', (socket) => {
  console.log(`✅ User connected: ${socket.userId} (socket: ${socket.id})`);

  // Log all incoming events for debugging
  socket.onAny((eventName, ...args) => {
    const data = args.length > 0 ? (typeof args[0] === 'object' ? JSON.stringify(args[0]) : args[0]) : 'no data';
    // Highlight admin events
    if (eventName.startsWith('admin_')) {
      console.log(`🔴🔴🔴 ADMIN EVENT: ${eventName} 🔴🔴🔴`, data);
    } else {
      console.log(`📥 Socket ${socket.id} received event: ${eventName}`, data);
    }
  });
  
  // Handle connection errors
  socket.on('error', (error) => {
    console.error(`❌ Socket ${socket.id} error:`, error);
  });
  
  // Handle disconnection
  socket.on('disconnect', (reason) => {
    console.log(`❌ Socket ${socket.id} disconnected: ${reason}`);
  });

  // Join party room
  socket.on('join-party', async (partyId) => {
    // Validate input
    if (!isValidPartyId(partyId)) {
      socket.emit('error', { message: 'Invalid party ID' });
      return;
    }
    
    // Verify user is a participant
    const isParticipant = await verifyPartyMembership(partyId, socket.userId);
    if (!isParticipant) {
      socket.emit('error', { message: 'You are not a participant in this party' });
      return;
    }
    
    const roomName = `party:${partyId}`;
    socket.join(roomName);
    
    // Verify room join
    const room = io.sockets.adapter.rooms.get(roomName);
    const roomSize = room ? room.size : 0;
    
    console.log(`✅ User ${socket.userId} (socket: ${socket.id}) joined party:${partyId} in room ${roomName} (${roomSize} total clients)`);
    
    // Confirm room join to client
    socket.emit('party-joined', { partyId, roomName, roomSize });

    // Send current game state if game is active
    const redisKey = `game:${partyId}`;
    // Try to load game state (from Redis or Firestore)
    const { loadGameState } = await import('./utils/game-state-persistence.js');
    const gameState = await loadGameState(partyId);
    
    if (gameState) {
      console.log(`📤 Sending game-state to socket ${socket.id} for party ${partyId}`);
      socket.emit('game-state', gameState);
    } else {
      console.log(`⚠️ No game state found for party ${partyId}`);
      // Check if party is marked as ACTIVE - if so, there's a data inconsistency
      try {
        const partyDoc = await db.collection('parties').doc(partyId).get();
        if (partyDoc.exists) {
          const partyData = partyDoc.data();
          if (partyData.status === 'ACTIVE') {
            console.log(`⚠️ Party ${partyId} is marked ACTIVE but game state missing - data inconsistency detected`);
            socket.emit('error', { 
              message: 'Game state not found. The game may have expired or been lost.',
              code: 'GAME_STATE_MISSING'
            });
          }
        }
      } catch (error) {
        console.error(`Error checking party status for ${partyId}:`, error);
      }
    }
  });

  // Handle game actions
  socket.on('pick-gift', async ({ partyId, giftId }) => {
    try {
      // Validate inputs
      if (!isValidPartyId(partyId) || !isValidGiftId(giftId)) {
        socket.emit('error', { message: 'Invalid party ID or gift ID' });
        return;
      }
      
      // Verify user is a participant
      const isParticipant = await verifyPartyMembership(partyId, socket.userId);
      if (!isParticipant) {
        socket.emit('error', { message: 'You are not a participant in this party' });
        return;
      }
      
      // Load game state (from Redis or Firestore)
      const { loadGameState, saveGameState } = await import('./utils/game-state-persistence.js');
      const gameState = await loadGameState(partyId);
      if (!gameState) {
        socket.emit('error', { message: 'Game not found' });
        return;
      }

      // Emit action_started event BEFORE processing (for synchronized reveal animation)
      io.to(`party:${partyId}`).emit('action_started', { 
        type: 'pick', 
        giftId, 
        playerId: socket.userId 
      });

      // CRITICAL: Validate gameState.partyId matches partyId parameter
      if (gameState.partyId && gameState.partyId !== partyId) {
        console.error(`❌ CRITICAL: partyId mismatch in pick-gift! Parameter: ${partyId}, gameState.partyId: ${gameState.partyId}`);
        socket.emit('error', { message: 'Game state party ID mismatch' });
        return;
      }
      
      const { GameEngine } = await import('./engine.js');
      const config = gameState.config || { maxSteals: 3, returnToStart: false };
      // Ensure partyId is set in gameState before creating engine
      gameState.partyId = partyId;
      const engine = new GameEngine(gameState, config);

      engine.pickGift(giftId, socket.userId);
      const newState = engine.getState();
      // Preserve config in state
      newState.config = gameState.config;
      // CRITICAL: Ensure partyId is preserved
      newState.partyId = partyId;

      // Save to both Redis and Firestore
      await saveGameState(partyId, newState);

      // Broadcast update
      io.to(`party:${partyId}`).emit('game-updated', newState);
      
      // Check if next player is a bot and trigger auto-play
      // Wait for reveal animation to complete (3s) + small buffer before checking
      setTimeout(() => {
        checkAndMakeBotMove(partyId, newState, io).catch(console.error);
      }, 3500); // 3s reveal animation + 500ms buffer
    } catch (error) {
      socket.emit('error', { message: error.message });
    }
  });

  socket.on('steal-gift', async ({ partyId, giftId }) => {
    try {
      // Validate inputs
      if (!isValidPartyId(partyId) || !isValidGiftId(giftId)) {
        socket.emit('error', { message: 'Invalid party ID or gift ID' });
        return;
      }
      
      // Verify user is a participant
      const isParticipant = await verifyPartyMembership(partyId, socket.userId);
      if (!isParticipant) {
        socket.emit('error', { message: 'You are not a participant in this party' });
        return;
      }
      
      // Load game state (from Redis or Firestore)
      const { loadGameState, saveGameState } = await import('./utils/game-state-persistence.js');
      const gameState = await loadGameState(partyId);
      if (!gameState) {
        socket.emit('error', { message: 'Game not found' });
        return;
      }

      // Emit action_started event BEFORE processing (for auto-scroll, not reveal animation)
      // Note: STEAL events don't trigger reveal animation (gift is already known)
      io.to(`party:${partyId}`).emit('action_started', { 
        type: 'steal', 
        giftId, 
        playerId: socket.userId 
      });

      // CRITICAL: Validate gameState.partyId matches partyId parameter
      if (gameState.partyId && gameState.partyId !== partyId) {
        console.error(`❌ CRITICAL: partyId mismatch in steal-gift! Parameter: ${partyId}, gameState.partyId: ${gameState.partyId}`);
        socket.emit('error', { message: 'Game state party ID mismatch' });
        return;
      }
      
      const { GameEngine } = await import('./engine.js');
      const config = gameState.config || { maxSteals: 3, returnToStart: false };
      // Ensure partyId is set in gameState before creating engine
      gameState.partyId = partyId;
      const engine = new GameEngine(gameState, config);

      engine.stealGift(giftId, socket.userId);
      const newState = engine.getState();
      // Preserve config in state
      newState.config = gameState.config;
      // CRITICAL: Ensure partyId is preserved
      newState.partyId = partyId;

      // Save to both Redis and Firestore
      await saveGameState(partyId, newState);

      // Broadcast update
      io.to(`party:${partyId}`).emit('game-updated', newState);
      
      // Check if next player (victim) is a bot and trigger auto-play
      // For STEAL events, no reveal animation, so use shorter delay
      setTimeout(() => {
        checkAndMakeBotMove(partyId, newState, io).catch(console.error);
      }, 1000); // Shorter delay for steal (no reveal animation needed)
    } catch (error) {
      socket.emit('error', { message: error.message });
    }
  });

  socket.on('end-turn', async ({ partyId }) => {
    try {
      // Validate input
      if (!isValidPartyId(partyId)) {
        socket.emit('error', { message: 'Invalid party ID' });
        return;
      }
      
      // Verify user is a participant
      const isParticipant = await verifyPartyMembership(partyId, socket.userId);
      if (!isParticipant) {
        socket.emit('error', { message: 'You are not a participant in this party' });
        return;
      }
      
      // Load game state (from Redis or Firestore)
      const { loadGameState, saveGameState } = await import('./utils/game-state-persistence.js');
      const gameState = await loadGameState(partyId);
      if (!gameState) {
        socket.emit('error', { message: 'Game not found' });
        return;
      }

      // CRITICAL: Validate gameState.partyId matches partyId parameter
      if (gameState.partyId && gameState.partyId !== partyId) {
        console.error(`❌ CRITICAL: partyId mismatch in end-turn! Parameter: ${partyId}, gameState.partyId: ${gameState.partyId}`);
        socket.emit('error', { message: 'Game state party ID mismatch' });
        return;
      }
      
      const { GameEngine } = await import('./engine.js');
      const config = gameState.config || { maxSteals: 3, returnToStart: false };
      // Ensure partyId is set in gameState before creating engine
      gameState.partyId = partyId;
      const engine = new GameEngine(gameState, config);

      const newState = engine.endTurn();
      // Preserve config in state
      newState.config = gameState.config;
      // CRITICAL: Ensure partyId is preserved
      newState.partyId = partyId;

      // Save to both Redis and Firestore
      await saveGameState(partyId, newState);

      // Broadcast update
      io.to(`party:${partyId}`).emit('game-updated', newState);

      // Check if next player is a bot and trigger auto-play (if game didn't end)
      if (newState.phase === 'ACTIVE') {
        // Wait for reveal animation to complete (3s) + small buffer before checking
        setTimeout(() => {
          checkAndMakeBotMove(partyId, newState, io).catch(console.error);
        }, 3500); // 3s reveal animation + 500ms buffer
      }

      // If game ended, persist winners to Firestore
      if (newState.phase === 'ENDED') {
        // Create a new engine with the updated state to get correct final ownership
        const finalEngine = new GameEngine(newState, config);
        const finalState = finalEngine.endGame();
        
        // Write winnerId to Firestore gifts collection - ensure one gift per player
        const { db } = await import('./config/firebase-admin.js');
        const finalOwnership = finalState.finalOwnership || {};
        
        // Ensure one gift per player - track which gift each winner gets
        const winnerToGiftMap = new Map();
        const giftsToUpdate = [];
        
        // First pass: build map of winner -> gift (only first gift per winner)
        for (const [giftId, winnerId] of Object.entries(finalOwnership)) {
          if (winnerId && !winnerToGiftMap.has(winnerId)) {
            winnerToGiftMap.set(winnerId, giftId);
            giftsToUpdate.push({ giftId, winnerId });
          }
        }
        
        // Clear winnerId from any gifts not in the final assignment
        const assignedGiftIds = new Set(giftsToUpdate.map(g => g.giftId));
        const allGiftsSnapshot = await db.collection('gifts').where('partyId', '==', partyId).get();
        
        for (const giftDoc of allGiftsSnapshot.docs) {
          const giftId = giftDoc.id;
          const giftData = giftDoc.data();
          
          if (assignedGiftIds.has(giftId)) {
            // Update with correct winnerId
            const assignment = giftsToUpdate.find(g => g.giftId === giftId);
            if (assignment) {
              await db.collection('gifts').doc(giftId).update({
                winnerId: assignment.winnerId,
                updatedAt: new Date(),
              });
            }
          } else {
            // Clear winnerId from unassigned gifts
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
        
        io.to(`party:${partyId}`).emit('game-ended', finalState);
      }
    } catch (error) {
      socket.emit('error', { message: error.message });
    }
  });

  // Handle reaction events
  socket.on('send_reaction', async ({ partyId, type, value }) => {
    try {
      // Validate input
      if (!isValidPartyId(partyId)) {
        socket.emit('error', { message: 'Invalid party ID' });
        return;
      }
      
      // Verify user is a participant
      const isParticipant = await verifyPartyMembership(partyId, socket.userId);
      if (!isParticipant) {
        socket.emit('error', { message: 'You are not a participant in this party' });
        return;
      }

      // Ensure socket is in the room (in case it wasn't joined properly)
      const roomName = `party:${partyId}`;
      if (!socket.rooms.has(roomName)) {
        console.log(`⚠️ Socket ${socket.id} not in room ${roomName}, joining now...`);
        socket.join(roomName);
      }
      
      // Load game state and increment reaction count
      const { loadGameState, saveGameState } = await import('./utils/game-state-persistence.js');
      const gameState = await loadGameState(partyId);
      
      if (gameState && gameState.phase === 'ACTIVE') {
        // Increment reaction count in game state
        const { GameEngine } = await import('./engine.js');
        const config = gameState.config || { maxSteals: 3, returnToStart: false };
        const engine = new GameEngine(gameState, config);
        engine.reactionCount = (engine.reactionCount || 0) + 1;
        const updatedState = engine.getState();
        
        // Save updated state (with incremented reaction count)
        await saveGameState(partyId, updatedState);
      }
      
      // Broadcast reaction to all OTHER clients in the party room
      // (Sender already sees it via optimistic UI)
      const reactionData = {
        emoji: value,
        userId: socket.userId,
        type: type || 'emoji',
      };
      
      const room = io.sockets.adapter.rooms.get(roomName);
      const roomSize = room ? room.size : 0;
      const socketIds = room ? Array.from(room) : [];
      
      console.log(`📢 Broadcasting reaction: ${value} by ${socket.userId} (socket: ${socket.id}) in party ${partyId} to room ${roomName} (${roomSize} clients: ${socketIds.join(', ')})`);
      
      // Broadcast to all OTHER clients in the room (excludes sender)
      socket.broadcast.to(roomName).emit('reaction_received', reactionData);
      
      console.log(`✅ Reaction broadcast complete: ${value} by ${socket.userId} in party ${partyId} (broadcast to ${roomSize - 1} other clients)`);
    } catch (error) {
      console.error('Error handling reaction:', error);
      socket.emit('error', { message: error.message });
    }
  });

  // Admin: Batch add fake players for simulation
  socket.on('admin_batch_add_bots', async (data) => {
    console.log(`🤖🤖🤖 ADMIN_BATCH_ADD_BOTS EVENT RECEIVED 🤖🤖🤖`);
    console.log(`📥 Received admin_batch_add_bots event:`, { 
      data,
      userId: socket.userId,
      socketId: socket.id,
      connected: socket.connected 
    });
    
    // Validate data structure
    if (!data || typeof data !== 'object') {
      console.error('❌ Invalid data structure:', data);
      socket.emit('error', { message: 'Invalid request data' });
      return;
    }
    
    const { partyId, count } = data;
    
    try {
      // Validate input
      if (!isValidPartyId(partyId) || !Number.isInteger(count) || count < 1 || count > 50) {
        console.log(`❌ Invalid input: partyId=${partyId}, count=${count}`);
        socket.emit('error', { message: 'Invalid party ID or bot count (1-50)' });
        return;
      }

      // Verify user is party admin
      console.log(`🔍 Checking party admin for party ${partyId}, user ${socket.userId}`);
      const partyDoc = await db.collection('parties').doc(partyId).get();
      if (!partyDoc.exists) {
        console.log(`❌ Party ${partyId} not found`);
        socket.emit('error', { message: 'Party not found' });
        return;
      }

      const party = partyDoc.data();
      console.log(`📋 Party data:`, { adminId: party.adminId, status: party.status, userId: socket.userId });
      if (party.adminId !== socket.userId) {
        console.log(`❌ User ${socket.userId} is not admin (adminId: ${party.adminId})`);
        socket.emit('error', { message: 'Only party admin can add bots' });
        return;
      }

      // Allow adding bots in LOBBY or ACTIVE status (for testing)
      // In ACTIVE status, bots will be added but won't join the current game
      if (party.status !== 'LOBBY' && party.status !== 'ACTIVE') {
        console.log(`❌ Party is not in LOBBY or ACTIVE status (status: ${party.status})`);
        socket.emit('error', { message: `Can only add bots when party is in LOBBY or ACTIVE status. Current status: ${party.status}` });
        return;
      }

      // Warn if adding bots to an active game (they won't join current game)
      if (party.status === 'ACTIVE') {
        console.log(`⚠️ Adding bots to active game - they will be participants but won't join current game`);
      }

      console.log(`🤖 Admin ${socket.userId} adding ${count} bots to party ${partyId}`);

      // Fake names for bots
      const fakeNames = [
        'Alice', 'Bob', 'Charlie', 'Diana', 'Eve', 'Frank', 'Grace', 'Henry',
        'Ivy', 'Jack', 'Kate', 'Leo', 'Mia', 'Noah', 'Olivia', 'Paul',
        'Quinn', 'Ruby', 'Sam', 'Tina', 'Uma', 'Victor', 'Wendy', 'Xander',
        'Yara', 'Zoe', 'Alex', 'Blake', 'Casey', 'Drew', 'Ellis', 'Finley'
      ];

      // Fake gift ideas
      const fakeGifts = [
        { title: 'Vintage Record Player', price: '$45', emoji: '🎵' },
        { title: 'Gourmet Coffee Set', price: '$30', emoji: '☕' },
        { title: 'Artisan Candle Collection', price: '$25', emoji: '🕯️' },
        { title: 'Leather Journal', price: '$35', emoji: '📔' },
        { title: 'Board Game Collection', price: '$40', emoji: '🎲' },
        { title: 'Scarf & Gloves Set', price: '$28', emoji: '🧣' },
        { title: 'Bluetooth Speaker', price: '$50', emoji: '🔊' },
        { title: 'Tea Sampler Box', price: '$22', emoji: '🍵' },
        { title: 'Yoga Mat Bundle', price: '$35', emoji: '🧘' },
        { title: 'Puzzle Set', price: '$20', emoji: '🧩' },
        { title: 'Chocolate Gift Basket', price: '$30', emoji: '🍫' },
        { title: 'Indoor Plant Kit', price: '$25', emoji: '🌱' }
      ];

      const batch = db.batch();
      const addedBots = [];
      const baseTimestamp = Date.now();

      for (let i = 0; i < count; i++) {
        // Use unique ID with timestamp + index + random to ensure uniqueness
        const botId = `bot_${partyId}_${baseTimestamp}_${i}_${Math.random().toString(36).substring(2, 9)}`;
        const botName = fakeNames[i % fakeNames.length] + ` ${Math.floor(Math.random() * 1000)}`;
        const botEmail = `bot${i}@simulation.local`;
        
        // Create fake user document
        const userRef = db.collection('users').doc(botId);
        batch.set(userRef, {
          displayName: botName,
          email: botEmail,
          createdAt: new Date(),
          updatedAt: new Date(),
          isBot: true,
        });

        // Create participant document
        const participantRef = db.collection('parties').doc(partyId).collection('participants').doc(botId);
        batch.set(participantRef, {
          status: 'GOING',
          turnNumber: null,
          ready: true, // Bots are auto-ready
          joinedAt: new Date(),
          updatedAt: new Date(),
        });

        // Create fake gift for this bot
        const giftData = fakeGifts[i % fakeGifts.length];
        const giftRef = db.collection('gifts').doc();
        batch.set(giftRef, {
          partyId,
          submitterId: botId,
          title: giftData.title,
          price: giftData.price,
          image: null,
          url: null,
          isFrozen: false,
          winnerId: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        });

        addedBots.push({ id: botId, name: botName, gift: giftData.title });
      }

      // Commit all writes
      console.log(`💾 Committing batch with ${addedBots.length} bots to Firestore...`);
      console.log(`📝 Bot IDs being created:`, addedBots.map(b => b.id));
      await batch.commit();
      console.log(`✅ Batch committed successfully`);

      // Verify the write by reading back
      const participantsSnapshot = await db
        .collection('parties')
        .doc(partyId)
        .collection('participants')
        .get();
      console.log(`📊 Total participants in party ${partyId} after commit: ${participantsSnapshot.size}`);
      console.log(`📋 Participant IDs:`, participantsSnapshot.docs.map(d => d.id));
      
      // Check if all bots were written
      const botIds = addedBots.map(b => b.id);
      const writtenBotIds = participantsSnapshot.docs
        .map(d => d.id)
        .filter(id => id.startsWith('bot_'));
      console.log(`🤖 Bots written: ${writtenBotIds.length}/${botIds.length}`);
      if (writtenBotIds.length !== botIds.length) {
        console.warn(`⚠️ Mismatch! Expected ${botIds.length} bots, found ${writtenBotIds.length}`);
      }

      console.log(`✅ Successfully added ${count} bots to party ${partyId}:`, addedBots);
      socket.emit('bots-added', { count, bots: addedBots });
      
      // Notify all clients in the party room
      // Note: Firestore real-time listeners will automatically update the participants list
      io.to(`party:${partyId}`).emit('participants-updated');
      console.log(`📢 Notified all clients in party:${partyId} - ${count} bots added to Firestore`);
    } catch (error) {
      console.error('❌ Error adding bots:', error);
      console.error('Error stack:', error.stack);
      socket.emit('error', { message: 'Failed to add bots: ' + error.message });
    }
  });

  // Admin: Toggle autoplay for bots
  socket.on('admin_toggle_autoplay', async ({ partyId, active }) => {
    console.log(`📥 Received admin_toggle_autoplay event:`, { partyId, active, userId: socket.userId });
    try {
      // Validate input
      if (!isValidPartyId(partyId) || typeof active !== 'boolean') {
        socket.emit('error', { message: 'Invalid party ID or autoplay state' });
        return;
      }

      // Verify user is party admin
      const partyDoc = await db.collection('parties').doc(partyId).get();
      if (!partyDoc.exists) {
        socket.emit('error', { message: 'Party not found' });
        return;
      }

      const party = partyDoc.data();
      if (party.adminId !== socket.userId) {
        socket.emit('error', { message: 'Only party admin can toggle autoplay' });
        return;
      }

      // Store autoplay state in Redis
      const autoplayKey = `autoplay:${partyId}`;
      if (active) {
        await redisClient.setEx(autoplayKey, 86400, 'true'); // 24 hour expiry
        console.log(`✅ Autoplay enabled for party ${partyId}`);
        
        // Trigger bot move check if game is active
        const { loadGameState } = await import('./utils/game-state-persistence.js');
        const gameState = await loadGameState(partyId);
        if (gameState && gameState.phase === 'ACTIVE') {
          // Schedule bot move check - wait for reveal animation to complete
          setTimeout(() => checkAndMakeBotMove(partyId, gameState, io), 3500); // 3s reveal animation + 500ms buffer
        }
      } else {
        await redisClient.del(autoplayKey);
        console.log(`❌ Autoplay disabled for party ${partyId}`);
      }

      socket.emit('autoplay-toggled', { active });
      io.to(`party:${partyId}`).emit('autoplay-updated', { active });
    } catch (error) {
      console.error('❌ Error toggling autoplay:', error);
      socket.emit('error', { message: 'Failed to toggle autoplay: ' + error.message });
    }
  });

  // Admin: Force bot move (manual bot control)
  socket.on('admin_force_bot_move', async ({ partyId }) => {
    console.log(`📥 Received admin_force_bot_move event:`, { partyId, userId: socket.userId });
    try {
      // Validate input
      if (!isValidPartyId(partyId)) {
        socket.emit('error', { message: 'Invalid party ID' });
        return;
      }

      // Verify user is party admin
      const partyDoc = await db.collection('parties').doc(partyId).get();
      if (!partyDoc.exists) {
        socket.emit('error', { message: 'Party not found' });
        return;
      }

      const party = partyDoc.data();
      if (party.adminId !== socket.userId) {
        socket.emit('error', { message: 'Only party admin can force bot moves' });
        return;
      }

      // Force bot move
      const { forceBotMove } = await import('./utils/bot-utils.js');
      const result = await forceBotMove(partyId, io);
      
      socket.emit('bot-move-forced', { success: true, result });
      console.log(`✅ Bot move forced for party ${partyId}:`, result);
    } catch (error) {
      console.error('❌ Error forcing bot move:', error);
      socket.emit('error', { message: 'Failed to force bot move: ' + error.message });
    }
  });

  socket.on('admin_force_bot_steal', async ({ partyId }) => {
    console.log(`📥 Received admin_force_bot_steal event:`, { partyId, userId: socket.userId });
    try {
      // Validate input
      if (!isValidPartyId(partyId)) {
        socket.emit('error', { message: 'Invalid party ID' });
        return;
      }

      // Verify user is party admin
      const partyDoc = await db.collection('parties').doc(partyId).get();
      if (!partyDoc.exists) {
        socket.emit('error', { message: 'Party not found' });
        return;
      }

      const party = partyDoc.data();
      if (party.adminId !== socket.userId) {
        socket.emit('error', { message: 'Only party admin can force bot moves' });
        return;
      }

      // Force bot steal
      const { forceBotSteal } = await import('./utils/bot-utils.js');
      const result = await forceBotSteal(partyId, io);
      
      socket.emit('bot-steal-forced', { success: true, result });
      console.log(`✅ Bot steal forced for party ${partyId}:`, result);
    } catch (error) {
      console.error('❌ Error forcing bot steal:', error);
      socket.emit('error', { message: 'Failed to force bot steal: ' + error.message });
    }
  });

  socket.on('admin_force_bot_skip', async ({ partyId }) => {
    console.log(`📥 Received admin_force_bot_skip event:`, { partyId, userId: socket.userId });
    try {
      // Validate input
      if (!isValidPartyId(partyId)) {
        socket.emit('error', { message: 'Invalid party ID' });
        return;
      }

      // Verify user is party admin
      const partyDoc = await db.collection('parties').doc(partyId).get();
      if (!partyDoc.exists) {
        socket.emit('error', { message: 'Party not found' });
        return;
      }

      const party = partyDoc.data();
      if (party.adminId !== socket.userId) {
        socket.emit('error', { message: 'Only party admin can force bot moves' });
        return;
      }

      // Force bot skip
      const { forceBotSkip } = await import('./utils/bot-utils.js');
      const result = await forceBotSkip(partyId, io);
      
      socket.emit('bot-move-forced', { success: true, result });
      console.log(`✅ Bot skip forced for party ${partyId}:`, result);
    } catch (error) {
      console.error('❌ Error forcing bot skip:', error);
      socket.emit('error', { message: error.message });
    }
  });

  socket.on('admin_force_bot_pick', async ({ partyId }) => {
    console.log(`📥 Received admin_force_bot_pick event:`, { partyId, userId: socket.userId });
    try {
      // Validate input
      if (!isValidPartyId(partyId)) {
        socket.emit('error', { message: 'Invalid party ID' });
        return;
      }

      // Verify user is party admin
      const partyDoc = await db.collection('parties').doc(partyId).get();
      if (!partyDoc.exists) {
        socket.emit('error', { message: 'Party not found' });
        return;
      }

      const party = partyDoc.data();
      if (party.adminId !== socket.userId) {
        socket.emit('error', { message: 'Only party admin can force bot moves' });
        return;
      }

      // Force bot pick
      const { forceBotPick } = await import('./utils/bot-utils.js');
      const result = await forceBotPick(partyId, io);
      
      socket.emit('bot-pick-forced', { success: true, result });
      console.log(`✅ Bot pick forced for party ${partyId}:`, result);
    } catch (error) {
      console.error('❌ Error forcing bot pick:', error);
      socket.emit('error', { message: 'Failed to force bot pick: ' + error.message });
    }
  });

  // Admin: Reset game
  socket.on('admin_reset_game', async ({ partyId }) => {
    console.log(`📥 Received admin_reset_game event:`, { partyId, userId: socket.userId });
    try {
      // Validate input
      if (!isValidPartyId(partyId)) {
        socket.emit('error', { message: 'Invalid party ID' });
        return;
      }

      // Verify user is party admin
      const partyDoc = await db.collection('parties').doc(partyId).get();
      if (!partyDoc.exists) {
        socket.emit('error', { message: 'Party not found' });
        return;
      }

      const party = partyDoc.data();
      if (party.adminId !== socket.userId) {
        socket.emit('error', { message: 'Only party admin can reset game' });
        return;
      }

      // Clear game state from Redis
      const redisKey = `game:${partyId}`;
      await redisClient.del(redisKey);

      // Clear autoplay state
      const autoplayKey = `autoplay:${partyId}`;
      await redisClient.del(autoplayKey);
      
      // Clear game state from both Redis and Firestore
      const { deleteGameState } = await import('./utils/game-state-persistence.js');
      await deleteGameState(partyId);
      
      // Clear bot timers and state
      const { clearBotState } = await import('./utils/bot-utils.js');
      clearBotState(partyId);

      // Reset party status to LOBBY
      await db.collection('parties').doc(partyId).update({
        status: 'LOBBY',
        updatedAt: new Date(),
      });

      // Clear winnerId from all gifts
      const giftsSnapshot = await db.collection('gifts').where('partyId', '==', partyId).get();
      const batch = db.batch();
      giftsSnapshot.docs.forEach((giftDoc) => {
        batch.update(giftDoc.ref, {
          winnerId: null,
          updatedAt: new Date(),
        });
      });
      await batch.commit();

      console.log(`✅ Game reset for party ${partyId}`);
      socket.emit('game-reset', { partyId });
      io.to(`party:${partyId}`).emit('game-reset', { partyId });
    } catch (error) {
      console.error('❌ Error resetting game:', error);
      socket.emit('error', { message: 'Failed to reset game: ' + error.message });
    }
  });

  socket.on('disconnect', () => {
    console.log(`❌ User disconnected: ${socket.userId}`);
  });
});

// Start server
httpServer.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📡 Socket.io ready`);
  console.log(`🔍 Debug logging enabled - watching for socket events`);
  console.log(`🌐 CORS allowed origins:`, allowedOrigins);
});


