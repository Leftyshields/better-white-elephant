/**
 * Test API Routes
 * For E2E testing - allows programmatic party creation using Firebase Admin SDK
 * Only available in development/test environments
 */
import express from 'express';
import { db } from '../config/firebase-admin.js';
import { partyConverter, participantConverter } from '../utils/firestore-converters.js';

const router = express.Router();

// Middleware to protect test endpoints - only allow in non-production environments
router.use((req, res, next) => {
  // Check if we're in production
  if (process.env.NODE_ENV === 'production') {
    // In production, require a test secret header
    const testSecret = process.env.TEST_SECRET;
    if (!testSecret || req.headers['x-test-secret'] !== testSecret) {
      return res.status(403).json({ 
        error: 'Test endpoints are disabled in production',
        hint: 'Set NODE_ENV to development or provide valid X-Test-Secret header'
      });
    }
  }
  next();
});

/**
 * POST /api/test/party
 * Create a test party using Firebase Admin SDK (bypasses Firestore security rules)
 * 
 * Request Body (optional):
 * {
 *   "adminId": "test-user-id",  // Optional, defaults to "test-admin-{timestamp}"
 *   "title": "My Test Party",    // Optional
 *   "date": "2024-12-25",        // Optional, defaults to tomorrow
 *   "config": {                   // Optional
 *     "maxSteals": 3,
 *     "returnToStart": false
 *   }
 * }
 * 
 * Response:
 * {
 *   "success": true,
 *   "partyId": "abc123..."
 * }
 */
router.post('/party', async (req, res) => {
  try {
    const { adminId, title, date, config } = req.body || {};

    // Generate default adminId if not provided
    const partyAdminId = adminId || `test-admin-${Date.now()}`;

    // Set default date to tomorrow if not provided
    let partyDate;
    if (date) {
      partyDate = new Date(date);
    } else {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      partyDate = tomorrow;
    }

    // Default title
    const partyTitle = title || `Test Party ${new Date().toISOString()}`;

    // Default config
    const partyConfig = {
      maxSteals: config?.maxSteals ?? 3,
      returnToStart: config?.returnToStart ?? false,
      priceLimit: config?.priceLimit ?? null,
    };

    // Create party document using converter
    const partyData = partyConverter.toFirestore({
      adminId: partyAdminId,
      title: partyTitle,
      date: partyDate,
      status: 'LOBBY',
      config: partyConfig,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    // Add party document to Firestore
    const partyRef = await db.collection('parties').add(partyData);
    const partyId = partyRef.id;

    // Create participant entry for admin
    const participantData = participantConverter.toFirestore({
      status: 'PENDING',
      turnNumber: null,
      joinedAt: new Date(),
      updatedAt: new Date(),
    });

    await db
      .collection('parties')
      .doc(partyId)
      .collection('participants')
      .doc(partyAdminId)
      .set(participantData);

    return res.json({
      success: true,
      partyId,
      adminId: partyAdminId,
    });
  } catch (error) {
    console.error('Error creating test party:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to create test party',
    });
  }
});

export default router;
