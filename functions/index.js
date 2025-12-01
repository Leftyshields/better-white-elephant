/**
 * Firebase Functions
 */
import { onRequest } from 'firebase-functions/v2/https';
import { onDocumentUpdated } from 'firebase-functions/v2/firestore';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { defineSecret } from 'firebase-functions/params';
import { Resend } from 'resend';
import admin from 'firebase-admin';

if (!admin.apps.length) {
  admin.initializeApp();
}

// Define secrets for Resend
const resendApiKey = defineSecret('RESEND_API_KEY');
const resendFromEmail = defineSecret('RESEND_FROM_EMAIL');
const db = admin.firestore();

// Initialize Resend with secret (production) or env var (fallback)
let resendInstance = null;
const getResend = () => {
  if (!resendInstance) {
    // Prioritize secrets (production), fallback to env var for local testing
    const apiKey = resendApiKey.value() || process.env.RESEND_API_KEY;
    if (!apiKey) {
      throw new Error('RESEND_API_KEY not found. Set it as a Firebase secret: firebase functions:secrets:set RESEND_API_KEY');
    }
    resendInstance = new Resend(apiKey);
  }
  return resendInstance;
};

/**
 * Send party invite email
 */
export const sendPartyInvite = onRequest(
  { 
    cors: true,
    secrets: [resendApiKey, resendFromEmail],
    invoker: 'public', // Make function publicly accessible
  },
  async (req, res) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    res.set('Access-Control-Allow-Origin', '*');
    res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.set('Access-Control-Allow-Headers', 'Content-Type');
    res.status(204).send('');
    return;
  }

  // Set CORS headers
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type');

  try {
    const { email, partyId, hostName } = req.body;

    if (!email || !partyId) {
      return res.status(400).json({ error: 'email and partyId are required' });
    }

    // Get party details
    const partyDoc = await db.collection('parties').doc(partyId).get();
    if (!partyDoc.exists) {
      return res.status(404).json({ error: 'Party not found' });
    }

    const party = partyDoc.data();
    // Use production URL for invite links (prefer custom domain, fallback to Firebase domain)
    const clientUrl = process.env.CLIENT_URL || 'https://stealorreveal.com' || 'https://better-white-elephant.web.app';
    const inviteLink = `${clientUrl}/party/${partyId}`;
    const partyTitle = party.title || 'White Elephant Party';
    const partyDate = party.date?.toDate ? party.date.toDate().toLocaleDateString() : 'TBD';

    // Send email via Resend
    const resendClient = getResend();
    // Prioritize secrets (production), fallback to env var
    // Ensure proper format for Resend
    let fromEmail = resendFromEmail.value() || process.env.RESEND_FROM_EMAIL || 'onboarding@resend.dev';
    fromEmail = fromEmail.trim();
    if (!fromEmail.includes('@')) {
      fromEmail = 'onboarding@resend.dev';
    }
    const { data, error } = await resendClient.emails.send({
      from: fromEmail,
      to: email,
      subject: `You're invited to ${partyTitle}!`,
      html: `
        <h1>You're Invited!</h1>
        <p>${hostName || 'Someone'} has invited you to a White Elephant gift exchange party.</p>
        <div style="background-color: #f3f4f6; padding: 16px; border-radius: 6px; margin: 16px 0;">
          <p style="margin: 0;"><strong>${partyTitle}</strong></p>
          <p style="margin: 8px 0 0 0; color: #6b7280;">Date: ${partyDate}</p>
        </div>
        <p><a href="${inviteLink}" style="display: inline-block; padding: 12px 24px; background-color: #2563eb; color: white; text-decoration: none; border-radius: 6px; margin-top: 16px;">Join Party</a></p>
        <p style="margin-top: 16px; color: #6b7280; font-size: 14px;">Or copy this link: <a href="${inviteLink}">${inviteLink}</a></p>
      `,
    });

    if (error) {
      console.error('Resend error:', error);
      
      // Handle Resend testing mode limitation
      if (error.statusCode === 403 || error.message?.includes('testing emails') || error.message?.includes('verified email')) {
        const isTestingMode = error.message?.includes('testing emails') || error.message?.includes('verified email');
        return res.status(403).json({ 
          error: 'Email sending limited',
          message: isTestingMode 
            ? `Resend is in testing mode. You can only send emails to verified email addresses (like ${process.env.VERIFIED_EMAIL || 'your account email'}). To send to other recipients, verify a domain at resend.com/domains`
            : 'Email sending is limited. Please verify your domain in Resend to send to all recipients.',
          details: error,
          testingMode: isTestingMode
        });
      }
      
      return res.status(500).json({ error: 'Failed to send email', details: error });
    }

    res.json({ success: true, messageId: data?.id });
  } catch (error) {
    console.error('Error sending invite:', error);
    res.status(500).json({ error: 'Failed to send invite', message: error.message });
  }
});

