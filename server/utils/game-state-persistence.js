/**
 * Game State Persistence Utility
 * Handles saving game state to both Redis (for fast access) and Firestore (for persistence)
 */
import redisClient from './redis.js';
import { db } from '../config/firebase-admin.js';
import admin from 'firebase-admin';

const { Timestamp } = admin.firestore;

/**
 * Deep clean an object for Firestore compatibility
 * Removes undefined values, converts Maps/Sets, handles Dates, removes functions
 */
function cleanForFirestore(obj, depth = 0) {
  // Prevent infinite recursion (Firestore max depth is 20)
  if (depth > 15) {
    console.warn('Maximum recursion depth reached in cleanForFirestore');
    return null;
  }
  
  if (obj === null || obj === undefined) {
    return null;
  }
  
  // Handle primitives (string, number, boolean)
  if (typeof obj !== 'object') {
    // Reject functions and symbols
    if (typeof obj === 'function' || typeof obj === 'symbol') {
      return null;
    }
    return obj;
  }
  
  // Handle Date objects - convert to Firestore Timestamp
  if (obj instanceof Date) {
    return Timestamp.fromDate(obj);
  }
  
  // Handle Firestore Timestamp (already valid)
  if (obj instanceof Timestamp) {
    return obj;
  }
  
  // Handle Arrays
  if (Array.isArray(obj)) {
    return obj.map(item => {
      const cleaned = cleanForFirestore(item, depth + 1);
      // Convert undefined to null in arrays (Firestore doesn't allow undefined)
      return cleaned === undefined ? null : cleaned;
    });
  }
  
  // Handle Maps - convert to object
  if (obj instanceof Map) {
    const result = {};
    for (const [key, value] of obj.entries()) {
      const cleaned = cleanForFirestore(value, depth + 1);
      if (cleaned !== undefined) {
        result[String(key)] = cleaned;
      }
    }
    return result;
  }
  
  // Handle Sets - convert to array
  if (obj instanceof Set) {
    return Array.from(obj)
      .map(item => cleanForFirestore(item, depth + 1))
      .filter(item => item !== undefined);
  }
  
  // Handle plain objects
  const result = {};
  for (const [key, value] of Object.entries(obj)) {
    // Skip undefined values and functions (Firestore doesn't allow them)
    if (value !== undefined && typeof value !== 'function' && typeof value !== 'symbol') {
      const cleaned = cleanForFirestore(value, depth + 1);
      // Only add if cleaned value is not undefined
      if (cleaned !== undefined) {
        result[key] = cleaned;
      }
    }
  }
  return result;
}

/**
 * Convert Firestore Timestamps to ISO strings for Redis storage
 */
function cleanForRedis(obj) {
  if (obj === null || obj === undefined) {
    return null;
  }
  
  // Handle primitives
  if (typeof obj !== 'object') {
    return obj;
  }
  
  // Handle Firestore Timestamps - convert to ISO string
  if (obj instanceof Timestamp) {
    return obj.toDate().toISOString();
  }
  
  // Handle Date objects - convert to ISO string
  if (obj instanceof Date) {
    return obj.toISOString();
  }
  
  // Handle Arrays
  if (Array.isArray(obj)) {
    return obj.map(item => cleanForRedis(item));
  }
  
  // Handle Maps - convert to object
  if (obj instanceof Map) {
    const result = {};
    for (const [key, value] of obj.entries()) {
      result[String(key)] = cleanForRedis(value);
    }
    return result;
  }
  
  // Handle Sets - convert to array
  if (obj instanceof Set) {
    return Array.from(obj).map(item => cleanForRedis(item));
  }
  
  // Handle plain objects
  const result = {};
  for (const [key, value] of Object.entries(obj)) {
    result[key] = cleanForRedis(value);
  }
  return result;
}

/**
 * Save game state to both Redis and Firestore
 * @param {string} partyId - The party ID
 * @param {object} gameState - The game state object
 * @param {number} ttl - Redis TTL in seconds (default: 86400 = 24 hours)
 */
export async function saveGameState(partyId, gameState, ttl = 86400) {
  const redisKey = `game:${partyId}`;
  
  // Clean the game state for Firestore compatibility
  // This handles Maps, Sets, Dates, undefined values, etc.
  const cleanedState = cleanForFirestore(gameState);
  
  // Create a JSON-safe version for Redis (convert Firestore Timestamps to ISO strings)
  const redisState = cleanForRedis(cleanedState);
  
  // Save to Redis (fast access)
  await redisClient.setEx(redisKey, ttl, JSON.stringify(redisState));
  
  // Save to Firestore (persistence)
  // Firestore requires plain objects with no undefined values
  try {
    await db.collection('parties').doc(partyId).update({
      gameState: cleanedState,
      gameStateUpdatedAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    });
  } catch (error) {
    console.error(`Error saving game state to Firestore for party ${partyId}:`, error);
    console.error(`Error details:`, error.message, error.details);
    // Log the problematic state structure for debugging (first 1000 chars)
    try {
      const debugStr = JSON.stringify(cleanedState, null, 2);
      console.error(`Game state structure (first 1000 chars):`, debugStr.substring(0, 1000));
      // Also log the size
      console.error(`Game state size:`, JSON.stringify(cleanedState).length, 'bytes');
    } catch (e) {
      console.error(`Could not stringify game state for debugging:`, e.message);
    }
    // Don't throw - Redis save succeeded, Firestore is backup
  }
}

/**
 * Load game state from Redis, or restore from Firestore if Redis is empty
 * @param {string} partyId - The party ID
 * @returns {object|null} - The game state object, or null if not found
 */
export async function loadGameState(partyId) {
  const redisKey = `game:${partyId}`;
  
  // Try Redis first (fast)
  const redisState = await redisClient.get(redisKey);
  if (redisState) {
    return JSON.parse(redisState);
  }
  
  // Redis is empty - try to restore from Firestore
  try {
    const partyDoc = await db.collection('parties').doc(partyId).get();
    if (partyDoc.exists) {
      const partyData = partyDoc.data();
      
      // Check if party is ACTIVE and has game state in Firestore
      if (partyData.status === 'ACTIVE' && partyData.gameState) {
        const gameState = partyData.gameState;
        console.log(`🔄 Restoring game state from Firestore for party ${partyId}`);
        
        // Restore to Redis for future fast access
        await redisClient.setEx(redisKey, 86400, JSON.stringify(gameState));
        
        return gameState;
      }
    }
  } catch (error) {
    console.error(`Error loading game state from Firestore for party ${partyId}:`, error);
  }
  
  return null;
}

/**
 * Delete game state from both Redis and Firestore
 * @param {string} partyId - The party ID
 */
export async function deleteGameState(partyId) {
  const redisKey = `game:${partyId}`;
  
  // Delete from Redis
  await redisClient.del(redisKey);
  
  // Clear from Firestore
  try {
    await db.collection('parties').doc(partyId).update({
      gameState: null,
      gameStateUpdatedAt: null,
      updatedAt: Timestamp.now(),
    });
  } catch (error) {
    console.error(`Error deleting game state from Firestore for party ${partyId}:`, error);
  }
}

