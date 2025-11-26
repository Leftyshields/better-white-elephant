/**
 * Firebase Functions
 */
import { onRequest } from 'firebase-functions/v2/https';
import { onDocumentUpdated } from 'firebase-functions/v2/firestore';
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

// Initialize Resend with secret
let resendInstance = null;
const getResend = () => {
  if (!resendInstance) {
    resendInstance = new Resend(resendApiKey.value());
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
    const fromEmail = resendFromEmail.value() || process.env.RESEND_FROM_EMAIL || 'White Elephant <onboarding@resend.dev>';
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
      if (error.statusCode === 403 && error.message?.includes('testing emails')) {
        return res.status(403).json({ 
          error: 'Email sending limited',
          message: 'Resend is in testing mode. You can only send emails to your verified email address. To send to other recipients, verify a domain at resend.com/domains',
          details: error 
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
          const fromEmail = resendFromEmail.value() || process.env.RESEND_FROM_EMAIL || 'White Elephant <onboarding@resend.dev>';
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