/**
 * Notify gift submitter when winner updates address
 */
export const notifyGiftSubmitter = onDocumentUpdated(
  {
    secrets: [resendApiKey, resendFromEmail],
  },
  'users/{userId}',
  async (event) => {
    try {
      const before = event.data.before.data();
      const after = event.data.after.data();

      // Check if shipping address was just added
      if (!before.shippingAddress && after.shippingAddress) {
        const userId = event.params.userId;

        // Find all gifts where this user is the winner
        const giftsSnapshot = await db
          .collection('gifts')
          .where('winnerId', '==', userId)
          .get();

        if (giftsSnapshot.empty) return;

        // Get user details
        const userDoc = await db.collection('users').doc(userId).get();
        const user = userDoc.data();

        // For each gift, notify the submitter
        for (const giftDoc of giftsSnapshot.docs) {
          const gift = giftDoc.data();
          
          // Get submitter's email
          const submitterDoc = await db.collection('users').doc(gift.submitterId).get();
          const submitter = submitterDoc.data();

          if (!submitter?.email) continue;

          // Send email to submitter with winner's address
          const resendClient = getResend();
          let fromEmail = resendFromEmail.value() || process.env.RESEND_FROM_EMAIL || 'onboarding@resend.dev';
          fromEmail = fromEmail.trim();
          if (!fromEmail.includes('@')) {
            fromEmail = 'onboarding@resend.dev';
          }
          await resendClient.emails.send({
            from: fromEmail,
            to: submitter.email,
            subject: 'Shipping Address for Your Gift',
            html: `
              <h1>Shipping Address</h1>
              <p>The winner of your gift has provided their shipping address:</p>
              <div style="background-color: #f3f4f6; padding: 16px; border-radius: 6px; margin: 16px 0;">
                <p><strong>${user.displayName || 'Winner'}</strong></p>
                <pre style="white-space: pre-wrap; font-family: sans-serif;">${JSON.stringify(after.shippingAddress, null, 2)}</pre>
              </div>
              <p>Please ship the gift to this address.</p>
            `,
          });
        }
      }
    } catch (error) {
      console.error('Error notifying gift submitter:', error);
    }
  }
);

/**
 * Send contact form email (for support, security issues, general inquiries)
 */
