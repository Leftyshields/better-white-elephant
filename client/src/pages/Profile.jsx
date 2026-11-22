/**
 * User Profile Page
 * Allows users to update their display name. Shipping addresses are per game (A0), not on the profile.
 */
import { useState, useEffect } from 'react';
import { useAuth } from '../hooks/useAuth.js';
import { useNavigate } from 'react-router-dom';
import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import { PROFILE_SAVE_SUCCESS_MESSAGE } from '../utils/shippingAddressCopy.js';
import { updateProfile } from 'firebase/auth';
import { auth, db } from '../utils/firebase.js';
import {
  resolveSyncedFirestoreDisplayName,
  sanitizeUserChosenDisplayName,
} from '../../../server/lib/display-names.js';
import { Button } from '../components/ui/Button.jsx';
import { Input } from '../components/ui/Input.jsx';
import { LockClosedIcon } from '@heroicons/react/24/outline';

export function Profile() {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [displayName, setDisplayName] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

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
        if (userDoc.exists()) {
          const userData = userDoc.data();
          setDisplayName(
            resolveSyncedFirestoreDisplayName(user.displayName, userData.displayName),
          );
        } else {
          // Create user document if it doesn't exist
          setDisplayName(resolveSyncedFirestoreDisplayName(user.displayName, ''));
          await setDoc(doc(db, 'users', user.uid), {
            displayName: resolveSyncedFirestoreDisplayName(user.displayName, ''),
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
      const safeDisplayName = sanitizeUserChosenDisplayName(displayName);
      if (safeDisplayName && safeDisplayName !== user.displayName) {
        await updateProfile(auth.currentUser, { displayName: safeDisplayName });
      }

      await updateDoc(doc(db, 'users', user.uid), {
        displayName: safeDisplayName,
        email: user.email || '',
        updatedAt: new Date(),
      });

      setSuccessMessage(PROFILE_SAVE_SUCCESS_MESSAGE);
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
            id="profile-display-name"
            label="Display Name"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder={user.email || 'Enter your name'}
          />
        </div>

        {/* Email (read-only) */}
        <div>
          <label htmlFor="profile-email" className="block text-sm font-medium text-slate-400 mb-2">
            Email
          </label>
          <div className="relative">
            <input
              id="profile-email"
              type="email"
              value={user.email || ''}
              disabled
              readOnly
              aria-readonly="true"
              className="w-full min-h-11 px-3 py-2 pl-10 border border-slate-800 rounded-md bg-slate-900/30 text-slate-500 cursor-not-allowed"
            />
            <LockClosedIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-slate-600" />
          </div>
          <p className="mt-1 text-sm text-slate-400">
            Your email cannot be changed
          </p>
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
            disabled={saving}
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
