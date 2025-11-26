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

    setSaving(true);
    try {
      await updateDoc(doc(db, 'users', user.uid), {
        shippingAddress: address,
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
    } catch (error) {
      console.error('Error saving address:', error);
      alert('Failed to save address: ' + error.message);
    } finally {
      setSaving(false);
    }
  };

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
        <div className="flex gap-3 justify-end mt-6">
          <Button variant="secondary" onClick={onClose} type="button">
            Cancel
          </Button>
          <Button type="submit" disabled={saving}>
            {saving ? 'Saving...' : 'Save Address'}
          </Button>
        </div>
      </form>
      )}
    </Modal>
  );
}