export const sendContactEmail = onRequest(
  { 
    cors: true,
    secrets: [resendApiKey, resendFromEmail],
    invoker: 'public', // Make function publicly accessible
  },
  async (req, res) => {
    // Handle CORS preflight
    if (req.method === 'OPTIONS') {
      res.set('Access-Control-Allow-Origin', '*');
      res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
      res.set('Access-Control-Allow-Headers', 'Content-Type');
      res.status(204).send('');
      return;
    }

    // Set CORS headers
    res.set('Access-Control-Allow-Origin', '*');
    res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.set('Access-Control-Allow-Headers', 'Content-Type');

    try {
      const { name, email, subject, message, type } = req.body;

      // Validation
      if (!email || !message) {
        return res.status(400).json({ error: 'email and message are required' });
      }

      // Basic email validation
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        return res.status(400).json({ error: 'Invalid email address' });
      }

      // Determine recipient based on type
      const contactType = type || 'general';
      // Use a valid email address for recipient (must be verified in Resend for testing mode)
      // In testing mode, Resend only allows sending to verified emails
      let recipientEmail = process.env.CONTACT_EMAIL || 'brianshields@gmail.com';
      recipientEmail = recipientEmail.trim();
      
      // For security issues, use a different subject prefix
      const subjectPrefix = contactType === 'security' ? '[SECURITY]' : contactType === 'account' ? '[ACCOUNT]' : '[CONTACT]';
      const emailSubject = subject 
        ? `${subjectPrefix} ${subject}` 
        : `${subjectPrefix} Contact Form Submission from ${name || email}`;

      // Send email via Resend
      const resendClient = getResend();
      // Get from email and ensure proper format for Resend
      let fromEmail = resendFromEmail.value() || process.env.RESEND_FROM_EMAIL || 'onboarding@resend.dev';
      fromEmail = fromEmail.trim();
      
      // Resend requires: "email@domain.com" or "Name <email@domain.com>"
      // Extract email if it's in "Name <email>" format, or use as-is if it's just an email
      const emailMatch = fromEmail.match(/<(.+?)>/) || fromEmail.match(/^(.+?@.+?)$/);
      if (emailMatch) {
        const emailOnly = emailMatch[1];
        // If original had a name, keep the format; otherwise use email only
        if (fromEmail.includes('<') && fromEmail.includes('>')) {
          // Already in correct format, just ensure it's clean
          fromEmail = fromEmail.replace(/\s+/g, ' ').trim();
        } else {
          // Just an email, use as-is
          fromEmail = emailOnly;
        }
      } else {
        // Fallback to simple email format
        fromEmail = 'onboarding@resend.dev';
      }
      
      // Send to support/contact email
      const { data, error } = await resendClient.emails.send({
        from: fromEmail,
        to: recipientEmail,
        replyTo: email, // Allow replying directly to the user
        subject: emailSubject,
        html: `
          <h2>Contact Form Submission</h2>
          <div style="background-color: #f3f4f6; padding: 16px; border-radius: 6px; margin: 16px 0;">
            <p><strong>Type:</strong> ${contactType}</p>
            <p><strong>From:</strong> ${name || 'Anonymous'} (${email})</p>
            ${subject ? `<p><strong>Subject:</strong> ${subject}</p>` : ''}
          </div>
          <div style="background-color: #ffffff; padding: 16px; border-radius: 6px; margin: 16px 0; border-left: 4px solid #2563eb;">
            <h3>Message:</h3>
            <p style="white-space: pre-wrap; font-family: sans-serif;">${message}</p>
          </div>
          <p style="color: #6b7280; font-size: 14px; margin-top: 16px;">
            You can reply directly to this email to respond to ${email}
          </p>
        `,
      });

      if (error) {
        console.error('Resend error:', error);
        
        // Handle Resend testing mode limitation
        if (error.statusCode === 403 || error.message?.includes('testing emails') || error.message?.includes('verified email')) {
          const isTestingMode = error.message?.includes('testing emails') || error.message?.includes('verified email');
          return res.status(403).json({ 
            error: 'Email sending limited',
            message: isTestingMode 
              ? `Resend is in testing mode. You can only send emails to verified email addresses. To send to other recipients, verify a domain at resend.com/domains`
              : 'Email sending is limited. Please verify your domain in Resend to send to all recipients.',
            details: error,
            testingMode: isTestingMode
          });
        }
        
        return res.status(500).json({ error: 'Failed to send email', details: error });
      }

      // Optionally send a confirmation email to the user
      if (contactType !== 'security') {
        try {
          await resendClient.emails.send({
            from: fromEmail,
            to: email,
            subject: 'We received your message - StealOrReveal',
            html: `
              <h2>Thank you for contacting us!</h2>
              <p>We've received your message and will get back to you as soon as possible.</p>
              <div style="background-color: #f3f4f6; padding: 16px; border-radius: 6px; margin: 16px 0;">
                <p><strong>Your message:</strong></p>
                <p style="white-space: pre-wrap; font-family: sans-serif;">${message}</p>
              </div>
              <p style="color: #6b7280; font-size: 14px; margin-top: 16px;">
                If you have any urgent security concerns, please reply to this email immediately.
              </p>
            `,
          });
        } catch (confirmationError) {
          // Don't fail the request if confirmation email fails
          console.error('Failed to send confirmation email:', confirmationError);
        }
      }

      res.json({ success: true, messageId: data?.id });
    } catch (error) {
      console.error('Error sending contact email:', error);
      res.status(500).json({ error: 'Failed to send contact email', message: error.message });
    }
  }
);

/**
 * Data Retention Cleanup - Runs daily to enforce retention policies
 * Per Privacy Policy Section 5:
 * - Account Information: 90 days after account deletion
 * - Game and Party Data: 1 year after game ends
 * - Fulfillment Information (Shipping Addresses): Immediately after fulfillment confirmed OR 30 days after game ends
 * - Gift Links: Duration of game + 30 days after game ends
 * - Analytics and Logs: 90 days
 * - Support Communications: 1 year after last communication
 */
