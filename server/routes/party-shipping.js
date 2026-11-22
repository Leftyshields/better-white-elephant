/**
 * Per-game shipping address routes (A0). See server/lib/party-shipping.js for the gate and limits.
 *
 * GET /api/party-shipping/:partyId  owner reads their own address for this game (null if none)
 * POST /api/party-shipping/:partyId owner saves { address } (all six fields) or clears it (all empty)
 *
 * uid comes only from the verified ID token (req.user, set by the auth middleware in server.js).
 */
import express from 'express';
import { db } from '../config/firebase-admin.js';
import redisClient from '../utils/redis.js';
import { readOwnShipping, writeOwnShipping } from '../lib/party-shipping.js';

/** @param {{ db?: object, redis?: object }} [deps] */
export function createPartyShippingRouter(deps = {}) {
  const store = deps.db ?? db;
  const redis = deps.redis ?? redisClient;
  const router = express.Router();

  router.use((req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  });

  function send(res, result) {
    if (result.status !== 200) {
      return res.status(result.status).json({ error: result.error });
    }
    return res.json({ shippingAddress: result.shippingAddress });
  }

  router.get('/:partyId', async (req, res) => {
    const { partyId } = req.params;
    try {
      return send(res, await readOwnShipping(store, redis, { uid: req.user?.uid, partyId }));
    } catch (error) {
      console.error('party_shipping_read_failed', { partyId, code: error?.code ?? 'unknown' });
      return res.status(500).json({ error: 'Failed to load address' });
    }
  });

  router.post('/:partyId', async (req, res) => {
    const { partyId } = req.params;
    try {
      const result = await writeOwnShipping(store, redis, {
        uid: req.user?.uid,
        partyId,
        body: req.body,
      });
      if (result.status === 200) {
        console.info('party_shipping_written', {
          partyId,
          status: result.shippingAddress ? 'saved' : 'cleared',
        });
      }
      return send(res, result);
    } catch (error) {
      console.error('party_shipping_write_failed', { partyId, code: error?.code ?? 'unknown' });
      return res.status(500).json({ error: 'Failed to save address' });
    }
  });

  return router;
}

export default createPartyShippingRouter();
