/**
 * User Profile Page
 * Allows users to update their shipping address and display name
 */
import { useState, useEffect } from 'react';
import { useAuth } from '../hooks/useAuth.js';
import { useNavigate } from 'react-router-dom';
import { doc, getDoc, setDoc, updateDoc, deleteField } from 'firebase/firestore';
import {
  SHIPPING_ADDRESS_CONSENT_REQUIRED_PROFILE,
  SHIPPING_ADDRESS_SAVED_NEEDS_CONSENT_PROFILE,
  SHIPPING_ADDRESS_SENDER_SHARE_CONSENT_LABEL,
} from '../utils/shippingAddressCopy.js';
import { updateProfile } from 'firebase/auth';
import { auth, db } from '../utils/firebase.js';
import { Button } from '../components/ui/Button.jsx';
import { Input } from '../components/ui/Input.jsx';
import { LockClosedIcon } from '@heroicons/react/24/outline';

function hasCompleteShippingFields(address) {
  return !!(
    address.name?.trim() &&
    address.street?.trim() &&
    address.city?.trim() &&
    address.state?.trim() &&
    address.zip?.trim() &&
    address.country?.trim()
  );
}

export function Profile() {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [displayName, setDisplayName] = useState('');
  const [address, setAddress] = useState({
    name: '',
    street: '',
    city: '',
    state: '',
    zip: '',
    country: '',
  });
  const [successMessage, setSuccessMessage] = useState('');
  const [shareConsent, setShareConsent] = useState(false);
  const [showSavedAddressNeedsConsentNote, setShowSavedAddressNeedsConsentNote] = useState(false);
  const [hadPersistedShippingAddress, setHadPersistedShippingAddress] = useState(false);

  const hasShippingFields = hasCompleteShippingFields(address);
  const saveDisabled = saving;

  // Load user profile data
  useEffect(() => {
    const loadProfile = async () => {
      if (!user) {
        navigate('/');
        return;
      }

      setLoading(true);
      try {
        // Load from Firestore
        const userDoc = await getDoc(doc(db, 'users', user.uid));
        if (userDoc.exists) {
          const userData = userDoc.data();
          setDisplayName(user.displayName || userData.displayName || '');
          if (userData.shippingAddress) {
            setAddress(userData.shippingAddress);
          }
          setShareConsent(Boolean(userData.shippingAddressSenderShareConsentAt));
          const loadedAddress = userData.shippingAddress || {};
          const loadedHadCompleteAddress = hasCompleteShippingFields(loadedAddress);
          const loadedHadConsent = Boolean(userData.shippingAddressSenderShareConsentAt);
          setShowSavedAddressNeedsConsentNote(loadedHadCompleteAddress && !loadedHadConsent);
          setHadPersistedShippingAddress(Boolean(userData.shippingAddress));
        } else {
          // Create user document if it doesn't exist
          setDisplayName(user.displayName || '');
          setShowSavedAddressNeedsConsentNote(false);
          setHadPersistedShippingAddress(false);
          await setDoc(doc(db, 'users', user.uid), {
            displayName: user.displayName || '',
            email: user.email || '',
            createdAt: new Date(),
            updatedAt: new Date(),
          });
        }
      } catch (error) {
        console.error('Error loading profile:', error);
        alert('Failed to load profile: ' + error.message);
      } finally {
        setLoading(false);
      }
    };

    if (!authLoading) {
      loadProfile();
    }
  }, [user, authLoading, navigate]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!user) return;

    setSaving(true);
    setSuccessMessage('');
    
    try {
      // Update Firebase Auth display name
      if (displayName && displayName !== user.displayName) {
        await updateProfile(auth.currentUser, { displayName });
      }

      const profileUpdate = {
        displayName: displayName || user.email || '',
        email: user.email || '',
        updatedAt: new Date(),
      };

      if (hasShippingFields) {
        profileUpdate.shippingAddress = address;
        profileUpdate.shippingAddressSenderShareConsentAt = shareConsent
          ? new Date()
          : deleteField();
      } else if (hadPersistedShippingAddress) {
        profileUpdate.shippingAddress = deleteField();
        profileUpdate.shippingAddressSenderShareConsentAt = deleteField();
        setHadPersistedShippingAddress(false);
      }

      // Update Firestore user document
      await updateDoc(doc(db, 'users', user.uid), profileUpdate);

      if (hasShippingFields) {
        setShowSavedAddressNeedsConsentNote(!shareConsent);
      } else {
        setShowSavedAddressNeedsConsentNote(false);
      }

      setSuccessMessage('Profile updated successfully!');
      setTimeout(() => setSuccessMessage(''), 3000);
    } catch (error) {
      console.error('Error updating profile:', error);
      alert('Failed to update profile: ' + error.message);
    } finally {
      setSaving(false);
    }
  };

  if (authLoading || loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="text-center text-white">Loading profile...</div>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  return (
    <div className="min-h-screen bg-slate-950 pt-24 pb-16">
      <div className="max-w-2xl mx-auto px-4">
        <h1 className="text-3xl font-bold mb-6 text-white">Your Profile</h1>

        {successMessage && (
          <div className="mb-4 p-4 bg-emerald-500/20 border border-emerald-500/50 text-emerald-300 rounded-lg">
            {successMessage}
          </div>
        )}

        <form onSubmit={handleSubmit} className="bg-slate-900/60 backdrop-blur-xl border border-white/10 shadow-2xl rounded-2xl p-6 md:p-8 space-y-6">
        {/* Display Name */}
        <div>
          <Input
            label="Display Name"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder={user.email || 'Enter your name'}
          />
        </div>

        {/* Email (read-only) */}
        <div>
          <label className="block text-sm font-medium text-slate-400 mb-2">
            Email
          </label>
          <div className="relative">
            <input
              type="email"
              value={user.email || ''}
              disabled
              className="w-full px-3 py-2 pl-10 border border-slate-800 rounded-md bg-slate-900/30 text-slate-500 cursor-not-allowed"
            />
            <LockClosedIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-slate-600" />
          </div>
          <p className="mt-1 text-sm text-slate-400">
            Your email cannot be changed
          </p>
        </div>

        {/* Shipping Address Section */}
        <div className="border-t border-white/10 pt-6">
          <h2 className="text-xl font-bold mb-4 text-white">Shipping Address</h2>
          <p className="text-sm text-slate-400 mb-4">
            Add this before the game so the person mailing your gift can ship. It auto-deletes 30 days after the game ends.
          </p>

          <div className="space-y-4">
            <Input
              label="Full Name"
              value={address.name}
              onChange={(e) => setAddress({ ...address, name: e.target.value })}
              placeholder="Enter your full name"
            />
            <Input
              label="Street Address"
              value={address.street}
              onChange={(e) => setAddress({ ...address, street: e.target.value })}
              placeholder="123 Main St"
            />
            <div className="grid grid-cols-2 gap-4">
              <Input
                label="City"
                value={address.city}
                onChange={(e) => setAddress({ ...address, city: e.target.value })}
                placeholder="City"
              />
              <Input
                label="State/Province"
                value={address.state}
                onChange={(e) => setAddress({ ...address, state: e.target.value })}
                placeholder="State"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <Input
                label="ZIP/Postal Code"
                value={address.zip}
                onChange={(e) => setAddress({ ...address, zip: e.target.value })}
                placeholder="12345"
              />
              <Input
                label="Country"
                value={address.country}
                onChange={(e) => setAddress({ ...address, country: e.target.value })}
                placeholder="Country"
              />
            </div>
            <label className="flex gap-3 items-start text-sm text-slate-300 cursor-pointer">
              <input
                type="checkbox"
                className="mt-1"
                checked={shareConsent}
                onChange={(e) => setShareConsent(e.target.checked)}
              />
              <span>{SHIPPING_ADDRESS_SENDER_SHARE_CONSENT_LABEL}</span>
            </label>
            {showSavedAddressNeedsConsentNote && (
              <p className="text-sm text-slate-300">{SHIPPING_ADDRESS_SAVED_NEEDS_CONSENT_PROFILE}</p>
            )}
            {hasShippingFields && !shareConsent && (
              <p className="text-sm text-amber-300" role="alert">
                {SHIPPING_ADDRESS_CONSENT_REQUIRED_PROFILE}
              </p>
            )}
          </div>
        </div>

        {/* Submit Button */}
        <div className="flex gap-3 justify-end pt-4 border-t border-white/10">
          <Button
            type="button"
            onClick={() => navigate(-1)}
            className="text-slate-400 hover:text-white bg-transparent border border-slate-700 hover:border-slate-600"
          >
            Cancel
          </Button>
          <Button 
            type="submit" 
            disabled={saveDisabled}
            className="bg-gradient-to-r from-indigo-600 to-purple-600 text-white shadow-lg shadow-purple-500/20 hover:scale-[1.02] transition-transform disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
          >
            {saving ? 'Saving...' : 'Save Changes'}
          </Button>
        </div>
      </form>
      </div>
    </div>
  );
}
