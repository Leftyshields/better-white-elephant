/**
 * Shipping Address View Modal
 * Shows shipping address for gift submitters to see where to send gifts
 */
import { useState, useEffect } from 'react';
import { Modal } from './ui/Modal.jsx';
import { Button } from './ui/Button.jsx';
import { fetchWinnerShippingAddress } from '../utils/api.js';
import { SHIPPING_ADDRESS_WINNER_NOT_SHARED_VIEW_MODAL } from '../utils/shippingAddressCopy.js';

export function ShippingAddressViewModal({ isOpen, onClose, partyId, giftId, winnerName, giftTitle }) {
  const [address, setAddress] = useState(null);
  const [loading, setLoading] = useState(false);
  const [unavailable, setUnavailable] = useState(false);

  useEffect(() => {
    const fetchAddress = async () => {
      if (!isOpen || !partyId || !giftId) {
        setAddress(null);
        setUnavailable(false);
        return;
      }

      setLoading(true);
      setUnavailable(false);
      try {
        const data = await fetchWinnerShippingAddress(partyId, giftId);
        setAddress(data.shippingAddress || null);
        setUnavailable(!data.shippingAddress);
      } catch (error) {
        console.error('Error fetching address:', error);
        setAddress(null);
        setUnavailable(true);
      } finally {
        setLoading(false);
      }
    };

    fetchAddress();
  }, [isOpen, partyId, giftId]);

  if (!isOpen) return null;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Shipping Address">
      <div className="space-y-4">
        <div>
          <p className="text-gray-600 mb-1">
            <strong>{giftTitle}</strong>
          </p>
          <p className="text-sm text-gray-500">
            Winner: <strong>{winnerName}</strong>
          </p>
        </div>

        {loading ? (
          <p className="text-gray-500">Loading address...</p>
        ) : address ? (
          <div className="bg-gray-50 p-4 rounded border">
            <p className="font-medium">{address.name || 'N/A'}</p>
            <p>{address.street || ''}</p>
            <p>
              {address.city && address.state && `${address.city}, ${address.state} ${address.zip || ''}`}
            </p>
            {address.country && <p>{address.country}</p>}
          </div>
        ) : (
          <p
            className={
              unavailable
                ? 'text-sm text-slate-300 italic'
                : 'text-gray-500 italic'
            }
          >
            {unavailable
              ? SHIPPING_ADDRESS_WINNER_NOT_SHARED_VIEW_MODAL
              : 'Winner has not provided their shipping address yet.'}
          </p>
        )}

        <div className="flex justify-end">
          <Button variant="secondary" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </Modal>
  );
}
