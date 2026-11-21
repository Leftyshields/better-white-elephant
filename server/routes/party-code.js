/**
 * Party code routes (item 10). See server/lib/party-code.js for the design and abuse limits.
 *
 * POST /api/party-code/share   Google host: current { code, token } for the share box (issues one if needed)
 * POST /api/party-code/rotate  Google host: new token and new code together; old ones stop working
 * POST /api/party-code/join    any signed-in caller (anonymous guests included): resolve + seat
 *
 * Responses are never cached. Join answers only { partyId } on success, { error: 'full' } after a
 * valid match on a full party, and { error: 'party_code_failed' } for every other outcome, so a
 * caller can't tell not found, expired, started, locked out, rate limited, or breaker apart.
 */
import express from 'express';
import { db } from '../config/firebase-admin.js';
import { isPartyHostCaller } from '../lib/host-auth.js';
import {
  PARTY_CODE_RESULT,
  clientIpFromRequest,
  hashIpForRateLimit,
  issuePartyCode,
  resolvePartyCodeAndSeat,
} from '../lib/party-code.js';

export const PARTY_CODE_FAILED = 'party_code_failed';
export const PARTY_CODE_FULL = 'full';

const PARTY_ID_RE = /^[a-zA-Z0-9_-]{1,128}$/;

/** @param {{ db?: import('firebase-admin/firestore').Firestore }} [deps] */
export function createPartyCodeRouter(deps = {}) {
  const store = deps.db ?? db;
  const router = express.Router();

  router.use((req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  });

  async function hostOnly(req, res, rotate) {
    const partyId = req.body?.partyId;
    if (!req.user?.uid || typeof partyId !== 'string' || !PARTY_ID_RE.test(partyId)) {
      return res.status(400).json({ error: PARTY_CODE_FAILED });
    }
    try {
      const partySnap = await store.collection('parties').doc(partyId).get();
      if (!partySnap.exists || !isPartyHostCaller(partySnap.data(), req.user)) {
        return res.status(403).json({ error: PARTY_CODE_FAILED });
      }
      const issued = await issuePartyCode(store, partyId, { rotate });
      if (!issued.ok) {
        return res.status(400).json({ error: PARTY_CODE_FAILED });
      }
      return res.json({ code: issued.code, token: issued.token });
    } catch (error) {
      console.error('party_code_host_route_failed', { partyId, rotate, code: error?.code });
      return res.status(500).json({ error: PARTY_CODE_FAILED });
    }
  }

  router.post('/share', (req, res) => hostOnly(req, res, false));
  router.post('/rotate', (req, res) => hostOnly(req, res, true));

  router.post('/join', async (req, res) => {
    const uid = req.user?.uid;
    if (!uid) {
      return res.status(401).json({ error: PARTY_CODE_FAILED });
    }
    try {
      const outcome = await resolvePartyCodeAndSeat(store, {
        uid,
        ipHash: hashIpForRateLimit(clientIpFromRequest(req)),
        rawCode: req.body?.code,
      });
      if (outcome.result === PARTY_CODE_RESULT.seated) {
        return res.json({ partyId: outcome.partyId });
      }
      if (outcome.result === PARTY_CODE_RESULT.full) {
        return res.status(409).json({ error: PARTY_CODE_FULL });
      }
      return res.status(400).json({ error: PARTY_CODE_FAILED });
    } catch (error) {
      console.error('party_code_join_failed', { code: error?.code });
      return res.status(400).json({ error: PARTY_CODE_FAILED });
    }
  });

  return router;
}

export default createPartyCodeRouter();
