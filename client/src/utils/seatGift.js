/**
 * Seat gift link (G26): parties/{id}/participants/{uid}.hasGift + giftId mirror the seat owner's
 * own gift doc. Written in the same batch as the gift create/delete; Firestore rules check the
 * link against the real gift. The seat carries no gift details.
 */
import { deleteField } from 'firebase/firestore';

export function seatGiftLink(giftId) {
  return { hasGift: true, giftId };
}

export function seatGiftUnlink() {
  return { hasGift: false, giftId: deleteField() };
}

/**
 * Seat fields to fix a stale link (older seats, or a write from an older tab), or null when the
 * seat already matches. Only the seat owner runs this, on lobby load, once their gift has loaded.
 * @param {{hasGift?: boolean, giftId?: string} | null | undefined} seat
 * @param {{id: string} | null | undefined} ownGift
 */
export function seatGiftReconcileFields(seat, ownGift) {
  if (!seat) return null;
  if (ownGift) {
    return seat.hasGift === true && seat.giftId === ownGift.id ? null : seatGiftLink(ownGift.id);
  }
  return seat.hasGift === true || seat.giftId ? seatGiftUnlink() : null;
}
