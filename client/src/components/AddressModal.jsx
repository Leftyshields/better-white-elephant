/**
 * Address Exchange Modal
 */
import { useState, useEffect } from 'react';
import { Modal } from './ui/Modal.jsx';
import { Input } from './ui/Input.jsx';
import { Button } from './ui/Button.jsx';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { db } from '../utils/firebase.js';
import { useAuth } from '../hooks/useAuth.js';
import {
  SHIPPING_ADDRESS_CONSENT_REQUIRED_ADDRESS_MODAL,
  SHIPPING_ADDRESS_SENDER_SHARE_CONSENT_LABEL,
} from '../utils/shippingAddressCopy.js';

const ADDRESS_FIELD_KEYS = ['name', 'street', 'city', 'state', 'zip', 'country'];

function hasCompleteShippingFields(address) {
  return ADDRESS_FIELD_KEYS.every((key) => Boolean(address[key]?.trim()));
}

function trimShippingAddress(address) {
  return ADDRESS_FIELD_KEYS.reduce((acc, key) => {
    acc[key] = address[key]?.trim() ?? '';
    return acc;
  }, {});
}

export function AddressModal({ isOpen, onClose, giftTitle }) {
  const { user } = useAuth();
  const [address, setAddress] = useState({
    name: '',
    street: '',
    city: '',
    state: '',
    zip: '',
    country: '',
  });
  const [shareConsent, setShareConsent] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);

  // Load existing address when modal opens
  useEffect(() => {
    const loadAddress = async () => {
      if (!isOpen || !user) {
        return;
      }

      setLoading(true);
      try {
        const userDoc = await getDoc(doc(db, 'users', user.uid));
        if (userDoc.exists()) {
          const userData = userDoc.data();
          if (userData.shippingAddress) {
            setAddress(userData.shippingAddress);
          }
          setShareConsent(Boolean(userData.shippingAddressSenderShareConsentAt));
        }
      } catch (error) {
        console.error('Error loading address:', error);
      } finally {
        setLoading(false);
      }
    };

    loadAddress();
  }, [isOpen, user]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!user) return;

    if (!shareConsent) {
      alert(SHIPPING_ADDRESS_CONSENT_REQUIRED_ADDRESS_MODAL);
      return;
    }

    if (!hasCompleteShippingFields(address)) {
      return;
    }

    const trimmedAddress = trimShippingAddress(address);

    setSaving(true);
    try {
      await updateDoc(doc(db, 'users', user.uid), {
        shippingAddress: trimmedAddress,
        shippingAddressSenderShareConsentAt: new Date(),
        updatedAt: new Date(),
      });
      alert('Address saved! The gift submitter will be notified.');
      onClose();
      setAddress({
        name: '',
        street: '',
        city: '',
        state: '',
        zip: '',
        country: '',
      });
      setShareConsent(false);
    } catch (error) {
      console.error('Error saving address:', error);
      alert('Failed to save address: ' + error.message);
    } finally {
      setSaving(false);
    }
  };

  const canSaveAddress = hasCompleteShippingFields(address) && shareConsent;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Enter Shipping Address">
      <p className="text-gray-600 mb-4">
        You won the gift: <strong>{giftTitle}</strong>
      </p>
      <p className="text-sm text-gray-500 mb-4">
        Please provide your shipping address so the gift can be sent to you.
        {address.name && address.street && (
          <span className="block mt-2 text-blue-600">
            Your saved address has been pre-filled. You can update it below or save as-is.
          </span>
        )}
      </p>
      {loading ? (
        <p className="text-gray-500">Loading your address...</p>
      ) : (
        <form onSubmit={handleSubmit}>
        <Input
          label="Full Name"
          value={address.name}
          onChange={(e) => setAddress({ ...address, name: e.target.value })}
          required
        />
        <Input
          label="Street Address"
          value={address.street}
          onChange={(e) => setAddress({ ...address, street: e.target.value })}
          required
        />
        <div className="grid grid-cols-2 gap-4">
          <Input
            label="City"
            value={address.city}
            onChange={(e) => setAddress({ ...address, city: e.target.value })}
            required
          />
          <Input
            label="State"
            value={address.state}
            onChange={(e) => setAddress({ ...address, state: e.target.value })}
            required
          />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Input
            label="ZIP Code"
            value={address.zip}
            onChange={(e) => setAddress({ ...address, zip: e.target.value })}
            required
          />
          <Input
            label="Country"
            value={address.country}
            onChange={(e) => setAddress({ ...address, country: e.target.value })}
            required
          />
        </div>
        <label className="flex gap-3 items-start mt-4 text-sm text-slate-300 cursor-pointer">
          <input
            type="checkbox"
            className="mt-1"
            checked={shareConsent}
            onChange={(e) => setShareConsent(e.target.checked)}
            required
          />
          <span>{SHIPPING_ADDRESS_SENDER_SHARE_CONSENT_LABEL}</span>
        </label>
        <div className="flex gap-3 justify-end mt-6">
          <Button variant="secondary" onClick={onClose} type="button">
            Cancel
          </Button>
          <Button type="submit" disabled={saving || !canSaveAddress}>
            {saving ? 'Saving...' : 'Save Address'}
          </Button>
        </div>
      </form>
      )}
    </Modal>
  );
}
