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

dotenv.config();

const app = express();
const httpServer = createServer(app);
// CORS origins - allow both localhost and hostname for development
const allowedOrigins = [
  process.env.CLIENT_URL || 'http://localhost:5173',
  'http://localhost:5173',
  'http://sandbox-mac-mini.local:5173',
  'https://better-white-elephant.web.app',
  'https://better-white-elephant.firebaseapp.com',
  // Add your custom domain here when you set it up
  // 'https://yourdomain.com',
].filter(Boolean);

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
  console.log(`✅ User connected: ${socket.userId}`);

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
    
    socket.join(`party:${partyId}`);
    console.log(`User ${socket.userId} joined party:${partyId}`);

    // Send current game state if game is active
    const redisKey = `game:${partyId}`;
    const gameStateStr = await redisClient.get(redisKey);
    if (gameStateStr) {
      const gameState = JSON.parse(gameStateStr);
      socket.emit('game-state', gameState);
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
      
      const redisKey = `game:${partyId}`;
      const gameStateStr = await redisClient.get(redisKey);
      if (!gameStateStr) {
        socket.emit('error', { message: 'Game not found' });
        return;
      }

      const gameState = JSON.parse(gameStateStr);
      const { GameEngine } = await import('./engine.js');
      const config = gameState.config || { maxSteals: 3, returnToStart: false };
      const engine = new GameEngine(gameState, config);

      engine.pickGift(giftId, socket.userId);
      const newState = engine.getState();
      // Preserve config in state
      newState.config = gameState.config;

      // Save to Redis
      await redisClient.setEx(redisKey, 86400, JSON.stringify(newState));

      // Broadcast update
      io.to(`party:${partyId}`).emit('game-updated', newState);
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
      
      const redisKey = `game:${partyId}`;
      const gameStateStr = await redisClient.get(redisKey);
      if (!gameStateStr) {
        socket.emit('error', { message: 'Game not found' });
        return;
      }

      const gameState = JSON.parse(gameStateStr);
      const { GameEngine } = await import('./engine.js');
      const config = gameState.config || { maxSteals: 3, returnToStart: false };
      const engine = new GameEngine(gameState, config);

      engine.stealGift(giftId, socket.userId);
      const newState = engine.getState();
      // Preserve config in state
      newState.config = gameState.config;

      // Save to Redis
      await redisClient.setEx(redisKey, 86400, JSON.stringify(newState));

      // Broadcast update
      io.to(`party:${partyId}`).emit('game-updated', newState);
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
      
      const redisKey = `game:${partyId}`;
      const gameStateStr = await redisClient.get(redisKey);
      if (!gameStateStr) {
        socket.emit('error', { message: 'Game not found' });
        return;
      }

      const gameState = JSON.parse(gameStateStr);
      const { GameEngine } = await import('./engine.js');
      const config = gameState.config || { maxSteals: 3, returnToStart: false };
      const engine = new GameEngine(gameState, config);

      const newState = engine.endTurn();
      // Preserve config in state
      newState.config = gameState.config;

      // Save to Redis
      await redisClient.setEx(redisKey, 86400, JSON.stringify(newState));

      // Broadcast update
      io.to(`party:${partyId}`).emit('game-updated', newState);

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
        await db.collection('parties').doc(partyId).update({
          status: 'ENDED',
          gameHistory: finalState.state.history || [], // Store history in party document
          updatedAt: new Date(),
        });
        
        io.to(`party:${partyId}`).emit('game-ended', finalState);
      }
    } catch (error) {
      socket.emit('error', { message: error.message });
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
});


