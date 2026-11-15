/**
 * Firebase Functions
 */
import { onRequest } from 'firebase-functions/v2/https';
import { onDocumentCreated, onDocumentUpdated } from 'firebase-functions/v2/firestore';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { defineSecret, defineString } from 'firebase-functions/params';
import { Resend } from 'resend';
import admin from 'firebase-admin';
import {
  collectEndedPartiesBeforeCutoff,
  isAbandonedPartyPastRetention,
  isEndedPartyPastRetention,
  partiesForAddressCleanupIterable,
  partyStatusBlocksAddressDeletion,
  shouldDeleteGiftForRetention,
  shouldRemoveShippingAddress,
} from './dataRetentionLogic.js';
import {
  commitOperationsInBatches,
  dedupeOperationsByDocumentPath,
  getAllDocumentsFromQuery,
} from './dataRetentionBatch.js';
import {
  logAcceptInviteOnParticipantJoinFailure,
  markPendingInvitesAcceptedForParticipantJoin,
} from './acceptPendingInvitesLogic.js';
import { handleSendPartyInviteRequest } from './sendPartyInviteHandler.js';
import { handleSendContactEmailRequest } from './sendContactEmailHandler.js';
import { SEND_CONTACT_GENERIC_ERROR } from './sendContactEmailLogic.js';
import {
  buildGiftSubmitterNotifyHtml,
  hostDisplayNameForInvite,
  SEND_PARTY_INVITE_ERRORS,
} from './sendPartyInviteLogic.js';

if (!admin.apps.length) {
  admin.initializeApp();
}

// Define secrets for Resend
const resendApiKey = defineSecret('RESEND_API_KEY');
const resendFromEmail = defineSecret('RESEND_FROM_EMAIL');
/** Inbox that receives contact form mail (required; function fails closed if unset). */
const contactRecipientEmail = defineString('CONTACT_EMAIL');
/** When true, requires a valid Firebase App Check token. Default off until the client enables App Check. */
const enforceContactAppCheck = defineString('ENFORCE_CONTACT_APP_CHECK', { default: 'false' });
const allowedOriginsParam = defineString('ALLOWED_ORIGINS', { default: '' });
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
    invoker: 'public',
  },
  async (req, res) => {
    if (req.method === 'OPTIONS') {
      res.set('Access-Control-Allow-Origin', '*');
      res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
      res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
      res.status(204).send('');
      return;
    }

    if (req.method !== 'POST') {
      res.set('Access-Control-Allow-Origin', '*');
      res.status(405).json({ error: 'Method not allowed' });
      return;
    }

    res.set('Access-Control-Allow-Origin', '*');
    res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    try {
      const getFromEmail = () =>
        resendFromEmail.value() || process.env.RESEND_FROM_EMAIL || 'onboarding@resend.dev';

      const result = await handleSendPartyInviteRequest(req, {
        db,
        auth: admin.auth(),
        getResend,
        getFromEmail,
      });

      res.status(result.status).json(result.body);
    } catch (error) {
      console.error('Error sending invite:', {
        code: error?.code,
        name: error?.name,
      });
      res.status(500).json({ error: SEND_PARTY_INVITE_ERRORS.sendInviteServerError });
    }
  });

/**
 * Mark matching pendingInvites ACCEPTED when someone joins as a participant.
 */
