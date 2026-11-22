/**
 * Gift To Send Card Component
 * Shows a gift you need to send with winner's shipping address
 */
import { useState, useEffect } from 'react';
import { ClipboardDocumentIcon } from '@heroicons/react/24/outline';
import { CheckIcon } from '@heroicons/react/24/solid';
import { CheckBadgeIcon } from '@heroicons/react/24/solid';
import { fetchWinnerShippingAddress } from '../utils/api.js';
import { SHIPPING_ADDRESS_WINNER_NOT_SHARED_GIFT_TO_SEND } from '../utils/shippingAddressCopy.js';
import { GIFT_TO_SEND_COPY } from '../utils/giftToSendCopy.js';

/** Give up on a load after this long and show the error with Try again (never an endless spinner). */
export const ADDRESS_TIMEOUT_MS = 8000;
/** While the winner hasn't shared yet, check again this often... */
export const ADDRESS_POLL_MS = 30000;
/** ...for this long after the card opens. Coming back to the tab always checks again. */
export const ADDRESS_POLL_WINDOW_MS = 10 * 60 * 1000;
/** Brief backoff after a 403 that means the game is still finishing (about 10s total). */
export const ADDRESS_RETRYABLE_BACKOFF_MS = [500, 1000, 2000, 4000];
export const ADDRESS_RETRYABLE_BUDGET_MS = 10_000;
const RETRYABLE_ADDRESS_ERROR_CODES = new Set(['GAME_NOT_ENDED', 'FULFILLMENT_NOT_FOUND']);
const RETRYABLE_ADDRESS_ERROR_MESSAGES = new Set([
  'Game has not ended',
  'Gift fulfillment record not found',
]);

/** 403 "game not ended" / "fulfillment not found" is a short-lived race, not a real failure. */
export function isRetryableAddressLoadError(error) {
  if (error?.timedOut || error?.status !== 403) return false;
  if (error.code && RETRYABLE_ADDRESS_ERROR_CODES.has(error.code)) return true;
  return RETRYABLE_ADDRESS_ERROR_MESSAGES.has(error.message);
}

/**
 * Address states: 'loading' | 'loaded' | 'not-shared' | 'error'.
 * winnerKnown: false while the end screen doesn't know the winner yet (game state still loading),
 * so "no winner" is only said once it's actually true.
 */
