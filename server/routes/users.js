/**
 * Users API Routes
 */
import express from 'express';
import admin from 'firebase-admin';

const router = express.Router();

/**
 * POST /api/users/batch
 * Get user info for multiple user IDs
 */
router.post('/batch', async (req, res) => {
  try {
    // Require authentication
    if (!req.user?.uid) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    
    const { userIds } = req.body;

    if (!Array.isArray(userIds)) {
      return res.status(400).json({ error: 'userIds must be an array' });
    }
    
    // Limit array size to prevent DoS
    if (userIds.length > 100) {
      return res.status(400).json({ error: 'Maximum 100 userIds allowed per request' });
    }
    
    // Validate each userId
    for (const userId of userIds) {
      if (typeof userId !== 'string' || userId.length === 0 || userId.length > 128) {
        return res.status(400).json({ error: 'Invalid userId in array' });
      }
    }

    const userInfo = {};
    const userEmails = {};
    
    // Fetch user info from Firebase Auth and Firestore
    for (const userId of userIds) {
      try {
        // Get from Firebase Auth (Admin SDK)
        const authUser = await admin.auth().getUser(userId);
        const authDisplayName = authUser.displayName || authUser.email || null;
        const authEmail = authUser.email || null;
        
        // Get from Firestore users collection
        const userDoc = await admin.firestore().collection('users').doc(userId).get();
        let firestoreDisplayName = null;
        let firestoreEmail = null;
        
        if (userDoc.exists) {
          const userData = userDoc.data();
          firestoreDisplayName = userData.displayName || userData.name || userData.email || null;
          firestoreEmail = userData.email || null;
        }
        
        // Prefer Firestore, fallback to Auth
        userInfo[userId] = firestoreDisplayName || authDisplayName || userId;
        userEmails[userId] = firestoreEmail || authEmail || null;
      } catch (error) {
        console.error(`Error fetching user ${userId}:`, error);
        userInfo[userId] = userId;
        userEmails[userId] = null;
      }
    }

    res.json({ users: userInfo, emails: userEmails });
  } catch (error) {
    console.error('Error in batch user fetch:', error);
    res.status(500).json({ error: 'Failed to fetch user info', message: error.message });
  }
});

export default router;