export const acceptInviteOnParticipantJoin = onDocumentCreated(
  'parties/{partyId}/participants/{participantId}',
  async (event) => {
    const partyId = event.params.partyId;
    const participantId = event.params.participantId;
    try {
      await markPendingInvitesAcceptedForParticipantJoin(
        db,
        admin.auth(),
        partyId,
        participantId
      );
    } catch (error) {
      logAcceptInviteOnParticipantJoinFailure(partyId, participantId, error);
    }
  }
);

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
          const winnerDisplayName = hostDisplayNameForInvite(
            userId,
            user ?? {},
          );
          const html = buildGiftSubmitterNotifyHtml({
            winnerDisplayName,
            shippingAddressJson: JSON.stringify(after.shippingAddress, null, 2),
          });

          await resendClient.emails.send({
            from: fromEmail,
            to: submitter.email,
            subject: 'Shipping Address for Your Gift',
            html,
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
function applyContactCors(res, corsOrigin) {
  if (corsOrigin) {
    res.set('Access-Control-Allow-Origin', corsOrigin);
    res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.set('Access-Control-Allow-Headers', 'Content-Type, X-Firebase-AppCheck');
    res.set('Vary', 'Origin');
  }
}

export const sendContactEmail = onRequest(
  {
    cors: false,
    secrets: [resendApiKey, resendFromEmail],
    invoker: 'public',
  },
  async (req, res) => {
    try {
      const getFromEmail = () =>
        resendFromEmail.value() || process.env.RESEND_FROM_EMAIL || 'onboarding@resend.dev';
      const getContactRecipient = () =>
        contactRecipientEmail.value() || process.env.CONTACT_EMAIL || '';
      const getEnforceAppCheck = () =>
        enforceContactAppCheck.value() || process.env.ENFORCE_CONTACT_APP_CHECK || 'false';
      const getAllowedOriginsCsv = () =>
        allowedOriginsParam.value() || process.env.ALLOWED_ORIGINS || '';

      const result = await handleSendContactEmailRequest(req, {
        db,
        getResend,
        getFromEmail,
        getContactRecipient,
        getEnforceAppCheck,
        getAllowedOriginsCsv,
        appCheck: admin.appCheck(),
      });

      applyContactCors(res, result.corsOrigin);

      if (result.status === 204) {
        res.status(204).send('');
        return;
      }

      res.status(result.status).json(result.body ?? { error: SEND_CONTACT_GENERIC_ERROR });
    } catch (error) {
      console.error('sendContactEmail:', { code: error?.code, name: error?.name });
      res.status(500).json({ error: SEND_CONTACT_GENERIC_ERROR });
    }
  },
);

/**
 * Participant docs live at parties/{partyId}/participants/{uid} with uid as doc id — no userId field.
 * Uses direct gets (not collectionGroup + documentId(), which compares full document paths).
 */
async function userParticipatesInAddressBlockingParty(userId, excludePartyId, lobbyAndActivePartyDocs) {
  for (const partyDoc of lobbyAndActivePartyDocs) {
    if (partyDoc.id === excludePartyId) continue;
    const party = partyDoc.data();
    if (!partyStatusBlocksAddressDeletion(party?.status)) continue;

    const participantSnap = await db.collection('parties').doc(partyDoc.id)
      .collection('participants').doc(userId).get();
    if (participantSnap.exists) {
      return true;
    }
  }
  return false;
}

async function queuePartySubtreeDeletes(partyId, partyRef, operations) {
  operations.push({ type: 'delete', ref: partyRef });

  const participantsSnapshot = await db.collection('parties').doc(partyId).collection('participants').get();
  participantsSnapshot.docs.forEach((doc) => {
    operations.push({ type: 'delete', ref: doc.ref });
  });

  const invitesSnapshot = await db.collection('parties').doc(partyId).collection('pendingInvites').get();
  invitesSnapshot.docs.forEach((doc) => {
    operations.push({ type: 'delete', ref: doc.ref });
  });
}

/**
 * Data Retention Cleanup - Runs daily to enforce retention policies
 * Per Privacy Policy Section 5:
 * - Account Information: 90 days after account deletion
 * - Game and Party Data: 30 days after game ends
 * - Fulfillment Information (Shipping Addresses): 30 days after game ends (unless user is in another active party)
 * - Gift Links: Duration of game + 30 days after game ends
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

      const thirtyDaysAgo = new Date(now.toMillis() - (30 * 24 * 60 * 60 * 1000));
      const thirtyDaysAgoTimestamp = admin.firestore.Timestamp.fromDate(thirtyDaysAgo);

      const allEndedPartyDocs = await getAllDocumentsFromQuery(
        db.collection('parties').where('status', '==', 'ENDED'),
      );

      const partiesForAddressCleanup = collectEndedPartiesBeforeCutoff(
        allEndedPartyDocs,
        thirtyDaysAgoTimestamp,
      );

      const allNonEndedPartyDocs = await getAllDocumentsFromQuery(
        db.collection('parties').where('status', 'in', ['LOBBY', 'ACTIVE', 'CANCELLED']),
      );

      const lobbyAndActivePartyDocs = allNonEndedPartyDocs.filter((partyDoc) => {
        const status = partyDoc.data()?.status;
        return partyStatusBlocksAddressDeletion(status);
      });

      // 2. Delete shipping addresses 30 days after game ends (before party docs are removed)
      const addressOperations = [];
      for (const partyDoc of partiesForAddressCleanupIterable(partiesForAddressCleanup)) {
        const party = partyDoc.data();
        const partyEndedBeforeCutoff = isEndedPartyPastRetention(party, thirtyDaysAgoTimestamp);

        const participantsSnapshot = await db.collection('parties').doc(partyDoc.id).collection('participants').get();

        for (const participantDoc of participantsSnapshot.docs) {
          const userId = participantDoc.id;

          const userDoc = await db.collection('users').doc(userId).get();
          if (!userDoc.exists) continue;
          const userData = userDoc.data();
          if (!userData.shippingAddress) continue;

          const userInNotEndedParty = await userParticipatesInAddressBlockingParty(
            userId,
            partyDoc.id,
            lobbyAndActivePartyDocs,
          );
          if (shouldRemoveShippingAddress({
            hasShippingAddress: true,
            sourcePartyEndedBeforeCutoff: partyEndedBeforeCutoff,
            userInNotEndedParty,
          })) {
            addressOperations.push({
              type: 'update',
              ref: userDoc.ref,
              data: {
                shippingAddress: admin.firestore.FieldValue.delete(),
                shippingAddressAddedAt: admin.firestore.FieldValue.delete(),
              },
            });
          }
        }
      }
      const dedupedAddressOperations = dedupeOperationsByDocumentPath(addressOperations);
      if (dedupedAddressOperations.length > 0) {
        await commitOperationsInBatches(db, dedupedAddressOperations);
        console.log(`✅ Deleted ${dedupedAddressOperations.length} expired shipping addresses`);
        stats.deletedShippingAddresses = dedupedAddressOperations.length;
      }

      // 3. Delete gift documents 30 days after game ends (full doc, not url-only)
      const allGiftDocs = await getAllDocumentsFromQuery(db.collection('gifts'));
      const giftDeleteOperations = [];
      for (const giftDoc of allGiftDocs) {
        const gift = giftDoc.data();
        const partyEndedAtExpired =
          gift.partyEndedAt && gift.partyEndedAt <= thirtyDaysAgoTimestamp;

        let party = undefined;
        if (!partyEndedAtExpired && gift.partyId) {
          const partyDoc = await db.collection('parties').doc(gift.partyId).get();
          party = partyDoc.exists ? partyDoc.data() : null;
        }

        if (shouldDeleteGiftForRetention(gift, thirtyDaysAgoTimestamp, party)) {
          giftDeleteOperations.push({ type: 'delete', ref: giftDoc.ref });
        }
      }
      const dedupedGiftDeletes = dedupeOperationsByDocumentPath(giftDeleteOperations);
      if (dedupedGiftDeletes.length > 0) {
        await commitOperationsInBatches(db, dedupedGiftDeletes);
        stats.deletedGiftLinks = dedupedGiftDeletes.length;
        console.log(`✅ Deleted ${stats.deletedGiftLinks} expired gift documents`);
      }

      // 4. Delete ENDED parties 30 days after game ends (participants + pendingInvites)
      const partyDeleteOperations = [];
      for (const partyDoc of partiesForAddressCleanup) {
        await queuePartySubtreeDeletes(partyDoc.id, partyDoc.ref, partyDeleteOperations);
        stats.deletedParties++;
      }
      if (partyDeleteOperations.length > 0) {
        await commitOperationsInBatches(db, partyDeleteOperations);
        console.log(`✅ Deleted ${stats.deletedParties} ended parties past 30-day retention`);
      }

      // 5. Delete abandoned non-ENDED parties after 30 days without activity
      // ACTIVE parties: server saveGameState bumps parties/{id}.updatedAt each persist — 30d inactivity = abandoned.
      const staleAbandonedParties = allNonEndedPartyDocs.filter((partyDoc) => {
        const party = partyDoc.data();
        return isAbandonedPartyPastRetention(party, thirtyDaysAgoTimestamp);
      });

      const abandonedDeleteOperations = [];
      for (const partyDoc of staleAbandonedParties) {
        await queuePartySubtreeDeletes(partyDoc.id, partyDoc.ref, abandonedDeleteOperations);
        stats.deletedParties++;
      }
      if (abandonedDeleteOperations.length > 0) {
        await commitOperationsInBatches(db, abandonedDeleteOperations);
        console.log(`✅ Deleted ${staleAbandonedParties.length} abandoned parties past 30-day retention`);
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