export const dataRetentionCleanup = onSchedule(
  {
    schedule: 'every day 02:00', // Run daily at 2 AM UTC
    timeZone: 'UTC',
  },
  async (event) => {
    console.log('🧹 Starting data retention cleanup...');
    const now = admin.firestore.Timestamp.now();
    const stats = {
      deletedAccounts: 0,
      deletedParties: 0,
      deletedShippingAddresses: 0,
      deletedGiftLinks: 0,
      deletedAnalytics: 0,
      deletedSupportComm: 0,
      errors: [],
    };

    try {
      // 1. Delete accounts that were deleted more than 90 days ago
      // Note: We track deleted accounts with a deletedAt timestamp
      const ninetyDaysAgo = new Date(now.toMillis() - (90 * 24 * 60 * 60 * 1000));
      const deletedAccountsQuery = await db.collection('users')
        .where('deletedAt', '<=', admin.firestore.Timestamp.fromDate(ninetyDaysAgo))
        .limit(500) // Process in batches
        .get();

      const accountBatch = db.batch();
      deletedAccountsQuery.docs.forEach((doc) => {
        accountBatch.delete(doc.ref);
        stats.deletedAccounts++;
      });
      if (deletedAccountsQuery.docs.length > 0) {
        await accountBatch.commit();
        console.log(`✅ Deleted ${stats.deletedAccounts} expired accounts`);
      }

      // 2. Delete parties that ended more than 1 year ago
      // Note: For backward compatibility, also check updatedAt if endedAt doesn't exist
      const oneYearAgo = new Date(now.toMillis() - (365 * 24 * 60 * 60 * 1000));
      const oneYearAgoTimestamp = admin.firestore.Timestamp.fromDate(oneYearAgo);
      
      // Get all ended parties and filter by retention period
      const allEndedParties = await db.collection('parties')
        .where('status', '==', 'ENDED')
        .limit(500)
        .get();
      
      const expiredParties = [];
      for (const partyDoc of allEndedParties.docs) {
        const party = partyDoc.data();
        const endedAt = party.endedAt || party.updatedAt; // Fallback to updatedAt for backward compatibility
        if (endedAt && endedAt <= oneYearAgoTimestamp) {
          expiredParties.push(partyDoc);
        }
      }

      const partyBatch = db.batch();
      for (const partyDoc of expiredParties) {
        const partyId = partyDoc.id;
        
        // Delete party document
        partyBatch.delete(partyDoc.ref);
        
        // Delete subcollections (participants, pendingInvites, etc.)
        // Note: Firestore doesn't support cascade delete, so we need to delete subcollections manually
        const participantsSnapshot = await db.collection('parties').doc(partyId).collection('participants').get();
        participantsSnapshot.docs.forEach((doc) => partyBatch.delete(doc.ref));
        
        const invitesSnapshot = await db.collection('parties').doc(partyId).collection('pendingInvites').get();
        invitesSnapshot.docs.forEach((doc) => partyBatch.delete(doc.ref));
        
        stats.deletedParties++;
      }
      if (expiredParties.length > 0) {
        await partyBatch.commit();
        console.log(`✅ Deleted ${stats.deletedParties} expired parties`);
      }

      // 3. Delete shipping addresses: Immediately after fulfillment confirmed OR 30 days after game ends
      const thirtyDaysAgo = new Date(now.toMillis() - (30 * 24 * 60 * 60 * 1000));
      const thirtyDaysAgoTimestamp = admin.firestore.Timestamp.fromDate(thirtyDaysAgo);
      
      // Find parties that ended more than 30 days ago (with backward compatibility)
      const allEndedPartiesForAddress = await db.collection('parties')
        .where('status', '==', 'ENDED')
        .limit(500)
        .get();
      
      const partiesForAddressCleanup = [];
      for (const partyDoc of allEndedPartiesForAddress.docs) {
        const party = partyDoc.data();
        const endedAt = party.endedAt || party.updatedAt; // Fallback to updatedAt
        if (endedAt && endedAt <= thirtyDaysAgoTimestamp) {
          partiesForAddressCleanup.push(partyDoc);
        }
      }

      const addressBatch = db.batch();
      for (const partyDoc of partiesForAddressCleanup.docs) {
        const party = partyDoc.data();
        
        // Get all participants for this party
        const participantsSnapshot = await db.collection('parties').doc(partyDoc.id).collection('participants').get();
        
        for (const participantDoc of participantsSnapshot.docs) {
          const participant = participantDoc.data();
          const userId = participant.id || participantDoc.id;
          
          // Check if user has shipping address and if fulfillment is confirmed
          const userDoc = await db.collection('users').doc(userId).get();
          if (userDoc.exists) {
            const userData = userDoc.data();
            if (userData.shippingAddress) {
              // Check if fulfillment is confirmed (gift shipped) OR 30 days have passed
              const fulfillmentConfirmed = userData.fulfillmentConfirmed === true;
              const addressAddedAt = userData.shippingAddressAddedAt?.toDate();
              const thirtyDaysAfterAddress = addressAddedAt ? new Date(addressAddedAt.getTime() + (30 * 24 * 60 * 60 * 1000)) : null;
              
              if (fulfillmentConfirmed || (thirtyDaysAfterAddress && now.toDate() >= thirtyDaysAfterAddress)) {
                // Remove shipping address
                addressBatch.update(userDoc.ref, {
                  shippingAddress: admin.firestore.FieldValue.delete(),
                  shippingAddressAddedAt: admin.firestore.FieldValue.delete(),
                });
                stats.deletedShippingAddresses++;
              }
            }
          }
        }
      }
      if (stats.deletedShippingAddresses > 0) {
        await addressBatch.commit();
        console.log(`✅ Deleted ${stats.deletedShippingAddresses} expired shipping addresses`);
      }

      // 4. Delete gift links: 30 days after game ends
      // Find gifts from parties that ended more than 30 days ago
      // Note: For backward compatibility, also check gifts without partyEndedAt by looking up party
      const allGiftsForCleanup = await db.collection('gifts')
        .limit(500)
        .get();
      
      const expiredGifts = [];
      for (const giftDoc of allGiftsForCleanup.docs) {
        const gift = giftDoc.data();
        const partyEndedAt = gift.partyEndedAt;
        
        if (partyEndedAt && partyEndedAt <= thirtyDaysAgoTimestamp) {
          expiredGifts.push(giftDoc);
        } else if (!partyEndedAt && gift.partyId) {
          // Backward compatibility: check party status
          const partyDoc = await db.collection('parties').doc(gift.partyId).get();
          if (partyDoc.exists) {
            const party = partyDoc.data();
            if (party.status === 'ENDED') {
              const partyEnded = party.endedAt || party.updatedAt;
              if (partyEnded && partyEnded <= thirtyDaysAgoTimestamp) {
                expiredGifts.push(giftDoc);
              }
            }
          }
        }
      }

      const giftBatch = db.batch();
      expiredGifts.forEach((doc) => {
        // Only delete the gift link, keep other gift data
        giftBatch.update(doc.ref, {
          url: admin.firestore.FieldValue.delete(),
          scrapedData: admin.firestore.FieldValue.delete(),
        });
        stats.deletedGiftLinks++;
      });
      if (expiredGifts.length > 0) {
        await giftBatch.commit();
        console.log(`✅ Deleted ${stats.deletedGiftLinks} expired gift links`);
      }

      // 5. Delete analytics and logs older than 90 days
      // Note: This assumes analytics are stored in a collection with a timestamp field
      const analyticsQuery = await db.collection('analytics')
        .where('timestamp', '<=', admin.firestore.Timestamp.fromDate(ninetyDaysAgo))
        .limit(500)
        .get();

      const analyticsBatch = db.batch();
      analyticsQuery.docs.forEach((doc) => {
        analyticsBatch.delete(doc.ref);
        stats.deletedAnalytics++;
      });
      if (analyticsQuery.docs.length > 0) {
        await analyticsBatch.commit();
        console.log(`✅ Deleted ${stats.deletedAnalytics} expired analytics records`);
      }

      // 6. Delete support communications older than 1 year
      const oneYearAgoForSupport = new Date(now.toMillis() - (365 * 24 * 60 * 60 * 1000));
      const supportCommQuery = await db.collection('support_communications')
        .where('lastUpdated', '<=', admin.firestore.Timestamp.fromDate(oneYearAgoForSupport))
        .limit(500)
        .get();

      const supportBatch = db.batch();
      supportCommQuery.docs.forEach((doc) => {
        supportBatch.delete(doc.ref);
        stats.deletedSupportComm++;
      });
      if (supportCommQuery.docs.length > 0) {
        await supportBatch.commit();
        console.log(`✅ Deleted ${stats.deletedSupportComm} expired support communications`);
      }

      console.log('✅ Data retention cleanup completed:', stats);
      return stats;
    } catch (error) {
      console.error('❌ Error during data retention cleanup:', error);
      stats.errors.push(error.message);
      throw error;
    }
  }
);