export function GiftToSendCard({ gift, winnerId, winnerName, winnerKnown = true, isSelfWin = false }) {
  const [address, setAddress] = useState(null);
  const [addressState, setAddressState] = useState('loading');
  const [attempt, setAttempt] = useState(0);
  const [copied, setCopied] = useState(false);
  const noWinner = !isSelfWin && winnerKnown && !winnerId;

  const formatAddressForCopy = (addr) => {
    if (!addr) return '';
    const parts = [
      addr.name,
      addr.street,
      addr.city && addr.state ? `${addr.city}, ${addr.state} ${addr.zip || ''}`.trim() : addr.city,
      addr.country,
    ].filter(Boolean);
    return parts.join('\n');
  };

  const [showToast, setShowToast] = useState(false);

  const handleCopyAddress = async () => {
    if (!address) return;
    const addressText = formatAddressForCopy(address);
    try {
      await navigator.clipboard.writeText(addressText);
      setCopied(true);
      setShowToast(true);
      setTimeout(() => {
        setCopied(false);
        setShowToast(false);
      }, 2000);
    } catch (error) {
      console.error('Failed to copy address:', error);
    }
  };

  const partyId = gift?.partyId;
  const giftId = gift?.id;

  useEffect(() => {
    if (isSelfWin || noWinner || !partyId || !giftId) return undefined;

    let cancelled = false;
    let inFlight = false;
    let pollTimer = null;
    let retryIndex = 0;
    let current = 'loading';
    const openedAt = Date.now();
    const show = (next, nextAddress = null) => {
      current = next;
      setAddress(nextAddress);
      setAddressState(next);
    };
    show('loading');

    // The winner isn't known yet: wait for the game state, but not forever.
    if (!winnerKnown) {
      const waitTimer = setTimeout(() => {
        if (!cancelled) show('error');
      }, ADDRESS_TIMEOUT_MS);
      return () => {
        cancelled = true;
        clearTimeout(waitTimer);
      };
    }

    const schedulePoll = () => {
      clearTimeout(pollTimer);
      if (Date.now() - openedAt + ADDRESS_POLL_MS <= ADDRESS_POLL_WINDOW_MS) {
        pollTimer = setTimeout(() => load({ background: true }), ADDRESS_POLL_MS);
      }
    };

    // background: a quiet recheck while "not shared yet" shows. It never shows the skeleton, and a
    // failed recheck leaves the last real answer on screen and tries again later.
    async function load({ background }) {
      if (inFlight) return;
      inFlight = true;
      clearTimeout(pollTimer);
      try {
        const data = await fetchWinnerShippingAddress(partyId, giftId, { timeoutMs: ADDRESS_TIMEOUT_MS });
        if (cancelled) return;
        if (data?.shippingAddress) {
          show('loaded', data.shippingAddress);
          return;
        }
        show('not-shared');
        schedulePoll();
      } catch (error) {
        if (cancelled) return;
        // Status only: never log the response body or the address.
        console.warn('[GiftToSendCard] address load failed', error?.timedOut ? 'timeout' : error?.status ?? 'network');
        if (background) {
          schedulePoll();
          return;
        }
        if (isRetryableAddressLoadError(error)) {
          const delay = ADDRESS_RETRYABLE_BACKOFF_MS[
            Math.min(retryIndex, ADDRESS_RETRYABLE_BACKOFF_MS.length - 1)
          ];
          retryIndex += 1;
          if (Date.now() - openedAt + delay <= ADDRESS_RETRYABLE_BUDGET_MS) {
            clearTimeout(pollTimer);
            pollTimer = setTimeout(() => load({ background: false }), delay);
            return;
          }
        }
        show('error');
      } finally {
        inFlight = false;
      }
    }

    const onVisibility = () => {
      if (document.visibilityState === 'visible' && current === 'not-shared') load({ background: true });
    };
    document.addEventListener('visibilitychange', onVisibility);
    load({ background: false });

    return () => {
      cancelled = true;
      clearTimeout(pollTimer);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [isSelfWin, noWinner, winnerKnown, winnerId, partyId, giftId, attempt]);

  return (
    <div className="bg-slate-900/50 border border-slate-700 rounded-2xl p-6 hover:border-slate-600 transition-all relative">
      {/* Toast Notification */}
      {showToast && (
        <div className="absolute top-4 right-4 bg-green-500/90 text-white px-4 py-2 rounded-lg shadow-lg z-10 animate-fade-in">
          Address Copied!
        </div>
      )}
      <div className="flex gap-6">
        {gift.image && (
          <img
            src={gift.image}
            alt={gift.title || 'Gift'}
            className="w-32 h-32 object-cover rounded-lg shadow-md"
            onError={(e) => {
              e.target.style.display = 'none';
            }}
          />
        )}
        <div className="flex-1">
          <h3 className="text-white text-xl font-bold mb-2">{gift.title || 'Gift'}</h3>
          {gift.url && (
            <a
              href={gift.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-indigo-300 hover:text-white underline text-sm mb-4 inline-block"
            >
              View Gift Link ↗
            </a>
          )}
          
          {/* Winner Info */}
          {!isSelfWin && !noWinner && winnerKnown && (
            <div className="mb-4">
              <p className="text-sm text-slate-300 mb-1">Winner:</p>
              <p className="text-lg font-semibold text-white">{winnerName}</p>
            </div>
          )}

          {/* Self-Win Success Message */}
          {isSelfWin ? (
            <div className="bg-emerald-500/10 border border-emerald-500/20 backdrop-blur-sm rounded-lg p-6 mt-4 text-center">
              <CheckBadgeIcon className="w-12 h-12 mx-auto mb-2 text-emerald-400" />
              <p className="text-emerald-400 font-bold text-lg mb-2">You won your own gift.</p>
              <p className="text-slate-400">No shipping needed. You keep it.</p>
            </div>
          ) : noWinner ? (
            <p className="text-sm text-slate-300 mt-4" data-testid="gift-to-send-no-winner">
              {GIFT_TO_SEND_COPY.noWinnerForYourGift}
            </p>
          ) : (
            /* Shipping Address */
            <div className="bg-black/30 border-2 border-dashed border-white/20 rounded-lg p-4 mt-4 relative">
              <p className="text-sm font-semibold text-slate-300 mb-2">📬 Shipping Address:</p>
              {addressState === 'loading' ? (
                <div aria-busy="true" data-testid="gift-to-send-address-loading" className="space-y-2 py-1">
                  <span className="sr-only">{GIFT_TO_SEND_COPY.addressLoading}</span>
                  <div aria-hidden="true" className="h-3 rounded bg-slate-700/60 w-3/5" />
                  <div aria-hidden="true" className="h-3 rounded bg-slate-700/60 w-4/5" />
                  <div aria-hidden="true" className="h-3 rounded bg-slate-700/60 w-1/2" />
                </div>
              ) : addressState === 'loaded' && address ? (
                <>
                  <button
                    onClick={handleCopyAddress}
                    className="absolute top-2 right-2 bg-white/10 hover:bg-white/20 border border-white/20 rounded p-1.5 transition-all"
                    title={copied ? "Address Copied!" : "Copy address"}
                  >
                    {copied ? (
                      <CheckIcon className="w-4 h-4 text-green-400" />
                    ) : (
                      <ClipboardDocumentIcon className="w-4 h-4 text-slate-400" />
                    )}
                  </button>
                  <div className="text-sm font-mono text-slate-300 space-y-1 pr-8">
                    <p className="font-medium">{address.name || 'N/A'}</p>
                    {address.street && <p>{address.street}</p>}
                    {address.city && address.state && (
                      <p>
                        {address.city}, {address.state} {address.zip || ''}
                      </p>
                    )}
                    {address.country && <p>{address.country}</p>}
                  </div>
                </>
              ) : addressState === 'error' ? (
                <div data-testid="gift-to-send-address-error">
                  <p className="text-sm text-orange-300">{GIFT_TO_SEND_COPY.addressLoadFailed}</p>
                  <button
                    type="button"
                    onClick={() => setAttempt((n) => n + 1)}
                    aria-label={GIFT_TO_SEND_COPY.addressRetryAria}
                    className="mt-3 min-h-11 px-4 rounded-lg border border-white/30 bg-white/10 hover:bg-white/20 text-sm font-semibold text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
                  >
                    {GIFT_TO_SEND_COPY.addressRetry}
                  </button>
                </div>
              ) : (
                <div data-testid="gift-to-send-address-not-shared">
                  <p className="text-sm text-orange-400 italic font-mono">
                    {SHIPPING_ADDRESS_WINNER_NOT_SHARED_GIFT_TO_SEND}
                  </p>
                  <p className="text-sm text-slate-300 mt-1">{GIFT_TO_SEND_COPY.addressWillUpdate}</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
