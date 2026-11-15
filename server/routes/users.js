/**
 * Users API Routes
 */
import express from 'express';
import { auth, db } from '../config/firebase-admin.js';
import { batchUsersLookup, isValidPartyId } from '../utils/batch-users.js';

const router = express.Router();

/**
 * POST /api/users/batch
 * Get display info for party members (caller must be admin or participant).
 */
router.post('/batch', async (req, res) => {
  try {
    if (!req.user?.uid) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const { userIds, partyId } = req.body;

    if (typeof partyId !== 'string' || !isValidPartyId(partyId)) {
      return res.status(400).json({ error: 'Valid partyId is required' });
    }

    if (!Array.isArray(userIds)) {
      return res.status(400).json({ error: 'userIds must be an array' });
    }

    if (userIds.length > 100) {
      return res.status(400).json({ error: 'Maximum 100 userIds allowed per request' });
    }

    for (const userId of userIds) {
      if (typeof userId !== 'string' || userId.length === 0 || userId.length > 128) {
        return res.status(400).json({ error: 'Invalid userId in array' });
      }
    }

    const result = await batchUsersLookup(db, auth, req.user.uid, partyId, userIds);

    res.json(result);
  } catch (error) {
    console.error('Error in batch user fetch:', error);
    res.status(500).json({ error: 'Failed to fetch user info' });
  }
});

export default router;