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
    const userBots = {};
    
    // Fetch user info from Firebase Auth and Firestore
    for (const userId of userIds) {
      try {
        // Check if it's a bot (bots only exist in Firestore, not Auth)
        const isBot = userId.startsWith('bot_');
        
        // Get from Firestore users collection first (for bots and regular users)
        const userDoc = await admin.firestore().collection('users').doc(userId).get();
        let firestoreDisplayName = null;
        let firestoreEmail = null;
        let isBotUser = false;
        
        if (userDoc.exists) {
          const userData = userDoc.data();
          firestoreDisplayName = userData.displayName || userData.name || null;
          firestoreEmail = userData.email || null;
          isBotUser = userData.isBot === true || isBot;
        }
        
        // For non-bots, try Firebase Auth as fallback
        let authDisplayName = null;
        let authEmail = null;
        if (!isBotUser) {
          try {
            const authUser = await admin.auth().getUser(userId);
            authDisplayName = authUser.displayName || null;
            authEmail = authUser.email || null;
          } catch (authError) {
            // User might not exist in Auth (e.g., deleted account), that's OK
            console.log(`User ${userId} not found in Auth, using Firestore data only`);
          }
        }
        
        // Determine the best display name to use
        // Prefer Firestore displayName, then Auth displayName, then email username, then userId
        const finalEmail = firestoreEmail || authEmail;
        const emailUsername = finalEmail ? finalEmail.split('@')[0] : null;
        
        userInfo[userId] = firestoreDisplayName || authDisplayName || emailUsername || userId;
        userEmails[userId] = firestoreEmail || authEmail || null;
        userBots[userId] = isBotUser;
      } catch (error) {
        console.error(`Error fetching user ${userId}:`, error);
        userInfo[userId] = userId;
        userEmails[userId] = null;
        userBots[userId] = false;
      }
    }

    res.json({ users: userInfo, emails: userEmails, bots: userBots });
  } catch (error) {
    console.error('Error in batch user fetch:', error);
    res.status(500).json({ error: 'Failed to fetch user info', message: error.message });
  }
});

export default router;

